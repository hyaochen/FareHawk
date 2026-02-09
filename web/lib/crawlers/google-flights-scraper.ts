/**
 * Google Flights 爬蟲模組
 *
 * 核心策略：用 protobuf 編碼的 tfs 參數構建搜尋 URL，
 * 直接導航到搜尋結果頁面，不需要操作表單。
 *
 * 輸出與 SerpApi 完全相同的格式，讓 processAndSaveFlights() 可直接消化。
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

// =====================================================
// 型別定義（SerpApi 相容格式）
// =====================================================

export interface ReturnFlightInfo {
    airline: string;
    departureTime: string;
    arrivalTime: string;
    duration: number;
    stops: number;
    flightNumber: string;
    price: number;
}

export interface SerpApiCompatibleResponse {
    best_flights: SerpApiFlightOption[];
    other_flights: SerpApiFlightOption[];
    passengerWarning?: string;
    returnFlights?: ReturnFlightInfo[];
}

export interface SerpApiFlightOption {
    flights: SerpApiSegment[];
    price: number;
    total_duration: number;
}

export interface SerpApiSegment {
    airline: string;
    airline_logo?: string;
    flight_number: string;
    duration: number;
    departure_airport: { name: string; id: string; time: string };
    arrival_airport: { name: string; id: string; time: string };
}

// =====================================================
// 設定
// =====================================================

const DEBUG_SCREENSHOTS = true;
const DEBUG_DIR = path.join(process.cwd(), 'debug-screenshots');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

// =====================================================
// 瀏覽器管理（單例）
// =====================================================

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--lang=zh-TW',
                '--disable-blink-features=AutomationControlled',
            ],
        });
    }
    return browserInstance;
}

export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

// =====================================================
// 工具函式
// =====================================================

function randomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise(r => setTimeout(r, delay));
}

async function saveDebugScreenshot(page: Page, label: string): Promise<void> {
    if (!DEBUG_SCREENSHOTS) return;
    try {
        if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
        const filename = `${label}-${Date.now()}.png`;
        await page.screenshot({ path: path.join(DEBUG_DIR, filename), fullPage: true });
        console.log(`[爬蟲][debug] 截圖已存: ${filename}`);
    } catch { /* ignore */ }
}

async function createStealthContext(browser: Browser): Promise<BrowserContext> {
    const context = await browser.newContext({
        userAgent: randomUserAgent(),
        viewport: { width: 1366, height: 768 },
        locale: 'zh-TW',
        timezoneId: 'Asia/Taipei',
        extraHTTPHeaders: {
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        },
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        (window as any).chrome = { runtime: {} };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                : originalQuery(parameters);
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-TW', 'zh', 'en-US', 'en'],
        });
    });

    return context;
}

// =====================================================
// Protobuf URL 構建
// =====================================================

/**
 * 手動構建 protobuf 的 varint 編碼
 */
function encodeVarint(value: number): number[] {
    if (value === 0) return [0];
    const bytes: number[] = [];
    let v = value;
    while (v > 0) {
        if (v > 0x7F) {
            bytes.push((v & 0x7F) | 0x80);
            v >>>= 7;
        } else {
            bytes.push(v & 0x7F);
            v = 0;
        }
    }
    return bytes;
}

function pbFieldVarint(fieldNum: number, value: number): number[] {
    return [...encodeVarint((fieldNum << 3) | 0), ...encodeVarint(value)];
}

function pbFieldBytes(fieldNum: number, data: number[]): number[] {
    return [...encodeVarint((fieldNum << 3) | 2), ...encodeVarint(data.length), ...data];
}

function pbFieldString(fieldNum: number, str: string): number[] {
    const bytes = Array.from(Buffer.from(str, 'utf-8'));
    return pbFieldBytes(fieldNum, bytes);
}

/**
 * 構建 Google Flights 搜尋 URL
 * 使用 protobuf tfs 參數直接導航到搜尋結果頁
 */
