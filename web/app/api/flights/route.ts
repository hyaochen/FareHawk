/**
 * 機票搜尋 API
 *
 * 核心邏輯：
 * 1. 先查 DB 有沒有新鮮資料（24 小時內），有就直接回傳
 * 2. 只有在 DB 沒有該航線資料、或使用者明確要求 refresh 時才打 API
 * 3. 搜尋到的機票「全部」儲存（不篩價格），篩選只在顯示層做
 * 4. SerpApi 搜的是「航線+日期」，回傳該航線所有航空公司的航班
 * 5. 日期從「今天 + N 天」開始算，不是從今天
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { searchSkyscanner } from '../../../lib/crawlers/skyscanner';
import { getSearchCacheKey, isSearchCached, setSearchCache } from '../../../lib/cache';
import { scrapeGoogleFlights, buildSearchUrl } from '../../../lib/crawlers/google-flights-scraper';

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

// 預設設定
const defaultSettings = {
    userLocation: '屏東市',
    departureAirports: ['TPE', 'TSA', 'KHH'],
    destinations: ['NRT', 'KIX', 'ICN', 'BKK', 'SIN', 'FUK', 'OKA'],
    tripDurations: [3, 4, 5, 7],
    priceThreshold: 20000,
    searchDaysAhead: 60,
    startDaysAhead: 7, // 從幾天後開始搜尋
};

// 每次 refresh 最多消耗的 SerpApi 搜尋次數
const MAX_API_CALLS_PER_REFRESH = 12;

// DB 資料新鮮度（小時）— 同航線在這段時間內不重複搜尋
const DATA_FRESHNESS_HOURS = 24;

// 交通費用資料
const transportCosts: Record<string, Record<string, { cost: number; method: string; duration: string; reference: string }>> = {
    'TPE': {
        '屏東市': { cost: 1300, method: '高鐵左營→桃園 + 機捷（來回）', duration: '約3.5小時', reference: 'https://www.thsrc.com.tw/' },
        '高雄市': { cost: 1100, method: '高鐵左營→桃園 + 機捷（來回）', duration: '約2.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台北市': { cost: 320, method: '機場捷運（來回）', duration: '約35分鐘', reference: 'https://www.tymetro.com.tw/' },
        '新北市': { cost: 320, method: '機場捷運（來回）', duration: '約40分鐘', reference: 'https://www.tymetro.com.tw/' },
        '桃園市': { cost: 0, method: '機場所在地', duration: '約10分鐘', reference: '' },
        '台中市': { cost: 800, method: '高鐵台中→桃園 + 機捷（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台南市': { cost: 1000, method: '高鐵台南→桃園 + 機捷（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
        '新竹市': { cost: 600, method: '高鐵新竹→桃園 + 機捷（來回）', duration: '約1小時', reference: 'https://www.thsrc.com.tw/' },
    },
    'TSA': {
        '屏東市': { cost: 1200, method: '高鐵左營→台北 + 捷運（來回）', duration: '約3小時', reference: 'https://www.thsrc.com.tw/' },
        '高雄市': { cost: 1000, method: '高鐵左營→台北 + 捷運（來回）', duration: '約2.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台北市': { cost: 50, method: '捷運文湖線（來回）', duration: '約15分鐘', reference: 'https://www.metro.taipei/' },
        '新北市': { cost: 100, method: '捷運（來回）', duration: '約30分鐘', reference: 'https://www.metro.taipei/' },
        '桃園市': { cost: 320, method: '機捷（來回）', duration: '約35分鐘', reference: 'https://www.tymetro.com.tw/' },
        '台中市': { cost: 750, method: '高鐵台中→台北 + 捷運（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台南市': { cost: 950, method: '高鐵台南→台北 + 捷運（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
        '新竹市': { cost: 550, method: '高鐵新竹→台北 + 捷運（來回）', duration: '約1小時', reference: 'https://www.thsrc.com.tw/' },
    },
    'KHH': {
        '屏東市': { cost: 160, method: '台鐵區間車（來回）', duration: '約40分鐘', reference: 'https://www.railway.gov.tw/' },
        '高雄市': { cost: 50, method: '捷運紅線（來回）', duration: '約20分鐘', reference: 'https://www.krtc.com.tw/' },
        '台北市': { cost: 1200, method: '高鐵台北→左營 + 捷運（來回）', duration: '約2.5小時', reference: 'https://www.thsrc.com.tw/' },
        '新北市': { cost: 1200, method: '高鐵台北→左營 + 捷運（來回）', duration: '約2.5小時', reference: 'https://www.thsrc.com.tw/' },
        '桃園市': { cost: 1100, method: '高鐵桃園→左營 + 捷運（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
        '台中市': { cost: 700, method: '高鐵台中→左營 + 捷運（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台南市': { cost: 400, method: '台鐵自強號（來回）', duration: '約1小時', reference: 'https://www.railway.gov.tw/' },
        '新竹市': { cost: 1000, method: '高鐵新竹→左營 + 捷運（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
    },
    'RMQ': {
        '屏東市': { cost: 800, method: '高鐵左營→台中 + 公車（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
        '高雄市': { cost: 700, method: '高鐵左營→台中 + 公車（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台北市': { cost: 750, method: '高鐵台北→台中 + 公車（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '新北市': { cost: 750, method: '高鐵台北→台中 + 公車（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '桃園市': { cost: 600, method: '高鐵桃園→台中 + 公車（來回）', duration: '約1小時', reference: 'https://www.thsrc.com.tw/' },
        '台中市': { cost: 100, method: '公車（來回）', duration: '約40分鐘', reference: '' },
        '台南市': { cost: 500, method: '高鐵台南→台中 + 公車（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '新竹市': { cost: 400, method: '高鐵新竹→台中 + 公車（來回）', duration: '約1小時', reference: 'https://www.thsrc.com.tw/' },
    },
    'TNN': {
        '屏東市': { cost: 200, method: '台鐵（來回）', duration: '約1小時', reference: 'https://www.railway.gov.tw/' },
        '高雄市': { cost: 300, method: '台鐵自強號（來回）', duration: '約40分鐘', reference: 'https://www.railway.gov.tw/' },
        '台北市': { cost: 1000, method: '高鐵台北→台南（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
        '新北市': { cost: 1000, method: '高鐵台北→台南（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
        '桃園市': { cost: 900, method: '高鐵桃園→台南（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台中市': { cost: 500, method: '高鐵台中→台南（來回）', duration: '約1小時', reference: 'https://www.thsrc.com.tw/' },
        '台南市': { cost: 0, method: '機場所在地', duration: '約10分鐘', reference: '' },
        '新竹市': { cost: 700, method: '高鐵新竹→台南（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
    },
};

// 機場資訊
const airportInfo: Record<string, { name: string; country: string; visa: string; requirements: string }> = {
    'NRT': { name: '東京成田', country: '日本', visa: '免簽90天', requirements: 'Visit Japan Web' },
    'HND': { name: '東京羽田', country: '日本', visa: '免簽90天', requirements: 'Visit Japan Web' },
    'KIX': { name: '大阪關西', country: '日本', visa: '免簽90天', requirements: 'Visit Japan Web' },
    'FUK': { name: '福岡', country: '日本', visa: '免簽90天', requirements: 'Visit Japan Web' },
    'CTS': { name: '札幌新千歲', country: '日本', visa: '免簽90天', requirements: 'Visit Japan Web' },
    'OKA': { name: '沖繩那霸', country: '日本', visa: '免簽90天', requirements: 'Visit Japan Web' },
    'NGO': { name: '名古屋中部', country: '日本', visa: '免簽90天', requirements: 'Visit Japan Web' },
    'ICN': { name: '首爾仁川', country: '韓國', visa: '免簽90天', requirements: 'K-ETA' },
    'GMP': { name: '首爾金浦', country: '韓國', visa: '免簽90天', requirements: 'K-ETA' },
    'PUS': { name: '釜山金海', country: '韓國', visa: '免簽90天', requirements: 'K-ETA' },
    'CJU': { name: '濟州島', country: '韓國', visa: '免簽90天', requirements: 'K-ETA' },
    'BKK': { name: '曼谷素萬那普', country: '泰國', visa: '免簽30天', requirements: '無' },
    'DMK': { name: '曼谷廊曼', country: '泰國', visa: '免簽30天', requirements: '無' },
    'CNX': { name: '清邁', country: '泰國', visa: '免簽30天', requirements: '無' },
    'HKT': { name: '普吉島', country: '泰國', visa: '免簽30天', requirements: '無' },
    'SIN': { name: '新加坡樟宜', country: '新加坡', visa: '免簽30天', requirements: 'SG Arrival Card' },
    'SGN': { name: '胡志明市', country: '越南', visa: '電子簽證', requirements: 'e-Visa' },
    'HAN': { name: '河內', country: '越南', visa: '電子簽證', requirements: 'e-Visa' },
    'DAD': { name: '峴港', country: '越南', visa: '電子簽證', requirements: 'e-Visa' },
    'DPS': { name: '峇里島', country: '印尼', visa: '落地簽30天', requirements: 'VOA' },
    'MNL': { name: '馬尼拉', country: '菲律賓', visa: '免簽30天', requirements: '無' },
    'CEB': { name: '宿霧', country: '菲律賓', visa: '免簽30天', requirements: '無' },
    'KUL': { name: '吉隆坡', country: '馬來西亞', visa: '免簽30天', requirements: 'MDAC' },
    'HKG': { name: '香港', country: '香港', visa: '免簽90天', requirements: '無' },
    'MFM': { name: '澳門', country: '澳門', visa: '免簽30天', requirements: '無' },
    'PVG': { name: '上海浦東', country: '中國', visa: '需簽證', requirements: '台胞證' },
    'PEK': { name: '北京首都', country: '中國', visa: '需簽證', requirements: '台胞證' },
};

const departureAirportNames: Record<string, string> = {
    'TPE': '桃園國際機場',
    'TSA': '台北松山機場',
    'KHH': '高雄國際機場',
    'RMQ': '台中清泉崗機場',
    'TNN': '台南機場',
};

const LOW_COST_CARRIERS = [
    'Peach', '樂桃', 'Scoot', '酷航', 'Tigerair', '虎航', 'AirAsia', '亞航',
    'Jetstar', '捷星', 'VietJet', '越捷', 'Cebu Pacific', '宿霧太平洋',
    'Spring', '春秋', 'NOK', 'Lion Air', '獅航', 'Starlux', '星宇',
];

// =====================================================
// 時間解析工具
// =====================================================

function parseSerpApiTime(timeStr: string, fallbackDate: string): Date | null {
    if (!timeStr) return null;
    // 格式: "2026-02-23 4:50" or "2026-02-23 14:50"
    if (timeStr.includes('-') && timeStr.includes(' ')) {
        const spaceIdx = timeStr.lastIndexOf(' ');
        const datePart = timeStr.substring(0, spaceIdx);
        const timePart = timeStr.substring(spaceIdx + 1);
        // 補齊小時位數: "4:50" → "04:50"
        const [h, m] = timePart.split(':');
        if (h && m) {
            const paddedTime = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
            const d = new Date(`${datePart}T${paddedTime}:00`);
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(timeStr.replace(' ', 'T'));
        return isNaN(d.getTime()) ? null : d;
    }
    // 格式: "14:50" or "4:50"
    if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [h, m] = timeStr.split(':');
        const paddedTime = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
        const d = new Date(`${fallbackDate}T${paddedTime}:00`);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function extractHour(timeStr: string): number {
    if (!timeStr) return -1;
    if (timeStr.includes(' ')) {
        const timePart = timeStr.split(' ').pop() || '';
        return parseInt(timePart.split(':')[0]) || 0;
    }
    return parseInt(timeStr.split(':')[0]) || 0;
}

// =====================================================
// 日期生成
// =====================================================

/**
 * 生成日期組合
 * @param startDaysAhead 從今天起算幾天後開始（預設 7 天）
 * @param searchDaysAhead 搜尋範圍天數（預設 60 天）— 回程日不能超過此範圍
 * @param tripDurations 行程天數陣列
 *
 * 邏輯：搜尋區間為 [startDaysAhead, searchDaysAhead]
 * 每一天都可以是出發日，只要「出發日 + 行程天數 ≤ searchDaysAhead」
 * 例：區間 7~28 天，3 天行程 → 出發日可以是第 7~25 天（共 19 組）
 */
