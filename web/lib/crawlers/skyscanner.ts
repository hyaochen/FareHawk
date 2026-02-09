/**
 * Skyscanner 模組
 *
 * 原本的 Browse Quotes API 端點已失效（Skyscanner 頻繁更換內部 API）
 * 改為：
 * 1. 生成 Skyscanner 搜尋連結供使用者手動比價
 * 2. 主要航班資料依靠 SerpApi（Google Flights）
 *
 * 此模組保留作為連結生成器和未來 API 整合的擴充點
 */

export interface SkyscannerFlight {
    airline: string;
    price: number;          // TWD
    origin: string;
    destination: string;
    outboundDate: string;   // YYYY-MM-DD
    returnDate: string;     // YYYY-MM-DD
    isDirect: boolean;
    tripDays: number;
    source: 'skyscanner';
    bookingUrl: string;
    departureTimes?: string;
    arrivalTimes?: string;
}

/**
 * 生成 Skyscanner 搜尋 URL
 * 格式: https://www.skyscanner.com.tw/transport/flights/tpe/nrt/250214/250218/
 */
function generateSkyscannerUrl(origin: string, destination: string, outDate: string, retDate: string): string {
    // 日期格式: YYMMDD
    const outYYMMDD = outDate.substring(2).replace(/-/g, '');
    const retYYMMDD = retDate.substring(2).replace(/-/g, '');
    return `https://www.skyscanner.com.tw/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${outYYMMDD}/${retYYMMDD}/`;
}

/**
 * 生成 Google Flights 搜尋 URL（作為備用比價連結）
 */
function generateGoogleFlightsUrl(origin: string, destination: string, outDate: string, retDate: string): string {
    return `https://www.google.com/travel/flights?q=Flights+from+${origin}+to+${destination}+on+${outDate}+return+${retDate}&curr=TWD`;
}

/**
 * 計算行程天數
 */
function calculateTripDays(outDate: string, retDate: string): number {
    const out = new Date(outDate);
    const ret = new Date(retDate);
    return Math.round((ret.getTime() - out.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 搜尋 Skyscanner
 *
 * 目前 Browse API 已失效，此函式僅生成搜尋連結
 * 不消耗任何 API 額度，不會產生 404 錯誤
 */
export async function searchSkyscanner(
    origins: string[],
    destinations: string[],
    dateCombos: { outbound: string; return: string; days: number }[],
): Promise<SkyscannerFlight[]> {
    console.log('[Skyscanner] 生成比價連結（API 已停用，改為連結模式）');

    // 不再嘗試 API 呼叫，僅記錄可用的搜尋連結供 debug 或未來使用
    const links: string[] = [];
    const origin = origins[0];
    const combo = dateCombos[0];

    if (origin && combo) {
        for (const dest of destinations.slice(0, 3)) {
            const url = generateSkyscannerUrl(origin, dest, combo.outbound, combo.return);
            links.push(`  ${origin}→${dest}: ${url}`);
        }
        console.log(`[Skyscanner] 可手動比價的連結:\n${links.join('\n')}`);
    }

    // 回傳空陣列，不再產生無用的 404 錯誤
    return [];
}

/**
 * 生成比價連結（供前端使用）
 */
export function getComparisonLinks(origin: string, destination: string, outDate: string, retDate: string) {
    return {
        skyscanner: generateSkyscannerUrl(origin, destination, outDate, retDate),
        googleFlights: generateGoogleFlightsUrl(origin, destination, outDate, retDate),
    };
}
