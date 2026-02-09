/**
 * 便宜機票搜尋器 - 主程式入口
 */

import { settings, validateSettings } from './config/settings.js';
import { initBot, startBot, sendSimpleNotification } from './services/telegram-bot.js';
import { startScheduler, runSearchAndNotify } from './services/scheduler.js';

// =====================================================
// 啟動流程
// =====================================================

async function main() {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║     ✈️  便宜機票搜尋器 v1.0.0              ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');

    // 驗證設定
    console.log('🔧 檢查系統設定...');
    const validation = validateSettings();

    if (!validation.valid) {
        console.error('❌ 設定驗證失敗：');
        validation.errors.forEach(err => console.error(`   - ${err}`));
        console.log('\n💡 請複製 .env.example 為 .env 並填入正確的設定值');
        process.exit(1);
    }

    console.log('✅ 設定驗證通過');

    // 顯示當前設定
    console.log('');
    console.log('📋 目前設定：');
    console.log(`   📍 所在地區：${settings.user.location}`);
    console.log(`   🛫 出發機場：${settings.user.preferredAirports.join(', ')}`);
    console.log(`   🎯 關注目的地：${settings.user.watchDestinations.join(', ')}`);
    console.log(`   📅 行程天數：${settings.user.tripDurations.join(', ')} 天`);
    console.log(`   💰 價格門檻：NT$ ${settings.user.priceThreshold.toLocaleString()}`);
    console.log('');

    // 初始化 Telegram Bot
    if (settings.telegram.isConfigured) {
        console.log('🤖 初始化 Telegram Bot...');
        initBot();

        // 發送啟動通知
        await sendSimpleNotification(
            '✈️ 機票搜尋器已啟動',
            `正在監控 ${settings.user.watchDestinations.join(', ')} 的便宜機票`
        );
    } else {
        console.log('⚠️  Telegram 未配置，通知功能將被停用');
    }

    // 啟動排程
    console.log('');
    console.log('⏰ 啟動排程服務...');
    startScheduler();

    // 是否立即執行一次搜尋
    const runNow = process.argv.includes('--run-now');
    if (runNow) {
        console.log('');
        console.log('🚀 立即執行搜尋...');
        await runSearchAndNotify();
    }

    console.log('');
    console.log('🎉 系統啟動完成！');
    console.log('   按 Ctrl+C 停止服務');
    console.log('');

    // 啟動 Bot (這會阻塞)
    if (settings.telegram.isConfigured) {
        await startBot();
    } else {
        // 沒有 Bot 時，保持程式運行
        await new Promise(() => { }); // 無限等待
    }
}

// 處理終止信號
process.on('SIGINT', () => {
    console.log('\n👋 正在關閉服務...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 正在關閉服務...');
    process.exit(0);
});

// 執行主程式
main().catch(error => {
    console.error('❌ 程式啟動失敗:', error);
    process.exit(1);
});
