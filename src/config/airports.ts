/**
 * 台灣機場與交通費用配置
 * 包含前往各機場的交通方式與費用
 */

import type { Airport, TransportOption } from '../types/index.js';

// =====================================================
// 機場定義
// =====================================================

export const AIRPORTS: Airport[] = [
    {
        code: 'TPE',
        name: '桃園國際機場',
        city: '桃園',
        timezone: 'Asia/Taipei',
        transportOptions: {
            '台北市': [
                { method: '捷運', from: '台北車站', cost: 160, duration: 39, description: '機場捷運直達車' },
                { method: '捷運', from: '台北車站', cost: 160, duration: 52, description: '機場捷運普通車' },
                { method: '客運', from: '台北車站', cost: 140, duration: 55, description: '國光客運 1819' },
                { method: '計程車', from: '市區', cost: 1200, duration: 45, description: '包車/計程車' },
            ],
            '新北市': [
                { method: '捷運', from: '新北產業園區', cost: 110, duration: 25, description: '機場捷運' },
                { method: '捷運', from: '三重站', cost: 130, duration: 32, description: '機場捷運' },
                { method: '客運', from: '板橋', cost: 145, duration: 60, description: '客運' },
            ],
            '桃園': [
                { method: '捷運', from: '高鐵桃園站', cost: 35, duration: 11, description: '機場捷運' },
                { method: '客運', from: '桃園市區', cost: 60, duration: 25, description: '統聯客運' },
                { method: '計程車', from: '桃園市區', cost: 400, duration: 15 },
            ],
            '新竹': [
                { method: '高鐵', from: '新竹高鐵站', cost: 325, duration: 50, description: '高鐵到桃園 + 機場捷運' },
                // 高鐵新竹到桃園 290 + 捷運 35 = 325
            ],
            '台中': [
                { method: '高鐵', from: '台中高鐵站', cost: 575, duration: 70, description: '高鐵到桃園 + 機場捷運' },
                // 高鐵台中到桃園 540 + 捷運 35 = 575
                { method: '客運', from: '台中市區', cost: 280, duration: 150, description: '國光客運' },
            ],
            '台南': [
                { method: '高鐵', from: '台南高鐵站', cost: 1175, duration: 110, description: '高鐵到桃園 + 機場捷運' },
                // 高鐵台南到桃園 1140 + 捷運 35 = 1175
            ],
            '高雄': [
                { method: '高鐵', from: '左營高鐵站', cost: 1525, duration: 130, description: '高鐵到桃園 + 機場捷運' },
                // 高鐵左營到桃園 1490 + 捷運 35 = 1525
            ],
        },
    },
    {
        code: 'TSA',
        name: '台北松山機場',
        city: '台北',
        timezone: 'Asia/Taipei',
        transportOptions: {
            '台北市': [
                { method: '捷運', from: '市區', cost: 25, duration: 20, description: '文湖線松山機場站' },
                { method: '計程車', from: '市區', cost: 200, duration: 15 },
            ],
            '新北市': [
                { method: '捷運', from: '板橋', cost: 40, duration: 35, description: '捷運轉乘' },
                { method: '捷運', from: '三重', cost: 35, duration: 30, description: '捷運轉乘' },
            ],
            '桃園': [
                { method: '高鐵', from: '桃園高鐵站', cost: 195, duration: 50, description: '高鐵到台北 + 捷運' },
                // 高鐵桃園到台北 170 + 捷運 25 = 195
            ],
            '新竹': [
                { method: '高鐵', from: '新竹高鐵站', cost: 335, duration: 60, description: '高鐵到台北 + 捷運' },
                // 高鐵新竹到台北 310 + 捷運 25 = 335
            ],
            '台中': [
                { method: '高鐵', from: '台中高鐵站', cost: 725, duration: 85, description: '高鐵到台北 + 捷運' },
                // 高鐵台中到台北 700 + 捷運 25 = 725
            ],
        },
    },
    {
        code: 'KHH',
        name: '高雄國際機場',
        city: '高雄',
        timezone: 'Asia/Taipei',
        transportOptions: {
            '高雄市': [
                { method: '捷運', from: '高雄車站', cost: 35, duration: 20, description: '紅線高雄國際機場站' },
                { method: '捷運', from: '左營高鐵站', cost: 40, duration: 30, description: '紅線' },
                { method: '計程車', from: '市區', cost: 300, duration: 20 },
            ],
            '台南': [
                { method: '台鐵', from: '台南車站', cost: 150, duration: 70, description: '台鐵 + 捷運' },
                { method: '高鐵', from: '台南高鐵站', cost: 190, duration: 45, description: '高鐵到左營 + 捷運' },
                // 高鐵台南到左營 150 + 捷運 40 = 190
            ],
            '屏東': [
                { method: '客運', from: '屏東市區', cost: 80, duration: 50, description: '屏東客運' },
                { method: '台鐵', from: '屏東車站', cost: 60, duration: 45, description: '台鐵 + 捷運' },
            ],
            '台中': [
                { method: '高鐵', from: '台中高鐵站', cost: 830, duration: 75, description: '高鐵到左營 + 捷運' },
                // 高鐵台中到左營 790 + 捷運 40 = 830
            ],
            '台北市': [
                { method: '高鐵', from: '台北高鐵站', cost: 1530, duration: 120, description: '高鐵到左營 + 捷運' },
                // 高鐵台北到左營 1490 + 捷運 40 = 1530
            ],
        },
    },
];

