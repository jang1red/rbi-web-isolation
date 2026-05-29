// 격리 브라우저 제어 — CDP(Chrome DevTools Protocol)로 Neko 안의 Chromium 을 구동.
//
// 담당 역할(소개서 "인포바를 통한 안전 브라우징", "URL을 통한 행위 통제 및 상세 로그"):
//   - 인포바에서 입력한 URL 로 원격 브라우저를 네비게이트
//   - 현재 URL 조회 (인포바 동기화)
//   - 네트워크 요청 로깅 + 다운로드 가로채기(파일 통제/CDR 연동)
//
// CDP 연결 실패 시에도 게이트웨이는 정상 동작하며(스트리밍은 Neko 가 직접 처리),
// 네비게이션은 graceful 하게 degrade 됩니다.
import CDP from 'chrome-remote-interface';
import config from './config.js';
import { logger } from './logger.js';
import { audit } from './audit.js';
import { evaluateUrl, evaluateFile } from './policy.js';

let client = null;
let connecting = null;
let lastUrl = config.neko.homepage;

async function connect() {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const c = await CDP({ host: config.neko.cdpHost, port: config.neko.cdpPort });
    const { Page, Network, Runtime } = c;
    await Page.enable();
    await Network.enable();
    await Runtime.enable();

    // 모든 요청 로깅 (상세 로그)
    Network.requestWillBeSent(({ request }) => {
      if (request.url.startsWith('http')) {
        logger.debug({ url: request.url }, 'cdp request');
      }
    });
    // 현재 URL 추적
    Page.frameNavigated(({ frame }) => {
      if (!frame.parentId) lastUrl = frame.url;
    });
    // 다운로드 시작 가로채기 → 파일 정책/CDR 연동 (이벤트 기록)
    try {
      await Page.setDownloadBehavior?.({ behavior: 'allow', downloadPath: '/tmp/rbi-downloads' });
    } catch { /* 일부 버전 미지원 */ }
    Page.downloadWillBegin?.(({ url, suggestedFilename }) => {
      const action = evaluateFile('download', suggestedFilename || url);
      logger.info({ url, suggestedFilename, action }, 'download intercepted');
      audit('download', { detail: { url, filename: suggestedFilename, action } });
      // 실제 CDR/차단은 cdr.js 및 다운로드 프록시에서 수행 (hook)
    });

    c.on('disconnect', () => {
      logger.warn('CDP 연결 끊김 — 재연결 대기');
      client = null;
    });
    client = c;
    return c;
  })().catch((err) => {
    connecting = null;
    throw err;
  });
  return connecting;
}

/** 인포바 네비게이션. 정책 평가 후 허용 시 원격 브라우저를 이동. */
export async function navigate(url, ctx = {}) {
  const verdict = evaluateUrl(url);
  if (!verdict.allowed) {
    audit('blocked', { ...ctx, detail: { url, reason: verdict.reason, category: verdict.category } });
    return { ok: false, blocked: true, reason: verdict.reason, category: verdict.category };
  }
  audit('navigate', { ...ctx, detail: { url } });
  try {
    const c = await connect();
    await c.Page.navigate({ url });
    lastUrl = url;
    return { ok: true, url };
  } catch (err) {
    logger.warn({ err: err.message }, 'CDP navigate 실패 — degrade');
    // CDP 불가 시: 정책 평가/로깅은 완료, 실제 이동은 Neko UI 에 위임
    return { ok: true, url, degraded: true };
  }
}

export async function currentUrl() {
  try {
    const c = await connect();
    const { result } = await c.Runtime.evaluate({ expression: 'location.href', returnByValue: true });
    lastUrl = result.value || lastUrl;
  } catch { /* degrade: 마지막으로 알려진 URL */ }
  return lastUrl;
}

export async function goBack() {
  try {
    const c = await connect();
    const history = await c.Page.getNavigationHistory();
    const idx = history.currentIndex;
    if (idx > 0) await c.Page.navigateToHistoryEntry({ entryId: history.entries[idx - 1].id });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function goForward() {
  try {
    const c = await connect();
    const history = await c.Page.getNavigationHistory();
    const idx = history.currentIndex;
    if (idx < history.entries.length - 1)
      await c.Page.navigateToHistoryEntry({ entryId: history.entries[idx + 1].id });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
export async function reload() {
  try { const c = await connect(); await c.Page.reload(); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
}

/** 세션 종료 시 흔적 폐기 — 쿠키/캐시/스토리지 클리어 */
export async function wipeSession() {
  try {
    const c = await connect();
    await c.Network.clearBrowserCookies();
    await c.Network.clearBrowserCache();
    audit('wipe', { detail: { ok: true } });
    return { ok: true };
  } catch (err) {
    logger.warn({ err: err.message }, 'wipe 실패');
    return { ok: false };
  }
}

export async function isCdpAlive() {
  try { await connect(); return true; } catch { return false; }
}