export function buildSearchUrl(origin: string, destination: string, outDate: string, retDate: string): string {
    // Airport sub-message: { field1: 1 (IATA type), field2: "CODE" }
    function airportMsg(code: string): number[] {
        return [...pbFieldVarint(1, 1), ...pbFieldString(2, code)];
    }

    // Segment sub-message: { field2: "date", field13: airport(from), field14: airport(to) }
    function segmentMsg(date: string, from: string, to: string): number[] {
        return [
            ...pbFieldString(2, date),
            ...pbFieldBytes(13, airportMsg(from)),
            ...pbFieldBytes(14, airportMsg(to)),
        ];
    }

    // Max uint64 varint (sentinel for "no price limit")
    const maxUint64 = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01];

    // Top-level TFS message
    const tfs: number[] = [
        ...pbFieldVarint(1, 28),
        ...pbFieldVarint(2, 2), // round trip
        ...pbFieldBytes(3, segmentMsg(outDate, origin, destination)),
        ...pbFieldBytes(3, segmentMsg(retDate, destination, origin)),
        ...pbFieldVarint(8, 1), // 1 adult
        ...pbFieldVarint(9, 1),
        ...pbFieldVarint(14, 1),
        ...pbFieldBytes(16, [...encodeVarint((1 << 3) | 0), ...maxUint64]),
        ...pbFieldVarint(8, 1),
        ...pbFieldVarint(19, 1),
    ];

    const tfsBase64 = Buffer.from(tfs).toString('base64url');
    console.log(`[爬蟲] tfs 參數長度: ${tfs.length} bytes, base64: ${tfsBase64.substring(0, 40)}...`);

    return `https://www.google.com/travel/flights/search?tfs=${tfsBase64}&curr=TWD&hl=zh-TW`;
}

// =====================================================
// 核心爬蟲
// =====================================================