function generateDateCombinations(
    startDaysAhead: number,
    searchDaysAhead: number,
    tripDurations: number[]
) {
    const combinations: { outbound: string; return: string; days: number }[] = [];
    const today = new Date();

    for (let i = startDaysAhead; i <= searchDaysAhead; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        for (const duration of tripDurations) {
            // 回程日不能超過搜尋區間
            if (i + duration > searchDaysAhead) continue;

            const returnDate = new Date(date);
            returnDate.setDate(date.getDate() + duration);
            combinations.push({
                outbound: date.toISOString().split('T')[0],
                return: returnDate.toISOString().split('T')[0],
                days: duration,
            });
        }
    }

    return combinations;
}

// =====================================================
// SerpApi 搜尋
// =====================================================

async function searchRoute(departure: string, arrival: string, outbound: string, returnDate: string) {
    if (!SERPAPI_API_KEY) throw new Error('SERPAPI_API_KEY not configured');

    // 記憶體快取檢查（server 重啟會清除）
    const cacheKey = getSearchCacheKey('serpapi', departure, arrival, outbound, returnDate);
    if (isSearchCached(cacheKey)) {
        console.log(`[SerpApi] 快取命中: ${departure}→${arrival} | ${outbound}`);
        return null;
    }

    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('engine', 'google_flights');
    url.searchParams.set('api_key', SERPAPI_API_KEY);
    url.searchParams.set('departure_id', departure);
    url.searchParams.set('arrival_id', arrival);
    url.searchParams.set('outbound_date', outbound);
    url.searchParams.set('return_date', returnDate);
    url.searchParams.set('currency', 'TWD');
    url.searchParams.set('hl', 'zh-TW');
    url.searchParams.set('type', '1'); // 來回

    console.log(`[SerpApi] 搜尋: ${departure}→${arrival} | ${outbound} ~ ${returnDate}`);

    const res = await fetch(url.toString());
    if (!res.ok) {
        console.error(`[SerpApi] 搜尋失敗: HTTP ${res.status}`);
        return null;
    }

    const data = await res.json();
    setSearchCache(cacheKey, true);
    return data;
}

