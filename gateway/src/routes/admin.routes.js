// 관리자 라우트 — 사용자/정책/설정/감사로그 관리. ("관리자 정책에 따라 ... 통제 및 상세 로그")
import { Router } from 'express';
import {
  listUsers, createUser, setUserDisabled, setUserConditions, changePassword, deleteUser,
} from '../auth.js';
import {
  listUrlPolicies, addUrlPolicy, updateUrlPolicy, deleteUrlPolicy,
  listFilePolicies, addFilePolicy, deleteFilePolicy,
  getAllSettings, setSetting,
} from '../policy.js';
import { queryAudit } from '../audit.js';
import { audit } from '../audit.js';
import { adminRequired, clientIp } from '../middleware/auth.middleware.js';

const router = Router();
router.use(adminRequired);

const logAdmin = (req, action, detail) =>
  audit('admin', { user: req.user, ip: clientIp(req), detail: { action, ...detail } });

// ── 사용자 ────────────────────────────────────────────────
router.get('/users', (req, res) => res.json(listUsers().map(u => ({ ...u, conditions: safeParse(u.conditions) }))));
router.post('/users', (req, res) => {
  const { username, password, role, conditions } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
  if (String(password).length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  try {
    const u = createUser({ username, password, role, conditions });
    logAdmin(req, 'create-user', { username, role });
    res.json({ id: u.id, username: u.username, role: u.role });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `이미 존재하는 아이디입니다: ${username}` });
    }
    res.status(500).json({ error: '사용자 생성 실패: ' + err.message });
  }
});
router.patch('/users/:id', (req, res) => {
  const { disabled, conditions, password } = req.body || {};
  if (disabled !== undefined) setUserDisabled(req.params.id, disabled);
  if (conditions !== undefined) setUserConditions(req.params.id, conditions);
  if (password) changePassword(req.params.id, password);
  logAdmin(req, 'update-user', { id: req.params.id });
  res.json({ ok: true });
});
router.delete('/users/:id', (req, res) => {
  deleteUser(req.params.id);
  logAdmin(req, 'delete-user', { id: req.params.id });
  res.json({ ok: true });
});

// ── URL 정책 ──────────────────────────────────────────────
router.get('/url-policies', (req, res) => res.json(listUrlPolicies()));
router.post('/url-policies', (req, res) => {
  const p = addUrlPolicy(req.body || {});
  logAdmin(req, 'add-url-policy', req.body);
  res.json(p);
});
router.patch('/url-policies/:id', (req, res) => {
  const p = updateUrlPolicy(Number(req.params.id), req.body || {});
  logAdmin(req, 'update-url-policy', { id: req.params.id });
  res.json(p);
});
router.delete('/url-policies/:id', (req, res) => {
  deleteUrlPolicy(Number(req.params.id));
  logAdmin(req, 'delete-url-policy', { id: req.params.id });
  res.json({ ok: true });
});

// ── 파일 정책 ─────────────────────────────────────────────
router.get('/file-policies', (req, res) => res.json(listFilePolicies()));
router.post('/file-policies', (req, res) => {
  const p = addFilePolicy(req.body || {});
  logAdmin(req, 'add-file-policy', req.body);
  res.json(p);
});
router.delete('/file-policies/:id', (req, res) => {
  deleteFilePolicy(Number(req.params.id));
  logAdmin(req, 'delete-file-policy', { id: req.params.id });
  res.json({ ok: true });
});

// ── 설정 (워터마크/클립보드) ──────────────────────────────
router.get('/settings', (req, res) => res.json(getAllSettings()));
router.put('/settings', (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [k, v] of entries) setSetting(k, v);
  logAdmin(req, 'update-settings', { keys: entries.map(([k]) => k) });
  res.json(getAllSettings());
});

// ── 감사 로그 ─────────────────────────────────────────────
router.get('/audit', (req, res) => {
  const { limit, offset, type, userId, since } = req.query;
  res.json(queryAudit({
    limit: Math.min(Number(limit) || 200, 1000),
    offset: Number(offset) || 0,
    type, userId, since,
  }));
});

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

export default router;
