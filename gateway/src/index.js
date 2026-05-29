// RBI 게이트웨이 진입점.
//   - 인증/세션/관리 API
//   - Neko(격리 브라우저) 리버스 프록시 (HTTP + WebSocket) : 인증된 사용자만 접근
//   - 프론트엔드(React 빌드) 정적 서빙
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import config from './config.js';
import { logger } from './logger.js';
import { verifyToken, getUserById } from './auth.js';
import { regenerateManagedPolicy } from './policy.js';
import { ensureBootstrap } from './seed.js';

import authRoutes from './routes/auth.routes.js';
import sessionRoutes from './routes/session.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url.startsWith('/neko') } }));
app.use(helmet({
  contentSecurityPolicy: false, // 격리 브라우저 iframe 임베드 위해 완화 (운영시 frame-src 화이트리스트 권장)
  crossOriginEmbedderPolicy: false,
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// ── API ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Neko 리버스 프록시 (인증 게이트) ───────────────────────
// /neko/* → Neko 컨테이너. 쿠키의 JWT 가 유효한 경우에만 통과.
function gateNeko(req, res, next) {
  const token = req.cookies?.[config.cookieName];
  const payload = token && verifyToken(token);
  const user = payload && getUserById(payload.sub);
  if (!user || user.disabled) {
    return res.status(401).send('격리 세션 인증 필요');
  }
  next();
}

const nekoProxy = createProxyMiddleware({
  target: config.neko.url,
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/neko': '' },
  logger,
});

app.use('/neko', gateNeko, nekoProxy);

// ── 프론트엔드 정적 서빙 ───────────────────────────────────
const frontendDir = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/neko')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
} else {
  logger.warn('frontend/dist 없음 — 먼저 frontend 를 빌드하세요 (npm run build)');
}

// ── 부팅 ───────────────────────────────────────────────────
ensureBootstrap();
regenerateManagedPolicy();

const server = app.listen(config.port, config.host, () => {
  logger.info(`RBI gateway listening on http://${config.host}:${config.port}`);
});

// WebSocket 업그레이드(Neko WebRTC 시그널링) 프록시
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/neko')) {
    nekoProxy.upgrade(req, socket, head);
  }
});

export default app;
