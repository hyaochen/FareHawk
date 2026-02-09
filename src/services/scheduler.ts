/**
 * 排程服務
 * 負責定時搜尋機票並發送通知
 */

import cron from 'node-cron';
import { settings } from '../config/settings.js';
import { searchFlights } from '../core/flight-fetcher.js';
import { analyzeFlights } from '../core/flight-analyzer.js';
import { sortFlights, filterFlights, calculateStats } from '../core/flight-ranker.js';
import { sendFlightAlert, sendSimpleNotification } from './telegram-bot.js';
import type { SearchRequest, AlertMessage, FlightAnalysis } from '../types/index.js';
import { addDays } from 'date-fns';

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
 */
export async function runSearchAndNotify(): Promise<void> {
    const results = await runSearchJob();

    // 儲存到資料庫
    if (results.length > 0) {
        await saveFlightResults(results);
    }

    if (results.length === 0) {
        console.log('😴 沒有符合條件的便宜機票');
        return;
    }

    // 取得前 10 個最便宜的結果
    const topResults = results.slice(0, 10);

    // 建立通知
    const alert: AlertMessage = {
        type: 'new_deal',
        title: '發現便宜機票！',
        flights: topResults,
        createdAt: new Date(),
    };

    // 發送通知
    await sendFlightAlert(alert);
    console.log(`📤 已發送 ${topResults.length} 個機票通知`);
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
