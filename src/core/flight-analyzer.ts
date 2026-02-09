/**
 * 機票分析引擎
 * 負責分析航班時間品質並生成標籤
 */

import {
    differenceInHours,
    differenceInMinutes,
    differenceInDays,
    getHours,
    isWeekend,
    format,
} from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import type { Flight, FlightAnalysis, FlightTag } from '../types/index.js';
import { calculateRoundTripTransportCost, isLowCostCarrier } from '../config/airports.js';

// =====================================================
// 時間分析
// =====================================================

/**
 * 分析出發航班的時間品質
 */
function analyzeOutboundTiming(flight: Flight): FlightTag[] {
    const tags: FlightTag[] = [];

    // 取得當地時間
    const departureHour = getHours(flight.departureTime);
    const arrivalHour = getHours(flight.arrivalTime);

    // 紅眼航班：晚上出發 (21:00-02:00)，早上抵達 (05:00-10:00)
    const isLateNightDeparture = departureHour >= 21 || departureHour <= 2;
    const isEarlyMorningArrival = arrivalHour >= 5 && arrivalHour <= 10;

    if (isLateNightDeparture && isEarlyMorningArrival) {
        tags.push('紅眼航班');
    }

    // 早起航班：06:00 前出發
    if (departureHour >= 4 && departureHour < 6) {
        tags.push('早起航班');
    }

    // 深夜抵達：20:00 之後抵達
    if (arrivalHour >= 20 || arrivalHour < 4) {
        tags.push('深夜抵達');
    }

    // 完整首日：06:00-14:00 抵達（當日可完整活動）
    if (arrivalHour >= 6 && arrivalHour <= 14) {
        tags.push('完整首日');
    }

    // 午後抵達：14:00-18:00 抵達
    if (arrivalHour > 14 && arrivalHour <= 18) {
        tags.push('午後抵達');
    }

    // 週末/平日出發
    if (isWeekend(flight.departureTime)) {
        tags.push('週末出發');
    } else {
        tags.push('平日出發');
    }

    return tags;
}

/**
 * 分析回程航班的時間品質
 */
function analyzeReturnTiming(flight: Flight): FlightTag[] {
    const tags: FlightTag[] = [];

    const departureHour = getHours(flight.departureTime);

    // 晚間回程：18:00 之後出發
    if (departureHour >= 18) {
        tags.push('晚間回程');
    }

    // 凌晨回程：00:00-06:00 出發
    if (departureHour >= 0 && departureHour < 6) {
        tags.push('凌晨回程');
    }

    return tags;
}

/**
 * 分析行程長度
 */
function analyzeTripDuration(tripDays: number): FlightTag[] {
    const tags: FlightTag[] = [];

    if (tripDays <= 3) {
        tags.push('短程快閃');
    } else if (tripDays <= 5) {
        tags.push('標準假期');
    } else if (tripDays >= 7) {
        tags.push('長假行程');
    }

    return tags;
}

/**
 * 分析航班特性
 */
function analyzeFlightCharacteristics(flight: Flight): FlightTag[] {
    const tags: FlightTag[] = [];

    // 轉機
    if (flight.stops === 0) {
        tags.push('直飛航班');
    } else {
        tags.push('轉機航班');
    }

    // 廉航
    if (isLowCostCarrier(flight.airline)) {
        tags.push('廉航特價');
    }

    return tags;
}

// =====================================================
// 停留時間計算
// =====================================================

/**
 * 計算實際停留時數（不含飛行時間）
 */
function calculateTotalStayHours(
    outbound: Flight,
    inbound: Flight
): number {
    return differenceInHours(inbound.departureTime, outbound.arrivalTime);
}

/**
 * 計算有效活動時數
 * 扣除：
 * - 深夜抵達當天剩餘時間
 * - 回程當天提前到機場時間
 * - 睡眠時間不全額扣除（假設住宿內正常作息）
 */
function calculateEffectiveStayHours(
    outbound: Flight,
    inbound: Flight
): number {
    const totalStay = calculateTotalStayHours(outbound, inbound);
    let ineffectiveHours = 0;

    const arrivalHour = getHours(outbound.arrivalTime);
    const returnDepartureHour = getHours(inbound.departureTime);

    // 如果深夜抵達 (20:00 後)，當天剩餘時間視為無效
    if (arrivalHour >= 20) {
        ineffectiveHours += (24 - arrivalHour);
    }

    // 如果凌晨抵達 (00:00-05:00)，需要先休息
    if (arrivalHour >= 0 && arrivalHour < 5) {
        ineffectiveHours += (8 - arrivalHour); // 假設休息到 08:00
    }

    // 回程當天需要提前 3 小時到機場
    ineffectiveHours += 3;

    // 如果是凌晨回程，前一晚可能需要提早準備
    if (returnDepartureHour >= 0 && returnDepartureHour < 6) {
        ineffectiveHours += 3; // 額外扣除
    }

    return Math.max(0, totalStay - ineffectiveHours);
}

