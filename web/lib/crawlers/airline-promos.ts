/**
 * 航空促銷資訊爬蟲
 *
 * 資料來源（依優先順序）：
 * 1. 航空公司官網促銷頁面 — 虎航、樂桃、酷航、星宇等
 * 2. 社群媒體 — Facebook、Instagram 促銷帳號連結
 * 3. PTT 航空/旅遊版 — 作為補充來源
 *
 * 官網大多是 SPA，cheerio 只能解析部分靜態內容。
 * 對於無法解析的頁面，提供直接連結讓使用者手動查看。
 */

import * as cheerio from 'cheerio';

export interface PromoInfo {
    airline: string;
    title: string;
    description: string;
    destinations: string[];
    priceFrom: number | null;
    currency: string;
    dateRange: string;
    saleEnd: string;
    url: string;
    source: string;
    fetchedAt: string;
    isOneway: boolean;
}

const HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': 'over18=1',
};

async function fetchWithRetry(url: string, retries: number = 2): Promise<Response | null> {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, {
                headers: HEADERS,
                signal: AbortSignal.timeout(10000),
            });
            return res;
        } catch (e: any) {
            if (i < retries) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            console.error(`[促銷] fetch 失敗 (${url}): ${e.message}`);
            return null;
        }
    }
    return null;
}

// 目的地關鍵字對照
const DESTINATION_KEYWORDS: Record<string, string> = {
    '東京': 'NRT', '成田': 'NRT', '羽田': 'HND',
    '大阪': 'KIX', '關西': 'KIX',
    '名古屋': 'NGO', '福岡': 'FUK',
    '沖繩': 'OKA', '那霸': 'OKA',
    '札幌': 'CTS', '新千歲': 'CTS',
    '首爾': 'ICN', '仁川': 'ICN', '金浦': 'GMP',
    '釜山': 'PUS', '濟州': 'CJU',
    '曼谷': 'BKK', '素萬那普': 'BKK', '廊曼': 'DMK',
    '清邁': 'CNX', '普吉': 'HKT',
    '新加坡': 'SIN',
    '胡志明': 'SGN', '河內': 'HAN', '峴港': 'DAD',
    '吉隆坡': 'KUL',
    '香港': 'HKG', '澳門': 'MFM',
    '馬尼拉': 'MNL', '宿霧': 'CEB',
    '峇里': 'DPS',
};

const AIRLINE_KEYWORDS: Record<string, string> = {
    '虎航': '台灣虎航', 'tigerair': '台灣虎航', 'tiger': '台灣虎航',
    '樂桃': '樂桃航空', 'peach': '樂桃航空',
    '酷航': '酷航', 'scoot': '酷航',
    '星宇': '星宇航空', 'starlux': '星宇航空',
    '長榮': '長榮航空', 'eva': '長榮航空',
    '華航': '中華航空', 'china airlines': '中華航空',
    '亞航': '亞洲航空', 'airasia': '亞洲航空',
    '捷星': '捷星航空', 'jetstar': '捷星航空',
    '越捷': '越捷航空', 'vietjet': '越捷航空',
    '全日空': '全日空', 'ana': '全日空',
    '日航': '日本航空', 'jal': '日本航空',
};

const PROMO_KEYWORDS = [
    '特價', '促銷', '優惠', '廉航', '低價', '便宜',
    '搶票', '限時', '折扣', '早鳥', '閃購', '快閃',
    'sale', 'promo', 'deal', '出清', '回饋',
    '免費', '加價', '升等', '買一送一',
    '機票', '航空', '虎航', '樂桃', '酷航', '星宇',
    '華航', '長榮', '亞航', '捷星',
];

function extractDestinations(text: string): string[] {
    const found: string[] = [];
    for (const [keyword, code] of Object.entries(DESTINATION_KEYWORDS)) {
        if (text.includes(keyword)) found.push(code);
    }
    return Array.from(new Set(found));
}

function extractAirline(text: string): string {
    const lowerText = text.toLowerCase();
    for (const [keyword, name] of Object.entries(AIRLINE_KEYWORDS)) {
        if (lowerText.includes(keyword)) return name;
    }
    return '多家航空';
}

function extractPrice(text: string): number | null {
    const patterns = [
        /NT\$?\s*([\d,]+)/gi,
        /TWD\s*([\d,]+)/gi,
        /\$([\d,]+)/g,
        /([\d,]+)\s*元/g,
        /([\d,]+)\s*起/g,
    ];

    let lowestPrice: number | null = null;
    for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const price = parseInt(match[1].replace(/,/g, ''));
            if (price > 100 && price < 100000) {
                if (lowestPrice === null || price < lowestPrice) {
                    lowestPrice = price;
                }
            }
        }
    }
    return lowestPrice;
}

