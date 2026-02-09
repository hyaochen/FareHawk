# FareHawk

從台灣出發的智慧便宜機票搜尋工具。自動搜尋亞洲多個目的地的來回機票，計算含機場交通的**真實總花費**，分析每筆航班的**實際可玩時數**，並以標籤標示紅眼省住宿、首日可完整利用、直飛等資訊，所有結果呈現在響應式深色主題 Web 介面上。

## 功能特色

### 搜尋與資料收集
- **多來源機票搜尋** — 支援 Google Flights（SerpApi API 模式）及 Playwright 爬蟲（免費模式）
- **多機場比價** — 同時搜尋桃園 TPE、松山 TSA、高雄 KHH、台中 RMQ、台南 TNN，依總花費排序
- **彈性行程天數** — 自由設定天數組合（如 3、4、5、7 天），在搜尋區間內自動生成所有有效出發日期
- **智慧排程** — 設定搜尋區間（如第 7～60 天），支援 cron 自動定時刷新
- **航空公司促銷爬蟲** — 自動抓取各航空公司當前促銷活動

### 分析與智慧標籤
- **真實總花費計算** — 機票價格 + 從所在地到機場的來回交通費（高鐵、捷運、客運、台鐵）
- **有效遊玩時數** — 根據抵達時間、回程出發時間、機場提前報到時間，計算實際可利用的旅遊時數
- **智慧標籤系統：**

| 標籤 | 說明 |
|------|------|
| 🌙 紅眼航班（省住宿） | 深夜出發、清晨抵達，不浪費白天 |
| ☀️ 早到（玩滿首日） | 抵達時間夠早，首日可完整利用 |
| ✈️ 直飛 | 無需轉機 |
| 💰 廉航 | 偵測到廉價航空 |
| 🔥 超低價 | 總花費低於 NT$5,000 |
| 💎 優惠價 | 總花費低於 NT$8,000 |
| 👍 合理價 | 總花費低於 NT$12,000 |
| 📆 出發星期 | 顯示出發日是週幾 |

### Web 介面
- **響應式深色主題** — 手機、平板、桌面皆最佳化
- **多維排序** — 依總價、票價、出發日期、實玩時數、飛行時間排序
- **進階篩選** — 依出發機場、國家、目的地、航空公司、轉機次數、行程天數篩選
- **航班詳情彈窗** — 完整費用明細、交通資訊、簽證需求、訂票連結
- **搜尋確認機制** — 執行前顯示預估 API 用量，可設定搜尋次數上限
- **促銷活動區** — 顯示當前航空公司促銷資訊

### 通知
- **Telegram Bot** — 發現便宜機票即時推送通知
- **自訂價格門檻** — 設定低於多少錢才通知

## 運作流程

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  使用者設定    │────>│  日期組合生成器    │────>│  搜尋佇列     │
│  - 出發機場    │     │  搜尋區間內每一天  │     │  (機場 x      │
│  - 行程天數    │     │  都可做為出發日    │     │   目的地 x    │
│  - 搜尋區間    │     │  只要回程不超過    │     │   日期)       │
│              │     │  區間終點          │     │              │
└──────────────┘     └──────────────────┘     └──────┬───────┘
                                                      │
                     ┌────────────────────────────────┘
                     ▼
      ┌──────────────────────────┐
      │  Google Flights 搜尋     │
      │  (SerpApi 或 Playwright) │
      └────────────┬─────────────┘
                   │
                   ▼
      ┌──────────────────────────┐
      │  處理並儲存至資料庫       │
      │  - 解析航班資料           │
      │  - 計算交通費             │
      │  - 生成智慧標籤           │
      │  - 去重複                │
      │  - 儲存所有航班（不篩價格）│
      └────────────┬─────────────┘
                   │
                   ▼
      ┌──────────────────────────┐
      │  顯示層                  │
      │  - 依價格門檻篩選        │
      │  - 排序與呈現             │
      │  - 渲染卡片               │
      └──────────────────────────┘
