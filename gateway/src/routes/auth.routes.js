// 인증 라우트 — 로그인(비밀번호 + 선택적 MFA + Zero-Trust 조건), 로그아웃, 내 정보, MFA 등록.
import { Router } from 'express';
import { nanoid } from 'nanoid';
import db from '../db.js';
import config from '../config.js';
import {
  getUserByName, verifyPassword, verifyMfa, evaluateConditions, issueToken,
  beginMfaEnrollment, confirmMfa, changePassword,
} from '../auth.js';
import { audit } from '../audit.js';
import { authRequired, clientIp } from '../middleware/auth.middleware.js';
import { createSession, destroySession } from '../orchestrator.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password, mfaToken } = req.body || {};
  const ip = clientIp(req);
  const user = getUserByName(username || '');

  if (!user || user.disabled || !verifyPassword(user, password || '')) {
    audit('login-fail', { ip, detail: { username, reason: 'bad-credentials' } });
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  // Zero-Trust 조건부 접근 (시간/네트워크)
  const cond = evaluateConditions(user, { ip });
  if (!cond.ok) {
    audit('login-deny', { user, ip, detail: { reason: cond.reason } });
    return res.status(403).json({ error: `접근 거부: ${cond.reason}` });
  }

  // MFA
  if (user.mfa_enabled) {
    if (!mfaToken) return res.status(401).json({ error: 'MFA 토큰 필요', mfaRequired: true });
    if (!verifyMfa(user, mfaToken)) {
      audit('login-fail', { user, ip, detail: { reason: 'bad-mfa' } });
      return res.status(401).json({ error: 'MFA 토큰이 올바르지 않습니다.', mfaRequired: true });
    }
  }

  // 세션 생성
  const sessionId = nanoid();
  db.prepare(
    'INSERT INTO sessions (id, user_id, client_ip, user_agent) VALUES (?, ?, ?, ?)'
  ).run(sessionId, user.id, ip, req.headers['user-agent'] || '');

  // ★ 사용자 전용 격리 컨테이너 생성 (세션 격리의 핵심)
  if (config.orchestrator.enabled) {
    try {
      await createSession(sessionId, { username: user.username });
      audit('container-create', { user, sessionId, ip });
    } catch (err) {
      // 컨테이너 생성 실패 시 세션 롤백
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      audit('container-fail', { user, sessionId, ip, detail: { error: err.message } });
      return res.status(503).json({ error: `격리 환경 생성 실패: ${err.message}` });
    }
  }

  const token = issueToken(user, sessionId);
  res.cookie(config.cookieName, token, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 8 * 3600 * 1000,
  });
  audit('login', { user, sessionId, ip });
  res.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
    sessionId,
    mustChangePassword: password === config.bootstrapPassword,
  });
});

router.post('/logout', authRequired, async (req, res) => {
  db.prepare("UPDATE sessions SET ended_at = datetime('now') WHERE id = ?").run(req.sessionId);
  // ★ 사용자 전용 컨테이너 삭제 → 쿠키·캐시·히스토리 완전 폐기
  if (config.orchestrator.enabled) {
    await destroySession(req.sessionId);
    audit('container-destroy', { user: req.user, sessionId: req.sessionId, ip: clientIp(req) });
  }
  audit('logout', { user: req.user, sessionId: req.sessionId, ip: clientIp(req) });
  res.clearCookie(config.cookieName);
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  res.json({
    user: { id: req.user.id, username: req.user.username, role: req.user.role, mfaEnabled: !!req.user.mfa_enabled },
    sessionId: req.sessionId,
  });
});

router.post('/change-password', authRequired, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: '8자 이상의 새 비밀번호가 필요합니다.' });
  changePassword(req.user.id, newPassword);
  audit('change-password', { user: req.user, ip: clientIp(req) });
  res.json({ ok: true });
});

// MFA 등록 시작 → otpauth URI 반환(프론트에서 QR 표시)
router.post('/mfa/enroll', authRequired, (req, res) => {
  const { otpauth, secret } = beginMfaEnrollment(req.user);
  res.json({ otpauth, secret });
});
// MFA 등록 확정
router.post('/mfa/confirm', authRequired, (req, res) => {
  const ok = confirmMfa(req.user, (req.body || {}).token);
  if (!ok) return res.status(400).json({ error: 'MFA 토큰 검증 실패' });
  audit('mfa-enabled', { user: req.user });
  res.json({ ok: true });
});

export default router;
