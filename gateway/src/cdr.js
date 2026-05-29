// CDR (Content Disarm & Reconstruction) — 소개서의
// "웹 상의 콘텐츠 내부의 위험 요소를 제거하면서도 문서의 호환성을 유지".
//
// 실제 무해화 엔진(상용 CDR/백신)은 별도 패키지로 제공된다고 명시되어 있으므로,
// 여기서는 **연동 지점(hook)**과 정책 분기만 구현합니다.
// 운영 시 CDR_ENGINE_URL 로 외부 무해화 서비스(REST)에 위임하도록 설계.
import config from './config.js';
import { evaluateFile } from './policy.js';
import { audit } from './audit.js';
import { logger } from './logger.js';

const CDR_ENGINE_URL = process.env.CDR_ENGINE_URL || '';

/**
 * 파일 바이트를 정책에 따라 처리.
 * @returns {{ action:'allow'|'block'|'cdr', buffer?:Buffer, sanitized?:boolean }}
 */
export async function processFile({ direction, filename, buffer, ctx }) {
  const action = evaluateFile(direction, filename);
  audit('file-policy', { ...ctx, detail: { direction, filename, action, size: buffer?.length } });

  if (action === 'block') {
    return { action: 'block' };
  }
  if (action === 'cdr') {
    if (CDR_ENGINE_URL) {
      try {
        const res = await fetch(`${CDR_ENGINE_URL}/disarm`, {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream', 'x-filename': filename },
          body: buffer,
        });
        if (!res.ok) throw new Error(`CDR engine ${res.status}`);
        const out = Buffer.from(await res.arrayBuffer());
        audit('cdr', { ...ctx, detail: { filename, sanitized: true, engine: CDR_ENGINE_URL } });
        return { action: 'cdr', buffer: out, sanitized: true };
      } catch (err) {
        logger.error({ err: err.message }, 'CDR 엔진 호출 실패 — 안전을 위해 차단');
        return { action: 'block', reason: 'CDR 처리 실패' };
      }
    }
    // 외부 엔진 미설정: hook 만 통과시키되 경고 (운영 전 반드시 엔진 연결)
    logger.warn({ filename }, 'CDR 엔진 미설정 — pass-through (운영 비권장)');
    audit('cdr', { ...ctx, detail: { filename, sanitized: false, note: 'engine-not-configured' } });
    return { action: 'cdr', buffer, sanitized: false };
  }
  return { action: 'allow', buffer };
}

export default { processFile };
