/**
 * 排程服務
 * 負責定時搜尋機票並發送通知
 */

import cron from 'node-cron';
import { settings } from '../config/settings.js';
import { searchFlights } from '../core/flight-fetcher.js';
import { analyzeFlights } from '../core/flight-analyzer.js';
import { sortFlights, filterFlights, calculateStats } from '../core/flight-ranker.js';
import { sendFlightAlert, sendSimpleNotification, sendMessage } from './telegram-bot.js';
import type { SearchRequest, AlertMessage, FlightAnalysis } from '../types/index.js';
import { addDays } from 'date-fns';

// =====================================================
// Web API 爬蟲搜尋（透過本地 Web 伺服器的 Playwright 爬蟲）
// =====================================================

/**
 * 透過 Web API 觸發 Playwright 爬蟲搜尋並取得結果
 * 不消耗任何付費 API 額度
 */
async function fetchFlightsViaWebApi(): Promise<any[]> {
    const port = settings.web.port;
    const params = new URLSearchParams({
        refresh: 'true',
        useApi: 'false',
        location: settings.user.location,
        airports: settings.user.preferredAirports.join(','),
        destinations: settings.user.watchDestinations.join(','),
        durations: settings.user.tripDurations.join(','),
        priceThreshold: String(settings.user.priceThreshold),
        searchDaysAhead: String(settings.search.daysAhead),
    });

    const url = `http://localhost:${port}/api/flights?${params}`;
    console.log(`🌐 呼叫 Web API 搜尋（爬蟲模式）...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 分鐘超時

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Web API 回應錯誤: HTTP ${response.status}`);
        }

        const json = await response.json() as { success: boolean; data?: any[]; error?: string };
        if (!json.success) {
            throw new Error(`Web API 搜尋失敗: ${json.error}`);
        }

        return json.data || [];
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * 格式化單筆機票為 Telegram 訊息（從 DB Flight 記錄）
 */