export async function scrapeGoogleFlights(
    origin: string,
    destination: string,
    outDate: string,
    retDate: string
): Promise<SerpApiCompatibleResponse | null> {
    let context: BrowserContext | null = null;

    try {
        const browser = await getBrowser();
        context = await createStealthContext(browser);
        const page = await context.newPage();

        console.log(`[爬蟲] 開始爬取: ${origin}→${destination} | ${outDate} ~ ${retDate}`);

        // 先訪問 Google 首頁建立 cookies
        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await handleConsentDialog(page);
        await randomDelay(1000, 2000);

        // 用 tfs 參數直接導航到搜尋結果
        const searchUrl = buildSearchUrl(origin, destination, outDate, retDate);
        console.log(`[爬蟲] 導航到: ${searchUrl.substring(0, 100)}...`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await handleConsentDialog(page);

        // 等待搜尋結果載入
        await waitForFlightResults(page);

        // 偵測封鎖
        if (await detectBlock(page)) {
            console.error('[爬蟲] 被 Google 偵測到自動化，暫停 60 秒');
            await saveDebugScreenshot(page, 'blocked');
            await closeBrowser();
            await randomDelay(60000, 70000);
            return null;
        }

        // 檢查是否在搜尋結果頁
        const pageState = await page.evaluate(() => ({
            title: document.title,
            url: window.location.href,
            isSearchPage: window.location.href.includes('/search') || window.location.href.includes('tfs='),
            hasFlightContent: /\d{1,2}:\d{2}/.test(document.body.textContent || ''),
            hasPrices: /(?:NT\$|TWD|\$)\s*[\d,]{3,}/.test(document.body.textContent || ''),
        }));

        console.log(`[爬蟲] 頁面狀態: title="${pageState.title}" | 搜尋頁=${pageState.isSearchPage} | 有時間=${pageState.hasFlightContent} | 有價格=${pageState.hasPrices}`);

        await saveDebugScreenshot(page, `result-${origin}-${destination}`);

        // 如果 tfs URL 沒進入搜尋結果頁，嘗試表單互動
        if (!pageState.isSearchPage || !pageState.hasPrices) {
            console.log('[爬蟲] tfs URL 未進入搜尋結果，嘗試表單互動...');
            const formOk = await fillSearchForm(page, origin, destination, outDate, retDate);
            if (formOk) {
                await waitForFlightResults(page);
                await saveDebugScreenshot(page, `form-result-${origin}-${destination}`);
            } else {
                console.warn(`[爬蟲] 表單互動也失敗: ${origin}→${destination}`);
                await saveDebugScreenshot(page, `form-fail-${origin}-${destination}`);
                return null;
            }
        }

        // 偵測是否為 2 張機票價格（Google 有時預設顯示 2 位旅客）
        const passengerWarning = await detectMultiplePassengers(page);
        if (passengerWarning) {
            console.warn(`[爬蟲] ⚠️ ${passengerWarning}`);
        }

        // 嘗試展開更多航班
        await expandMoreFlights(page);

        // 提取航班資料
        const rawFlights = await extractFlightData(page);

        let outboundFlights: RawFlightData[];
        if (rawFlights.length === 0) {
            console.warn(`[爬蟲] DOM 提取無資料，嘗試備用文字提取: ${origin}→${destination}`);
            const fallbackFlights = await extractFlightDataFallback(page);
            if (fallbackFlights.length === 0) {
                await saveDebugScreenshot(page, `no-data-${origin}-${destination}`);
                return null;
            }
            console.log(`[爬蟲] 備用方案提取到 ${fallbackFlights.length} 筆: ${origin}→${destination}`);
            outboundFlights = fallbackFlights;
        } else {
            console.log(`[爬蟲] 提取到 ${rawFlights.length} 筆去程航班: ${origin}→${destination}`);
            outboundFlights = rawFlights;
        }

        // 爬取回程航班（點擊第一個去程航班 → 進入回程選擇頁）
        let returnFlights: ReturnFlightInfo[] = [];
        try {
            returnFlights = await scrapeReturnFlights(page);
            if (returnFlights.length > 0) {
                console.log(`[爬蟲] 回程航班提取到 ${returnFlights.length} 筆: ${destination}→${origin}`);
            } else {
                console.warn(`[爬蟲] 未能提取到回程航班: ${destination}→${origin}`);
            }
        } catch (err: any) {
            console.warn(`[爬蟲] 回程航班爬取異常: ${err.message}`);
        }

        const result = transformToSerpApiFormat(outboundFlights, origin, destination, outDate);
        if (passengerWarning) result.passengerWarning = passengerWarning;
        if (returnFlights.length > 0) result.returnFlights = returnFlights;
        return result;

    } catch (error: any) {
        if (error.message?.includes('browser has been closed')) {
            browserInstance = null;
        }
        const isTimeout = error.message?.includes('Timeout') || error.message?.includes('timeout');
        console.error(`[爬蟲] ${isTimeout ? '頁面載入超時' : '爬取失敗'} ${origin}→${destination}: ${error.message}`);
        return null;
    } finally {
        if (context) {
            try { await context.close(); } catch { /* ignore */ }
        }
    }
}

// =====================================================
// 表單互動（備用方案）
// =====================================================

async function fillSearchForm(
    page: Page,
    origin: string,
    destination: string,
    outDate: string,
    retDate: string
): Promise<boolean> {
    try {
        // Google Flights 使用 Material Design 自訂組件
        // 需要用 text/role based 選擇器而非 CSS input 選擇器

        // 等待頁面完全載入
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await randomDelay(1000, 2000);

        // --- 出發地 ---
        // 找到出發地區域（通常已自動填入使用者位置）
        const originArea = page.locator('[data-placeholder="你要從哪裡出發？"], [aria-label*="出發地"], [aria-placeholder*="出發"]').first();
        const originVisible = await originArea.isVisible({ timeout: 3000 }).catch(() => false);

        if (originVisible) {
            await originArea.click();
            await randomDelay(300, 500);
            await page.keyboard.press('Control+a');
            await page.keyboard.type(origin, { delay: 80 });
            await randomDelay(1000, 1500);
            // 選擇下拉建議
            const suggestion = page.locator('[role="option"], li[data-value]').first();
            if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
                await suggestion.click();
                await randomDelay(500, 800);
            } else {
                await page.keyboard.press('Enter');
                await randomDelay(500, 800);
            }
        } else {
            console.log('[爬蟲] 找不到出發地欄位，嘗試用文字定位');
            // 嘗試點擊包含位置文字的區域
            const anyInput = page.locator('input[type="text"]').first();
            if (await anyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await anyInput.click();
                await page.keyboard.press('Control+a');
                await page.keyboard.type(origin, { delay: 80 });
                await randomDelay(1000, 1500);
                await page.keyboard.press('Enter');
                await randomDelay(500, 800);
            }
        }

        // --- 目的地 ---
        // 嘗試多種方式找到目的地欄位
        const destLocators = [
            page.locator('[data-placeholder="你要去哪裡？"]').first(),
            page.locator('[aria-label*="目的地"]').first(),
            page.locator('text=要去哪裡').first(),
        ];

        let destClicked = false;
        for (const loc of destLocators) {
            if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
                await loc.click();
                destClicked = true;
                break;
            }
        }

        if (!destClicked) {
            console.log('[爬蟲] 找不到目的地欄位');
            return false;
        }

        await randomDelay(300, 500);
        await page.keyboard.type(destination, { delay: 80 });
        await randomDelay(1000, 1500);

        const destSuggestion = page.locator('[role="option"], li[data-value]').first();
        if (await destSuggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
            await destSuggestion.click();
            await randomDelay(500, 800);
        } else {
            await page.keyboard.press('Enter');
            await randomDelay(500, 800);
        }

        // --- 日期 ---
        // Google Flights 日期區域通常在目的地右邊
        const dateArea = page.locator('[data-placeholder="出發日期"], [aria-label*="出發日期"], input[placeholder*="出發"]').first();
        if (await dateArea.isVisible({ timeout: 3000 }).catch(() => false)) {
            await dateArea.click();
            await randomDelay(300, 500);
            await page.keyboard.press('Control+a');
            await page.keyboard.type(outDate, { delay: 50 });
            await page.keyboard.press('Enter');
            await randomDelay(500, 800);
        }

        const retDateArea = page.locator('[data-placeholder="回程日期"], [aria-label*="回程日期"], input[placeholder*="回程"]').first();
        if (await retDateArea.isVisible({ timeout: 2000 }).catch(() => false)) {
            await retDateArea.click();
            await randomDelay(300, 500);
            await page.keyboard.press('Control+a');
            await page.keyboard.type(retDate, { delay: 50 });
            await page.keyboard.press('Enter');
            await randomDelay(500, 800);
        }

        // --- 搜尋 ---
        const searchBtn = page.locator('button:has-text("搜尋"), button:has-text("Search"), button[aria-label*="搜尋"]').first();
        if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await searchBtn.click();
            console.log('[爬蟲] 已點擊搜尋按鈕');
            await randomDelay(3000, 5000);
            return true;
        }

        // 按 Enter 嘗試觸發搜尋
        await page.keyboard.press('Enter');
        await randomDelay(3000, 5000);
        return true;

    } catch (error: any) {
        console.log(`[爬蟲] 表單互動失敗: ${error.message}`);
        return false;
    }
}

