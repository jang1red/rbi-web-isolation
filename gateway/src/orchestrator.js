// 세션 오케스트레이터 — RBI의 핵심.
// 로그인하는 사용자마다 "전용 격리 브라우저 컨테이너"를 동적으로 생성하고,
// 로그아웃/세션 종료 시 컨테이너를 삭제해 모든 흔적을 폐기합니다.
//
//   사용자A ──▶ rbi-session-<A> 컨테이너  (A 전용 브라우저)
//   사용자B ──▶ rbi-session-<B> 컨테이너  (B 전용 브라우저)
//   로그아웃 ──▶ 컨테이너 remove(force) → 쿠키·캐시·히스토리 완전 폐기
//
// WebRTC(UDP)는 P2P 미디어라 프록시 불가 → 세션마다 호스트 UDP 포트를 1개씩 할당해
// 클라이언트가 <natIp>:<udpPort> 로 직접 연결합니다. (HTTP/WS 시그널링만 게이트웨이 프록시)
import Docker from 'dockerode';
import config from './config.js';
import { logger } from './logger.js';

const docker = new Docker(); // 기본 소켓(/var/run/docker.sock) 사용
const SESSION_PREFIX = 'rbi-session-';

// sessionId -> { containerId, name, udpPort, host, ready }
const sessions = new Map();

// ── UDP 포트 풀 ───────────────────────────────────────────────
const usedPorts = new Set();
function allocPort() {
  const base = config.orchestrator.baseUdpPort;
  for (let p = base; p < base + config.orchestrator.maxSessions; p++) {
    if (!usedPorts.has(p)) { usedPorts.add(p); return p; }
  }
  throw new Error('동시 세션 한도 초과 — 잠시 후 다시 시도하세요');
}
function freePort(p) { usedPorts.delete(p); }

// ── 세션 컨테이너 생성 ────────────────────────────────────────
export async function createSession(sessionId, opts = {}) {
  const { username } = opts;
  if (sessions.has(sessionId)) return sessions.get(sessionId);

  const udpPort = allocPort();
  const name = `${SESSION_PREFIX}${sessionId}`;
  const o = config.orchestrator;

  logger.info({ sessionId, username, udpPort, name }, '세션 컨테이너 생성 시작');

  let container;
  try {
    container = await docker.createContainer({
      Image: o.image,
      name,
      Labels: { 'rbi.session': sessionId, 'rbi.user': username || '', 'rbi.managed': 'true' },
      Env: [
        // neko 자체 로그인 화면 완전 제거 — 게이트웨이 JWT 인증 + 컨테이너 격리로 이미 보호됨.
        // ★ NEKO_PASSWORD(v2 설정)가 있으면 multiuser 모드로 폴백되어 로그인 화면이 뜨므로 제거.
        'NEKO_MEMBER_PROVIDER=noauth',
        'NEKO_MEMBER_NOAUTH=true',
        'NEKO_SESSION_API_TOKEN=',
        `NEKO_WEBRTC_NAT1TO1=${o.natIp}`,
        `NEKO_WEBRTC_UDPMUX=${udpPort}`,
        // ★ TCP mux 도 같은 포트로 활성화 — UDP가 막히는 환경(Windows Docker 등)에서 WebRTC over TCP fallback
        `NEKO_WEBRTC_TCPMUX=${udpPort}`,
        'NEKO_CHROMIUM_FLAGS=--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run --disable-default-apps --disable-session-crashed-bubble --use-fake-ui-for-media-stream',
      ],
      ExposedPorts: { '8080/tcp': {}, '9222/tcp': {}, [`${udpPort}/udp`]: {}, [`${udpPort}/tcp`]: {} },
      HostConfig: {
        NetworkMode: o.network,
        // WebRTC 포트를 호스트에 매핑(같은 번호) — UDP + TCP 둘 다. 미디어는 클라이언트 직접 연결
        PortBindings: {
          [`${udpPort}/udp`]: [{ HostPort: String(udpPort) }],
          [`${udpPort}/tcp`]: [{ HostPort: String(udpPort) }],
        },
        ShmSize: 2 * 1024 * 1024 * 1024, // Chromium 렌더링 공유메모리 2GB
        CapAdd: ['SYS_ADMIN'],
        Binds: [`${o.policyVolume}:/etc/chromium/policies/managed:ro`],
        RestartPolicy: { Name: 'no' },
        // 세션 격리: 자원 제한 (1.5 CPU, 2GB RAM)
        NanoCpus: 1_500_000_000,
        Memory: 2 * 1024 * 1024 * 1024,
      },
    });
    await container.start();
  } catch (err) {
    // 실패한 컨테이너(좀비) 정리 — 포트 점유 방지
    try { await docker.getContainer(name).remove({ force: true }); } catch { /* 이미 없음 */ }
    const msg = String(err.message || '');
    // 포트 충돌이면 그 포트는 usedPorts에 유지(다음 포트 사용)하고 다음 포트로 재시도
    if (/already (allocated|in use)|only one usage|port is already|bind/i.test(msg) && (opts._retry || 0) < 20) {
      logger.warn({ udpPort, sessionId, retry: opts._retry || 0 }, '포트 충돌 — 다음 포트로 재시도');
      return createSession(sessionId, { username, _retry: (opts._retry || 0) + 1 });
    }
    freePort(udpPort);
    logger.error({ err: msg, sessionId }, '세션 컨테이너 생성 실패');
    throw err;
  }

  const info = { containerId: container.id, name, udpPort, host: name, ready: false };
  sessions.set(sessionId, info);

  // 컨테이너 HTTP(8080)가 응답할 때까지 대기
  await waitReady(info).catch((err) => {
    logger.warn({ err: err.message, sessionId }, '세션 컨테이너 준비 대기 타임아웃(계속 진행)');
  });
  info.ready = true;
  logger.info({ sessionId, name, udpPort }, '세션 컨테이너 준비 완료');
  return info;
}