function formatSingleFlightMessage(f: any): string {
    const depTime = new Date(f.departureTime);
    const arrTime = new Date(f.arrivalTime);
    const tags: string[] = JSON.parse(f.tags || '[]');

    // 計算行程天數
    let tripDays = 0;
    if (f.returnFlightId) {
        const retDate = new Date(f.returnFlightId);
        if (!isNaN(retDate.getTime())) {
            tripDays = Math.round((retDate.getTime() - depTime.getTime()) / (1000 * 60 * 60 * 24));
        }
    }

    const outDate = depTime.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' });
    const outTime = depTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    const outArrival = arrTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

    let retDateStr = '';
    if (f.returnFlightId && !isNaN(new Date(f.returnFlightId).getTime())) {
        retDateStr = new Date(f.returnFlightId).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' });
    }

    let message = `✈️ *${f.destination}* 來回機票\n`;
    message += `🛫 ${f.origin}\n\n`;

    message += `💰 *機票價格：NT$ ${Number(f.price).toLocaleString()}*\n\n`;

    message += `📅 ${outDate}`;
    if (retDateStr) message += ` → ${retDateStr}`;
    if (tripDays > 0) message += ` (${tripDays}天)`;
    message += `\n`;

    if (f.effectiveHours && f.effectiveHours > 0) {
        message += `🎯 有效活動：約 ${f.effectiveHours} 小時\n`;
    }
    message += `\n`;

    if (tags.length > 0) {
        message += `🏷️ ${tags.join(' ')}\n\n`;
    }

    message += `*去程*：${f.airline} | ${outTime} → ${outArrival}`;
    if (f.stops > 0) message += ` (轉${f.stops}次)`;
    message += `\n`;

    if (f.returnDepartureTime) {
        const retDepTime = new Date(f.returnDepartureTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        const retArrTime = f.returnArrivalTime
            ? new Date(f.returnArrivalTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
            : '';
        message += `*回程*：${f.returnAirline || f.airline} | ${retDepTime} → ${retArrTime}`;
        if (f.returnStops && f.returnStops > 0) message += ` (轉${f.returnStops}次)`;
        message += `\n`;
    }

    if (f.bookingUrl) {
        message += `\n🔗 [查看詳情](${f.bookingUrl})`;
    }

    return message;
}

// =====================================================
// 搜尋任務
// =====================================================

/**
 * 執行一次完整的機票搜尋
 */
export async function runSearchJob(): Promise<FlightAnalysis[]> {
    console.log('🔍 開始搜尋便宜機票...');
    const startTime = Date.now();

    try {
        // 建立搜尋請求
        const request: SearchRequest = {
            origins: settings.user.preferredAirports,
            destinations: settings.user.watchDestinations,
            tripDurations: settings.user.tripDurations,
            startDateFrom: addDays(new Date(), 7), // 從一週後開始
            startDateTo: addDays(new Date(), settings.search.daysAhead),
            maxPrice: settings.user.priceThreshold * 1.5, // 搜尋門檻的 1.5 倍
        };

        // 搜尋機票
        const flights = await searchFlights(request);
        console.log(`📦 找到 ${flights.length} 個航班`);

        if (flights.length === 0) {
            console.log('😕 沒有找到任何航班');
            return [];
        }

        // 分析機票
        const analyzed = analyzeFlights(flights, settings.user.location);
        console.log(`📊 分析完成 ${analyzed.length} 個來回機票`);

        // 過濾便宜機票
        const cheapFlights = filterFlights(analyzed, {
            maxTotalCost: settings.user.priceThreshold,
        });

        // 按總成本排序
        const sorted = sortFlights(cheapFlights, 'total_cost_asc');

        // 統計
        const stats = calculateStats(sorted);
        console.log(`💰 符合條件的機票：${stats.count} 個`);
        if (stats.count > 0) {
            console.log(`   最低價：NT$ ${stats.minTotalCost.toLocaleString()}`);
            console.log(`   平均價：NT$ ${stats.avgTotalCost.toLocaleString()}`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ 搜尋完成，耗時 ${duration} 秒`);

        return sorted;

    } catch (error) {
        console.error('❌ 搜尋發生錯誤:', error);
        return [];
    }
}

import { db } from './db.js';

/**
 * 儲存機票分析結果到資料庫
 */
async function saveFlightResults(flights: FlightAnalysis[]) {
    console.log(`💾 正在儲存 ${flights.length} 筆機票資料到資料庫...`);
    let savedCount = 0;
    let updateCount = 0;

    for (const analysis of flights) {
        const { flight, tags, totalStayHours, effectiveStayHours } = analysis;

        try {
            // 1. 處理回程航班
            let returnFlightId = null;
            if (flight.returnFlight) {
                const ret = flight.returnFlight;

                // 檢查回程是否已存在
                const existingReturn = await db.flight.findFirst({
                    where: {
                        airline: ret.airline,
                        flightNumber: ret.flightNumber || undefined,
                        origin: ret.origin,
                        destination: ret.destination,
                        departureTime: ret.departureTime,
                    }
                });

                if (existingReturn) {
                    returnFlightId = existingReturn.id;
                } else {
                    // 新增回程
                    const newReturn = await db.flight.create({
                        data: {
                            airline: ret.airline,
                            flightNumber: ret.flightNumber,
                            origin: ret.origin,
                            destination: ret.destination,
                            departureTime: ret.departureTime,
                            arrivalTime: ret.arrivalTime,
                            flightDuration: ret.flightDuration,
                            price: 0, // 回程價格通常包含在去程或其他方式計算，這裡設0或依資料
                            currency: ret.currency,
                            isRoundTrip: false,
                            stops: ret.stops,
                            source: ret.source,
                            bookingUrl: ret.bookingUrl,
                        }
                    });
                    returnFlightId = newReturn.id;
                }
            }

            // 2. 處理去程航班 (主記錄)
            const existingFlight = await db.flight.findFirst({
                where: {
                    airline: flight.airline,
                    flightNumber: flight.flightNumber || undefined,
                    origin: flight.origin,
                    destination: flight.destination,
                    departureTime: flight.departureTime,
                    isRoundTrip: true,
                }
            });

            if (existingFlight) {
                // 更新價格與分析數據
                await db.flight.update({
                    where: { id: existingFlight.id },
                    data: {
                        price: flight.price,
                        bookingUrl: flight.bookingUrl,
                        tags: JSON.stringify(tags),
                        totalStayHours: totalStayHours,
                        effectiveHours: effectiveStayHours,
                        returnFlightId: returnFlightId,
                    }
                });

                // 記錄價格歷史
                if (existingFlight.price !== flight.price) {
                    await db.priceHistory.create({
                        data: {
                            flightId: existingFlight.id,
                            price: flight.price,
                        }
                    });
                }
                updateCount++;
            } else {
                // 新增去程
                const newFlight = await db.flight.create({
                    data: {
                        airline: flight.airline,
                        flightNumber: flight.flightNumber,
                        origin: flight.origin,
                        destination: flight.destination,
                        departureTime: flight.departureTime,
                        arrivalTime: flight.arrivalTime,
                        flightDuration: flight.flightDuration,
                        price: flight.price,
                        currency: flight.currency,
                        isRoundTrip: true,
                        stops: flight.stops,
                        source: flight.source,
                        bookingUrl: flight.bookingUrl,
                        tags: JSON.stringify(tags),
                        totalStayHours: totalStayHours,
                        effectiveHours: effectiveStayHours,
                        returnFlightId: returnFlightId,
                    }
                });

                // 初始價格歷史
                await db.priceHistory.create({
                    data: {
                        flightId: newFlight.id,
                        price: flight.price,
                    }
                });
                savedCount++;
            }

        } catch (error) {
            console.error(`❌ 儲存航班失敗 (${flight.origin}->${flight.destination}):`, error);
        }
    }
    console.log(`✅ 資料庫作業完成：新增 ${savedCount} 筆，更新 ${updateCount} 筆`);
}

/**
 * 執行搜尋並發送通知
 * 透過 Web API 的 Playwright 爬蟲搜尋，不消耗付費 API
 * 即時通知：每找到一筆符合條件的機票就立刻發送 Telegram 通知
 */
export async function runSearchAndNotify(): Promise<void> {
    console.log('🔍 開始搜尋便宜機票（爬蟲模式）...');
    const searchStartTime = new Date();
    const sentFlightIds = new Set<string>();
    let totalSent = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let searchDone = false;

    // 輪詢 DB 找新機票並即時發送
    const pollAndNotify = async () => {
        try {
            const now = new Date();
            const newFlights = await db.flight.findMany({
                where: {
                    createdAt: { gte: searchStartTime },
                    isRoundTrip: true,
                    price: { gt: 0, lte: settings.user.priceThreshold },
                    departureTime: { gte: now },
                },
                orderBy: { price: 'asc' },
            });

            for (const flight of newFlights) {
                if (sentFlightIds.has(flight.id)) continue;
                sentFlightIds.add(flight.id);

                try {
                    const message = formatSingleFlightMessage(flight);
                    await sendMessage(message);
                    totalSent++;
                    console.log(`📤 已發送：${flight.airline} ${flight.origin}→${flight.destination} NT$${flight.price}`);
                    // 避免 Telegram 速率限制
                    await new Promise(r => setTimeout(r, 1000));
                } catch (err: any) {
                    console.error(`❌ 發送通知失敗:`, err.message);
                }
            }
        } catch (err: any) {
            console.error('❌ 輪詢 DB 失敗:', err.message);
        }
    };

    try {
        // 啟動 DB 輪詢（每 15 秒檢查一次新機票）
        pollTimer = setInterval(pollAndNotify, 15000);

        // 觸發 Web API 爬蟲搜尋（等待完成）
        await fetchFlightsViaWebApi();
        searchDone = true;

        // 搜尋完成後最後輪詢一次
        await pollAndNotify();

        const duration = ((Date.now() - searchStartTime.getTime()) / 1000).toFixed(1);
        console.log(`✅ 搜尋完成，耗時 ${duration} 秒`);

        if (totalSent === 0) {
            console.log('😴 沒有符合條件的便宜機票');
        } else {
            console.log(`📤 共發送 ${totalSent} 筆機票通知`);
            await sendSimpleNotification(
                '✅ 搜尋完成',
                `本次共找到 ${totalSent} 筆符合條件的便宜機票`
            );
        }

    } catch (error: any) {
        console.error('❌ 搜尋發生錯誤:', error.message || error);
        // 搜尋失敗但可能已經有部分結果，做最後一次輪詢
        if (!searchDone) {
            await pollAndNotify();
        }
        if (totalSent === 0) {
            await sendSimpleNotification(
                '⚠️ 搜尋失敗',
                '無法連線到 Web API，請確認 Web 伺服器是否運行中。'
            );
        }
    } finally {
        if (pollTimer) clearInterval(pollTimer);
    }
}

// =====================================================
// 排程管理
// =====================================================

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * 啟動排程任務
 */
export function startScheduler(): void {
    const cronExpression = settings.search.cronSchedule;

    // 驗證 cron 表達式
    if (!cron.validate(cronExpression)) {
        console.error(`❌ 無效的 cron 表達式：${cronExpression}`);
        return;
    }

    console.log(`⏰ 設定排程任務：${cronExpression}`);

    scheduledTask = cron.schedule(cronExpression, async () => {
        console.log('\n========== 執行排程搜尋 ==========');
        console.log(`🕐 時間：${new Date().toLocaleString('zh-TW')}`);

        try {
            await runSearchAndNotify();
        } catch (error) {
            console.error('排程任務執行失敗:', error);
            await sendSimpleNotification(
                '⚠️ 搜尋失敗',
                '機票搜尋過程中發生錯誤，請檢查日誌。'
            );
        }

        console.log('====================================\n');
    });

    console.log('✅ 排程任務已啟動');
}

/**
 * 停止排程任務
 */
export function stopScheduler(): void {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        console.log('🛑 排程任務已停止');
    }
}

/**
 * 取得下次執行時間
 */
export function getNextRunTime(): Date | null {
    // node-cron 沒有內建方法，這裡做一個簡單估算
    // 實際可以用 cron-parser 套件
    return null;
}