// =====================================================
// 頁面互動輔助
// =====================================================

async function handleConsentDialog(page: Page): Promise<void> {
    try {
        const selectors = [
            'button:has-text("全部接受")',
            'button:has-text("Accept all")',
            'button:has-text("同意")',
            '#L2AGLb',
        ];

        for (const selector of selectors) {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
                await btn.click();
                await randomDelay(500, 1000);
                console.log('[爬蟲] 已處理同意對話框');
                break;
            }
        }
    } catch { /* no consent dialog */ }
}

async function waitForFlightResults(page: Page): Promise<void> {
    // 策略 1: 等待頁面中出現航班時間+價格
    try {
        await page.waitForFunction(
            () => {
                const text = document.body.textContent || '';
                const hasTimes = /\d{1,2}:\d{2}/.test(text);
                const hasPrice = /(?:NT\$|TWD|\$)\s*[\d,]{3,}/.test(text);
                const hasDuration = /\d+\s*(?:小時|h|hr)/.test(text);
                return hasTimes && hasPrice && hasDuration;
            },
            { timeout: 20000 }
        );
        await randomDelay(2000, 3000);
        return;
    } catch { /* 繼續嘗試 */ }

    // 策略 2: 等待 DOM 元素
    try {
        await page.waitForSelector('[role="main"] li, [data-ved]', {
            timeout: 10000,
            state: 'attached'
        });
        await randomDelay(3000, 4000);
        return;
    } catch { /* 繼續嘗試 */ }

    // 策略 3: network idle
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        await randomDelay(3000, 4000);
    } catch {
        console.warn('[爬蟲] 所有等待策略均超時');
        await randomDelay(2000, 3000);
    }
}

