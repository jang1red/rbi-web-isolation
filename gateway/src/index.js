// RBI 게이트웨이 진입점.
//   - 인증/세션/관리 API
//   - RBCloud Browser(격리 브라우저) 리버스 프록시 (HTTP + WebSocket) : 인증된 사용자만 접근
//   - 사용자별 전용 컨테이너로 동적 라우팅 (세션 격리)
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
import { getSession, cleanupOrphans, dockerAlive } from './orchestrator.js';

import authRoutes from './routes/auth.routes.js';
import sessionRoutes from './routes/session.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url.startsWith('/rbcloud') } }));
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

// ── 요청 → 사용자 세션 컨테이너 타겟 결정 ───────────────────
// JWT 쿠키의 sid 로 해당 사용자 전용 컨테이너를 찾는다.
function resolveTarget(req) {
  const token = req.cookies?.[config.cookieName] || cookieFromRaw(req.headers.cookie);
  const payload = token && verifyToken(token);
  if (!payload) return { user: null, target: null };
  const user = getUserById(payload.sub);
  if (!user || user.disabled) return { user: null, target: null };

  if (config.orchestrator.enabled) {
    const sess = getSession(payload.sid);
    // 사용자 전용 컨테이너 (없으면 아직 미생성 → null)
    return { user, target: sess ? `http://${sess.host}:8080` : null, sid: payload.sid };
  }
  // 단일 공유 모드(폴백)
  return { user, target: config.rbcloud.url, sid: payload.sid };
}

// WS 업그레이드는 req.cookies 가 없으므로 raw 헤더에서 직접 파싱
function cookieFromRaw(raw) {
  if (!raw) return null;
  const m = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(config.cookieName + '='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : null;
}

// ── RBCloud Browser 리버스 프록시 (인증 게이트 + 동적 라우팅) ─
function gateRBCloud(req, res, next) {
  const { user, target } = resolveTarget(req);
  if (!user) return res.status(401).send('격리 세션 인증 필요');
  if (!target) {
    return res.status(503).send('격리 브라우저 준비 중입니다. 잠시 후 새로고침 해주세요.');
  }
  req._rbiTarget = target;
  next();
}

const rbcloudProxy = createProxyMiddleware({
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/rbcloud': '' },
  // 사용자별 전용 컨테이너로 동적 라우팅
  router: (req) => req._rbiTarget || resolveTarget(req).target || config.rbcloud.url,
  logger,
  on: {
    // 격리 브라우저 리소스를 캐시하지 않음 — 브랜딩 즉시 반영 + RBI 흔적 방지 철학
    proxyRes: (proxyRes) => {
      proxyRes.headers['cache-control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      proxyRes.headers['pragma'] = 'no-cache';
      delete proxyRes.headers['etag'];
      delete proxyRes.headers['last-modified'];
    },
  },
});

app.use('/rbcloud', gateRBCloud, rbcloudProxy);

// ── 프론트엔드 정적 서빙 ───────────────────────────────────
// __dirname = /app/src  →  ../frontend/dist = /app/frontend/dist
const frontendDir = path.resolve(__dirname, '../frontend/dist');
// 프론트엔드도 캐시하지 않음 — 브랜딩/UI 변경 즉시 반영 (새로고침만으로)
const noStore = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
};
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir, { etag: false, lastModified: false, setHeaders: noStore }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/rbcloud')) return next();
    noStore(res);
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
} else {
  logger.warn('frontend/dist 없음 — 먼저 frontend 를 빌드하세요 (npm run build)');
}

// ── 부팅 ───────────────────────────────────────────────────
ensureBootstrap();
regenerateManagedPolicy();

// 오케스트레이터: Docker 연결 확인 + 고아 컨테이너 정리
if (config.orchestrator.enabled) {
  dockerAlive().then((alive) => {
    if (alive) {
      logger.info('오케스트레이터 활성화 — 사용자별 전용 격리 컨테이너 모드');
      cleanupOrphans();
    } else {
      logger.error('Docker 데몬에 연결할 수 없습니다. docker.sock 마운트를 확인하세요. (단일 공유 모드로 폴백되지 않음)');
    }
  });
}

const server = app.listen(config.port, config.host, () => {
  logger.info(`RBI gateway listening on http://${config.host}:${config.port}`);
});

// WebSocket 업그레이드(RBCloud Browser WebRTC 시그널링) 프록시 — 사용자별 컨테이너로 라우팅
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/rbcloud')) {
    const { user, target } = resolveTarget(req);
    if (!user || !target) { socket.destroy(); return; }
    // ★ neko 표시명을 로그인한 실제 아이디로 강제 교체 (브라우저에 저장된 이전 이름 무시)
    const uname = encodeURIComponent(user.username);
    if (/[?&]username=/.test(req.url)) {
      req.url = req.url.replace(/([?&])username=[^&]*/, `$1username=${uname}`);
    } else {
      req.url += (req.url.includes('?') ? '&' : '?') + 'username=' + uname;
    }
    req._rbiTarget = target;
    rbcloudProxy.upgrade(req, socket, head);
  }
});

export default app;