// =====================================================
// 爬蟲搜尋（Playwright）
// =====================================================

async function searchRouteScraper(departure: string, arrival: string, outbound: string, returnDate: string) {
    // 記憶體快取檢查
    const cacheKey = getSearchCacheKey('scraper', departure, arrival, outbound, returnDate);
    if (isSearchCached(cacheKey)) {
        console.log(`[爬蟲] 快取命中: ${departure}→${arrival} | ${outbound}`);
        return null;
    }

    try {
        const data = await scrapeGoogleFlights(departure, arrival, outbound, returnDate);
        if (data) {
            setSearchCache(cacheKey, true);
        }
        return data;
    } catch (error: any) {
        console.error(`[爬蟲] 爬取失敗 ${departure}→${arrival}:`, error.message);
        return null;
    }
}

/**
 * 檢查 DB 是否已有該航線的新鮮資料
 * 如果有，就不需要再打 API
 */
async function hasRecentData(origin: string, destination: string, outDate: string): Promise<boolean> {
    const freshnessCutoff = new Date(Date.now() - DATA_FRESHNESS_HOURS * 60 * 60 * 1000);
    const dayStart = new Date(`${outDate}T00:00:00`);
    const dayEnd = new Date(`${outDate}T23:59:59`);

    const count = await db.flight.count({
        where: {
            origin,
            destination,
            departureTime: { gte: dayStart, lte: dayEnd },
            createdAt: { gte: freshnessCutoff },
        },
    });

    return count > 0;
}