async function detectBlock(page: Page): Promise<boolean> {
    try {
        const url = page.url();
        if (url.includes('sorry') || url.includes('captcha')) return true;

        const content = await page.textContent('body');
        if (!content) return false;

        const blockSignals = [
            'unusual traffic', '異常流量', '我們偵測到你的電腦',
            'captcha', 'CAPTCHA', '驗證您是真人', 'automated queries',
        ];

        return blockSignals.some(signal =>
            content.toLowerCase().includes(signal.toLowerCase())
        );
    } catch {
        return false;
    }
}

/**
 * 偵測 Google Flights 是否顯示多人票價
 * Google 有時預設顯示 2 位旅客的價格，需要偵測並除以人數
 */
async function detectMultiplePassengers(page: Page): Promise<string | null> {
    try {
        const result = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const innerText = document.body.innerText || '';

            // 偵測旅客人數提示
            const patterns = [
                /(\d+)\s*(?:位旅客|位成人|名旅客|名成人|位乘客)/,
                /(\d+)\s*(?:passengers?|adults?|travelers?)/i,
                /(?:旅客|成人|乘客)\s*[:：]\s*(\d+)/,
                /(\d+)\s*張(?:機票|票)/,
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern) || innerText.match(pattern);
                if (match) {
                    const count = parseInt(match[1]);
                    if (count > 1) {
                        return `偵測到 ${count} 位旅客票價，價格可能需要除以 ${count}`;
                    }
                }
            }

            return null;
        });

        return result;
    } catch {
        return null;
    }
}

async function expandMoreFlights(page: Page): Promise<void> {
    try {
        const moreBtn = page.locator(
            'button:has-text("更多航班"), button:has-text("顯示更多"), button:has-text("Show more"), button:has-text("查看更多")'
        ).first();

        if (await moreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await moreBtn.click();
            await randomDelay(2000, 3000);
            console.log('[爬蟲] 已展開更多航班');
        }
    } catch { /* no more button */ }
}

// =====================================================
// 回程航班爬取
// =====================================================

async function scrapeReturnFlights(page: Page): Promise<ReturnFlightInfo[]> {
    try {
        console.log('[爬蟲] 嘗試進入回程航班頁面...');

        // 找到第一個航班卡片（包含價格+時間的 li）
        const flightLis = page.locator('li').filter({ hasText: /\d{1,2}:\d{2}/ }).filter({ hasText: /NT\$|\$\s*\d/ });
        const liCount = await flightLis.count();

        if (liCount === 0) {
            console.log('[爬蟲] 找不到可點擊的航班卡片');
            return [];
        }

        // 點擊第一個航班卡片
        await flightLis.first().click();
        console.log('[爬蟲] 已點擊第一個航班卡片');
        await randomDelay(1500, 2500);

        // 檢查是否需要點擊「選取航班」按鈕
        const selectBtns = [
            page.locator('button:has-text("選取航班")').first(),
            page.locator('button:has-text("選擇這個航班")').first(),
            page.locator('button:has-text("選取")').first(),
            page.locator('button:has-text("Select flight")').first(),
            page.locator('button:has-text("Select")').first(),
        ];

        for (const btn of selectBtns) {
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await btn.click();
                console.log('[爬蟲] 已點擊選取按鈕');
                await randomDelay(2000, 3000);
                break;
            }
        }

        await saveDebugScreenshot(page, 'return-page');

        // 等待回程航班結果載入
        await waitForFlightResults(page);

        // 確認已進入回程選擇頁面
        const pageInfo = await page.evaluate(() => {
            const text = document.body.textContent || '';
            return {
                hasReturnText: text.includes('回程') || text.includes('返回航班') ||
                    text.includes('Return') || text.includes('選取回程'),
                hasTimeAndPrice: /\d{1,2}:\d{2}/.test(text) && /(?:NT\$|TWD|\$)\s*[\d,]{3,}/.test(text),
                url: window.location.href,
            };
        });

        console.log(`[爬蟲] 回程頁面狀態: hasReturnText=${pageInfo.hasReturnText} hasTimeAndPrice=${pageInfo.hasTimeAndPrice}`);

        if (!pageInfo.hasTimeAndPrice) {
            console.log('[爬蟲] 回程頁面未偵測到時間+價格');
            await saveDebugScreenshot(page, 'return-no-data');
            return [];
        }

        // 嘗試展開更多回程航班
        await expandMoreFlights(page);

        // 提取回程航班資料（使用與去程相同的 DOM 提取邏輯）
        const rawReturn = await extractFlightData(page);

        if (rawReturn.length === 0) {
            console.log('[爬蟲] DOM 提取回程無資料，嘗試備用方案');
            const fallback = await extractFlightDataFallback(page);
            return fallback.map(f => ({
                airline: f.airline,
                departureTime: f.departureTime,
                arrivalTime: f.arrivalTime,
                duration: f.duration,
                stops: f.stops,
                flightNumber: f.flightNumber,
                price: f.price,
            }));
        }

        console.log(`[爬蟲] 回程航班提取到 ${rawReturn.length} 筆`);
        return rawReturn.map(f => ({
            airline: f.airline,
            departureTime: f.departureTime,
            arrivalTime: f.arrivalTime,
            duration: f.duration,
            stops: f.stops,
            flightNumber: f.flightNumber,
            price: f.price,
        }));

    } catch (error: any) {
        console.error('[爬蟲] 回程航班爬取失敗:', error.message);
        await saveDebugScreenshot(page, 'return-error');
        return [];
    }
}

