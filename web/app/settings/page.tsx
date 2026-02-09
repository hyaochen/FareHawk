'use client';

import { useState, useEffect } from 'react';

// 所在地區選項
const locations = [
    '屏東市', '高雄市', '台南市', '嘉義市', '台中市', '彰化市',
    '新竹市', '桃園市', '新北市', '台北市', '基隆市', '宜蘭市',
    '花蓮市', '台東市'
];

// 出發機場
const airports = [
    { code: 'TPE', name: '桃園國際機場', city: '桃園' },
    { code: 'TSA', name: '台北松山機場', city: '台北' },
    { code: 'KHH', name: '高雄國際機場', city: '高雄' },
    { code: 'RMQ', name: '台中清泉崗機場', city: '台中' },
    { code: 'TNN', name: '台南機場', city: '台南' },
];

// 目的地國家和機場
const destinationsByCountry = {
    '🇯🇵 日本': [
        { code: 'NRT', name: '東京成田', popular: true },
        { code: 'HND', name: '東京羽田', popular: true },
        { code: 'KIX', name: '大阪關西', popular: true },
        { code: 'NGO', name: '名古屋中部', popular: false },
        { code: 'FUK', name: '福岡', popular: true },
        { code: 'CTS', name: '札幌新千歲', popular: true },
        { code: 'OKA', name: '沖繩那霸', popular: true },
    ],
    '🇰🇷 韓國': [
        { code: 'ICN', name: '首爾仁川', popular: true },
        { code: 'GMP', name: '首爾金浦', popular: false },
        { code: 'PUS', name: '釜山金海', popular: true },
        { code: 'CJU', name: '濟州島', popular: true },
    ],
    '🇹🇭 泰國': [
        { code: 'BKK', name: '曼谷蘇凡納布', popular: true },
        { code: 'DMK', name: '曼谷廊曼', popular: true },
        { code: 'CNX', name: '清邁', popular: true },
        { code: 'HKT', name: '普吉島', popular: true },
    ],
    '🇻🇳 越南': [
        { code: 'SGN', name: '胡志明市', popular: true },
        { code: 'HAN', name: '河內', popular: true },
        { code: 'DAD', name: '峴港', popular: true },
    ],
    '🇸🇬 新加坡': [
        { code: 'SIN', name: '新加坡樟宜', popular: true },
    ],
    '🇲🇾 馬來西亞': [
        { code: 'KUL', name: '吉隆坡', popular: true },
        { code: 'PEN', name: '檳城', popular: false },
        { code: 'BKI', name: '沙巴亞庇', popular: true },
    ],
    '🇵🇭 菲律賓': [
        { code: 'MNL', name: '馬尼拉', popular: true },
        { code: 'CEB', name: '宿霧', popular: true },
        { code: 'KLO', name: '長灘島', popular: true },
    ],
    '🇭🇰 香港/澳門': [
        { code: 'HKG', name: '香港', popular: true },
        { code: 'MFM', name: '澳門', popular: true },
    ],
};

// 行程天數
const tripDurations = [2, 3, 4, 5, 6, 7, 10, 14];

// 預設選擇的目的地（熱門）
const defaultDestinations = [
    'NRT', 'HND', 'KIX', 'FUK', 'OKA', // 日本
    'ICN', 'PUS', 'CJU', // 韓國
    'BKK', 'DMK', 'CNX', // 泰國
    'SIN', // 新加坡
    'HKG', // 香港
];

