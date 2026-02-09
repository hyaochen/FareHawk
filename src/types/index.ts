/**
 * 便宜機票搜尋器 - 核心型別定義
 */

// =====================================================
// 機場與交通
// =====================================================

/** 交通方式 */
export type TransportMethod = '高鐵' | '台鐵' | '客運' | '捷運' | '計程車' | '步行';

/** 交通選項 */
export interface TransportOption {
    method: TransportMethod;
    from: string;           // 出發地點
    cost: number;           // 費用 (TWD)
    duration: number;       // 時間 (分鐘)
    description?: string;   // 說明
}

/** 機場資訊 */
export interface Airport {
    code: string;           // IATA 代碼
    name: string;           // 機場名稱
    city: string;
    timezone: string;
    transportOptions: Record<string, TransportOption[]>; // 地區 -> 交通選項
}

// =====================================================
// 機票資料
// =====================================================

/** 轉機資訊 */
export interface Layover {
    airport: string;        // 轉機機場
    duration: number;       // 等待時間 (分鐘)
}

/** 航班資訊 */
export interface Flight {
    id: string;

    // 航班基本資訊
    airline: string;           // 航空公司
    airlineLogo?: string;      // 航空公司 Logo URL
    flightNumber?: string;     // 航班號
    origin: string;            // 出發機場 (IATA)
    destination: string;       // 目的地機場

    // 時間資訊
    departureTime: Date;       // 出發時間 (當地)
    arrivalTime: Date;         // 抵達時間 (當地)
    flightDuration: number;    // 飛行時長 (分鐘)

    // 價格
    price: number;             // 機票價格 (TWD)
    currency: string;

    // 轉機資訊
    stops: number;             // 轉機次數
    layovers?: Layover[];      // 轉機詳情

    // 來源
    source: string;            // 資料來源
    bookingUrl?: string;       // 訂票連結

    // 票種
    isRoundTrip: boolean;      // 是否來回
    returnFlight?: Flight;     // 回程航班
}

/** 機票標籤 */
export type FlightTag = string;

/** 機票分析結果 */
export interface FlightAnalysis {
    flight: Flight;

    // 停留分析
    totalStayHours: number;           // 實際停留時數 (不含飛行)
    effectiveStayHours: number;       // 有效活動時數

    // 時間品質標籤
    tags: FlightTag[];

    // 計算後的總成本
    totalCost: number;                // 機票 + 來回交通費
    transportCost: number;            // 單程交通費用

    // 價格評估
    pricePerEffectiveHour: number;    // 每有效小時成本
    pricePerDay: number;              // 每日平均成本
    historicalComparison: 'lowest' | 'low' | 'average' | 'high';

    // 行程天數
    tripDays: number;
}

// =====================================================
// 使用者設定
// =====================================================

/** 使用者偏好設定 */
export interface UserPreferences {
    location: string;                 // 所在地區
    preferredAirports: string[];      // 偏好的出發機場
    watchDestinations: string[];      // 關注的目的地
    tripDurations: number[];          // 關注的行程天數
    priceThreshold: number;           // 價格警報閾值
    notifyEnabled: boolean;           // 是否接收通知
}

/** 搜尋請求 */
export interface SearchRequest {
    origins: string[];                // 出發機場
    destinations: string[];           // 目的地
    tripDurations: number[];          // 行程天數
    startDateFrom: Date;              // 搜尋起始日期
    startDateTo: Date;                // 搜尋結束日期
    maxPrice?: number;                // 最高價格
}

/** 搜尋結果 */
export interface SearchResult {
    request: SearchRequest;
    flights: FlightAnalysis[];
    searchedAt: Date;
    source: string;
}

// =====================================================
// 通知
// =====================================================

/** 通知類型 */
export type AlertType =
    | 'price_drop'      // 價格下降
    | 'new_deal'        // 新優惠
    | 'threshold_hit'   // 達到價格門檻
    | 'trend_warning';  // 趨勢警告

/** 通知訊息 */
export interface AlertMessage {
    type: AlertType;
    title: string;
    flights: FlightAnalysis[];
    createdAt: Date;
}

// =====================================================
// API 回應
// =====================================================

/** API 基礎回應 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: Date;
}
