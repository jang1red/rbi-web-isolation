# 게이트웨이 이미지 — 프론트엔드 빌드까지 포함 (서버에 Node 설치 불필요).
# build context 는 저장소 루트(.) 이며 docker-compose 에서 dockerfile 경로로 지정.

# ── 1. 프론트엔드 빌드 ──────────────────────────────────────
FROM node:20-bookworm-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── 2. 게이트웨이 의존성 (better-sqlite3 prebuild 호환 위해 Node 20) ──
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY gateway/package.json ./
RUN npm install --omit=dev

# ── 3. 최종 이미지 ──────────────────────────────────────────
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY gateway/package.json ./
COPY gateway/src ./src
# 빌드된 프론트엔드를 이미지에 포함
COPY --from=frontend /fe/dist ./frontend/dist
RUN mkdir -p /app/data/policies
EXPOSE 8080
CMD ["node", "src/index.js"]
