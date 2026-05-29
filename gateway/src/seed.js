// 부트스트랩 시드 — 최초 부팅 시 관리자 계정과 기본 정책을 생성.
import db from './db.js';
import config from './config.js';
import { createUser, getUserByName } from './auth.js';
import { addUrlPolicy, addFilePolicy, listUrlPolicies, listFilePolicies } from './policy.js';
import { logger } from './logger.js';

export function ensureBootstrap() {
  // 1) 관리자 계정
  if (!getUserByName(config.bootstrapAdmin)) {
    createUser({ username: config.bootstrapAdmin, password: config.bootstrapPassword, role: 'admin' });
    logger.warn(`기본 관리자 생성: ${config.bootstrapAdmin} / ${config.bootstrapPassword} — 즉시 변경하세요`);
  }

  // 2) 기본 URL 정책 (유해 카테고리 예시 — 차단)
  if (listUrlPolicies().length === 0) {
    const seedBlocks = [
      { pattern: 'doubleclick.net', category: 'ads' },
      { pattern: 'malware.testing.google.test', category: 'malware' },
    ];
    for (const b of seedBlocks) addUrlPolicy({ pattern: b.pattern, action: 'block', category: b.category, note: 'seed' });
    logger.info('기본 URL 차단 정책 시드 완료');
  }

  // 3) 기본 파일 정책 (실행파일 차단, 문서 CDR)
  if (listFilePolicies().length === 0) {
    const seed = [
      { direction: 'download', ext: 'exe', action: 'block' },
      { direction: 'download', ext: 'bat', action: 'block' },
      { direction: 'download', ext: 'js', action: 'block' },
      { direction: 'download', ext: 'pdf', action: 'cdr' },
      { direction: 'download', ext: 'docx', action: 'cdr' },
      { direction: 'upload', ext: 'exe', action: 'block' },
      { direction: 'upload', ext: '*', action: 'cdr' },
    ];
    for (const f of seed) addFilePolicy(f);
    logger.info('기본 파일 정책 시드 완료');
  }
}

// `npm run seed` 로 단독 실행 가능
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  ensureBootstrap();
  logger.info('시드 완료');
  process.exit(0);
}