// =====================================================
// 主要分析函數
// =====================================================

/**
 * 完整分析機票
 */
export function analyzeFlight(
    flight: Flight,
    userLocation: string
): FlightAnalysis {
    // 確保有回程航班資訊
    if (!flight.isRoundTrip || !flight.returnFlight) {
        throw new Error('目前僅支援來回機票分析');
    }

    const returnFlight = flight.returnFlight;

    // 收集所有標籤
    const tags: FlightTag[] = [
        ...analyzeOutboundTiming(flight),
        ...analyzeReturnTiming(returnFlight),
        ...analyzeFlightCharacteristics(flight),
    ];

    // 計算行程天數
    const tripDays = differenceInDays(returnFlight.departureTime, flight.departureTime);
    tags.push(...analyzeTripDuration(tripDays));

    // 計算停留時間
    const totalStayHours = calculateTotalStayHours(flight, returnFlight);
    const effectiveStayHours = calculateEffectiveStayHours(flight, returnFlight);

    // 計算交通費用
    const transportInfo = getTransportInfo(flight.origin, userLocation);
    const transportCost = transportInfo.cost; // 已含來回
    const totalCost = flight.price + transportCost;

    // 標籤邏輯優化
    // 1. 實際停留時間
    tags.push(`⚡️停留${Math.floor(effectiveStayHours)}小時`);

    // 2. 行程週期
    tags.push(`📅${tripDays}天行程`);

    // 3. 紅眼航班 (去程 21:00-05:00 起飛 或 04:00-08:00 抵達) - 視為優質 (省住宿/多玩)
    const depHour = flight.departureTime.getHours();
    const arrHour = flight.arrivalTime.getHours();
    if ((depHour >= 21 || depHour <= 5) && arrHour <= 8) {
        tags.push('🌙紅眼(省住宿)');
    }

    // 4. 首日浪費 (去程 16:00 後抵達) - 視為劣勢
    if (arrHour >= 16) {
        tags.push('🥀晚到(浪費首日)');
    } else if (arrHour <= 10) {
        tags.push('☀️早到(玩滿首日)');
    }

    // 5. 轉機提示
    if (flight.stops > 0) {
        tags.push(`🔄轉機${flight.stops}次`);
    } else {
        tags.push('✈️直飛');
    }

    // 計算效益指標
    const pricePerEffectiveHour = effectiveStayHours > 0
        ? Math.round(totalCost / effectiveStayHours)
        : 0;
    const pricePerDay = tripDays > 0
        ? Math.round(totalCost / tripDays)
        : 0;

    // 去除重複標籤
    const uniqueTags = [...new Set(tags)];

    return {
        flight,
        totalStayHours,
        effectiveStayHours,
        tags: uniqueTags,
        totalCost,
        transportCost,
        pricePerEffectiveHour,
        pricePerDay,
        historicalComparison: 'average', // 後續會從歷史資料判斷
        tripDays,
    };
}

import { transportCosts } from '../config/transport.js';

function getTransportInfo(airportCode: string, userLocation: string) {
    const airportData = transportCosts[airportCode];
    if (!airportData) {
        return { cost: 500 }; // 預設值
    }
    const info = airportData[userLocation];
    return info || { cost: 500 };
}

/**
 * 批次分析多個機票
 */
export function analyzeFlights(
    flights: Flight[],
    userLocation: string
): FlightAnalysis[] {
    return flights
        .filter(f => f.isRoundTrip && f.returnFlight)
        .map(f => analyzeFlight(f, userLocation));
}

/**
 * 格式化航班時間資訊
 */
export function formatFlightTiming(analysis: FlightAnalysis): string {
    const { flight, totalStayHours, effectiveStayHours, tripDays } = analysis;
    const returnFlight = flight.returnFlight!;

    const outDep = format(flight.departureTime, 'MM/dd HH:mm');
    const outArr = format(flight.arrivalTime, 'HH:mm');
    const retDep = format(returnFlight.departureTime, 'MM/dd HH:mm');
    const retArr = format(returnFlight.arrivalTime, 'HH:mm');

    return `
去程：${outDep} → ${outArr} (${flight.airline})
回程：${retDep} → ${retArr} (${returnFlight.airline})
停留：${tripDays} 天 / 約 ${totalStayHours} 小時
有效活動時間：約 ${effectiveStayHours} 小時
`.trim();
}

/**
 * 判斷是否為優質時段航班
 */
export function isGoodTimingFlight(analysis: FlightAnalysis): boolean {
    const { tags } = analysis;

    // 優質條件：紅眼航班或完整首日，且不是深夜抵達
    const hasGoodArrival = tags.includes('紅眼航班') || tags.includes('完整首日');
    const hasBadArrival = tags.includes('深夜抵達');

    // 回程優質條件：晚間回程（可完整利用最後一天）
    const hasGoodReturn = tags.includes('晚間回程');

    return hasGoodArrival && !hasBadArrival && hasGoodReturn;
}