// =====================================================
// 標籤與分析
// =====================================================

function generateTags(
    outboundLeg: any,
    flightOption: any,
    price: number,
    tripDays: number,
    effectiveHours: number,
    transportCost: number
): string[] {
    const tags: string[] = [];

    tags.push(`📅${tripDays}天行程`);
    tags.push(`⚡️可用${Math.floor(effectiveHours)}小時`);

    const depTimeStr = outboundLeg.departure_airport?.time;
    const arrTimeStr = outboundLeg.arrival_airport?.time;

    if (depTimeStr && arrTimeStr) {
        const depHour = extractHour(depTimeStr);
        const arrHour = extractHour(arrTimeStr);

        if ((depHour >= 21 || depHour <= 5) && arrHour >= 5 && arrHour <= 10) {
            tags.push('🌙紅眼航班(省住宿)');
        }

        if (arrHour >= 5 && arrHour <= 10) {
            tags.push('☀️早到(玩滿首日)');
        } else if (arrHour >= 11 && arrHour <= 14) {
            tags.push('🌤️午間抵達');
        } else if (arrHour >= 15 && arrHour <= 17) {
            tags.push('🌆午後抵達');
        } else if (arrHour >= 18 && arrHour <= 20) {
            tags.push('🥀傍晚抵達(首日剩餘少)');
        } else if (arrHour >= 21 || arrHour <= 4) {
            tags.push('🌃深夜抵達(浪費首日)');
        }
    }

    const segmentCount = flightOption.flights?.length || 1;
    if (segmentCount === 1) {
        tags.push('✈️直飛');
    } else {
        tags.push(`🔄轉機${segmentCount - 1}次`);
    }

    const airline = outboundLeg.airline || '';
    if (LOW_COST_CARRIERS.some(lcc => airline.includes(lcc))) {
        tags.push('💰廉航');
    }

    const totalDuration = flightOption.total_duration || outboundLeg.duration || 0;
    if (totalDuration > 0) {
        const hours = Math.floor(totalDuration / 60);
        const mins = totalDuration % 60;
        tags.push(`🕐飛行${hours}h${mins > 0 ? mins + 'm' : ''}`);
    }

    const totalCost = price + transportCost;
    if (totalCost <= 5000) {
        tags.push('🔥超低價');
    } else if (totalCost <= 8000) {
        tags.push('💎優惠價');
    } else if (totalCost <= 12000) {
        tags.push('👍合理價');
    }

    return Array.from(new Set(tags));
}

function calculateEffectiveHours(arrivalTimeStr: string | undefined, tripDays: number, returnDepartureHour?: number): number {
    const hoursPerDay = 14; // 每天可用時間 8:00~22:00
    let totalEffective = tripDays * hoursPerDay;

    // 首日：依抵達時間調整
    if (arrivalTimeStr) {
        const arrHour = extractHour(arrivalTimeStr);

        if (arrHour >= 5 && arrHour <= 20) {
            const firstDayHours = Math.max(0, 22 - arrHour - 1);
            totalEffective = totalEffective - hoursPerDay + firstDayHours;
        } else {
            totalEffective = totalEffective - hoursPerDay;
        }
    }

    // 末日：依回程出發時間調整（需提前 3 小時到機場）
    if (returnDepartureHour !== undefined && returnDepartureHour >= 0) {
        const lastDayUsable = Math.max(0, returnDepartureHour - 3 - 8); // 8am 起算，提前3h到機場
        totalEffective = totalEffective - hoursPerDay + lastDayUsable;
    } else {
        totalEffective -= 3; // 預設扣除（無回程時間時）
    }

    return Math.max(0, Math.round(totalEffective));
}

// =====================================================
// 處理並儲存航班（核心：儲存全部航班，不篩價格）
// =====================================================