// =====================================================
// DOM 資料提取
// =====================================================

interface RawFlightData {
    airline: string;
    departureTime: string;
    arrivalTime: string;
    duration: number;
    price: number;
    stops: number;
    flightNumber: string;
}

async function extractFlightData(page: Page): Promise<RawFlightData[]> {
    return await page.evaluate(() => {
        const flights: any[] = [];
        const seenFlights = new Set<string>();

        // Google Flights 搜尋結果頁：航班卡片在列表中
        const containers = document.querySelectorAll(
            'li[class], [role="listitem"], [jsname] > div > div, [data-ved] li'
        );

        for (const el of Array.from(containers)) {
            const text = el.textContent || '';
            if (text.length < 20 || text.length > 2000) continue;

            // 必須包含價格
            const priceMatch = text.match(/(?:NT\$|TWD\s*)\s*([\d,]+)/);
            const altPriceMatch = !priceMatch ? text.match(/\$\s*([\d,]+)/) : null;
            const priceStr = priceMatch?.[1] || altPriceMatch?.[1];
            if (!priceStr) continue;

            const price = parseInt(priceStr.replace(/,/g, ''));
            if (price <= 100 || price > 200000) continue;

            // 必須包含至少兩個時間
            const timeMatches = text.match(/\b(\d{1,2}:\d{2})\b/g);
            if (!timeMatches || timeMatches.length < 2) continue;

            const departureTime = timeMatches[0];
            const arrivalTime = timeMatches[1];

            const key = `${price}-${departureTime}-${arrivalTime}`;
            if (seenFlights.has(key)) continue;
            seenFlights.add(key);

            // 航空公司名稱 — 兩階段提取
            let airline = '';

            // 已知航空公司關鍵字（優先匹配）
            const airlineKw = [
                '航空', 'Airlines', 'Airways', 'Airline',
                'EVA', '長榮', '華航', '星宇', '虎航', '樂桃',
                'Peach', 'Scoot', 'AirAsia', 'Jetstar', 'Tiger',
                'Japan', 'Korean', 'Cathay', 'Delta', 'United',
                'ANA', 'JAL', 'Thai', 'Singapore', 'Cebu',
                'Philippine', 'Vietnam', 'Malaysia', 'Garuda',
                'Emirates', 'Turkish', 'Qantas', 'Bamboo',
                'Spring', 'Lucky', 'VietJet', 'IndiGo',
                '中華', '國泰', '全日空', '日本', '韓亞', '大韓',
                '新加坡', '泰國', '越南', '馬來西亞', '菲律賓',
                '酷航', '捷星', '亞航', '春秋', '吉祥',
                'Starlux', 'HK Express', '香港快運',
                'Air China', 'China Eastern', 'China Southern',
                '中國國際', '東方', '南方', '海南', '廈門',
                '濟州', 'Jeju', 'T\'way', '德威', '易斯達', 'Eastar',
                'Zip', 'Flyscoot', '酷鳥', 'NokScoot',
            ];

            // Google Flights UI 常見文字（排除）
            const uiExclude = [
                '關閉', '對話', '費用', '行李', '乘客', '支付',
                '額外', '協助', '可能', '須', '服務', '篩選',
                '排序', '最佳', '最便宜', '建議', '離開', '返回',
                '繼續', '取消', '確認', '搜尋', '預訂', '詳細',
                '展開', '收合', '載入', '等待', '正在', '請',
                '上午', '下午', '隔天', '凌晨', '深夜', '碳排',
                'Close', 'dialog', 'fee', 'baggage', 'passenger',
                'filter', 'sort', 'best', 'cheapest', 'book',
                'loading', 'carbon', 'emissions', 'CO₂', 'kg CO',
                'select', 'more flights', '經濟', '商務', '頭等',
                '票價', '價格', '優惠', '折扣', '比較',
                '資訊', '了解', '查看詳情', '注意',
            ];

            const spans = Array.from(el.querySelectorAll('span, div'));

            // 第一輪：尋找包含已知航空公司關鍵字的文字
            for (const node of spans) {
                const t = (node.textContent || '').trim();
                if (t.length < 2 || t.length > 30) continue;
                if (t.includes('$') || /\d:\d/.test(t)) continue;
                if (airlineKw.some(kw => t.includes(kw))) {
                    if (!uiExclude.some(kw => t.includes(kw))) {
                        airline = t;
                        break;
                    }
                }
            }

            // 第二輪：排除法（更嚴格）
            if (!airline) {
                for (const node of spans) {
                    const t = (node.textContent || '').trim();
                    if (t.length < 2 || t.length > 20) continue;
                    if (t.includes('$') || /\d:\d/.test(t)) continue;
                    if (/^\d/.test(t) || /^\d+$/.test(t)) continue;
                    if (/\d+月/.test(t) || t.includes('+')) continue;
                    if (uiExclude.some(kw => t.toLowerCase().includes(kw.toLowerCase()))) continue;
                    if (t.includes('航班') || t.includes('轉機') ||
                        t.includes('直達') || t.includes('直飛') ||
                        t.includes('小時') || t.includes('分鐘') ||
                        /Nonstop/i.test(t) || /stop/i.test(t) ||
                        t.includes('更多') || t.includes('顯示') ||
                        t.includes('查看') || t.includes('選取')) continue;
                    // 排除過長句子（航空公司名稱通常很短）
                    if (t.includes('。') || t.includes('，') || t.includes('、')) continue;
                    airline = t;
                    break;
                }
            }

            if (!airline) airline = '未知航空';

            // 停靠次數
            let stops = 0;
            if (text.includes('直達') || text.includes('直飛') ||
                /\bNonstop\b/i.test(text) || /\bnon-stop\b/i.test(text)) {
                stops = 0;
            } else {
                const stopsMatch = text.match(/(\d+)\s*(?:次轉機|次中轉|站|stop|stops)/i);
                if (stopsMatch) {
                    stops = parseInt(stopsMatch[1]);
                } else if (text.includes('轉機') || text.includes('中轉')) {
                    stops = 1;
                }
            }

            // 飛行時間
            let duration = 0;
            const durMatch = text.match(/(\d+)\s*(?:小時|h|hr)\s*(?:(\d+)\s*(?:分鐘|分|m|min))?/);
            if (durMatch) {
                duration = parseInt(durMatch[1]) * 60 + (parseInt(durMatch[2]) || 0);
            }

            // 航班號
            let flightNumber = '';
            const fnMatch = text.match(/\b([A-Z]{2})\s*(\d{2,4})\b/);
            if (fnMatch) {
                flightNumber = `${fnMatch[1]} ${fnMatch[2]}`;
            }

            flights.push({
                airline, departureTime, arrivalTime,
                duration, price, stops, flightNumber,
            });
        }

        return flights;
    });
}

