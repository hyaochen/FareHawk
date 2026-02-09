/**
 * 機票排序與過濾
 */

import type { FlightAnalysis, FlightTag } from '../types/index.js';

// =====================================================
// 排序函數
// =====================================================

export type SortOption =
    | 'price_asc'           // 價格由低到高
    | 'price_desc'          // 價格由高到低
    | 'total_cost_asc'      // 總成本由低到高（含交通）
    | 'effective_hours_desc' // 有效時數由高到低
    | 'value_asc'           // CP值由高到低（每小時成本最低）
    | 'departure_asc';      // 出發日期由近到遠

/**
 * 根據排序選項排序機票
 */
export function sortFlights(
    flights: FlightAnalysis[],
    sortBy: SortOption = 'total_cost_asc'
): FlightAnalysis[] {
    const sorted = [...flights];

    switch (sortBy) {
        case 'price_asc':
            return sorted.sort((a, b) => a.flight.price - b.flight.price);

        case 'price_desc':
            return sorted.sort((a, b) => b.flight.price - a.flight.price);

        case 'total_cost_asc':
            return sorted.sort((a, b) => a.totalCost - b.totalCost);

        case 'effective_hours_desc':
            return sorted.sort((a, b) => b.effectiveStayHours - a.effectiveStayHours);

        case 'value_asc':
            return sorted.sort((a, b) => a.pricePerEffectiveHour - b.pricePerEffectiveHour);

        case 'departure_asc':
            return sorted.sort((a, b) =>
                a.flight.departureTime.getTime() - b.flight.departureTime.getTime()
            );

        default:
            return sorted;
    }
}

// =====================================================
// 過濾函數
// =====================================================

export interface FilterOptions {
    maxPrice?: number;              // 最高價格
    maxTotalCost?: number;          // 最高總成本
    minEffectiveHours?: number;     // 最少有效時數
    tripDays?: number[];            // 指定行程天數
    includeTags?: FlightTag[];      // 必須包含的標籤
    excludeTags?: FlightTag[];      // 排除的標籤
    airlines?: string[];            // 指定航空公司
    directOnly?: boolean;           // 僅直飛
    destinations?: string[];        // 指定目的地
}

/**
 * 根據條件過濾機票
 */
export function filterFlights(
    flights: FlightAnalysis[],
    options: FilterOptions
): FlightAnalysis[] {
    return flights.filter(analysis => {
        const { flight, totalCost, effectiveStayHours, tags, tripDays } = analysis;

        // 價格過濾
        if (options.maxPrice && flight.price > options.maxPrice) {
            return false;
        }

        // 總成本過濾
        if (options.maxTotalCost && totalCost > options.maxTotalCost) {
            return false;
        }

        // 有效時數過濾
        if (options.minEffectiveHours && effectiveStayHours < options.minEffectiveHours) {
            return false;
        }

        // 行程天數過濾
        if (options.tripDays && options.tripDays.length > 0) {
            if (!options.tripDays.includes(tripDays)) {
                return false;
            }
        }

        // 必須包含標籤
        if (options.includeTags && options.includeTags.length > 0) {
            const hasAllTags = options.includeTags.every(tag => tags.includes(tag));
            if (!hasAllTags) {
                return false;
            }
        }

        // 排除標籤
        if (options.excludeTags && options.excludeTags.length > 0) {
            const hasExcludedTag = options.excludeTags.some(tag => tags.includes(tag));
            if (hasExcludedTag) {
                return false;
            }
        }

        // 航空公司過濾
        if (options.airlines && options.airlines.length > 0) {
            const airlineLower = flight.airline.toLowerCase();
            const matchesAirline = options.airlines.some(a =>
                airlineLower.includes(a.toLowerCase())
            );
            if (!matchesAirline) {
                return false;
            }
        }

        // 僅直飛
        if (options.directOnly && flight.stops > 0) {
            return false;
        }

        // 目的地過濾
        if (options.destinations && options.destinations.length > 0) {
            if (!options.destinations.includes(flight.destination)) {
                return false;
            }
        }

        return true;
    });
}

// =====================================================
// 快速過濾預設
// =====================================================

/**
 * 獲取便宜且優質時段的機票
 */
export function getGoodDeals(
    flights: FlightAnalysis[],
    maxPrice: number
): FlightAnalysis[] {
    return filterFlights(flights, {
        maxTotalCost: maxPrice,
        excludeTags: ['深夜抵達', '凌晨回程'],
        includeTags: [], // 不強制要求特定標籤
    });
}

/**
 * 獲取最有CP值的機票（每有效小時成本最低）
 */
export function getBestValueFlights(
    flights: FlightAnalysis[],
    topN: number = 10
): FlightAnalysis[] {
    return sortFlights(flights, 'value_asc').slice(0, topN);
}

/**
 * 獲取紅眼航班優惠
 */
export function getRedEyeDeals(
    flights: FlightAnalysis[]
): FlightAnalysis[] {
    return filterFlights(flights, {
        includeTags: ['紅眼航班'],
    });
}

/**
 * 獲取週末快閃行程
 */
export function getWeekendTrips(
    flights: FlightAnalysis[]
): FlightAnalysis[] {
    return filterFlights(flights, {
        includeTags: ['週末出發'],
        tripDays: [2, 3, 4],
    });
}

// =====================================================
// 統計函數
// =====================================================

export interface FlightStats {
    count: number;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    minTotalCost: number;
    maxTotalCost: number;
    avgTotalCost: number;
    avgEffectiveHours: number;
}

/**
 * 計算機票統計資訊
 */
export function calculateStats(flights: FlightAnalysis[]): FlightStats {
    if (flights.length === 0) {
        return {
            count: 0,
            minPrice: 0,
            maxPrice: 0,
            avgPrice: 0,
            minTotalCost: 0,
            maxTotalCost: 0,
            avgTotalCost: 0,
            avgEffectiveHours: 0,
        };
    }

    const prices = flights.map(f => f.flight.price);
    const totalCosts = flights.map(f => f.totalCost);
    const effectiveHours = flights.map(f => f.effectiveStayHours);

    return {
        count: flights.length,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        minTotalCost: Math.min(...totalCosts),
        maxTotalCost: Math.max(...totalCosts),
        avgTotalCost: Math.round(totalCosts.reduce((a, b) => a + b, 0) / totalCosts.length),
        avgEffectiveHours: Math.round(effectiveHours.reduce((a, b) => a + b, 0) / effectiveHours.length),
    };
}