async function processAndSaveFlights(
    serpData: any,
    dep: string,
    arr: string,
    outDate: string,
    retDate: string,
    days: number,
    userLocation: string,
    source: string = 'google_flights'
) {
    if (!serpData) return 0;

    // 偵測多人票價警告並取得人數
    const passengerWarning: string = (serpData as any).passengerWarning || '';
    let passengerCount = 1;
    if (passengerWarning) {
        const countMatch = passengerWarning.match(/(\d+)\s*位/);
        if (countMatch) {
            passengerCount = parseInt(countMatch[1]);
        }
        console.warn(`[DB] ⚠️ ${passengerWarning} → 自動除以 ${passengerCount} (${dep}→${arr})`);
    }

    const transport = transportCosts[dep]?.[userLocation] || { cost: 500, method: '預估交通費', duration: '未知', reference: '' };

    // 儲存全部航班（不限制數量，不篩價格）
    const allFlights = [
        ...(serpData.best_flights || []),
        ...(serpData.other_flights || []),
    ];

    // 取得最佳回程航班（所有去程共用同一組回程資訊）
    const returnFlightsList: any[] = serpData.returnFlights || [];
    let bestReturn: { airline: string; departureTime: string; arrivalTime: string; duration: number; stops: number; flightNumber: string } | null = null;
    if (returnFlightsList.length > 0) {
        // 依價格排序取最便宜，如果價格相同取飛行時間最短
        const sorted = [...returnFlightsList].sort((a, b) => {
            if (a.price !== b.price) return (a.price || 0) - (b.price || 0);
            return (a.duration || 0) - (b.duration || 0);
        });
        bestReturn = sorted[0];
        if (bestReturn) {
            console.log(`[DB] 最佳回程: ${bestReturn.airline} ${bestReturn.departureTime}→${bestReturn.arrivalTime} (${bestReturn.duration}min)`);
        }
    }

    let savedCount = 0;
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    for (const flightOption of allFlights) {
        const segments = flightOption.flights;
        if (!segments || segments.length === 0) continue;

        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        const rawPrice = flightOption.price || 0;
        if (rawPrice <= 0) continue;
        // 自動除以旅客人數（偵測到多人票價時）
        const price = passengerCount > 1 ? Math.round(rawPrice / passengerCount) : rawPrice;

        try {
            const depTimeStr = firstSegment.departure_airport?.time;
            const arrTimeStr = lastSegment.arrival_airport?.time;
            if (!depTimeStr || !arrTimeStr) continue;

            const outDepTime = parseSerpApiTime(depTimeStr, outDate);
            let outArrTime = parseSerpApiTime(arrTimeStr, outDate);

            if (!outDepTime || !outArrTime) {
                console.warn(`[解析] 無效日期: ${firstSegment.flight_number} | dep=${depTimeStr} arr=${arrTimeStr}`);
                continue;
            }

            if (outArrTime.getTime() < outDepTime.getTime()) {
                outArrTime = new Date(outArrTime.getTime() + 24 * 60 * 60 * 1000);
            }

            // 解析回程時間
            let returnDepTime: Date | null = null;
            let returnArrTime: Date | null = null;
            let returnDuration: number | null = null;
            let returnAirline: string | null = null;
            let returnStopsCount: number | null = null;
            let returnDepHour: number | undefined = undefined;

            if (bestReturn) {
                returnDepTime = parseSerpApiTime(`${retDate} ${bestReturn.departureTime}`, retDate);
                returnArrTime = parseSerpApiTime(`${retDate} ${bestReturn.arrivalTime}`, retDate);
                if (returnArrTime && returnDepTime && returnArrTime.getTime() < returnDepTime.getTime()) {
                    returnArrTime = new Date(returnArrTime.getTime() + 24 * 60 * 60 * 1000);
                }
                returnDuration = bestReturn.duration > 0 ? bestReturn.duration : null;
                returnAirline = bestReturn.airline || null;
                returnStopsCount = bestReturn.stops >= 0 ? bestReturn.stops : null;
                if (returnDepTime) {
                    returnDepHour = returnDepTime.getHours();
                }
            }

            const effectiveHours = calculateEffectiveHours(arrTimeStr, days, returnDepHour);
            const stops = segments.length - 1;
            const airline = firstSegment.airline || '未知航空';
            const flightNumber = firstSegment.flight_number || '';

            const tags = generateTags(firstSegment, flightOption, price, days, effectiveHours, transport.cost);
            const dayOfWeek = outDepTime.getDay();
            tags.push(`📆週${dayNames[dayOfWeek]}出發`);
            if (passengerCount > 1) {
                tags.push(`⚠️原${passengerCount}人價已÷${passengerCount}`);
            }

            const totalDuration = flightOption.total_duration || firstSegment.duration || 0;
            const bookingUrl = buildSearchUrl(dep, arr, outDate, retDate);

            // 去重複：同航司、同出發機場、同目的地、同出發時間、同回程日期
            const existing = await db.flight.findFirst({
                where: {
                    airline,
                    origin: dep,
                    destination: arr,
                    departureTime: outDepTime,
                    returnFlightId: retDate,
                }
            });

            const flightData = {
                airline,
                flightNumber,
                origin: dep,
                destination: arr,
                departureTime: outDepTime,
                arrivalTime: outArrTime,
                flightDuration: totalDuration,
                price,
                currency: 'TWD',
                isRoundTrip: true,
                stops,
                source,
                bookingUrl,
                tags: JSON.stringify(tags),
                totalStayHours: days * 24,
                effectiveHours,
                returnFlightId: retDate,
                returnDepartureTime: returnDepTime,
                returnArrivalTime: returnArrTime,
                returnFlightDuration: returnDuration,
                returnAirline: returnAirline,
                returnStops: returnStopsCount,
            };

            if (existing) {
                // 更新條件：價格變動 或 新增了回程資料
                const needsUpdate = existing.price !== price ||
                    (returnDepTime && !(existing as any).returnDepartureTime);
                if (needsUpdate) {
                    await db.flight.update({ where: { id: existing.id }, data: flightData });
                    if (existing.price !== price) {
                        await db.priceHistory.create({ data: { flightId: existing.id, price } });
                    }
                }
            } else {
                const newFlight = await db.flight.create({ data: flightData });
                await db.priceHistory.create({ data: { flightId: newFlight.id, price } });
                savedCount++;
            }
        } catch (e: any) {
            console.error(`[DB] 儲存失敗 (${dep}→${arr}):`, e.message);
        }
    }

    return savedCount;
}