async function extractFlightDataFallback(page: Page): Promise<RawFlightData[]> {
    return await page.evaluate(() => {
        const flights: any[] = [];
        const seenFlights = new Set<string>();
        const bodyText = document.body.innerText || document.body.textContent || '';
        const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const priceMatch = line.match(/(?:NT\$|TWD)\s*([\d,]+)/);
            if (!priceMatch) continue;
            const price = parseInt(priceMatch[1].replace(/,/g, ''));
            if (price <= 100 || price > 200000) continue;

            const contextStart = Math.max(0, i - 10);
            const contextEnd = Math.min(lines.length, i + 5);
            const contextLines = lines.slice(contextStart, contextEnd).join(' ');

            const timeMatches = contextLines.match(/\b(\d{1,2}:\d{2})\b/g);
            if (!timeMatches || timeMatches.length < 2) continue;

            const departureTime = timeMatches[0];
            const arrivalTime = timeMatches[1];

            const key = `${price}-${departureTime}-${arrivalTime}`;
            if (seenFlights.has(key)) continue;
            seenFlights.add(key);

            let airline = '未知航空';
            const airlinePatterns = [
                /(?:長榮|華航|星宇|虎航|樂桃|酷航|亞航|捷星|越捷|釜山|真航空|大韓|韓亞|國泰|全日空|日航)/,
                /(?:EVA|China Airlines|Starlux|Tigerair|Peach|Scoot|AirAsia|Jetstar|VietJet|Korean Air|Asiana|Cathay|ANA|JAL)/i,
            ];
            for (const pattern of airlinePatterns) {
                const m = contextLines.match(pattern);
                if (m) { airline = m[0]; break; }
            }

            let stops = 0;
            if (contextLines.includes('直達') || contextLines.includes('直飛') || /Nonstop/i.test(contextLines)) {
                stops = 0;
            } else if (contextLines.includes('轉機') || contextLines.includes('stop')) {
                const sm = contextLines.match(/(\d+)\s*(?:次轉機|次中轉|stop)/i);
                stops = sm ? parseInt(sm[1]) : 1;
            }

            let duration = 0;
            const dm = contextLines.match(/(\d+)\s*(?:小時|h|hr)\s*(?:(\d+)\s*(?:分鐘|分|m|min))?/);
            if (dm) duration = parseInt(dm[1]) * 60 + (parseInt(dm[2]) || 0);

            let flightNumber = '';
            const fm = contextLines.match(/\b([A-Z]{2})\s*(\d{2,4})\b/);
            if (fm) flightNumber = `${fm[1]} ${fm[2]}`;

            flights.push({
                airline, departureTime, arrivalTime,
                duration, price, stops, flightNumber,
            });
        }

        return flights;
    });
}

