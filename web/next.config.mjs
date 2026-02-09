/** @type {import('next').NextConfig} */
const nextConfig = {
    // 啟用嚴格模式
    reactStrictMode: true,

    // 優化行動裝置體驗
    experimental: {
        // 將 cheerio 和相關依賴設為外部套件，避免 webpack 編譯問題
        serverComponentsExternalPackages: ['cheerio', 'playwright'],
    },
    env: {
        SERPAPI_API_KEY: process.env.SERPAPI_API_KEY,
    },
};

export default nextConfig;
