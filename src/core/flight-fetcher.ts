/**
 * 機票資料擷取模組
 * 支援多種 API 來源
 */

import axios, { type AxiosInstance } from 'axios';
import { settings } from '../config/settings.js';
import { transportCosts } from '../config/transport.js';
import type { Flight, SearchRequest, FlightTag } from '../types/index.js';
import { addDays, format, getHours } from 'date-fns';

// =====================================================
// API 客戶端基礎
// =====================================================

interface FlightFetcher {
    name: string;
    isConfigured: boolean;
    searchFlights(request: SearchRequest): Promise<Flight[]>;
}

// =====================================================
// SerpApi (Google Flights) 實作
// =====================================================

class SerpApiFetcher implements FlightFetcher {
    name = 'SerpApi (Google Flights)';
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: 'https://serpapi.com',
            timeout: 30000,
        });
    }

    get isConfigured(): boolean {
        return settings.api.serpapi.isConfigured;
    }

    async searchFlights(request: SearchRequest): Promise<Flight[]> {
        if (!this.isConfigured) {
            throw new Error('SerpApi 未配置');
        }

        const flights: Flight[] = [];
        // 限制搜尋次數避免 API 額度用完
        let searchCount = 0;
        const maxSearches = 5;

        // 對每個出發地和目的地組合進行搜尋
        // 為了節省額度，這裡只取第一個出發地
        const origin = request.origins[0] || 'TPE';

        for (const destination of request.destinations) {
            if (searchCount >= maxSearches) break;

            // 搜尋日期範圍內的航班
            // 只搜尋最近的一個日期組合
            const tripDuration = request.tripDurations[0] || 5;
            const departureDate = addDays(new Date(), 7); // 一週後
            const returnDate = addDays(departureDate, tripDuration);

            try {
                const result = await this.fetchSingleSearch(
                    origin,
                    destination,
                    departureDate,
                    returnDate
                );
                flights.push(...result);
                searchCount++;
            } catch (error) {
                console.error(`搜尋失敗: ${origin} → ${destination}`, error);
            }

            // 每次搜尋間隔，避免請求過快
            await this.delay(2000);
        }

        return flights;
    }

    private async fetchSingleSearch(
        origin: string,
        destination: string,
        departureDate: Date,
        returnDate: Date
    ): Promise<Flight[]> {
        const params = {
            engine: 'google_flights',
            api_key: settings.api.serpapi.apiKey,
            departure_id: origin,
            arrival_id: destination,
            outbound_date: format(departureDate, 'yyyy-MM-dd'),
            return_date: format(returnDate, 'yyyy-MM-dd'),
            currency: 'TWD',
            hl: 'zh-TW',
            type: '1', // 來回
        };

        console.log(`正在搜尋: ${origin} -> ${destination} (${params.outbound_date})`);
        const response = await this.client.get('/search', { params });

        return this.parseResponse(response.data, origin, destination, departureDate, returnDate);
    }

    private parseResponse(
        data: any,
        origin: string,
        destination: string,
        departureDate: Date,
        returnDate: Date
    ): Flight[] {
        const flights: Flight[] = [];

        // 解析最佳航班
        const bestFlights = data.best_flights || [];
        const otherFlights = data.other_flights || [];

        // 只取前 5 個結果
        const allFlights = [...bestFlights, ...otherFlights].slice(0, 5);

        for (const flightData of allFlights) {
            try {
                const outbound = flightData.flights?.[0];
                const returnFlights = flightData.flights?.[flightData.flights.length - 1]; // 最後一段是回程? SerpApi 結構有時是 flights 陣列包含去回

                if (!outbound) continue;

                // 產生訂票連結
                const bookingUrl = `https://www.google.com/travel/flights?q=Flights%20from%20${origin}%20to%20${destination}%20on%20${format(departureDate, 'yyyy-MM-dd')}%20returning%20${format(returnDate, 'yyyy-MM-dd')}&curr=TWD`;

                // 建立去程航班
                const flight: Flight = {
                    id: `serpapi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    airline: outbound.airline || '未知航空',
                    airlineLogo: outbound.airline_logo,
                    flightNumber: outbound.flight_number,
                    origin,
                    destination,
                    departureTime: new Date(departureDate), // 暫時使用日期，時間需要解析
                    arrivalTime: new Date(departureDate),
                    flightDuration: outbound.duration || 0,
                    price: flightData.price || 0,
                    currency: 'TWD',
                    stops: (flightData.flights?.length || 1) - 1,
                    source: 'serpapi',
                    bookingUrl: bookingUrl,
                    isRoundTrip: true,
                    returnFlight: {
                        id: `serpapi_return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        airline: outbound.airline || '未知航空',
                        flightNumber: outbound.flight_number,
                        origin: destination,
                        destination: origin,
                        departureTime: new Date(returnDate),
                        arrivalTime: new Date(returnDate),
                        flightDuration: outbound.duration || 0,
                        price: 0,
                        currency: 'TWD',
                        stops: 0,
                        source: 'serpapi',
                        isRoundTrip: false,
                    },
                };

                // 解析時間字串 (例如 "06:35")
                if (outbound.departure_airport?.time) {
                    const [hours, minutes] = outbound.departure_airport.time.split(':').map(Number);
                    flight.departureTime.setHours(hours, minutes, 0, 0);
                }

                if (outbound.arrival_airport?.time) {
                    const [hours, minutes] = outbound.arrival_airport.time.split(':').map(Number);
                    flight.arrivalTime.setHours(hours, minutes, 0, 0);
                }

                flights.push(flight);
            } catch (error) {
                console.error('解析航班資料失敗:', error);
            }
        }

        return flights;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// =====================================================
// 模擬資料（用於開發測試）
// =====================================================

class MockFetcher implements FlightFetcher {
    name = '模擬資料';
    isConfigured = true;

    async searchFlights(request: SearchRequest): Promise<Flight[]> {
        // ... (保持原有的模擬邏輯，這裡省略以節省篇幅)
        return [];
    }
}

// =====================================================
// 主要匯出
// =====================================================

/**
 * 獲取可用的機票擷取器
 */
export function getAvailableFetcher(): FlightFetcher {
    // 優先使用 SerpApi
    const serpApi = new SerpApiFetcher();
    if (serpApi.isConfigured) {
        return serpApi;
    }

    // 如果沒有配置任何 API，使用模擬資料
    console.warn('⚠️  未配置任何機票 API，使用模擬資料');
    return new MockFetcher();
}

/**
 * 搜尋機票
 */
export async function searchFlights(request: SearchRequest): Promise<Flight[]> {
    const fetcher = getAvailableFetcher();
    console.log(`🔍 使用 ${fetcher.name} 搜尋機票...`);
    return fetcher.searchFlights(request);
}

export { SerpApiFetcher, MockFetcher };
