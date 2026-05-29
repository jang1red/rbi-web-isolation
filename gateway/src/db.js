// SQLite 데이터 계층 (별도 DB 서버 없이 단일 파일). 운영 확장 시 Postgres 로 교체 가능.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
  mfa_secret    TEXT,
  mfa_enabled   INTEGER NOT NULL DEFAULT 0,
  -- Zero-Trust 조건부 접근: 허용 시간/네트워크 등 (JSON)
  conditions    TEXT NOT NULL DEFAULT '{}',
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_ip   TEXT,
  user_agent  TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT
);

-- URL 정책: 허용/차단 목록 + 유해 카테고리
CREATE TABLE IF NOT EXISTS url_policies (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern   TEXT NOT NULL,                  -- Chromium URL filter 형식 (예: example.com, ||ads.*)
  action    TEXT NOT NULL,                  -- 'allow' | 'block'
  category  TEXT,                           -- 'gambling','malware','adult',... (선택)
  enabled   INTEGER NOT NULL DEFAULT 1,
  note      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 파일 업로드/다운로드 정책
CREATE TABLE IF NOT EXISTS file_policies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  direction  TEXT NOT NULL,                 -- 'download' | 'upload'
  ext        TEXT NOT NULL,                 -- 확장자 (예: exe, pdf, *)
  action     TEXT NOT NULL,                 -- 'allow' | 'block' | 'cdr'
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 시스템 전역 설정 (워터마크, 클립보드 등)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 감사 로그: 모든 행위 기록 ("상세 로그 제공")
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  user_id    TEXT,
  username   TEXT,
  session_id TEXT,
  type       TEXT NOT NULL,                 -- 'login','navigate','blocked','download','upload','clipboard',...
  detail     TEXT,                          -- JSON
  ip         TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
`);

export default db;
