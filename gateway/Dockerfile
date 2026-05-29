# 게이트웨이 이미지. better-sqlite3 prebuild 호환을 위해 Node 20(LTS) 사용.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# 데이터/정책 디렉터리 (compose 에서 볼륨 마운트)
RUN mkdir -p /app/data/policies
EXPOSE 8080
CMD ["node", "src/index.js"]
