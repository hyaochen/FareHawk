'use client';

import { useState, useEffect, useCallback } from 'react';

// Types
interface FlightData {
    id: string;
    departureAirport: string;
    departureAirportName: string;
    destination: string;
    destinationCode: string;
    country: string;
    airline: string;
    flightNumber: string;
    price: number;
    transportCost: number;
    transportMethod: string;
    transportDuration: string;
    transportReference: string;
    totalCost: number;
    outboundDate: string;
    outboundTime: string;
    outboundArrival: string;
    returnDate: string;
    returnDateRaw: string;
    returnDepartureTime: string;
    returnArrivalTime: string;
    returnAirline: string;
    returnFlightDuration: number;
    returnStops: number;
    tripDays: number;
    daysFromNow: number;
    effectiveStayHours: number;
    stops: number;
    tags: string[];
    bookingUrl: string;
    sourceUrl: string;
    visaInfo: string;
    entryRequirements: string;
    foundAt: string;
    flightDuration: number;
}

interface SearchMeta {
    lastSearchTime: string;
    settings: {
        userLocation: string;
        departureAirports: string[];
        destinations: string[];
        priceThreshold: number;
        tripDurations: number[];
        startDaysAhead: number;
    };
    totalFound: number;
    totalInDb: number;
}

interface PromoInfo {
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

// Tag styling
const tagStyles: Record<string, string> = {
    '超低價': 'positive',
    '優惠價': 'positive',
    '完整首日': 'positive',
    '直飛': 'positive',
    '紅眼航班': 'highlight',
    '早起航班': '',
    '深夜抵達': 'negative',
    '轉機': 'negative',
};

export default function HomePage() {
    const [flights, setFlights] = useState<FlightData[]>([]);
    const [meta, setMeta] = useState<SearchMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFlight, setSelectedFlight] = useState<FlightData | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [promos, setPromos] = useState<PromoInfo[]>([]);
    const [promosLoading, setPromosLoading] = useState(false);
    const [sortBy, setSortBy] = useState<'totalCost' | 'price' | 'daysFromNow' | 'effectiveStayHours' | 'flightDuration'>('totalCost');
    const [filterCountry, setFilterCountry] = useState<string>('all');
    const [filterDepartureAirport, setFilterDepartureAirport] = useState<string>('all');
    const [filterDestination, setFilterDestination] = useState<string>('all');
    const [filterAirline, setFilterAirline] = useState<string>('all');
    const [filterStops, setFilterStops] = useState<string>('all');
    const [filterTripDays, setFilterTripDays] = useState<string>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [showSearchConfirm, setShowSearchConfirm] = useState(false);
    const [searchEstimate, setSearchEstimate] = useState<any>(null);
    const [estimating, setEstimating] = useState(false);
    const [confirmBeforeSearch, setConfirmBeforeSearch] = useState(true);

    // 載入便宜機票
    const loadFlights = useCallback(async (refresh = false) => {
        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (refresh) params.set('refresh', 'true');

            // 載入使用者設定
            if (typeof window !== 'undefined') {
                const savedSettings = localStorage.getItem('flightFinderSettings');
                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);
                    if (settings.location) params.set('location', settings.location);
                    if (settings.selectedAirports?.length) params.set('airports', settings.selectedAirports.join(','));
                    if (settings.selectedDestinations?.length) params.set('destinations', settings.selectedDestinations.join(','));
                    if (settings.selectedDurations?.length) params.set('durations', settings.selectedDurations.join(','));
                    if (settings.priceThreshold) params.set('priceThreshold', settings.priceThreshold.toString());
                    if (settings.startDaysAhead) params.set('startDaysAhead', settings.startDaysAhead.toString());
                    if (settings.searchDaysAhead) params.set('searchDaysAhead', settings.searchDaysAhead.toString());
                    if (settings.useApiSearch !== undefined) params.set('useApi', settings.useApiSearch.toString());
                }
            }

            const response = await fetch(`/api/flights?${params.toString()}`);
            if (!response.ok) {
                setError(`伺服器錯誤 (HTTP ${response.status})`);
                return;
            }
            const data = await response.json();

