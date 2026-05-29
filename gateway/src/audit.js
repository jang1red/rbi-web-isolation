// 감사 로그 — 소개서의 "관리자 정책에 따라 상세 로그를 제공" 요구사항.
import db from './db.js';
import { logger } from './logger.js';

const insertStmt = db.prepare(`
  INSERT INTO audit_logs (user_id, username, session_id, type, detail, ip)
  VALUES (@user_id, @username, @session_id, @type, @detail, @ip)
`);

/**
 * 감사 이벤트 기록.
 * @param {string} type  이벤트 종류 (login, navigate, blocked, download, upload, clipboard, admin, ...)
 * @param {object} opts  { user, sessionId, ip, detail }
 */
export function audit(type, { user, sessionId, ip, detail } = {}) {
  try {
    insertStmt.run({
      user_id: user?.id ?? null,
      username: user?.username ?? null,
      session_id: sessionId ?? null,
      type,
      detail: detail ? JSON.stringify(detail) : null,
      ip: ip ?? null,
    });
  } catch (err) {
    logger.error({ err }, 'audit 기록 실패');
  }
  logger.info({ type, user: user?.username, detail }, 'audit');
}

export function queryAudit({ limit = 200, offset = 0, type, userId, since } = {}) {
  const where = [];
  const params = {};
  if (type) { where.push('type = @type'); params.type = type; }
  if (userId) { where.push('user_id = @userId'); params.userId = userId; }
  if (since) { where.push('ts >= @since'); params.since = since; }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset });
  return rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

export default audit;
