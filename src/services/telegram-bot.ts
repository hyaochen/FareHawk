/**
 * Telegram Bot 通知服務
 */

import { Bot, Context, InlineKeyboard } from 'grammy';
import { settings } from '../config/settings.js';
import type { FlightAnalysis, AlertMessage } from '../types/index.js';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';

// =====================================================
// Bot 初始化
// =====================================================

let bot: Bot | null = null;

/**
 * 初始化 Telegram Bot
 */
export function initBot(): Bot | null {
    if (!settings.telegram.isConfigured) {
        console.warn('⚠️  Telegram Bot 未配置，跳過初始化');
        return null;
    }

    bot = new Bot(settings.telegram.botToken);

    // 設定指令
    setupCommands(bot);

    return bot;
}

/**
 * 設定 Bot 指令
 */
function setupCommands(bot: Bot) {
    // /start 指令
    bot.command('start', async (ctx) => {
        await ctx.reply(
            '✈️ 歡迎使用便宜機票搜尋器！\n\n' +
            '可用指令：\n' +
            '/search - 立即搜尋便宜機票\n' +
            '/subscribe - 訂閱機票通知\n' +
            '/settings - 查看/修改設定\n' +
            '/help - 查看幫助\n\n' +
            '系統會自動搜尋便宜機票並通知您！'
        );
    });

    // /help 指令
    bot.command('help', async (ctx) => {
        await ctx.reply(
            '📖 使用說明\n\n' +
            '【自動通知】\n' +
            '系統會每天自動搜尋便宜機票，發現好價格時會通知您。\n\n' +
            '【手動搜尋】\n' +
            '使用 /search 指令立即搜尋當前便宜機票。\n\n' +
            '【訂閱設定】\n' +
            '使用 /subscribe 可以設定關注的目的地和價格門檻。\n\n' +
            '【機票標籤說明】\n' +
            '🌙 紅眼航班 - 夜間飛行，早晨抵達\n' +
            '☀️ 完整首日 - 抵達後當日可完整活動\n' +
            '🌃 深夜抵達 - 當日已無活動時間\n' +
            '✈️ 直飛航班 - 無需轉機\n' +
            '💰 廉航特價 - 廉價航空優惠\n' +
            '📉 歷史低價 - 近期最低價格'
        );
    });

    // /search 指令
    bot.command('search', async (ctx) => {
        await ctx.reply('🔍 正在搜尋便宜機票，請稍候...\n這可能需要幾分鐘時間。');
        try {
            // 動態匯入避免循環依賴
            const { runSearchAndNotify } = await import('./scheduler.js');
            await runSearchAndNotify();
            await ctx.reply('✅ 搜尋完成！');
        } catch (error) {
            console.error('手動搜尋失敗:', error);
            await ctx.reply('❌ 搜尋過程中發生錯誤，請檢查日誌。');
        }
    });

    // /settings 指令
    bot.command('settings', async (ctx) => {
        const { user } = settings;
        await ctx.reply(
            '⚙️ 目前設定：\n\n' +
            `📍 所在地區：${user.location}\n` +
            `🛫 出發機場：${user.preferredAirports.join(', ')}\n` +
            `🎯 關注目的地：${user.watchDestinations.join(', ')}\n` +
            `📅 行程天數：${user.tripDurations.join(', ')} 天\n` +
            `💰 價格門檻：NT$ ${user.priceThreshold.toLocaleString()}`
        );
    });

    // 處理錯誤
    bot.catch((err) => {
        console.error('Telegram Bot 錯誤:', err);
    });
}

/**
 * 啟動 Bot
 */
export async function startBot(): Promise<void> {
    if (!bot) {
        bot = initBot();
    }

    if (bot) {
        console.log('🤖 Telegram Bot 啟動中...');
        await bot.start();
    }
}

// =====================================================
// 通知訊息格式化
// =====================================================

/**
 * 格式化機票標籤
 */
function formatTags(tags: string[]): string {
    const tagEmojis: Record<string, string> = {
        '紅眼航班': '🌙',
        '早起航班': '⏰',
        '深夜抵達': '🌃',
        '完整首日': '☀️',
        '午後抵達': '🌤️',
        '晚間回程': '🌆',
        '凌晨回程': '🌑',
        '短程快閃': '⚡',
        '標準假期': '📅',
        '長假行程': '🏖️',
        '直飛航班': '✈️',
        '轉機航班': '🔄',
        '廉航特價': '💰',
        '歷史低價': '📉',
        '即將漲價': '📈',
        '週末出發': '🗓️',
        '平日出發': '📆',
    };

    return tags.map(tag => `${tagEmojis[tag] || '#'}${tag}`).join(' ');
}