function isPromoRelated(title: string): boolean {
    const lowerTitle = title.toLowerCase();
    return PROMO_KEYWORDS.some(kw => lowerTitle.includes(kw));
}

// =====================================================
// 1. 航空公司官網促銷爬取
// =====================================================

/**
 * 爬取虎航促銷頁面
 * 虎航官網的促銷頁部分內容是靜態渲染的
 */
async function crawlTigerairPromos(): Promise<PromoInfo[]> {
    const promos: PromoInfo[] = [];
    const now = new Date().toISOString();

    try {
        const res = await fetchWithRetry('https://www.tigerairtw.com/zh-tw/promotions');
        if (!res || !res.ok) return promos;

        const html = await res.text();
        const $ = cheerio.load(html);

        // 嘗試解析促銷卡片
        $('a[href*="promotion"], a[href*="campaign"], .promotion-card, .card, article').each((_, el) => {
            const title = $(el).find('h2, h3, .title, .card-title').first().text().trim()
                || $(el).attr('title')?.trim()
                || $(el).text().trim().substring(0, 80);
            if (!title || title.length < 4) return;

            const href = $(el).attr('href') || '';
            const url = href.startsWith('http') ? href : `https://www.tigerairtw.com${href}`;
            const desc = $(el).find('p, .description, .card-text').first().text().trim();
            const fullText = $(el).text();

            promos.push({
                airline: '台灣虎航',
                title: title.substring(0, 100),
                description: desc || '虎航官網促銷活動',
                destinations: extractDestinations(fullText),
                priceFrom: extractPrice(fullText),
                currency: 'TWD',
                dateRange: '',
                saleEnd: '',
                url,
                source: 'tigerair_official',
                fetchedAt: now,
                isOneway: fullText.includes('單程'),
            });
        });

        console.log(`[虎航官網] 找到 ${promos.length} 筆促銷`);
    } catch (e: any) {
        console.error(`[虎航官網] 爬取失敗: ${e.message}`);
    }

    // 無論爬取結果，都加入官網直連
    if (promos.length === 0) {
        promos.push({
            airline: '台灣虎航',
            title: '虎航最新促銷活動',
            description: '查看虎航官網最新促銷和特價機票',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.tigerairtw.com/zh-tw/promotions',
            source: 'tigerair_official',
            fetchedAt: now,
            isOneway: false,
        });
    }

    return promos;
}

/**
 * 爬取樂桃促銷頁面
 */
async function crawlPeachPromos(): Promise<PromoInfo[]> {
    const promos: PromoInfo[] = [];
    const now = new Date().toISOString();

    try {
        const res = await fetchWithRetry('https://www.flypeach.com/tw/campaign/');
        if (!res || !res.ok) return promos;

        const html = await res.text();
        const $ = cheerio.load(html);

        $('a[href*="campaign"], .campaign-item, .card, article').each((_, el) => {
            const title = $(el).find('h2, h3, .title').first().text().trim()
                || $(el).attr('title')?.trim()
                || $(el).text().trim().substring(0, 80);
            if (!title || title.length < 4) return;

            const href = $(el).attr('href') || '';
            const url = href.startsWith('http') ? href : `https://www.flypeach.com${href}`;
            const fullText = $(el).text();

            promos.push({
                airline: '樂桃航空',
                title: title.substring(0, 100),
                description: '樂桃官網促銷活動',
                destinations: extractDestinations(fullText),
                priceFrom: extractPrice(fullText),
                currency: 'TWD',
                dateRange: '',
                saleEnd: '',
                url,
                source: 'peach_official',
                fetchedAt: now,
                isOneway: fullText.includes('單程'),
            });
        });

        console.log(`[樂桃官網] 找到 ${promos.length} 筆促銷`);
    } catch (e: any) {
        console.error(`[樂桃官網] 爬取失敗: ${e.message}`);
    }

    if (promos.length === 0) {
        promos.push({
            airline: '樂桃航空',
            title: '樂桃最新促銷活動',
            description: '查看樂桃官網最新促銷（含日本航線特價）',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.flypeach.com/tw/campaign/',
            source: 'peach_official',
            fetchedAt: now,
            isOneway: false,
        });
    }

    return promos;
}

