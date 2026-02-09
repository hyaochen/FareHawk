/**
 * 促銷資訊 API
 *
 * 快取策略：每日只爬一次
 * - 用當天日期作為快取 key，同一天內重複請求直接回傳快取
 * - refresh=true 可強制重新爬取
 */

import { NextRequest, NextResponse } from 'next/server';
import { crawlAllAirlinePromos, type PromoInfo } from '../../../lib/crawlers/airline-promos';
import { isPromoCached, setPromoCache, getPromoCache, getPromoCacheKey } from '../../../lib/cache';

/**
 * 取得今天的日期字串（用作快取 key 的一部分）
 */
function getTodayKey(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    // 用日期作為快取 key，同一天內不重複爬取
    const todayKey = getTodayKey();
    const cacheKey = getPromoCacheKey(`all:${todayKey}`);

    // 如果有當天快取且不要求強制刷新，直接回傳
    if (!refresh && isPromoCached(cacheKey)) {
        const cached = getPromoCache(cacheKey) as PromoInfo[];
        console.log(`[促銷 API] 使用當天快取 (${todayKey})，共 ${cached.length} 筆`);
        return NextResponse.json({
            success: true,
            data: cached,
            meta: {
                source: 'cache',
                cacheDate: todayKey,
                count: cached.length,
                fetchedAt: cached[0]?.fetchedAt || new Date().toISOString(),
            },
        });
    }

    // 執行爬蟲
    try {
        console.log(`[促銷 API] 開始爬取促銷資訊（${refresh ? '強制刷新' : '無當天快取'}）...`);
        const promos = await crawlAllAirlinePromos();

        // 過濾掉無標題的結果
        const validPromos = promos.filter(p => p.title && p.title.length > 0);

        // 快取結果（使用當天日期 key）
        setPromoCache(cacheKey, validPromos);

        return NextResponse.json({
            success: true,
            data: validPromos,
            meta: {
                source: 'crawl',
                cacheDate: todayKey,
                count: validPromos.length,
                fetchedAt: new Date().toISOString(),
                airlines: Array.from(new Set(validPromos.map(p => p.airline))),
            },
        });
    } catch (error: any) {
        console.error('[促銷 API] 錯誤:', error.message);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