// 컨테이너 내부 HTTP 헬스 폴링
async function waitReady(info) {
  const deadline = Date.now() + config.orchestrator.bootTimeoutMs;
  const url = `http://${info.host}:8080/`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 200 || res.status === 401) return;
    } catch { /* 아직 미기동 */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error('boot timeout');
}

// ── 세션 컨테이너 삭제 (흔적 폐기) ────────────────────────────
export async function destroySession(sessionId) {
  const info = sessions.get(sessionId);
  if (!info) return;
  try {
    await docker.getContainer(info.containerId).remove({ force: true });
    logger.info({ sessionId, name: info.name }, '세션 컨테이너 삭제(흔적 폐기)');
  } catch (err) {
    logger.warn({ err: err.message, sessionId }, '세션 컨테이너 삭제 실패');
  }
  freePort(info.udpPort);
  sessions.delete(sessionId);
}

export function getSession(sessionId) {
  return sessions.get(sessionId);
}

// 사용자별 컨테이너 내부 주소 (프록시/CDP 대상)
export function sessionTarget(sessionId) {
  const info = sessions.get(sessionId);
  return info ? `http://${info.host}:8080` : null;
}
export function sessionCdpHost(sessionId) {
  const info = sessions.get(sessionId);
  return info ? info.host : null;
}

// ── 부팅 시 고아 컨테이너 정리 ────────────────────────────────
// 게이트웨이가 재시작되면 이전 세션 컨테이너는 모두 무효 → 정리
export async function cleanupOrphans() {
  try {
    const list = await docker.listContainers({ all: true, filters: { label: ['rbi.managed=true'] } });
    for (const c of list) {
      try {
        await docker.getContainer(c.Id).remove({ force: true });
        logger.info({ name: c.Names?.[0] }, '고아 세션 컨테이너 정리');
      } catch { /* ignore */ }
    }
  } catch (err) {
    logger.warn({ err: err.message }, '고아 컨테이너 정리 실패(Docker 연결 확인)');
  }
}

// Docker 데몬 연결 확인
export async function dockerAlive() {
  try { await docker.ping(); return true; } catch { return false; }
}

export default {
  createSession, destroySession, getSession,
  sessionTarget, sessionCdpHost, cleanupOrphans, dockerAlive,
};