/**
 * 其他航空公司的官網促銷連結
 * 這些網站多為 SPA，只提供連結
 */
function getOtherAirlinePromoLinks(): PromoInfo[] {
    const now = new Date().toISOString();
    return [
        {
            airline: '酷航',
            title: '酷航最新促銷活動',
            description: '查看酷航最新促銷（含東南亞航線特價）',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.flyscoot.com/en/deals',
            source: 'scoot_official',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '星宇航空',
            title: '星宇最新促銷活動',
            description: '查看星宇航空最新促銷',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.starlux-airlines.com/zh-TW/promotions',
            source: 'starlux_official',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '長榮航空',
            title: '長榮最新促銷活動',
            description: '查看長榮航空最新優惠方案',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.evaair.com/zh-tw/promotions/',
            source: 'eva_official',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '中華航空',
            title: '華航最新促銷活動',
            description: '查看中華航空最新優惠方案',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.china-airlines.com/tw/zh/promotions',
            source: 'china_airlines_official',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '亞洲航空',
            title: 'AirAsia 最新促銷',
            description: '查看亞航最新促銷（含東南亞航線）',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.airasia.com/promotions',
            source: 'airasia_official',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '捷星航空',
            title: 'Jetstar 最新促銷',
            description: '查看捷星最新促銷活動',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.jetstar.com/tw/zh/deals',
            source: 'jetstar_official',
            fetchedAt: now,
            isOneway: false,
        },
    ];
}

// =====================================================
// 2. 社群媒體來源
// =====================================================

/**
 * 社群媒體促銷帳號連結
 * 提供各航空公司和旅遊促銷社群的直接連結
 */
function getSocialMediaLinks(): PromoInfo[] {
    const now = new Date().toISOString();
    return [
        {
            airline: '台灣虎航',
            title: '虎航 Facebook — 最新促銷公告',
            description: '虎航官方 Facebook 粉專，第一手促銷資訊',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.facebook.com/TigerairTaiwan',
            source: 'social_facebook',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '樂桃航空',
            title: '樂桃 Facebook — 日本航線特價',
            description: '樂桃航空 Facebook 粉專',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.facebook.com/flypeach.tw',
            source: 'social_facebook',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '星宇航空',
            title: '星宇 Facebook — 最新促銷',
            description: '星宇航空 Facebook 粉專',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.facebook.com/staborestarlux',
            source: 'social_facebook',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '多家航空',
            title: '布萊N 機票達人 — 機票促銷整理',
            description: '知名機票部落客，整理各家航空促銷資訊',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.facebook.com/brianflytw',
            source: 'social_facebook',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '多家航空',
            title: '台灣廉價航空福利社 — 社團促銷資訊',
            description: '台灣最大廉航促銷社團',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.facebook.com/groups/twnlcc',
            source: 'social_facebook',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '台灣虎航',
            title: '虎航 Instagram — 促銷快報',
            description: '虎航官方 Instagram',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.instagram.com/tigerairtw/',
            source: 'social_instagram',
            fetchedAt: now,
            isOneway: false,
        },
        {
            airline: '星宇航空',
            title: '星宇 Instagram — 促銷快報',
            description: '星宇航空官方 Instagram',
            destinations: [],
            priceFrom: null,
            currency: 'TWD',
            dateRange: '',
            saleEnd: '',
            url: 'https://www.instagram.com/starluxairlines/',
            source: 'social_instagram',
            fetchedAt: now,
            isOneway: false,
        },
    ];
}

// =====================================================
// 3. PTT（補充來源）
// =====================================================

