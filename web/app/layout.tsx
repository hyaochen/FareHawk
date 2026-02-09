import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: '便宜機票搜尋器',
    description: '自動搜尋台灣出發的便宜機票，智慧分析航班時間品質',
    keywords: ['機票', '便宜機票', '台灣', '搜尋', '比價'],
    authors: [{ name: 'Fly Ticket Finder' }],
    icons: {
        icon: '/favicon.ico',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: '#0a0a0f',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh-TW">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <nav className="navbar">
                    <div className="container navbar-content">
                        <a href="/" className="navbar-logo">
                            ✈️ <span>機票搜尋器</span>
                        </a>
                        <div className="navbar-nav">
                            <a href="/" className="nav-link active">🔍 搜尋</a>
                            <a href="/flights" className="nav-link">📋 機票</a>
                            <a href="/settings" className="nav-link">⚙️ 設定</a>
                        </div>
                    </div>
                </nav>
                <main className="container">
                    {children}
                </main>
            </body>
        </html>
    );
}