// =====================================================
// 智慧搜尋策略
// =====================================================

function getAirportsByTransportCost(airports: string[], userLocation: string): string[] {
    return [...airports].sort((a, b) => {
        const costA = transportCosts[a]?.[userLocation]?.cost ?? 9999;
        const costB = transportCosts[b]?.[userLocation]?.cost ?? 9999;
        return costA - costB;
    });
}

/**
 * 搜尋預估：計算所有日期+航線組合，檢查 DB 快取狀態
 * 回傳需要多少次 API 請求
 */
async function estimateSearch(settings: any) {
    const sortedAirports = getAirportsByTransportCost(
        settings.departureAirports,
        settings.userLocation
    );
    const startDays = settings.startDaysAhead || defaultSettings.startDaysAhead;
    const combos = generateDateCombinations(startDays, settings.searchDaysAhead, settings.tripDurations);

    // 用 outbound date 去重（同一天出發只需搜一次，不管 trip duration）
    // SerpApi type=1 來回搜尋：同航線同出發日，不同回程日是不同搜尋
    const searchTasks: { airport: string; dest: string; outbound: string; returnDate: string; days: number; cached: boolean }[] = [];

    for (const airport of sortedAirports) {
        for (const dest of settings.destinations) {
            for (const combo of combos) {
                const cached = await hasRecentData(airport, dest, combo.outbound);
                searchTasks.push({
                    airport,
                    dest,
                    outbound: combo.outbound,
                    returnDate: combo.return,
                    days: combo.days,
                    cached,
                });
            }
        }
    }

    const totalCombos = searchTasks.length;
    const cachedCount = searchTasks.filter(t => t.cached).length;
    const neededApiCalls = totalCombos - cachedCount;

    // 按目的地分組統計
    const byRoute: Record<string, { total: number; cached: number; needed: number }> = {};
    for (const task of searchTasks) {
        const key = `${task.airport}→${task.dest}`;
        if (!byRoute[key]) byRoute[key] = { total: 0, cached: 0, needed: 0 };
        byRoute[key].total++;
        if (task.cached) byRoute[key].cached++;
        else byRoute[key].needed++;
    }

    return {
        totalCombos,
        cachedCount,
        neededApiCalls,
        byRoute,
        airports: sortedAirports.map(a => `${departureAirportNames[a] || a} (${a})`),
        destinations: settings.destinations.map((d: string) => `${airportInfo[d]?.name || d} (${d})`),
        dateRange: { start: startDays, end: settings.searchDaysAhead },
        tripDurations: settings.tripDurations,
        dateCombosCount: combos.length,
    };
}

/**
 * 執行搜尋：遍歷所有航線+日期組合
 * maxCalls: 本次最多消耗的 API 次數（0 = 不限制）
 */