async function crawlPttBoard(boardName: string, pages: number = 1): Promise<PromoInfo[]> {
    const promos: PromoInfo[] = [];

    try {
        const indexUrl = `https://www.ptt.cc/bbs/${boardName}/index.html`;
        const indexRes = await fetchWithRetry(indexUrl);

        if (!indexRes || !indexRes.ok) {
            console.log(`[PTT ${boardName}] 無法訪問 (HTTP ${indexRes?.status || 'N/A'})`);
            return promos;
        }

        const indexHtml = await indexRes.text();
        const $index = cheerio.load(indexHtml);

        const prevLink = $index('.btn-group-paging a').eq(1).attr('href') || '';
        const pageMatch = prevLink.match(/index(\d+)/);
        let currentPage = pageMatch ? parseInt(pageMatch[1]) + 1 : 0;

        const pagesToCrawl: string[] = [indexUrl];
        for (let i = 1; i < pages && currentPage > 1; i++) {
            pagesToCrawl.push(`https://www.ptt.cc/bbs/${boardName}/index${currentPage - i}.html`);
        }

        for (const pageUrl of pagesToCrawl) {
            try {
                const res = await fetchWithRetry(pageUrl);
                if (!res || !res.ok) continue;

                const html = await res.text();
                const $ = cheerio.load(html);

                $('.r-ent').each((_, el) => {
                    const titleEl = $(el).find('.title a');
                    const title = titleEl.text().trim();
                    const href = titleEl.attr('href') || '';
                    const meta = $(el).find('.meta .date').text().trim();
                    const author = $(el).find('.meta .author').text().trim();
                    const pushCount = $(el).find('.nrec span').text().trim();

                    if (!title || !isPromoRelated(title)) return;
                    if (title.includes('(本文已被刪除)')) return;

                    const fullUrl = href.startsWith('http') ? href : `https://www.ptt.cc${href}`;

                    promos.push({
                        airline: extractAirline(title),
                        title: title.substring(0, 100),
                        description: `PTT ${boardName} | 作者: ${author} | 推: ${pushCount || '0'} | ${meta}`,
                        destinations: extractDestinations(title),
                        priceFrom: extractPrice(title),
                        currency: 'TWD',
                        dateRange: '',
                        saleEnd: '',
                        url: fullUrl,
                        source: `ptt_${boardName.toLowerCase()}`,
                        fetchedAt: new Date().toISOString(),
                        isOneway: title.includes('單程'),
                    });
                });

                await new Promise(r => setTimeout(r, 1000));
            } catch (e: any) {
                console.error(`[PTT ${boardName}] 頁面爬取失敗:`, e.message);
            }
        }
    } catch (error: any) {
        console.error(`[PTT ${boardName}] 爬蟲失敗:`, error.message);
    }

    return promos;
}

// =====================================================
// 主要匯出
// =====================================================

/**
 * 執行所有促銷爬蟲
 * 優先順序：官網 > 社群媒體 > PTT
 */
export async function crawlAllAirlinePromos(): Promise<PromoInfo[]> {
    console.log('[促銷爬蟲] 開始掃描（官網 + 社群 + PTT）...');
    const allPromos: PromoInfo[] = [];

    // 1. 航空公司官網（平行爬取）
    console.log('[促銷爬蟲] 爬取航空公司官網...');
    const [tigerPromos, peachPromos] = await Promise.all([
        crawlTigerairPromos(),
        crawlPeachPromos(),
    ]);
    allPromos.push(...tigerPromos, ...peachPromos);

    // 其他官網連結
    allPromos.push(...getOtherAirlinePromoLinks());
    console.log(`[促銷爬蟲] 官網: ${allPromos.length} 筆`);

    // 2. 社群媒體連結
    const socialLinks = getSocialMediaLinks();
    allPromos.push(...socialLinks);
    console.log(`[促銷爬蟲] + 社群: ${socialLinks.length} 筆`);

    // 3. PTT（補充來源，只爬 1 頁減少延遲）
    const pttBoards = [
        { name: 'Aviation', label: '航空版' },
        { name: 'Japan_Travel', label: '日旅版' },
    ];

    for (const board of pttBoards) {
        try {
            console.log(`[PTT ${board.label}] 爬取中...`);
            const promos = await crawlPttBoard(board.name, 1);
            allPromos.push(...promos);
            console.log(`[PTT ${board.label}] 找到 ${promos.length} 筆`);
        } catch (error: any) {
            console.error(`[PTT ${board.label}] 爬蟲異常:`, error.message);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`[促銷爬蟲] 完成，共 ${allPromos.length} 筆`);
    return allPromos;
}

/**
 * 只爬特定來源
 */
export async function crawlAirlinePromo(source: string): Promise<PromoInfo[]> {
    const sourceMap: Record<string, () => Promise<PromoInfo[]>> = {
        'ptt': () => crawlPttBoard('Aviation', 2),
        'ptt_aviation': () => crawlPttBoard('Aviation', 2),
        'ptt_japan': () => crawlPttBoard('Japan_Travel', 2),
        'tigerair': () => crawlTigerairPromos(),
        'peach': () => crawlPeachPromos(),
    };

    const crawlerFn = sourceMap[source.toLowerCase()];
    if (!crawlerFn) {
        console.warn(`[促銷爬蟲] 不支援的來源: ${source}`);
        return [];
    }

    return crawlerFn();
}