// =====================================================
// 格式轉換
// =====================================================

function transformToSerpApiFormat(
    rawFlights: RawFlightData[],
    origin: string,
    destination: string,
    outDate: string
): SerpApiCompatibleResponse {
    const flightOptions: SerpApiFlightOption[] = rawFlights.map(raw => ({
        flights: [{
            airline: raw.airline,
            flight_number: raw.flightNumber,
            duration: raw.duration,
            departure_airport: {
                name: origin,
                id: origin,
                time: `${outDate} ${raw.departureTime}`,
            },
            arrival_airport: {
                name: destination,
                id: destination,
                time: `${outDate} ${raw.arrivalTime}`,
            },
        }],
        price: raw.price,
        total_duration: raw.duration,
    }));

    // 多段航班（轉機）：補充虛擬轉機段
    rawFlights.forEach((raw, i) => {
        if (raw.stops > 0) {
            const option = flightOptions[i];
            for (let s = 0; s < raw.stops; s++) {
                option.flights.push({
                    airline: raw.airline,
                    flight_number: '',
                    duration: 0,
                    departure_airport: { name: '', id: '', time: '' },
                    arrival_airport: { name: destination, id: destination, time: `${outDate} ${raw.arrivalTime}` },
                });
            }
        }
    });

    return {
        best_flights: flightOptions.slice(0, 3),
        other_flights: flightOptions.slice(3),
    };
}
