// 인증 미들웨어 — JWT 쿠키 검증 후 req.user 주입.
import { verifyToken, getUserById } from '../auth.js';
import config from '../config.js';

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

export function authRequired(req, res, next) {
  const token = req.cookies?.[config.cookieName] || bearer(req);
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: '인증 필요' });

  const user = getUserById(payload.sub);
  if (!user || user.disabled) return res.status(401).json({ error: '비활성 계정' });

  req.user = user;
  req.sessionId = payload.sid;
  next();
}

export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });
    next();
  });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
