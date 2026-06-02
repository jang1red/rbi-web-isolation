// 격리 브라우저 제어 — CDP(Chrome DevTools Protocol)로 RBCloud Browser 안의 Chromium 을 구동.
// 사용자별 전용 컨테이너마다 독립적인 CDP 연결을 유지합니다(세션 격리).
//
// 담당 역할("인포바를 통한 안전 브라우징", "URL을 통한 행위 통제 및 상세 로그"):
//   - 인포바에서 입력한 URL 로 해당 사용자의 원격 브라우저를 네비게이트
//   - 현재 URL 조회 (인포바 동기화)
//   - 네트워크 요청 로깅 + 다운로드 가로채기(파일 통제/CDR 연동)
//
// CDP 연결 실패 시에도 게이트웨이는 정상 동작하며(스트리밍은 컨테이너가 직접 처리),
// 네비게이션은 graceful 하게 degrade 됩니다.
import CDP from 'chrome-remote-interface';
import config from './config.js';
import { logger } from './logger.js';
import { audit } from './audit.js';
import { evaluateUrl, evaluateFile } from './policy.js';
import { sessionCdpHost } from './orchestrator.js';

// sessionId -> { client, connecting, lastUrl }
const conns = new Map();

function stateFor(sessionId) {
  const key = sessionId || '_shared';
  if (!conns.has(key)) conns.set(key, { client: null, connecting: null, lastUrl: config.rbcloud.homepage });
  return conns.get(key);
}

// 세션 컨테이너의 CDP 호스트 결정 (오케스트레이터 비활성화 시 단일 호스트)
function cdpHostFor(sessionId) {
  if (config.orchestrator.enabled && sessionId) {
    return sessionCdpHost(sessionId); // 사용자 전용 컨테이너 호스트
  }
  return config.rbcloud.cdpHost;
}

async function connect(sessionId) {
  const st = stateFor(sessionId);
  if (st.client) return st.client;
  if (st.connecting) return st.connecting;

  const host = cdpHostFor(sessionId);
  if (!host) throw new Error('세션 컨테이너 없음');

  st.connecting = (async () => {
    const c = await CDP({ host, port: config.rbcloud.cdpPort });
    const { Page, Network, Runtime } = c;
    await Page.enable();
    await Network.enable();
    await Runtime.enable();

    // 모든 요청 로깅 (상세 로그)
    Network.requestWillBeSent(({ request }) => {
      if (request.url.startsWith('http')) logger.debug({ sessionId, url: request.url }, 'cdp request');
    });
    // 현재 URL 추적
    Page.frameNavigated(({ frame }) => {
      if (!frame.parentId) st.lastUrl = frame.url;
    });
    // 다운로드 가로채기 → 파일 정책/CDR 연동
    try {
      await Page.setDownloadBehavior?.({ behavior: 'allow', downloadPath: '/tmp/rbi-downloads' });
    } catch { /* 일부 버전 미지원 */ }
    Page.downloadWillBegin?.(({ url, suggestedFilename }) => {
      const action = evaluateFile('download', suggestedFilename || url);
      logger.info({ sessionId, url, suggestedFilename, action }, 'download intercepted');
      audit('download', { sessionId, detail: { url, filename: suggestedFilename, action } });
    });

    c.on('disconnect', () => {
      logger.warn({ sessionId }, 'CDP 연결 끊김 — 재연결 대기');
      st.client = null;
    });
    st.client = c;
    return c;
  })().catch((err) => {
    st.connecting = null;
    throw err;
  });
  return st.connecting;
}

/** 인포바 네비게이션. 정책 평가 후 허용 시 해당 사용자 브라우저를 이동. */
export async function navigate(url, ctx = {}) {
  const verdict = evaluateUrl(url);
  if (!verdict.allowed) {
    audit('blocked', { ...ctx, detail: { url, reason: verdict.reason, category: verdict.category } });
    return { ok: false, blocked: true, reason: verdict.reason, category: verdict.category };
  }
  audit('navigate', { ...ctx, detail: { url } });
  try {
    const c = await connect(ctx.sessionId);
    await c.Page.navigate({ url });
    stateFor(ctx.sessionId).lastUrl = url;
    return { ok: true, url };
  } catch (err) {
    logger.warn({ err: err.message, sessionId: ctx.sessionId }, 'CDP navigate 실패 — degrade');
    return { ok: true, url, degraded: true };
  }
}

export async function currentUrl(sessionId) {
  const st = stateFor(sessionId);
  try {
    const c = await connect(sessionId);
    const { result } = await c.Runtime.evaluate({ expression: 'location.href', returnByValue: true });
    st.lastUrl = result.value || st.lastUrl;
  } catch { /* degrade */ }
  return st.lastUrl;
}

export async function goBack(sessionId) {
  try {
    const c = await connect(sessionId);
    const history = await c.Page.getNavigationHistory();
    const idx = history.currentIndex;
    if (idx > 0) await c.Page.navigateToHistoryEntry({ entryId: history.entries[idx - 1].id });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function goForward(sessionId) {
  try {
    const c = await connect(sessionId);
    const history = await c.Page.getNavigationHistory();
    const idx = history.currentIndex;
    if (idx < history.entries.length - 1)
      await c.Page.navigateToHistoryEntry({ entryId: history.entries[idx + 1].id });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function reload(sessionId) {
  try { const c = await connect(sessionId); await c.Page.reload(); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
}

/** 세션 종료 시 흔적 폐기 — 쿠키/캐시 클리어 (컨테이너 자체는 오케스트레이터가 삭제) */
export async function wipeSession(sessionId) {
  try {
    const c = await connect(sessionId);
    await c.Network.clearBrowserCookies();
    await c.Network.clearBrowserCache();
    audit('wipe', { sessionId, detail: { ok: true } });
  } catch (err) {
    logger.warn({ err: err.message, sessionId }, 'wipe 실패');
  }
  // CDP 연결 정리
  const st = conns.get(sessionId || '_shared');
  if (st?.client) { try { st.client.close(); } catch { /* */ } }
  conns.delete(sessionId || '_shared');
  return { ok: true };
}

export async function isCdpAlive(sessionId) {
  try { await connect(sessionId); return true; } catch { return false; }
}