export default function SettingsPage() {
    const [location, setLocation] = useState('屏東市');
    const [selectedAirports, setSelectedAirports] = useState(['TPE', 'TSA', 'KHH']);
    const [selectedDestinations, setSelectedDestinations] = useState<string[]>(defaultDestinations);
    const [expandedCountries, setExpandedCountries] = useState<string[]>(Object.keys(destinationsByCountry));
    const [selectedDurations, setSelectedDurations] = useState([3, 4, 5, 7]);
    const [priceThreshold, setPriceThreshold] = useState(20000);
    const [startDaysAhead, setStartDaysAhead] = useState(7);
    const [searchDaysAhead, setSearchDaysAhead] = useState(60);
    const [telegramChatId, setTelegramChatId] = useState('');
    const [useApiSearch, setUseApiSearch] = useState(false); // 預設關閉 API，使用爬蟲
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    const toggleAirport = (code: string) => {
        setSelectedAirports(prev =>
            prev.includes(code)
                ? prev.filter(a => a !== code)
                : [...prev, code]
        );
    };

    const toggleDestination = (code: string) => {
        setSelectedDestinations(prev =>
            prev.includes(code)
                ? prev.filter(d => d !== code)
                : [...prev, code]
        );
    };

    const toggleCountry = (country: string) => {
        setExpandedCountries(prev =>
            prev.includes(country)
                ? prev.filter(c => c !== country)
                : [...prev, country]
        );
    };

    const selectAllInCountry = (country: string) => {
        const countryCodes = destinationsByCountry[country as keyof typeof destinationsByCountry].map(d => d.code);
        const allSelected = countryCodes.every(code => selectedDestinations.includes(code));

        if (allSelected) {
            setSelectedDestinations(prev => prev.filter(d => !countryCodes.includes(d)));
        } else {
            setSelectedDestinations(prev => Array.from(new Set([...prev, ...countryCodes])));
        }
    };

    const toggleDuration = (days: number) => {
        setSelectedDurations(prev =>
            prev.includes(days)
                ? prev.filter(d => d !== days)
                : [...prev, days].sort((a, b) => a - b)
        );
    };

    const handleSave = async () => {
        setSaving(true);

        // 模擬儲存到 localStorage（實際會儲存到後端）
        const settings = {
            location,
            selectedAirports,
            selectedDestinations,
            selectedDurations,
            priceThreshold,
            startDaysAhead,
            searchDaysAhead,
            telegramChatId,
            useApiSearch,
        };

        try {
            localStorage.setItem('flightFinderSettings', JSON.stringify(settings));
            await new Promise(resolve => setTimeout(resolve, 500));
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setSaving(false);
        }
    };

    // 載入已儲存的設定
    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem('flightFinderSettings');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                if (settings.location) setLocation(settings.location);
                if (settings.selectedAirports) setSelectedAirports(settings.selectedAirports);
                if (settings.selectedDestinations) setSelectedDestinations(settings.selectedDestinations);
                if (settings.selectedDurations) setSelectedDurations(settings.selectedDurations);
                if (settings.priceThreshold) setPriceThreshold(settings.priceThreshold);
                if (settings.startDaysAhead) setStartDaysAhead(settings.startDaysAhead);
                if (settings.searchDaysAhead) setSearchDaysAhead(settings.searchDaysAhead);
                if (settings.telegramChatId) setTelegramChatId(settings.telegramChatId);
                if (settings.useApiSearch !== undefined) setUseApiSearch(settings.useApiSearch);
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }, []);

    return (
        <>
            <header className="page-header">
                <h1 className="page-title">偏好設定</h1>
                <p className="page-subtitle">自訂搜尋條件和通知偏好</p>
            </header>

            <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '120px' }}>
                {/* 所在地區 */}
                <div className="form-group">
                    <label className="form-label">📍 所在地區</label>
                    <select
                        className="form-select"
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                    >
                        {locations.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                        ))}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        用於計算前往機場的交通費用
                    </p>
                </div>

                {/* 出發機場 */}
                <div className="form-group">
                    <label className="form-label">🛫 出發機場</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {airports.map(airport => (
                            <button
                                key={airport.code}
                                className={`filter-chip ${selectedAirports.includes(airport.code) ? 'active' : ''}`}
                                onClick={() => toggleAirport(airport.code)}
                            >
                                {airport.code} {airport.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 關注目的地 - 按國家分組 */}
                <div className="form-group">
                    <label className="form-label">🎯 關注目的地</label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        點擊國家名稱可全選/取消該國所有機場
                    </p>

                    {Object.entries(destinationsByCountry).map(([country, airports]) => {
                        const isExpanded = expandedCountries.includes(country);
                        const selectedCount = airports.filter(a => selectedDestinations.includes(a.code)).length;
                        const allSelected = selectedCount === airports.length;

                        return (
                            <div key={country} className="country-group">
                                <div
                                    className="country-header"
                                    onClick={() => selectAllInCountry(country)}
                                    style={{
                                        color: allSelected ? 'var(--accent-success)' : 'var(--text-primary)',
                                    }}
                                >
                                    <span
                                        style={{ cursor: 'pointer', marginRight: '4px' }}
                                        onClick={(e) => { e.stopPropagation(); toggleCountry(country); }}
                                    >
                                        {isExpanded ? '▼' : '▶'}
                                    </span>
                                    {country}
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginLeft: '8px'
                                    }}>
                                        ({selectedCount}/{airports.length})
                                    </span>
                                </div>

                                {isExpanded && (
                                    <div className="country-airports">
                                        {airports.map(airport => (
                                            <button
                                                key={airport.code}
                                                className={`filter-chip ${selectedDestinations.includes(airport.code) ? 'active' : ''}`}
                                                onClick={() => toggleDestination(airport.code)}
                                                style={{
                                                    borderColor: airport.popular && !selectedDestinations.includes(airport.code)
                                                        ? 'var(--accent-warning)'
                                                        : undefined
                                                }}
                                            >
                                                {airport.name}
                                                {airport.popular && <span style={{ marginLeft: '4px' }}>⭐</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* 行程天數 */}
                <div className="form-group">
                    <label className="form-label">📅 行程天數</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {tripDurations.map(days => (
                            <button
                                key={days}
                                className={`filter-chip ${selectedDurations.includes(days) ? 'active' : ''}`}
                                onClick={() => toggleDuration(days)}
                            >
                                {days} 天
                            </button>
                        ))}
                    </div>
                </div>

                {/* 出發日期範圍 */}
                <div className="form-group">
                    <label className="form-label">📆 出發日期範圍</label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        設定出發日的搜尋範圍（回程日 = 出發日 + 行程天數，不需另外設定）
                    </p>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ fontSize: '0.875rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                                最早出發：<strong style={{ color: 'var(--accent-primary)' }}>{startDaysAhead} 天後</strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                    ({new Date(Date.now() + startDaysAhead * 86400000).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })})
                                </span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="30"
                                step="1"
                                value={startDaysAhead}
                                onChange={e => setStartDaysAhead(Number(e.target.value))}
                                style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                <span>明天</span>
                                <span>30天後</span>
                            </div>
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ fontSize: '0.875rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                                最晚出發：<strong style={{ color: 'var(--accent-primary)' }}>{searchDaysAhead} 天後</strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                    ({new Date(Date.now() + searchDaysAhead * 86400000).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })})
                                </span>
                            </div>
                            <input
                                type="range"
                                min="14"
                                max="180"
                                step="7"
                                value={searchDaysAhead}
                                onChange={e => setSearchDaysAhead(Number(e.target.value))}
                                style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                <span>2週後</span>
                                <span>半年後</span>
                            </div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                    }}>
                        例：出發日 <strong>{startDaysAhead}</strong>~<strong>{searchDaysAhead}</strong> 天後，行程 {selectedDurations.join('/')} 天
                        → 出發 {new Date(Date.now() + startDaysAhead * 86400000).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                        ~{new Date(Date.now() + searchDaysAhead * 86400000).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}，
                        回程自動加上行程天數
                    </div>
                </div>

                {/* 價格門檻 */}
                <div className="form-group">
                    <label className="form-label">💰 價格警報門檻</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <input
                            type="range"
                            min="3000"
                            max="60000"
                            step="500"
                            value={priceThreshold}
                            onChange={e => setPriceThreshold(Number(e.target.value))}
                            style={{ flex: 1 }}
                        />
                        <input
                            type="number"
                            min="3000"
                            max="100000"
                            step="100"
                            value={priceThreshold}
                            onChange={e => setPriceThreshold(Number(e.target.value))}
                            style={{
                                width: '100px',
                                textAlign: 'right',
                                fontSize: '1.25rem',
                                fontWeight: '600',
                                color: 'var(--accent-success)',
                                background: 'transparent',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                padding: '4px'
                            }}
                        />
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        只有低於此價格的機票才會發送通知
                    </p>
                </div>

                {/* 搜尋模式 */}
                <div className="form-group" style={{
                    marginTop: '32px',
                    paddingTop: '24px',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <label className="form-label">🔧 搜尋模式</label>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--border-radius)',
                        border: '1px solid var(--border-color)',
                    }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            flex: 1,
                        }}>
                            <input
                                type="checkbox"
                                checked={useApiSearch}
                                onChange={e => setUseApiSearch(e.target.checked)}
                                style={{ width: '18px', height: '18px' }}
                            />
                            <div>
                                <div style={{ fontWeight: '600' }}>
                                    使用 API 搜尋
                                </div>
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    marginTop: '2px'
                                }}>
                                    {useApiSearch
                                        ? 'SerpApi（每月 250 次免費額度）'
                                        : '網頁爬蟲模式（免費，無次數限制，但速度較慢）'}
                                </div>
                            </div>
                        </label>
                        <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: useApiSearch
                                ? 'rgba(59, 130, 246, 0.15)'
                                : 'rgba(34, 197, 94, 0.15)',
                            color: useApiSearch
                                ? 'var(--accent-primary)'
                                : 'var(--accent-success)',
                        }}>
                            {useApiSearch ? 'API' : '爬蟲'}
                        </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        關閉 API 模式後，系統會使用瀏覽器爬蟲直接從 Google Flights 擷取資料（免費但較慢）
                    </p>
                </div>

                {/* Telegram 設定 */}
                <div className="form-group" style={{
                    marginTop: '32px',
                    paddingTop: '24px',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <label className="form-label">🤖 Telegram 通知</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="輸入您的 Telegram Chat ID"
                        value={telegramChatId}
                        onChange={e => setTelegramChatId(e.target.value)}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        發送訊息給 @userinfobot 獲取您的 Chat ID
                    </p>
                </div>

                {/* 儲存按鈕 */}
                <div style={{ marginTop: '32px', textAlign: 'center' }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                        style={{ width: '100%', padding: '16px' }}
                    >
                        {saving ? '⏳ 儲存中...' : saved ? '✅ 已儲存！' : '💾 儲存設定'}
                    </button>
                </div>

                {/* 成功提示 */}
                {saved && (
                    <div style={{
                        marginTop: '16px',
                        padding: '12px 16px',
                        borderRadius: 'var(--border-radius)',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        color: 'var(--accent-success)',
                        textAlign: 'center',
                    }}>
                        設定已成功儲存！
                    </div>
                )}

                {/* 已選擇摘要 */}
                <div style={{
                    marginTop: '24px',
                    padding: '16px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--border-radius)',
                    fontSize: '0.875rem'
                }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>📊 目前設定摘要</div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        <p>• 出發地：{location}</p>
                        <p>• 機場：{selectedAirports.join(', ')}</p>
                        <p>• 目的地：{selectedDestinations.length} 個機場</p>
                        <p>• 天數：{selectedDurations.join(', ')} 天</p>
                        <p>• 搜尋範圍：第 {startDaysAhead} ~ {searchDaysAhead} 天</p>
                        <p>• 價格門檻：NT$ {priceThreshold.toLocaleString()}</p>
                        <p>• 搜尋模式：{useApiSearch ? 'SerpApi (API)' : '網頁爬蟲（免費）'}</p>
                    </div>
                </div>
            </div>
        </>
    );
}
