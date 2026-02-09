/**
 * 搜尋快取管理
 * 避免短時間內重複搜尋相同路線，節省 API 額度和爬蟲頻率
 */

import NodeCache from 'node-cache';

// 快取 TTL: 6 小時（同路線+同日期 6 小時內不重複搜尋）
const searchCache = new NodeCache({ stdTTL: 6 * 60 * 60, checkperiod: 600 });

// 促銷快取 TTL: 24 小時（每日只爬一次）
const promoCache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 600 });

/**
 * 產生搜尋快取 key
 */
export function getSearchCacheKey(source: string, origin: string, dest: string, outDate: string, retDate: string): string {
    return `${source}:${origin}:${dest}:${outDate}:${retDate}`;
}

/**
 * 檢查搜尋是否已快取
 */
export function isSearchCached(key: string): boolean {
    return searchCache.has(key);
}

/**
 * 設定搜尋快取
 */
export function setSearchCache(key: string, data: any): void {
    searchCache.set(key, data);
}

/**
 * 取得搜尋快取
 */
export function getSearchCache(key: string): any | undefined {
    return searchCache.get(key);
}

/**
 * 產生促銷快取 key
 */
export function getPromoCacheKey(airline: string): string {
    return `promo:${airline}`;
}

/**
 * 促銷快取操作
 */
export function isPromoCached(key: string): boolean {
    return promoCache.has(key);
}

export function setPromoCache(key: string, data: any): void {
    promoCache.set(key, data);
}

export function getPromoCache(key: string): any | undefined {
    return promoCache.get(key);
}

/**
 * 快取統計
 */
export function getCacheStats() {
    return {
        search: searchCache.getStats(),
        promo: promoCache.getStats(),
    };
}
