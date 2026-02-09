'use client';

import { useState, useEffect, useCallback } from 'react';

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

const countryFlags: Record<string, string> = {
    '日本': '🇯🇵', '韓國': '🇰🇷', '泰國': '🇹🇭', '新加坡': '🇸🇬',
    '越南': '🇻🇳', '馬來西亞': '🇲🇾', '菲律賓': '🇵🇭', '香港': '🇭🇰',
    '澳門': '🇲🇴', '印尼': '🇮🇩', '中國': '🇨🇳',
};

export default function FlightsPage() {
    const [allFlights, setAllFlights] = useState<FlightData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalInDb, setTotalInDb] = useState(0);
    const [selectedFlight, setSelectedFlight] = useState<FlightData | null>(null);

    // 篩選狀態
    const [sortBy, setSortBy] = useState<'totalCost' | 'price' | 'daysFromNow' | 'effectiveStayHours' | 'flightDuration'>('totalCost');
    const [filterDepartureAirport, setFilterDepartureAirport] = useState('all');
    const [filterDestination, setFilterDestination] = useState('all');
    const [filterCountry, setFilterCountry] = useState('all');
    const [filterAirline, setFilterAirline] = useState('all');
    const [filterStops, setFilterStops] = useState('all');
    const [filterTripDays, setFilterTripDays] = useState('all');
    const [maxPrice, setMaxPrice] = useState(100000); // 不限

    const loadFlights = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            // 用高門檻拉出所有 DB 資料
            params.set('priceThreshold', '200000');

            if (typeof window !== 'undefined') {
                const savedSettings = localStorage.getItem('flightFinderSettings');
                if (savedSettings) {
                    const settings = JSON.parse(savedSettings);
                    if (settings.location) params.set('location', settings.location);
                    if (settings.selectedAirports?.length) params.set('airports', settings.selectedAirports.join(','));
                    if (settings.selectedDestinations?.length) params.set('destinations', settings.selectedDestinations.join(','));
                }
            }

            const response = await fetch(`/api/flights?${params.toString()}`);
            if (!response.ok) {
                setError(`伺服器錯誤 (HTTP ${response.status})`);
                return;
            }
            const data = await response.json();
            if (data.success) {
                setAllFlights(data.data);
                setTotalInDb(data.meta?.totalInDb || data.data.length);
            } else {
                setError(data.error || '載入失敗');
            }
        } catch (err: any) {
            setError(err.message || '網路錯誤');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadFlights(); }, [loadFlights]);

    // 取得可用的篩選選項
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
    const departureAirports = Array.from(new Set(allFlights.map(f => f.departureAirport).filter(Boolean))).sort();
    const destinations = Array.from(new Set(allFlights.map(f => f.destinationCode).filter(Boolean))).sort();
    const countries = Array.from(new Set(allFlights.map(f => f.country).filter(Boolean)));
    const airlines = Array.from(new Set(allFlights.map(f => f.airline).filter(Boolean))).sort();
    const tripDaysOptions = Array.from(new Set(allFlights.map(f => f.tripDays).filter(d => d > 0))).sort((a, b) => a - b);

    // 篩選 + 排序
    const displayFlights = allFlights
        .filter(f => {
            if (filterDepartureAirport !== 'all' && f.departureAirport !== filterDepartureAirport) return false;
            if (filterDestination !== 'all' && f.destinationCode !== filterDestination) return false;
            if (filterCountry !== 'all' && f.country !== filterCountry) return false;
            if (filterAirline !== 'all' && f.airline !== filterAirline) return false;
            if (filterStops !== 'all') {
                if (filterStops === '0' && f.stops !== 0) return false;
                if (filterStops === '1' && f.stops !== 1) return false;
                if (filterStops === '2+' && f.stops < 2) return false;
            }
            if (filterTripDays !== 'all' && f.tripDays !== parseInt(filterTripDays)) return false;
            if (f.totalCost > maxPrice) return false;
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
        <>
            <header className="page-header">
                <h1 className="page-title">機票清單</h1>
                <p className="page-subtitle">
                    {isLoading ? '載入中...' : `DB 共 ${totalInDb} 筆航班，篩選後 ${displayFlights.length} 筆`}
                </p>
            </header>

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
                    <button onClick={loadFlights} style={{ marginLeft: '12px', textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                        重試
                    </button>
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="loading">
                    <div className="loading-spinner" />
                    <p className="loading-text">載入機票資料中...</p>
                </div>
            )}

            {/* Filter Bar */}
            {!isLoading && allFlights.length > 0 && (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius)',
                    padding: '14px',
                    marginBottom: 'var(--spacing-lg)',
                    fontSize: '0.85rem',
                }}>
                    {/* Row 1: Sort */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>排序：</span>
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
                    </div>

                    {/* Row 2: Filters */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Departure Airport */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>出發：</span>
                            <select value={filterDepartureAirport} onChange={e => setFilterDepartureAirport(e.target.value)} style={selectStyle}>
                                <option value="all">全部</option>
                                {departureAirports.map(a => <option key={a} value={a}>{airportNames[a] || a}</option>)}
                            </select>
                        </div>

                        {/* Country */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>國家：</span>
                            <select value={filterCountry} onChange={e => { setFilterCountry(e.target.value); setFilterDestination('all'); }} style={selectStyle}>
                                <option value="all">全部</option>
                                {countries.map(c => <option key={c} value={c}>{countryFlags[c] || ''} {c}</option>)}
                            </select>
                        </div>

                        {/* Destination */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>目的地：</span>
                            <select value={filterDestination} onChange={e => setFilterDestination(e.target.value)} style={selectStyle}>
                                <option value="all">全部</option>
                                {destinations
                                    .filter(d => filterCountry === 'all' || allFlights.some(f => f.destinationCode === d && f.country === filterCountry))
                                    .map(d => <option key={d} value={d}>{destNames[d] || d}</option>)}
                            </select>
                        </div>

                        {/* Airline */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>航空：</span>
                            <select value={filterAirline} onChange={e => setFilterAirline(e.target.value)} style={selectStyle}>
                                <option value="all">全部</option>
                                {airlines.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>

                        {/* Stops */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>轉機：</span>
                            <select value={filterStops} onChange={e => setFilterStops(e.target.value)} style={selectStyle}>
                                <option value="all">不限</option>
                                <option value="0">直飛</option>
                                <option value="1">1 次轉機</option>
                                <option value="2+">2 次以上</option>
                            </select>
                        </div>

                        {/* Trip days */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>天數：</span>
                            <select value={filterTripDays} onChange={e => setFilterTripDays(e.target.value)} style={selectStyle}>
                                <option value="all">不限</option>
                                {tripDaysOptions.map(d => <option key={d} value={d.toString()}>{d} 天</option>)}
                            </select>
                        </div>

                        {/* Max price */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>總價上限：</span>
                            <input
                                type="number"
                                value={maxPrice}
                                onChange={e => setMaxPrice(Number(e.target.value) || 200000)}
                                min={3000}
                                max={200000}
                                step={1000}
                                style={{
                                    ...selectStyle,
                                    width: '90px',
                                    textAlign: 'right',
                                }}
                            />
                        </div>

                        {/* Clear all filters */}
                        {(filterDepartureAirport !== 'all' || filterDestination !== 'all' || filterCountry !== 'all' || filterAirline !== 'all' || filterStops !== 'all' || filterTripDays !== 'all' || maxPrice !== 100000) && (
                            <button
                                onClick={() => {
                                    setFilterDepartureAirport('all');
                                    setFilterDestination('all');
                                    setFilterCountry('all');
                                    setFilterAirline('all');
                                    setFilterStops('all');
                                    setFilterTripDays('all');
                                    setMaxPrice(100000);
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--accent-danger)',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    textDecoration: 'underline',
                                }}
                            >
                                清除全部篩選
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && allFlights.length === 0 && !error && (
                <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <div className="empty-title">資料庫尚無航班資料</div>
                    <div className="empty-text">
                        請先到首頁點擊「立即更新」搜尋航班
                    </div>
                </div>
            )}

            {/* Flight Grid */}
            {displayFlights.length > 0 && (
                <div className="flight-grid">
                    {displayFlights.map((flight, index) => (
                        <div
                            key={flight.id}
                            className="flight-card animate-in"
                            style={{ animationDelay: `${Math.min(index, 20) * 0.03}s` }}
                            onClick={() => setSelectedFlight(flight)}
                        >
                            <div className="flight-header">
                                <div>
                                    <div className="flight-destination">
                                        <span style={{ marginRight: '8px' }}>{countryFlags[flight.country] || '✈️'}</span>
                                        {flight.destination}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                        {flight.airline} {flight.flightNumber}
                                    </div>
                                    <div style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', marginTop: '4px' }}>
                                        📍 {flight.departureAirportName} 出發
                                    </div>
                                </div>
                                <div className="flight-price">
                                    <div className="price-total">NT$ {flight.totalCost.toLocaleString()}</div>
                                    <div className="price-breakdown">
                                        機票 ${flight.price.toLocaleString()} + 交通 ${flight.transportCost.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            <div className="flight-info">
                                <div className="flight-leg">
                                    <div className="flight-leg-label">去程</div>
                                    <div className="flight-leg-time">{flight.outboundTime || '--:--'} → {flight.outboundArrival || '--:--'}</div>
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

                            <div className="flight-tags">
                                {flight.tags.slice(0, 5).map(tag => (
                                    <span key={tag} className="tag">{tag}</span>
                                ))}
                            </div>

                            <div style={{ marginTop: 'var(--spacing-sm)', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                點擊查看詳情 →
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* No filter results */}
            {!isLoading && allFlights.length > 0 && displayFlights.length === 0 && (
                <div className="empty-state">
                    <div className="empty-icon">🔍</div>
                    <div className="empty-title">沒有符合篩選條件的航班</div>
                    <div className="empty-text">
                        DB 共 {totalInDb} 筆航班，請調整篩選條件
                    </div>
                </div>
            )}

            {/* Modal */}
            {selectedFlight && (
                <div className="modal-overlay" onClick={() => setSelectedFlight(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
                                    {countryFlags[selectedFlight.country] || '✈️'} {selectedFlight.destination}
                                </h2>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                                    {selectedFlight.airline} {selectedFlight.flightNumber}
                                </p>
                            </div>
                            <button className="modal-close" onClick={() => setSelectedFlight(null)}>✕</button>
                        </div>

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
                        </div>

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

                        <div className="detail-section">
                            <h3 className="detail-title">🚄 交通方式</h3>
                            <div className="info-box">
                                <div className="info-item">
                                    <span className="info-icon">🚌</span>
                                    <div>
                                        <div className="info-label">{selectedFlight.transportMethod}</div>
                                        <div className="info-value">{selectedFlight.transportDuration} | NT$ {selectedFlight.transportCost}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

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

                        <div className="detail-section">
                            <h3 className="detail-title">🏷️ 航班特色</h3>
                            <div className="flight-tags" style={{ justifyContent: 'flex-start' }}>
                                {selectedFlight.tags.map(tag => (
                                    <span key={tag} className="tag">{tag}</span>
                                ))}
                            </div>
                        </div>

                        <div style={{ padding: '8px var(--spacing-lg)', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            發現時間：{new Date(selectedFlight.foundAt).toLocaleString('zh-TW')}
                        </div>

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
                            <button className="btn btn-secondary" onClick={() => setSelectedFlight(null)}>
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const selectStyle: React.CSSProperties = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '0.8rem',
    color: 'var(--text-primary)',
};
