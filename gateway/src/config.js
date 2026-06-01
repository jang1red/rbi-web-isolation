// 게이트웨이 환경설정. 모든 값은 .env 로 덮어쓸 수 있습니다.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(key, fallback) {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function bool(key, fallback) {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export const config = {
  // HTTP 서버
  port: parseInt(env('GATEWAY_PORT', '8080'), 10),
  host: env('GATEWAY_HOST', '0.0.0.0'),

  // 보안
  jwtSecret: env('JWT_SECRET', 'dev-insecure-change-me'),
  jwtTtl: env('JWT_TTL', '8h'),
  cookieName: env('COOKIE_NAME', 'rbi_session'),
  cookieSecure: bool('COOKIE_SECURE', false), // 운영(HTTPS)에서는 true
  bcryptRounds: parseInt(env('BCRYPT_ROUNDS', '12'), 10),

  // 기본 관리자(최초 부팅 시 시드)
  bootstrapAdmin: env('BOOTSTRAP_ADMIN', 'admin'),
  bootstrapPassword: env('BOOTSTRAP_PASSWORD', 'changeme'),

  // 데이터/정책 경로
  dataDir: env('DATA_DIR', path.resolve(__dirname, '../data')),
  dbPath: env('DB_PATH', path.resolve(__dirname, '../data/rbi.db')),
  // Chromium managed policy 가 마운트되는 공유 볼륨 경로(rbcloud-browser 컨테이너와 공유)
  policyDir: env('POLICY_DIR', path.resolve(__dirname, '../data/policies')),

  // RBCloud Browser (격리 브라우저) 연결
  rbcloud: {
    // 게이트웨이가 프록시할 RBCloud Browser 내부 주소
    url: env('RBCLOUD_URL', 'http://rbcloud:8080'),
    // WebSocket 경로 (v3: /api/ws, v2: /ws)
    wsPath: env('RBCLOUD_WS_PATH', '/api/ws'),
    // 원격 브라우저 CDP(원격 디버깅) 엔드포인트
    cdpHost: env('CDP_HOST', 'rbcloud'),
    cdpPort: parseInt(env('CDP_PORT', '9222'), 10),
    // 격리 환경 시작(홈) 페이지
    homepage: env('RBI_HOMEPAGE', 'about:blank'),
    // RBCloud Browser 접속 비밀번호 (iframe 자동 로그인용, docker-compose RBCLOUD_PASSWORD와 동일)
    password: env('RBCLOUD_PASSWORD', 'userpass'),
  },

  // 감사 로그
  logLevel: env('LOG_LEVEL', 'info'),
};

export default config;