/**
 * 格式化單個機票訊息
 */
export function formatFlightMessage(analysis: FlightAnalysis): string {
    const { flight, totalStayHours, effectiveStayHours, tags, totalCost, transportCost, tripDays } = analysis;
    const returnFlight = flight.returnFlight!;

    const outDate = format(flight.departureTime, 'MM/dd (E)', { locale: zhTW });
    const retDate = format(returnFlight.departureTime, 'MM/dd (E)', { locale: zhTW });
    const outTime = format(flight.departureTime, 'HH:mm');
    const outArrTime = format(flight.arrivalTime, 'HH:mm');
    const retTime = format(returnFlight.departureTime, 'HH:mm');
    const retArrTime = format(returnFlight.arrivalTime, 'HH:mm');

    let message = `✈️ *${flight.destination}* 來回機票\n\n`;

    // 價格資訊
    message += `💰 *總價：NT$ ${totalCost.toLocaleString()}*\n`;
    message += `   ├─ 機票：NT$ ${flight.price.toLocaleString()}\n`;
    message += `   └─ 交通：NT$ ${transportCost.toLocaleString()}\n\n`;

    // 行程時間
    message += `📅 行程：${outDate} → ${retDate} (${tripDays}天)\n`;
    message += `⏱️ 實際停留：${totalStayHours} 小時\n`;
    message += `🎯 有效活動：約 ${effectiveStayHours} 小時\n\n`;

    // 標籤
    message += `🏷️ ${formatTags(tags)}\n\n`;

    // 航班詳情
    message += `*去程*：\n`;
    message += `  ${flight.airline} | ${outTime} → ${outArrTime}`;
    if (flight.stops > 0) message += ` (轉${flight.stops}次)`;
    message += `\n`;

    message += `*回程*：\n`;
    message += `  ${returnFlight.airline} | ${retTime} → ${retArrTime}`;
    if (returnFlight.stops > 0) message += ` (轉${returnFlight.stops}次)`;
    message += `\n`;

    return message;
}

/**
 * 格式化多個機票的通知
 */
export function formatAlertMessage(alert: AlertMessage): string {
    let message = '';

    switch (alert.type) {
        case 'price_drop':
            message = '📉 *價格下降通知*\n\n';
            break;
        case 'new_deal':
            message = '🎉 *發現便宜機票！*\n\n';
            break;
        case 'threshold_hit':
            message = '🔔 *達到目標價格*\n\n';
            break;
        default:
            message = '✈️ *機票通知*\n\n';
    }

    for (const analysis of alert.flights.slice(0, 5)) {
        message += formatFlightMessage(analysis);
        message += '\n─────────────\n\n';
    }

    if (alert.flights.length > 5) {
        message += `\n📋 還有 ${alert.flights.length - 5} 個結果，請前往網頁查看完整列表`;
    }

    return message;
}

// =====================================================
// 發送通知
// =====================================================

/**
 * 發送文字訊息
 */
export async function sendMessage(text: string, chatId?: string): Promise<void> {
    if (!bot) {
        console.warn('⚠️  Bot 未初始化，無法發送訊息');
        return;
    }

    const targetChatId = chatId || settings.telegram.chatId;

    try {
        await bot.api.sendMessage(targetChatId, text, {
            parse_mode: 'Markdown',
        });
    } catch (error) {
        console.error('發送 Telegram 訊息失敗:', error);
    }
}

/**
 * 發送機票通知
 */
export async function sendFlightAlert(alert: AlertMessage): Promise<void> {
    const message = formatAlertMessage(alert);

    // 建立互動按鈕
    const keyboard = new InlineKeyboard()
        .url('🌐 查看詳情', `http://localhost:${settings.web.port}/flights`)
        .row()
        .text('✅ 已讀', 'mark_read')
        .text('❌ 忽略', 'dismiss');

    if (!bot) {
        console.warn('⚠️  Bot 未初始化，無法發送通知');
        console.log('📧 通知內容：\n', message);
        return;
    }

    try {
        await bot.api.sendMessage(settings.telegram.chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });
        console.log('✅ 機票通知已發送');
    } catch (error) {
        console.error('發送機票通知失敗:', error);
    }
}

/**
 * 發送簡單通知
 */
export async function sendSimpleNotification(
    title: string,
    body: string
): Promise<void> {
    const message = `*${title}*\n\n${body}`;
    await sendMessage(message);
}

export { bot };