// =====================================================
// 常用目的地
// =====================================================

export const POPULAR_DESTINATIONS = {
    日本: [
        { code: 'NRT', name: '東京成田', city: '東京' },
        { code: 'HND', name: '東京羽田', city: '東京' },
        { code: 'KIX', name: '大阪關西', city: '大阪' },
        { code: 'FUK', name: '福岡', city: '福岡' },
        { code: 'CTS', name: '札幌新千歲', city: '札幌' },
        { code: 'OKA', name: '沖繩那霸', city: '沖繩' },
    ],
    韓國: [
        { code: 'ICN', name: '仁川國際', city: '首爾' },
        { code: 'GMP', name: '金浦', city: '首爾' },
        { code: 'PUS', name: '釜山金海', city: '釜山' },
    ],
    東南亞: [
        { code: 'BKK', name: '曼谷蘇凡納布', city: '曼谷' },
        { code: 'DMK', name: '曼谷廊曼', city: '曼谷' },
        { code: 'SIN', name: '新加坡樟宜', city: '新加坡' },
        { code: 'SGN', name: '胡志明市', city: '胡志明市' },
        { code: 'HAN', name: '河內', city: '河內' },
        { code: 'DPS', name: '峇里島', city: '峇里島' },
        { code: 'MNL', name: '馬尼拉', city: '馬尼拉' },
        { code: 'KUL', name: '吉隆坡', city: '吉隆坡' },
    ],
    港澳中國: [
        { code: 'HKG', name: '香港', city: '香港' },
        { code: 'MFM', name: '澳門', city: '澳門' },
        { code: 'PVG', name: '上海浦東', city: '上海' },
        { code: 'PEK', name: '北京首都', city: '北京' },
    ],
};

// =====================================================
// 廉價航空列表
// =====================================================

export const LOW_COST_CARRIERS = [
    'Tigerair Taiwan',  // 台灣虎航
    'Scoot',            // 酷航
    'Peach',            // 樂桃
    'Jetstar',          // 捷星
    'AirAsia',          // 亞洲航空
    'Spring Airlines',  // 春秋航空
    'HK Express',       // 香港快運
    'VietJet',          // 越捷航空
    'Cebu Pacific',     // 宿霧太平洋
    'Thai Lion Air',    // 泰國獅子航空
];

// =====================================================
// 工具函式
// =====================================================

/**
 * 根據機場代碼獲取機場資訊
 */
export function getAirport(code: string): Airport | undefined {
    return AIRPORTS.find(a => a.code === code);
}

/**
 * 獲取從使用者所在地到機場的最便宜交通選項
 */
export function getCheapestTransport(
    airportCode: string,
    userLocation: string
): TransportOption | undefined {
    const airport = getAirport(airportCode);
    if (!airport) return undefined;

    const options = airport.transportOptions[userLocation];
    if (!options || options.length === 0) return undefined;

    return options.reduce((min, opt) =>
        opt.cost < min.cost ? opt : min
    );
}

/**
 * 獲取從使用者所在地到機場的所有交通選項
 */
export function getTransportOptions(
    airportCode: string,
    userLocation: string
): TransportOption[] {
    const airport = getAirport(airportCode);
    if (!airport) return [];

    return airport.transportOptions[userLocation] || [];
}

/**
 * 計算來回交通總費用
 */
export function calculateRoundTripTransportCost(
    airportCode: string,
    userLocation: string
): number {
    const cheapest = getCheapestTransport(airportCode, userLocation);
    if (!cheapest) return 0;
    return cheapest.cost * 2; // 來回
}

/**
 * 檢查是否為廉價航空
 */
export function isLowCostCarrier(airline: string): boolean {
    return LOW_COST_CARRIERS.some(lcc =>
        airline.toLowerCase().includes(lcc.toLowerCase())
    );
}
