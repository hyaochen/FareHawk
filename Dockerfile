# FareHawk - 便宜機票搜尋器
# 單一容器包含 Web UI (Next.js + Playwright) + Telegram Bot (Node.js)

# ===== Stage 1: 安裝依賴 =====
FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm AS deps

WORKDIR /app

# 安裝系統依賴（Playwright 需要）
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 libx11-6 \
    libx11-xcb1 libxcb1 libxext6 libxfixes3 \
    fonts-noto-cjk wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 安裝根目錄依賴（後端）
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# 安裝 web 目錄依賴（前端）
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm ci --production=false

# 安裝 Playwright Chromium
RUN cd web && npx playwright install chromium

# ===== Stage 2: 建構 =====
FROM deps AS builder

WORKDIR /app

# 複製原始碼
COPY . .

# 生成 Prisma Client
RUN npx prisma generate
RUN rm -rf /app/web/node_modules/@prisma/client /app/web/node_modules/.prisma \
    && mkdir -p /app/web/node_modules/@prisma \
    && cp -R /app/node_modules/@prisma/client /app/web/node_modules/@prisma/client \
    && cp -R /app/node_modules/.prisma /app/web/node_modules/.prisma

# 建構後端 TypeScript
RUN npm run build

# 建構前端 Next.js
RUN cd web && npm run build

# ===== Stage 3: 運行 =====
FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm AS runner

WORKDIR /app

# 安裝運行時系統依賴
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 libx11-6 \
    libx11-xcb1 libxcb1 libxext6 libxfixes3 \
    fonts-noto-cjk dumb-init wget \
    && rm -rf /var/lib/apt/lists/*

# 複製建構產物和依賴
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/web/package.json ./web/
COPY --from=builder /app/web/node_modules ./web/node_modules
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/next.config.mjs ./web/

# 複製 Playwright 瀏覽器
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

# 複製啟動腳本
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

# 資料目錄（SQLite DB 會存在這裡）
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/fly.db"

# Web UI port
EXPOSE 3003

# 使用 dumb-init 管理進程
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-start.sh"]