```

**搜尋邏輯：**

1. 使用者設定出發機場、目的地、行程天數（如 3/4/5/7 天）、搜尋區間（如第 7～60 天）
2. 系統生成**所有有效日期組合** — 區間內每一天都是潛在出發日，只要「出發日 + 行程天數 ≤ 區間終點」
3. 每個（機場、目的地、日期）組合先檢查 DB 快取（24 小時新鮮度）
4. 未快取的航線透過 Google Flights 搜尋（API 或爬蟲模式）
5. 搜到的航班**全部儲存**至 SQLite（搜尋時不篩價格）
6. 顯示層再依使用者設定的價格門檻篩選並排序

## 技術架構

| 層級 | 技術 |
|------|------|
| 後端 | Node.js、TypeScript、Prisma ORM、node-cron |
| 前端 | Next.js 14、React 18 |
| 資料庫 | SQLite |
| 機票資料 | Google Flights（SerpApi / Playwright 爬蟲）|
| 通知 | Telegram Bot（grammy）|
| 樣式 | CSS Variables、深色主題、響應式設計 |

## 快速開始

### 環境需求

- Node.js >= 18
- npm

### 安裝

```bash
# 複製專案
git clone https://github.com/<your-username>/FareHawk.git
cd FareHawk

# 安裝後端依賴
npm install

# 安裝前端依賴
cd web && npm install && cd ..

# 生成 Prisma Client 並建立資料庫
npx prisma generate
npx prisma db push
```

### 環境變數設定

複製範例檔案並填入設定：

```bash
cp .env.example .env
```

`.env` 主要設定：

```env
# Telegram Bot（從 @BotFather 取得）
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# SerpApi（選用，用於 API 模式搜尋）
SERPAPI_API_KEY=your_serpapi_key

# 所在地（用於計算交通費）
USER_LOCATION=台北市

# 偏好出發機場
PREFERRED_AIRPORTS=TPE,TSA

# 關注的目的地
WATCH_DESTINATIONS=NRT,KIX,ICN,BKK,SIN

# 價格門檻（新台幣，含交通費）
PRICE_ALERT_THRESHOLD=20000
```

前端另需建立 `web/.env.local`：

```env
SERPAPI_API_KEY=your_serpapi_key
DATABASE_URL="file:../prisma/fly.db"
```

### 啟動

```bash
# 啟動後端（Telegram Bot + 排程器）
npm run dev

# 另開終端，啟動 Web 介面
cd web && npm run dev
```

Web 介面預設在 `http://localhost:3003`。

## 專案結構

```
FareHawk/
├── src/                          # 後端程式碼
│   ├── config/                   # 機場、交通費用、系統設定
│   ├── core/                     # 機票搜尋、分析、排序核心邏輯
│   ├── services/                 # Telegram Bot、排程器、DB 服務
│   └── types/                    # TypeScript 型別定義
├── web/                          # Next.js 前端
│   ├── app/
│   │   ├── api/flights/          # 機票搜尋 API
│   │   ├── api/promos/           # 航空促銷 API
│   │   ├── settings/             # 設定頁面
│   │   ├── page.tsx              # 主要機票結果頁面
│   │   └── globals.css           # 深色主題樣式
│   └── lib/
│       ├── crawlers/             # Google Flights 爬蟲、Skyscanner、促銷爬蟲
│       ├── cache.ts              # 記憶體搜尋快取
│       └── db.ts                 # Prisma Client
├── prisma/
│   └── schema.prisma             # 資料庫模型定義
├── scripts/
│   └── start.ps1                 # Windows 啟動腳本
└── .env.example                  # 環境變數範本
```

## 支援目的地

| 國家 | 機場 |
|------|------|
| 日本 | NRT 東京成田、HND 東京羽田、KIX 大阪關西、FUK 福岡、CTS 札幌、OKA 沖繩、NGO 名古屋 |
| 韓國 | ICN 首爾仁川、GMP 首爾金浦、PUS 釜山、CJU 濟州 |
| 泰國 | BKK 曼谷素萬那普、DMK 曼谷廊曼、CNX 清邁、HKT 普吉 |
| 新加坡 | SIN 新加坡樟宜 |
| 越南 | SGN 胡志明市、HAN 河內、DAD 峴港 |
| 其他 | DPS 峇里島、MNL 馬尼拉、CEB 宿霧、KUL 吉隆坡、HKG 香港、MFM 澳門 |

## 授權

MIT