            if (data.success) {
                setFlights(data.data);
                setMeta(data.meta);
                setLastRefresh(new Date());
            } else {
                setError(data.error || '載入失敗');
            }
        } catch (err: any) {
            setError(err.message || '網路錯誤');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // 載入促銷資訊
    const loadPromos = useCallback(async (refresh = false) => {
        setPromosLoading(true);
        try {
            const params = new URLSearchParams();
            if (refresh) params.set('refresh', 'true');
            const response = await fetch(`/api/promos?${params.toString()}`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.success) {
                setPromos(data.data);
            }
        } catch (err) {
            // 促銷載入失敗不影響主要功能
            console.error('促銷載入失敗:', err);
        } finally {
            setPromosLoading(false);
        }
    }, []);

    // 取得搜尋預估
    const getEstimate = useCallback(async () => {
        setEstimating(true);
        try {
            const params = new URLSearchParams();
            params.set('estimate', 'true');
            if (typeof window !== 'undefined') {
                const savedSettings = localStorage.getItem('flightFinderSettings');
                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);
                    if (settings.location) params.set('location', settings.location);
                    if (settings.selectedAirports?.length) params.set('airports', settings.selectedAirports.join(','));
                    if (settings.selectedDestinations?.length) params.set('destinations', settings.selectedDestinations.join(','));
                    if (settings.selectedDurations?.length) params.set('durations', settings.selectedDurations.join(','));
                    if (settings.priceThreshold) params.set('priceThreshold', settings.priceThreshold.toString());
                    if (settings.startDaysAhead) params.set('startDaysAhead', settings.startDaysAhead.toString());
                    if (settings.searchDaysAhead) params.set('searchDaysAhead', settings.searchDaysAhead.toString());
                    if (settings.useApiSearch !== undefined) params.set('useApi', settings.useApiSearch.toString());
                }
            }
            const response = await fetch(`/api/flights?${params.toString()}`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.success && data.estimate) {
                setSearchEstimate(data.estimate);
                setShowSearchConfirm(true);
            }
        } catch (err) {
            console.error('預估失敗:', err);
            // 預估失敗就直接搜尋
            loadFlights(true);
        } finally {
            setEstimating(false);
        }
    }, [loadFlights]);

    // 處理搜尋按鈕
    const handleRefresh = useCallback(() => {
        if (confirmBeforeSearch) {
            getEstimate();
        } else {
            loadFlights(true);
        }
    }, [confirmBeforeSearch, getEstimate, loadFlights]);

    // 確認搜尋（帶指定次數）
    const confirmSearch = useCallback((maxCalls: number) => {
        setShowSearchConfirm(false);
        setSearchEstimate(null);
        // 帶上 maxCalls 參數
        setIsLoading(true);
        setError(null);
        const doSearch = async () => {
            try {
                const params = new URLSearchParams();
                params.set('refresh', 'true');
                if (maxCalls > 0) params.set('maxCalls', maxCalls.toString());
                if (typeof window !== 'undefined') {
                    const savedSettings = localStorage.getItem('flightFinderSettings');
                    if (savedSettings) {
                        const settings = JSON.parse(savedSettings);
                        if (settings.location) params.set('location', settings.location);
                        if (settings.selectedAirports?.length) params.set('airports', settings.selectedAirports.join(','));
                        if (settings.selectedDestinations?.length) params.set('destinations', settings.selectedDestinations.join(','));
                        if (settings.selectedDurations?.length) params.set('durations', settings.selectedDurations.join(','));
                        if (settings.priceThreshold) params.set('priceThreshold', settings.priceThreshold.toString());
                        if (settings.startDaysAhead) params.set('startDaysAhead', settings.startDaysAhead.toString());
                        if (settings.searchDaysAhead) params.set('searchDaysAhead', settings.searchDaysAhead.toString());
                        if (settings.useApiSearch !== undefined) params.set('useApi', settings.useApiSearch.toString());
                    }
                }
                const response = await fetch(`/api/flights?${params.toString()}`);
                if (!response.ok) { setError(`伺服器錯誤 (HTTP ${response.status})`); return; }
                const data = await response.json();
                if (data.success) { setFlights(data.data); setMeta(data.meta); setLastRefresh(new Date()); }
                else { setError(data.error || '搜尋失敗'); }
            } catch (err: any) { setError(err.message || '網路錯誤'); }
            finally { setIsLoading(false); }
        };
        doSearch();
    }, []);

    // 首次載入
    useEffect(() => {
        loadFlights();
        loadPromos();
    }, [loadFlights, loadPromos]);

    // 自動刷新（每小時）
    useEffect(() => {
        const interval = setInterval(() => {
            loadFlights(true);
        }, 60 * 60 * 1000); // 1 hour

        return () => clearInterval(interval);
    }, [loadFlights]);

    return (
        <>
            {/* Header */}
            <header className="page-header">
                <h1 className="page-title">🔍 發現便宜機票</h1>
                <p className="page-subtitle">
                    系統自動搜尋中，低於 NT$ {meta?.settings.priceThreshold?.toLocaleString() || '20,000'} 的機票（含交通費）
                </p>
            </header>

            {/* Search Info */}
            {meta && (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius)',
                    padding: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-lg)',
                    fontSize: '0.875rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <strong>搜尋條件：</strong>
                            <span style={{ color: 'var(--text-secondary)' }}>
                                {meta.settings.userLocation} 出發 → {meta.settings.destinations.slice(0, 4).join('、')}
                                {meta.settings.destinations.length > 4 && ` 等${meta.settings.destinations.length}個目的地`}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                上次更新: {meta.lastSearchTime ? new Date(meta.lastSearchTime).toLocaleString('zh-TW') : '尚未搜尋'}
                            </span>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={confirmBeforeSearch}
                                    onChange={e => setConfirmBeforeSearch(e.target.checked)}
                                />
                                搜尋前確認
                            </label>
                            <button
                                className="btn btn-secondary"
                                onClick={handleRefresh}
                                disabled={isLoading || estimating}
                                style={{ padding: '6px 12px', fontSize: '0.875rem' }}
                            >
                                {estimating ? '預估中...' : isLoading ? '搜尋中...' : '🔄 立即更新'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--border-radius)',
                    padding: 'var(--spacing-md)',
                    color: 'var(--accent-danger)',
                    marginBottom: 'var(--spacing-md)'
                }}>
                    ⚠️ {error}
                    <button
                        onClick={() => loadFlights(true)}
                        style={{ marginLeft: '12px', textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                    >
                        重試
                    </button>
                </div>
            )}

            {/* Loading */}
            {isLoading && flights.length === 0 && (
                <div className="loading">
                    <div className="loading-spinner" />
                    <p className="loading-text">正在搜尋便宜機票...</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        搜尋多個航線和日期組合中，請稍候
                    </p>
                </div>
            )}

            {/* Results Summary + Sort/Filter */}
            {!isLoading && flights.length > 0 && (
                <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 'var(--border-radius)',
                    padding: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-md)',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-success)' }}>
                        找到 {flights.length} 筆便宜機票{filterCountry !== 'all' || filterDepartureAirport !== 'all' || filterDestination !== 'all' || filterAirline !== 'all' || filterStops !== 'all' || filterTripDays !== 'all' ? '（已篩選）' : ''}！
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        最低 NT$ {Math.min(...flights.map(f => f.totalCost)).toLocaleString()}（含交通）
                        {meta?.totalInDb ? ` | DB 共 ${meta.totalInDb} 筆航班` : ''}
                    </div>
                </div>
            )}

            {/* Sort & Filter Bar */}
            {flights.length > 0 && (() => {
                // 從航班資料動態取得篩選選項
                const uniqueAirports = Array.from(new Set(flights.map(f => f.departureAirport))).sort();
                const uniqueDestinations = Array.from(new Set(flights.map(f => f.destinationCode))).sort();
                const uniqueAirlines = Array.from(new Set(flights.map(f => f.airline))).sort();
                const uniqueCountries = Array.from(new Set(flights.map(f => f.country))).filter(Boolean).sort();
                const uniqueTripDays = Array.from(new Set(flights.map(f => f.tripDays))).filter(d => d > 0).sort((a, b) => a - b);

                const airportNames: Record<string, string> = {
                    'TPE': '桃園 TPE', 'TSA': '松山 TSA', 'KHH': '高雄 KHH', 'RMQ': '台中 RMQ', 'TNN': '台南 TNN',
                };
                const destNames: Record<string, string> = {
                    'NRT': '東京成田', 'HND': '東京羽田', 'KIX': '大阪關西',
                    'FUK': '福岡', 'CTS': '札幌', 'OKA': '沖繩那霸', 'NGO': '名古屋',
                    'ICN': '首爾仁川', 'GMP': '首爾金浦', 'PUS': '釜山', 'CJU': '濟州',
                    'BKK': '曼谷素萬', 'DMK': '曼谷廊曼', 'CNX': '清邁', 'HKT': '普吉',
                    'SIN': '新加坡', 'SGN': '胡志明', 'HAN': '河內', 'DAD': '峴港',
                    'DPS': '峇里島', 'MNL': '馬尼拉', 'CEB': '宿霧',
                    'KUL': '吉隆坡', 'HKG': '香港', 'MFM': '澳門',
                    'PVG': '上海', 'PEK': '北京',
                };

                // 計算目前啟用的篩選數量
                const activeFilterCount = [
                    filterDepartureAirport !== 'all',
                    filterDestination !== 'all',
                    filterCountry !== 'all',
                    filterAirline !== 'all',
                    filterStops !== 'all',
                    filterTripDays !== 'all',
                ].filter(Boolean).length;

                const selectStyle = {
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    minWidth: '80px',
                };

                return (
                    <div style={{
                        marginBottom: 'var(--spacing-lg)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--border-radius)',
                        fontSize: '0.875rem',
                    }}>
                        {/* 排序列 */}
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            padding: '10px 14px',
                        }}>
                            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>排序：</span>
                            {([
                                ['totalCost', '總價最低'],
                                ['price', '票價最低'],
                                ['daysFromNow', '最近出發'],
                                ['effectiveStayHours', '實玩最長'],
                                ['flightDuration', '飛行最短'],
                            ] as [typeof sortBy, string][]).map(([key, label]) => (
                                <button
                                    key={key}
                                    className={`filter-chip ${sortBy === key ? 'active' : ''}`}
                                    onClick={() => setSortBy(key)}
                                    style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                >
                                    {label}
                                </button>
                            ))}
                            <span style={{ flex: 1 }} />
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                style={{
                                    background: activeFilterCount > 0 ? 'var(--accent-primary)' : 'transparent',
                                    color: activeFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${activeFilterCount > 0 ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                    borderRadius: '6px',
                                    padding: '4px 12px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                }}
                            >
                                🔽 篩選{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                            </button>
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={() => {
                                        setFilterDepartureAirport('all');
                                        setFilterDestination('all');
                                        setFilterCountry('all');
                                        setFilterAirline('all');
                                        setFilterStops('all');
                                        setFilterTripDays('all');
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--accent-danger)',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        padding: '4px 6px',
                                    }}
                                >
                                    清除篩選
                                </button>
                            )}
                        </div>

                        {/* 篩選展開區 */}
                        {showFilters && (
                            <div style={{
                                borderTop: '1px solid var(--border-color)',
                                padding: '12px 14px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: '10px',
                            }}>
                                {/* 出發機場 */}
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>出發機場</div>
                                    <select value={filterDepartureAirport} onChange={e => setFilterDepartureAirport(e.target.value)} style={selectStyle}>
                                        <option value="all">全部</option>
                                        {uniqueAirports.map(a => (
                                            <option key={a} value={a}>{airportNames[a] || a}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 國家 */}
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>國家</div>
                                    <select value={filterCountry} onChange={e => { setFilterCountry(e.target.value); setFilterDestination('all'); }} style={selectStyle}>
                                        <option value="all">全部</option>
                                        {uniqueCountries.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 目的地 */}
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>目的地</div>
                                    <select value={filterDestination} onChange={e => setFilterDestination(e.target.value)} style={selectStyle}>
                                        <option value="all">全部</option>
                                        {uniqueDestinations
                                            .filter(d => filterCountry === 'all' || flights.some(f => f.destinationCode === d && f.country === filterCountry))
                                            .map(d => (
                                                <option key={d} value={d}>{destNames[d] || d}</option>
                                            ))}
                                    </select>
                                </div>

                                {/* 航空公司 */}
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>航空公司</div>
                                    <select value={filterAirline} onChange={e => setFilterAirline(e.target.value)} style={selectStyle}>
                                        <option value="all">全部</option>
                                        {uniqueAirlines.map(a => (
                                            <option key={a} value={a}>{a}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* 轉機 */}
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>轉機</div>
                                    <select value={filterStops} onChange={e => setFilterStops(e.target.value)} style={selectStyle}>
                                        <option value="all">全部</option>
                                        <option value="0">直飛</option>
                                        <option value="1">1 次轉機</option>
                                        <option value="2+">2 次以上</option>
                                    </select>
                                </div>

                                {/* 行程天數 */}
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>行程天數</div>
                                    <select value={filterTripDays} onChange={e => setFilterTripDays(e.target.value)} style={selectStyle}>
                                        <option value="all">全部</option>
                                        {uniqueTripDays.map(d => (
                                            <option key={d} value={String(d)}>{d} 天</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* No Results */}
            {!isLoading && flights.length === 0 && !error && (
                <div className="empty-state">
                    <div className="empty-icon">😔</div>
                    <div className="empty-title">目前沒有找到符合條件的便宜機票</div>
                    <div className="empty-text">
                        價格門檻：NT$ {meta?.settings.priceThreshold?.toLocaleString() || '20,000'}（含交通費）
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleRefresh}
                        disabled={estimating}
                        style={{ marginTop: 'var(--spacing-md)' }}
                    >
                        {estimating ? '預估中...' : '🔄 重新搜尋'}
                    </button>
                </div>
            )}

            {/* 航空公司促銷資訊 */}
            {promos.length > 0 && (
                <div style={{
                    marginBottom: 'var(--spacing-lg)',
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--spacing-sm)',
                    }}>
                        <h2 style={{ margin: 0, fontSize: '1.125rem' }}>
                            🏷️ 航空公司促銷活動
                        </h2>
                        <button
                            className="btn btn-secondary"
                            onClick={() => loadPromos(true)}
                            disabled={promosLoading}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                            {promosLoading ? '更新中...' : '🔄 更新促銷'}
                        </button>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '12px',
                    }}>
                        {promos.slice(0, 6).map((promo, i) => (
                            <a
                                key={`${promo.source}-${i}`}
                                href={promo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'block',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--border-radius)',
                                    padding: '12px 16px',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    transition: 'border-color 0.2s',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
                                        {promo.airline}
                                    </div>
                                    {promo.priceFrom && (
                                        <div style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--accent-success)' }}>
                                            {promo.isOneway ? '單程' : '來回'} NT$ {promo.priceFrom.toLocaleString()}起
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.875rem', fontWeight: '600', marginTop: '4px', lineHeight: 1.3 }}>
                                    {promo.title.substring(0, 50)}{promo.title.length > 50 ? '...' : ''}
                                </div>
                                {promo.destinations.length > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        目的地：{promo.destinations.join(', ')}
                                    </div>
                                )}
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                    點擊查看詳情 →
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Flight Grid */}
            {flights.length > 0 && (() => {
                const countryFlags: Record<string, string> = {
                    '日本': '🇯🇵', '韓國': '🇰🇷', '泰國': '🇹🇭', '新加坡': '🇸🇬',
                    '越南': '🇻🇳', '馬來西亞': '🇲🇾', '菲律賓': '🇵🇭', '香港': '🇭🇰',
                    '澳門': '🇲🇴', '印尼': '🇮🇩', '中國': '🇨🇳',
                };

                const displayFlights = flights
                    .filter(f => {
                        if (filterCountry !== 'all' && f.country !== filterCountry) return false;
                        if (filterDepartureAirport !== 'all' && f.departureAirport !== filterDepartureAirport) return false;
                        if (filterDestination !== 'all' && f.destinationCode !== filterDestination) return false;
                        if (filterAirline !== 'all' && f.airline !== filterAirline) return false;
                        if (filterStops === '0' && f.stops !== 0) return false;
                        if (filterStops === '1' && f.stops !== 1) return false;
                        if (filterStops === '2+' && f.stops < 2) return false;
                        if (filterTripDays !== 'all' && f.tripDays !== parseInt(filterTripDays)) return false;
                        return true;
                    })
                    .sort((a, b) => {
                        if (sortBy === 'totalCost') return a.totalCost - b.totalCost;
                        if (sortBy === 'price') return a.price - b.price;
                        if (sortBy === 'daysFromNow') return (a.daysFromNow || 999) - (b.daysFromNow || 999);
                        if (sortBy === 'effectiveStayHours') return (b.effectiveStayHours || 0) - (a.effectiveStayHours || 0);
                        if (sortBy === 'flightDuration') return (a.flightDuration || 9999) - (b.flightDuration || 9999);
                        return 0;
                    });

                return (
                    <div className="flight-grid">
                        {displayFlights.map((flight, index) => (
                            <div
                                key={flight.id}
                                className="flight-card animate-in"
                                style={{ animationDelay: `${index * 0.05}s` }}
                                onClick={() => setSelectedFlight(flight)}
                            >
                                {/* Header */}
                                <div className="flight-header">
                                    <div>
                                        <div className="flight-destination">
                                            <span style={{ marginRight: '8px' }}>
                                                {countryFlags[flight.country] || '✈️'}
                                            </span>
                                            {flight.destination}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            {flight.airline} {flight.flightNumber}
                                        </div>
                                        <div style={{
                                            color: 'var(--accent-primary)',
                                            fontSize: '0.75rem',
                                            marginTop: '4px'
                                        }}>
                                            📍 {flight.departureAirportName} 出發
                                        </div>
                                    </div>
                                    <div className="flight-price">
                                        <div className="price-total">
                                            NT$ {flight.totalCost.toLocaleString()}
                                        </div>
                                        <div className="price-breakdown">
                                            機票 ${flight.price.toLocaleString()} + 交通 ${flight.transportCost.toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Flight Times */}
                                <div className="flight-info">
                                    <div className="flight-leg">
                                        <div className="flight-leg-label">去程</div>
                                        <div className="flight-leg-time">
                                            {flight.outboundTime || '--:--'} → {flight.outboundArrival || '--:--'}
                                        </div>
                                        <div className="flight-leg-date">{flight.outboundDate}</div>
                                    </div>
                                    <div className="flight-leg">
                                        <div className="flight-leg-label">回程</div>
                                        <div className="flight-leg-time">
                                            {flight.returnDepartureTime && flight.returnArrivalTime
                                                ? `${flight.returnDepartureTime} → ${flight.returnArrivalTime}`
                                                : '--:-- → --:--'}
                                        </div>
                                        <div className="flight-leg-date">{flight.returnDate}</div>
                                    </div>
                                </div>

                                {/* Trip Info */}
                                <div className="flight-stay">
                                    <div className="stay-item">
                                        <div className="stay-value">{flight.tripDays} 天</div>
                                        <div className="stay-label">行程</div>
                                    </div>
                                    <div className="stay-item">
                                        <div className="stay-value">{flight.effectiveStayHours} hr</div>
                                        <div className="stay-label">實玩</div>
                                    </div>
                                    <div className="stay-item">
                                        <div className="stay-value">{flight.stops === 0 ? '直飛' : `${flight.stops}轉`}</div>
                                        <div className="stay-label">轉機</div>
                                    </div>
                                    <div className="stay-item">
                                        <div className="stay-value">{flight.flightDuration ? `${Math.floor(flight.flightDuration / 60)}h${flight.flightDuration % 60 > 0 ? (flight.flightDuration % 60) + 'm' : ''}` : '-'}</div>
                                        <div className="stay-label">飛行</div>
                                    </div>
                                </div>

                                {/* Tags */}
                                <div className="flight-tags">
                                    {flight.tags.map(tag => (
                                        <span
                                            key={tag}
                                            className={`tag ${tagStyles[tag] || ''}`}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                <div style={{
                                    marginTop: 'var(--spacing-sm)',
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    textAlign: 'center'
                                }}>
                                    點擊查看詳情與訂票 →
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* Search Confirmation Modal */}
            {showSearchConfirm && searchEstimate && (
                <div className="modal-overlay" onClick={() => setShowSearchConfirm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>搜尋確認</h2>
                            <button className="modal-close" onClick={() => setShowSearchConfirm(false)}>✕</button>
                        </div>

                        <div style={{ padding: '0 var(--spacing-lg)' }}>
                            {/* 搜尋摘要 */}
                            <div style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '8px',
                                padding: '14px',
                                marginBottom: '16px',
                                fontSize: '0.875rem',
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '8px' }}>搜尋範圍</div>
                                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    <div>出發機場：{searchEstimate.airports?.join('、')}</div>
                                    <div>目的地：{searchEstimate.destinations?.length} 個</div>
                                    <div>出發日範圍：第 {searchEstimate.dateRange?.start} ~ {searchEstimate.dateRange?.end} 天</div>
                                    <div>行程天數：{searchEstimate.tripDurations?.join('、')} 天</div>
                                    <div>日期組合：{searchEstimate.dateCombosCount} 組</div>
                                </div>
                            </div>

                            {/* 搜尋消耗預估 */}
                            <div style={{
                                background: searchEstimate.searchMode === 'scraper'
                                    ? 'rgba(34, 197, 94, 0.1)'
                                    : searchEstimate.neededApiCalls > 30
                                        ? 'rgba(239, 68, 68, 0.1)'
                                        : searchEstimate.neededApiCalls > 10
                                            ? 'rgba(245, 158, 11, 0.1)'
                                            : 'rgba(34, 197, 94, 0.1)',
                                borderRadius: '8px',
                                padding: '14px',
                                marginBottom: '16px',
                                textAlign: 'center',
                            }}>
                                <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                                    {searchEstimate.neededApiCalls}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    次{searchEstimate.searchMode === 'scraper' ? '爬蟲' : ' API '}請求（共 {searchEstimate.totalCombos} 個組合，{searchEstimate.cachedCount} 個已有快取）
                                </div>
                                {searchEstimate.searchMode === 'scraper' && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-success)', marginTop: '6px' }}>
                                        爬蟲模式：免費，不消耗 API 額度（但速度較慢）
                                    </div>
                                )}
                                {searchEstimate.searchMode !== 'scraper' && searchEstimate.neededApiCalls > 30 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-danger)', marginTop: '6px' }}>
                                        SerpApi 免費方案每月 250 次，請注意用量
                                    </div>
                                )}
                            </div>

                            {/* 按航線分布 */}
                            {searchEstimate.byRoute && Object.keys(searchEstimate.byRoute).length > 0 && (
                                <div style={{ marginBottom: '16px', fontSize: '0.8rem' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>各航線需求：</div>
                                    <div style={{ maxHeight: '120px', overflowY: 'auto', lineHeight: 1.8 }}>
                                        {Object.entries(searchEstimate.byRoute as Record<string, { total: number; cached: number; needed: number }>)
                                            .filter(([, v]) => v.needed > 0)
                                            .map(([route, info]) => (
                                                <div key={route} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                                                    <span>{route}</span>
                                                    <span>{info.needed} 次 {info.cached > 0 ? `(已快取 ${info.cached})` : ''}</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-actions" style={{ flexDirection: 'column', gap: '8px' }}>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                onClick={() => confirmSearch(searchEstimate.neededApiCalls)}
                            >
                                確認搜尋（{searchEstimate.neededApiCalls} 次{searchEstimate.searchMode === 'scraper' ? '爬蟲' : ' API'}）
                            </button>
                            {searchEstimate.neededApiCalls > 12 && (
                                <button
                                    className="btn btn-secondary"
                                    style={{ width: '100%' }}
                                    onClick={() => confirmSearch(12)}
                                >
                                    只搜尋前 12 次{searchEstimate.searchMode !== 'scraper' ? '（節省額度）' : ''}
                                </button>
                            )}
                            <button
                                className="btn btn-secondary"
                                style={{ width: '100%' }}
                                onClick={() => { setShowSearchConfirm(false); loadFlights(false); }}
                            >
                                取消（只讀取已有資料）
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Flight Detail Modal */}
            {selectedFlight && (
                <div
                    className="modal-overlay"
                    onClick={() => setSelectedFlight(null)}
                >
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="modal-header">
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
                                    {({'日本': '🇯🇵', '韓國': '🇰🇷', '泰國': '🇹🇭', '新加坡': '🇸🇬', '越南': '🇻🇳', '馬來西亞': '🇲🇾', '菲律賓': '🇵🇭', '香港': '🇭🇰', '澳門': '🇲🇴', '印尼': '🇮🇩'} as Record<string, string>)[selectedFlight.country] || '✈️'}{' '}
                                    {selectedFlight.destination}
                                </h2>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                                    {selectedFlight.airline} {selectedFlight.flightNumber}
                                </p>
                            </div>
                            <button
                                className="modal-close"
                                onClick={() => setSelectedFlight(null)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Price */}
                        <div className="detail-section">
                            <h3 className="detail-title">💰 費用明細</h3>
                            <div className="detail-grid">
                                <div className="detail-item">
                                    <span className="detail-label">機票費用</span>
                                    <span className="detail-value">NT$ {selectedFlight.price.toLocaleString()}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">交通費用</span>
                                    <span className="detail-value">NT$ {selectedFlight.transportCost.toLocaleString()}</span>
                                </div>
                                <div className="detail-item highlight">
                                    <span className="detail-label">總計</span>
                                    <span className="detail-value price">NT$ {selectedFlight.totalCost.toLocaleString()}</span>
                                </div>
                            </div>
                            <a
                                href={selectedFlight.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: 'var(--accent-primary)' }}
                            >
                                📊 機票價格來源：Google Flights →
                            </a>
                        </div>

                        {/* Transport */}
                        <div className="detail-section">
                            <h3 className="detail-title">🚄 交通費用計算</h3>
                            <div className="info-box">
                                <div className="info-item">
                                    <span className="info-icon">📍</span>
                                    <div>
                                        <div className="info-label">路線</div>
                                        <div className="info-value">{meta?.settings.userLocation} → {selectedFlight.departureAirportName}</div>
                                    </div>
                                </div>
                                <div className="info-item">
                                    <span className="info-icon">🚌</span>
                                    <div>
                                        <div className="info-label">交通方式</div>
                                        <div className="info-value">{selectedFlight.transportMethod}</div>
                                    </div>
                                </div>
                                <div className="info-item">
                                    <span className="info-icon">⏱️</span>
                                    <div>
                                        <div className="info-label">交通時間</div>
                                        <div className="info-value">{selectedFlight.transportDuration}</div>
                                    </div>
                                </div>
                            </div>
                            {selectedFlight.transportReference && (
                                <a
                                    href={selectedFlight.transportReference}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: 'var(--accent-primary)' }}
                                >
                                    📋 交通費用計算依據 →
                                </a>
                            )}
                        </div>

                        {/* Flight Details */}
                        <div className="detail-section">
                            <h3 className="detail-title">✈️ 航班資訊</h3>
                            <div className="flight-detail-box">
                                <div className="flight-detail-leg">
                                    <div className="leg-header">去程 - {selectedFlight.outboundDate}</div>
                                    <div className="leg-info">
                                        <span className="leg-time">{selectedFlight.outboundTime || '--:--'}</span>
                                        <span className="leg-arrow">→</span>
                                        <span className="leg-time">{selectedFlight.outboundArrival || '--:--'}</span>
                                    </div>
                                    <div className="leg-airline">
                                        {selectedFlight.departureAirport} → {selectedFlight.destinationCode}
                                        {selectedFlight.flightDuration > 0 && (
                                            <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                                                ({Math.floor(selectedFlight.flightDuration / 60)}h{selectedFlight.flightDuration % 60 > 0 ? (selectedFlight.flightDuration % 60) + 'm' : ''})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flight-detail-leg">
                                    <div className="leg-header">回程 - {selectedFlight.returnDate}</div>
                                    {selectedFlight.returnDepartureTime && selectedFlight.returnArrivalTime ? (
                                        <>
                                            <div className="leg-time">
                                                {selectedFlight.returnDepartureTime} → {selectedFlight.returnArrivalTime}
                                            </div>
                                            <div className="leg-airline">
                                                {selectedFlight.returnAirline || selectedFlight.airline} | {selectedFlight.destinationCode} → {selectedFlight.departureAirport}
                                                {selectedFlight.returnFlightDuration > 0 && (
                                                    <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                                                        ({Math.floor(selectedFlight.returnFlightDuration / 60)}h{selectedFlight.returnFlightDuration % 60 > 0 ? (selectedFlight.returnFlightDuration % 60) + 'm' : ''})
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="leg-airline">
                                            {selectedFlight.destinationCode} → {selectedFlight.departureAirport}
                                            {selectedFlight.tripDays > 0 && (
                                                <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                                                    ({selectedFlight.tripDays} 天行程)
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Entry Info */}
                        <div className="detail-section">
                            <h3 className="detail-title">🛂 入境資訊</h3>
                            <div className="info-box">
                                <div className="info-item">
                                    <span className="info-icon">📋</span>
                                    <div>
                                        <div className="info-label">簽證</div>
                                        <div className="info-value">{selectedFlight.visaInfo}</div>
                                    </div>
                                </div>
                                <div className="info-item">
                                    <span className="info-icon">✓</span>
                                    <div>
                                        <div className="info-label">入境要求</div>
                                        <div className="info-value">{selectedFlight.entryRequirements}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="detail-section">
                            <h3 className="detail-title">🏷️ 航班特色</h3>
                            <div className="flight-tags" style={{ justifyContent: 'flex-start' }}>
                                {selectedFlight.tags.map(tag => (
                                    <span key={tag} className={`tag ${tagStyles[tag] || ''}`}>{tag}</span>
                                ))}
                            </div>
                        </div>

                        {/* Found Time */}
                        <div style={{ padding: '8px var(--spacing-lg)', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            發現時間：{new Date(selectedFlight.foundAt).toLocaleString('zh-TW')}
                        </div>

                        {/* Actions */}
                        <div className="modal-actions">
                            <a
                                href={selectedFlight.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary"
                                style={{ flex: 1 }}
                            >
                                🎫 前往 Google Flights 訂票
                            </a>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setSelectedFlight(null)}
                            >
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