async function runAutoSearch(settings: any, maxCalls: number = 0, useApi: boolean = true) {
    const sortedAirports = getAirportsByTransportCost(
        settings.departureAirports,
        settings.userLocation
    );

    const startDays = settings.startDaysAhead || defaultSettings.startDaysAhead;
    const combos = generateDateCombinations(startDays, settings.searchDaysAhead, settings.tripDurations);
    if (combos.length === 0) return;

    const effectiveMax = maxCalls > 0 ? maxCalls : MAX_API_CALLS_PER_REFRESH;
    let totalSaved = 0;
    let apiCalls = 0;
    let skippedByDb = 0;

    const searchMode = useApi ? 'API' : '爬蟲';
    console.log(`[搜尋] 模式: ${searchMode}`);
    console.log(`[搜尋] 出發機場: ${sortedAirports.map(a => departureAirportNames[a]).join(', ')}`);
    console.log(`[搜尋] 目的地: ${settings.destinations.join(', ')} (共 ${settings.destinations.length} 個)`);
    console.log(`[搜尋] 出發日範圍: 第 ${startDays} ~ ${settings.searchDaysAhead} 天`);
    console.log(`[搜尋] 日期組合: ${combos.length} 組 | 搜尋上限: ${effectiveMax} 次`);

    // 建立搜尋佇列：所有 (機場, 目的地, 日期) 組合
    // 排列順序：交錯目的地和日期，讓搜尋覆蓋更均勻
    const queue: { airport: string; dest: string; combo: typeof combos[0] }[] = [];

    // 先用主要機場遍歷所有目的地和日期
    for (let comboIdx = 0; comboIdx < combos.length; comboIdx++) {
        for (const dest of settings.destinations) {
            queue.push({ airport: sortedAirports[0], dest, combo: combos[comboIdx] });
        }
    }
    // 再用次要機場（只搜 top 目的地）
    if (sortedAirports.length > 1) {
        const secondAirport = sortedAirports[1];
        const topDests = settings.destinations.slice(0, 3);
        for (let comboIdx = 0; comboIdx < Math.min(combos.length, 3); comboIdx++) {
            for (const dest of topDests) {
                queue.push({ airport: secondAirport, dest, combo: combos[comboIdx] });
            }
        }
    }

    for (const task of queue) {
        if (apiCalls >= effectiveMax) {
            console.log(`[搜尋] 已達 API 上限 (${effectiveMax})，停止搜尋`);
            break;
        }

        // DB 快取檢查
        const hasRecent = await hasRecentData(task.airport, task.dest, task.combo.outbound);
        if (hasRecent) {
            skippedByDb++;
            continue;
        }

        try {
            let data;
            const sourceLabel = useApi ? 'google_flights' : 'google_flights_scraper';

            if (useApi) {
                data = await searchRoute(task.airport, task.dest, task.combo.outbound, task.combo.return);
            } else {
                data = await searchRouteScraper(task.airport, task.dest, task.combo.outbound, task.combo.return);
            }

            const saved = await processAndSaveFlights(
                data, task.airport, task.dest,
                task.combo.outbound, task.combo.return,
                task.combo.days, settings.userLocation,
                sourceLabel
            );
            totalSaved += saved;
            if (data !== null) apiCalls++;

            // 爬蟲模式延遲較長以避免被封鎖
            const delayMs = useApi ? 1000 : 3000 + Math.random() * 2000;
            await new Promise(r => setTimeout(r, delayMs));
        } catch (e: any) {
            console.error(`[搜尋] ${task.airport}→${task.dest} 失敗:`, e.message);
        }
    }

    console.log(`[搜尋完成] ${searchMode}消耗 ${apiCalls} 次 | 新增 ${totalSaved} 筆 | DB 跳過 ${skippedByDb} 條航線`);

    // Skyscanner 連結生成（不消耗 API）
    try {
        await searchSkyscanner([sortedAirports[0]], settings.destinations, combos.slice(0, 2));
    } catch (e: any) {
        // Skyscanner 失敗不影響主流程
    }
}

