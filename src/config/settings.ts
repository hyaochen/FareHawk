/**
 * 系統設定
 * 從環境變數載入配置
 */

import { config } from 'dotenv';
import { z } from 'zod';

// 載入環境變數
config();

// =====================================================
// 設定驗證 Schema
// =====================================================

const envSchema = z.object({
    // Telegram
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),

    // API Keys
    SKYSCANNER_API_KEY: z.string().optional(),
    SERPAPI_API_KEY: z.string().optional(),
    AMADEUS_API_KEY: z.string().optional(),
    AMADEUS_API_SECRET: z.string().optional(),

    // 使用者設定
    USER_LOCATION: z.string().default('台北市'),
    PREFERRED_AIRPORTS: z.string().default('TPE,TSA'),
    WATCH_DESTINATIONS: z.string().default('NRT,HND,KIX,ICN'),

    // 搜尋設定
    TRIP_DURATIONS: z.string().default('3,4,5,7'),
    SEARCH_DAYS_AHEAD: z.string().default('60'),
    PRICE_ALERT_THRESHOLD: z.string().default('8000'),

    // 排程
    SEARCH_CRON: z.string().default('0 8,20 * * *'),

    // Web
    WEB_PORT: z.string().default('3000'),

    // 資料庫
    DATABASE_URL: z.string().default('file:./prisma/fly.db'),
});

// =====================================================
// 解析與轉換
// =====================================================

const env = envSchema.parse(process.env);

// 解析陣列格式的環境變數
function parseArray(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean);
}

function parseNumberArray(value: string): number[] {
    return value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
}

// =====================================================
// 匯出設定
// =====================================================

export const settings = {
    // Telegram Bot
    telegram: {
        botToken: env.TELEGRAM_BOT_TOKEN || '',
        chatId: env.TELEGRAM_CHAT_ID || '',
        isConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    },

    // API 設定
    api: {
        skyscanner: {
            apiKey: env.SKYSCANNER_API_KEY || '',
            isConfigured: !!env.SKYSCANNER_API_KEY,
        },
        serpapi: {
            apiKey: env.SERPAPI_API_KEY || '',
            isConfigured: !!env.SERPAPI_API_KEY,
        },
        amadeus: {
            apiKey: env.AMADEUS_API_KEY || '',
            apiSecret: env.AMADEUS_API_SECRET || '',
            isConfigured: !!(env.AMADEUS_API_KEY && env.AMADEUS_API_SECRET),
        },
    },

    // 使用者偏好
    user: {
        location: env.USER_LOCATION,
        preferredAirports: parseArray(env.PREFERRED_AIRPORTS),
        watchDestinations: parseArray(env.WATCH_DESTINATIONS),
        tripDurations: parseNumberArray(env.TRIP_DURATIONS),
        priceThreshold: parseInt(env.PRICE_ALERT_THRESHOLD) || 8000,
    },

    // 搜尋設定
    search: {
        daysAhead: parseInt(env.SEARCH_DAYS_AHEAD) || 60,
        cronSchedule: env.SEARCH_CRON,
    },

    // Web UI
    web: {
        port: parseInt(env.WEB_PORT) || 3000,
    },

    // 資料庫
    database: {
        url: env.DATABASE_URL,
    },
} as const;

// =====================================================
// 驗證設定
// =====================================================

export function validateSettings(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 檢查必要的 API 設定
    if (!settings.api.skyscanner.isConfigured &&
        !settings.api.serpapi.isConfigured &&
        !settings.api.amadeus.isConfigured) {
        errors.push('至少需要配置一個機票 API (Skyscanner, SerpApi, 或 Amadeus)');
    }

    // 檢查 Telegram 設定 (可選但建議)
    if (!settings.telegram.isConfigured) {
        console.warn('⚠️  Telegram Bot 未配置，將無法發送通知');
    }

    // 檢查使用者位置
    const validLocations = [
        '台北市', '新北市', '桃園', '新竹', '台中', '台南', '高雄市', '屏東'
    ];
    if (!validLocations.includes(settings.user.location)) {
        errors.push(`無效的使用者位置: ${settings.user.location}`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

export default settings;
