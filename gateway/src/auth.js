// 인증/계정 — 소개서의 "사용자 인증으로 인적 관리를 돕는 계정 시스템",
// "MFA 제공", "Zero-Trust Conditional Access" 요구사항.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { authenticator } from 'otplib';
import db from './db.js';
import config from './config.js';

// ── 사용자 CRUD ───────────────────────────────────────────────
export function createUser({ username, password, role = 'user', conditions = {} }) {
  const id = nanoid();
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, conditions)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, username, hash, role, JSON.stringify(conditions));
  return getUserById(id);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
export function getUserByName(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}
export function listUsers() {
  return db
    .prepare('SELECT id, username, role, mfa_enabled, disabled, conditions, created_at FROM users ORDER BY created_at')
    .all();
}
export function setUserDisabled(id, disabled) {
  db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id);
}
export function setUserConditions(id, conditions) {
  db.prepare('UPDATE users SET conditions = ? WHERE id = ?').run(JSON.stringify(conditions), id);
}
export function changePassword(id, password) {
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}
export function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

// ── MFA (TOTP) ────────────────────────────────────────────────
export function beginMfaEnrollment(user) {
  const secret = authenticator.generateSecret();
  db.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?').run(secret, user.id);
  const otpauth = authenticator.keyuri(user.username, 'RBI-WebIsolation', secret);
  return { secret, otpauth };
}
export function confirmMfa(user, token) {
  const fresh = getUserById(user.id);
  if (!fresh.mfa_secret) return false;
  const ok = authenticator.verify({ token, secret: fresh.mfa_secret });
  if (ok) db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(user.id);
  return ok;
}
export function verifyMfa(user, token) {
  if (!user.mfa_secret) return false;
  return authenticator.verify({ token, secret: user.mfa_secret });
}

// ── Zero-Trust 조건부 접근 ────────────────────────────────────
// conditions 예: { allowedHours: [8,19], allowedCidrs: ["10.0.0.0/8"] }
export function evaluateConditions(user, { ip, now = new Date() } = {}) {
  let cond = {};
  try { cond = JSON.parse(user.conditions || '{}'); } catch { /* ignore */ }

  if (Array.isArray(cond.allowedHours) && cond.allowedHours.length === 2) {
    const [start, end] = cond.allowedHours;
    const h = now.getHours();
    if (h < start || h >= end) {
      return { ok: false, reason: `허용 시간(${start}-${end}시) 외 접속` };
    }
  }
  if (Array.isArray(cond.allowedCidrs) && cond.allowedCidrs.length > 0 && ip) {
    const allowed = cond.allowedCidrs.some((cidr) => ipInCidr(ip, cidr));
    if (!allowed) return { ok: false, reason: `허용 네트워크 외 접속(${ip})` };
  }
  return { ok: true };
}

// ── JWT 발급/검증 ─────────────────────────────────────────────
export function issueToken(user, sessionId) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, sid: sessionId },
    config.jwtSecret,
    { expiresIn: config.jwtTtl }
  );
}
export function verifyToken(token) {
  try { return jwt.verify(token, config.jwtSecret); }
  catch { return null; }
}

// ── 간이 CIDR 매칭 (IPv4) ─────────────────────────────────────
function ipToInt(ip) {
  const clean = ip.replace(/^::ffff:/, '');
  const parts = clean.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
function ipInCidr(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr ?? '32', 10);
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  if (ipInt === null || rangeInt === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}
