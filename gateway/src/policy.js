// 정책 엔진 — 소개서의 "URL 접속 허용/차단", "유해사이트 카테고리",
// "파일 업로드/다운로드 통제", "클립보드 통제".
//
// 시행 지점은 두 곳(다층 방어):
//   1) Chromium Managed Policy (URLAllowlist/URLBlocklist/DownloadRestrictions/클립보드)
//      → 격리 브라우저가 OS 레벨에서 강제. generateManagedPolicy() 가 JSON 파일 생성.
//   2) 게이트웨이 평가 (인포바 네비게이션 시 evaluateUrl())
//      → 차단 사유/카테고리 즉시 응답 + 감사 로그.
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import config from './config.js';
import { logger } from './logger.js';

// ── URL 정책 ──────────────────────────────────────────────────
export function listUrlPolicies() {
  return db.prepare('SELECT * FROM url_policies ORDER BY action, pattern').all();
}
export function addUrlPolicy({ pattern, action, category = null, note = null }) {
  const info = db
    .prepare('INSERT INTO url_policies (pattern, action, category, note) VALUES (?, ?, ?, ?)')
    .run(pattern, action, category, note);
  regenerateManagedPolicy();
  return db.prepare('SELECT * FROM url_policies WHERE id = ?').get(info.lastInsertRowid);
}
export function updateUrlPolicy(id, fields) {
  const cur = db.prepare('SELECT * FROM url_policies WHERE id = ?').get(id);
  if (!cur) return null;
  const next = { ...cur, ...fields };
  db.prepare(
    `UPDATE url_policies SET pattern=?, action=?, category=?, enabled=?, note=?, updated_at=datetime('now') WHERE id=?`
  ).run(next.pattern, next.action, next.category, next.enabled ? 1 : 0, next.note, id);
  regenerateManagedPolicy();
  return db.prepare('SELECT * FROM url_policies WHERE id = ?').get(id);
}
export function deleteUrlPolicy(id) {
  db.prepare('DELETE FROM url_policies WHERE id = ?').run(id);
  regenerateManagedPolicy();
}

/**
 * 인포바 네비게이션 평가. 차단 목록이 허용 목록보다 우선.
 * @returns {{ allowed:boolean, reason?:string, category?:string }}
 */
export function evaluateUrl(rawUrl) {
  let host = '';
  try { host = new URL(rawUrl).hostname; } catch { /* 비정상 URL */ }

  const policies = db.prepare('SELECT * FROM url_policies WHERE enabled = 1').all();
  const blocks = policies.filter((p) => p.action === 'block');
  const allows = policies.filter((p) => p.action === 'allow');

  // 1) 차단 우선
  const block = blocks.find((p) => matchPattern(p.pattern, rawUrl, host));
  if (block) return { allowed: false, reason: '차단 정책', category: block.category || undefined };

  // 2) 허용 목록이 하나라도 있으면 화이트리스트 모드 — 매칭 안되면 차단
  if (allows.length > 0) {
    const allow = allows.find((p) => matchPattern(p.pattern, rawUrl, host));
    if (!allow) return { allowed: false, reason: '화이트리스트 외 사이트' };
  }
  return { allowed: true };
}

function matchPattern(pattern, url, host) {
  const p = pattern.toLowerCase();
  const u = (url || '').toLowerCase();
  const h = (host || '').toLowerCase();
  if (p === '*') return true;
  // 도메인/서브도메인 매칭 또는 부분 문자열 매칭
  return h === p || h.endsWith('.' + p) || u.includes(p);
}

// ── 파일 정책 ─────────────────────────────────────────────────
export function listFilePolicies() {
  return db.prepare('SELECT * FROM file_policies ORDER BY direction, ext').all();
}
export function addFilePolicy({ direction, ext, action }) {
  const info = db
    .prepare('INSERT INTO file_policies (direction, ext, action) VALUES (?, ?, ?)')
    .run(direction, ext.toLowerCase().replace(/^\./, ''), action);
  regenerateManagedPolicy();
  return db.prepare('SELECT * FROM file_policies WHERE id = ?').get(info.lastInsertRowid);
}
export function deleteFilePolicy(id) {
  db.prepare('DELETE FROM file_policies WHERE id = ?').run(id);
  regenerateManagedPolicy();
}
/** 확장자에 대한 정책 결정: allow | block | cdr */
export function evaluateFile(direction, filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const rules = db
    .prepare('SELECT * FROM file_policies WHERE enabled = 1 AND direction = ?')
    .all(direction);
  const exact = rules.find((r) => r.ext === ext);
  if (exact) return exact.action;
  const wild = rules.find((r) => r.ext === '*');
  return wild ? wild.action : 'allow';
}

// ── 설정 (워터마크/클립보드 등) ───────────────────────────────
const DEFAULT_SETTINGS = {
  watermark_enabled: 'true',
  watermark_text: '{username} · {datetime} · RBI', // 토큰 치환
  watermark_opacity: '0.12',
  clipboard_pc_to_rb: 'allow', // allow | block
  clipboard_rb_to_pc: 'block', // 기본: 격리→로컬 붙여넣기 차단(유출 방지)
};
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}
export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
  if (key.startsWith('clipboard')) regenerateManagedPolicy();
}

// ── Chromium Managed Policy 생성 ──────────────────────────────
// 격리 브라우저(rbcloud-browser)가 /etc/chromium/policies/managed/policy.json 으로 마운트.
export function regenerateManagedPolicy() {
  const policies = db.prepare('SELECT * FROM url_policies WHERE enabled = 1').all();
  const allowlist = policies.filter((p) => p.action === 'allow').map((p) => p.pattern);
  const blocklist = policies.filter((p) => p.action === 'block').map((p) => p.pattern);

  const dl = db.prepare("SELECT * FROM file_policies WHERE enabled = 1 AND direction = 'download'").all();
  const hasBlockedDownload = dl.some((r) => r.action === 'block');

  const clipRbToPc = getSetting('clipboard_rb_to_pc'); // block 이면 복사 제한

  const managed = {
    // URL 접속 통제
    URLAllowlist: allowlist,
    URLBlocklist: blocklist,
    // 다운로드 통제: 0=허용, 2=위험 차단, 3=모든 다운로드 차단
    DownloadRestrictions: hasBlockedDownload ? 3 : 0,
    // 격리 브라우저 안내 화면 단순화
    HomepageLocation: config.rbcloud.homepage,
    BookmarkBarEnabled: false,
    BrowserSignin: 0,
    SyncDisabled: true,
    PasswordManagerEnabled: false,
    DefaultClipboardSetting: clipRbToPc === 'block' ? 2 : 1, // 2=차단, 1=허용
    // 자동 PDF 열기(증명서 발급 등 인쇄 지원)
    AlwaysOpenPdfExternally: false,
  };

  fs.mkdirSync(config.policyDir, { recursive: true });
  const file = path.join(config.policyDir, 'policy.json');
  fs.writeFileSync(file, JSON.stringify(managed, null, 2), 'utf8');
  logger.info({ allow: allowlist.length, block: blocklist.length }, 'managed policy 재생성');
  return managed;
}

export default {
  listUrlPolicies, addUrlPolicy, updateUrlPolicy, deleteUrlPolicy, evaluateUrl,
  listFilePolicies, addFilePolicy, deleteFilePolicy, evaluateFile,
  getSetting, getAllSettings, setSetting, regenerateManagedPolicy,
};