// =====================================================
// API Handler
// =====================================================

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const estimate = searchParams.get('estimate') === 'true';
    const maxCalls = parseInt(searchParams.get('maxCalls') || '') || 0;
    const useApi = searchParams.get('useApi') === 'true'; // 預設 false（爬蟲模式，API 額度已用完）

    const userSettings = {
        userLocation: searchParams.get('location') || defaultSettings.userLocation,
        departureAirports: searchParams.get('airports')?.split(',').filter(Boolean) || defaultSettings.departureAirports,
        destinations: searchParams.get('destinations')?.split(',').filter(Boolean) || defaultSettings.destinations,
        tripDurations: searchParams.get('durations')?.split(',').map(Number).filter(n => !isNaN(n)) || defaultSettings.tripDurations,
        priceThreshold: parseInt(searchParams.get('priceThreshold') || '') || defaultSettings.priceThreshold,
        searchDaysAhead: parseInt(searchParams.get('searchDaysAhead') || '') || defaultSettings.searchDaysAhead,
        startDaysAhead: parseInt(searchParams.get('startDaysAhead') || '') || defaultSettings.startDaysAhead,
    };

    // 預估模式：只回傳搜尋計畫，不執行
    if (estimate) {
        try {
            const plan = await estimateSearch(userSettings);
            return NextResponse.json({ success: true, estimate: { ...plan, searchMode: useApi ? 'api' : 'scraper' } });
        } catch (e: any) {
            return NextResponse.json({ success: false, error: e.message }, { status: 500 });
        }
    }

    console.log(`[API] 請求: refresh=${refresh}, threshold=${userSettings.priceThreshold}, maxCalls=${maxCalls || 'default'}, mode=${useApi ? 'API' : '爬蟲'}`);

    if (refresh) {
        try {
            await runAutoSearch(userSettings, maxCalls, useApi);
        } catch (e: any) {
            console.error('[API] 搜尋過程發生錯誤:', e.message);
        }
    }

    // 清理 DB 中航空公司名稱為 UI 文字的錯誤記錄
    try {
        const badAirlineKeywords = ['關閉', '對話', '費用', '乘客', '協助', '可能須', '服務資訊', '點擊', '選取航班'];
        const badFlights = await db.flight.findMany({
            where: {
                OR: badAirlineKeywords.map(kw => ({ airline: { contains: kw } })),
            },
            select: { id: true },
        });
        if (badFlights.length > 0) {
            // 先刪除相關 priceHistory，再刪除航班
            await db.priceHistory.deleteMany({ where: { flightId: { in: badFlights.map(f => f.id) } } });
            const deleted = await db.flight.deleteMany({
                where: { id: { in: badFlights.map(f => f.id) } },
            });
            console.log(`[清理] 刪除 ${deleted.count} 筆航空公司名稱錯誤的記錄`);
        }
    } catch (e: any) {
        console.error('[清理] 清理錯誤記錄失敗:', e.message);
    }

    // 從 DB 讀取資料 — 只依據出發地、目的地和出發日期(未過期)過濾
    // 價格篩選在顯示層做
    try {
        const now = new Date();

        const flights = await db.flight.findMany({
            where: {
                origin: { in: userSettings.departureAirports },
                destination: { in: userSettings.destinations },
                // 只顯示未過期的航班（出發日在今天以後）
                departureTime: { gte: now },
            },
            orderBy: { price: 'asc' },
        });

        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

        const formattedFlights = flights
            .map(f => {
                const transport = transportCosts[f.origin]?.[userSettings.userLocation]
                    || { cost: 500, method: '預估交通費', duration: '未知', reference: '' };
                const tags: string[] = JSON.parse(f.tags || '[]');
                const totalCost = f.price + transport.cost;
                const returnDateStr = f.returnFlightId || '';

                // 計算行程天數
                let tripDays = 0;
                if (returnDateStr) {
                    const depDate = new Date(f.departureTime);
                    const retDate = new Date(returnDateStr);
                    if (!isNaN(retDate.getTime())) {
                        tripDays = Math.round((retDate.getTime() - depDate.getTime()) / (1000 * 60 * 60 * 24));
                    }
                }
                if (tripDays === 0) {
                    const tripDaysTag = tags.find(t => t.includes('天行程'));
                    if (tripDaysTag) {
                        tripDays = parseInt(tripDaysTag.replace(/\D/g, '')) || 0;
                    }
                }

                // 格式化回程日期
                let returnDateDisplay = '請見詳情';
                if (returnDateStr && !isNaN(new Date(returnDateStr).getTime())) {
                    const retD = new Date(returnDateStr);
                    returnDateDisplay = retD.toLocaleDateString('zh-TW', {
                        month: '2-digit', day: '2-digit', weekday: 'short'
                    });
                }

                // 出發日期資訊
                const depDate = new Date(f.departureTime);
                const daysFromNow = Math.ceil((depDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                return {
                    id: f.id,
                    departureAirport: f.origin,
                    departureAirportName: departureAirportNames[f.origin] || f.origin,
                    destination: airportInfo[f.destination]?.name || f.destination,
                    destinationCode: f.destination,
                    country: airportInfo[f.destination]?.country || '',
                    airline: f.airline,
                    flightNumber: f.flightNumber,
                    price: f.price,
                    transportCost: transport.cost,
                    transportMethod: transport.method,
                    transportDuration: transport.duration,
                    transportReference: transport.reference,
                    totalCost,
                    outboundDate: depDate.toLocaleDateString('zh-TW', {
                        month: '2-digit', day: '2-digit', weekday: 'short',
                    }),
                    outboundTime: depDate.toLocaleTimeString('zh-TW', {
                        hour: '2-digit', minute: '2-digit', hour12: false,
                    }),
                    outboundArrival: new Date(f.arrivalTime).toLocaleTimeString('zh-TW', {
                        hour: '2-digit', minute: '2-digit', hour12: false,
                    }),
                    returnDate: returnDateDisplay,
                    returnDateRaw: returnDateStr,
                    returnDepartureTime: f.returnDepartureTime
                        ? new Date(f.returnDepartureTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
                        : '',
                    returnArrivalTime: f.returnArrivalTime
                        ? new Date(f.returnArrivalTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
                        : '',
                    returnAirline: f.returnAirline || '',
                    returnFlightDuration: f.returnFlightDuration || 0,
                    returnStops: f.returnStops ?? 0,
                    effectiveStayHours: f.effectiveHours || 0,
                    tripDays,
                    daysFromNow,
                    stops: f.stops,
                    tags,
                    bookingUrl: f.bookingUrl,
                    sourceUrl: f.bookingUrl,
                    visaInfo: airportInfo[f.destination]?.visa || '',
                    entryRequirements: airportInfo[f.destination]?.requirements || '',
                    foundAt: f.createdAt.toISOString(),
                    flightDuration: f.flightDuration,
                };
            })
            // 用 totalCost 過濾（含交通費）
            .filter(f => f.totalCost <= userSettings.priceThreshold)
            // 按 totalCost 排序
            .sort((a, b) => a.totalCost - b.totalCost);

        return NextResponse.json({
            success: true,
            data: formattedFlights,
            meta: {
                lastSearchTime: new Date().toISOString(),
                settings: {
                    userLocation: userSettings.userLocation,
                    departureAirports: userSettings.departureAirports.map(a => departureAirportNames[a] || a),
                    destinations: userSettings.destinations.map(d => airportInfo[d]?.name || d),
                    priceThreshold: userSettings.priceThreshold,
                    tripDurations: userSettings.tripDurations,
                    startDaysAhead: userSettings.startDaysAhead,
                },
                totalFound: formattedFlights.length,
                totalInDb: flights.length,
            },
        });
    } catch (error: any) {
        console.error('[API] 查詢失敗:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
