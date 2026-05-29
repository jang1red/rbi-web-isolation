// 세션/워크스페이스 라우트 — 인포바 네비게이션, 현재 URL, 워터마크/클립보드 설정, 흔적 폐기.
import { Router } from 'express';
import { navigate, currentUrl, goBack, goForward, reload, wipeSession, isCdpAlive } from '../rbcloud.js';
import { getAllSettings, getSetting } from '../policy.js';
import { audit } from '../audit.js';
import { authRequired, clientIp } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authRequired);

function ctx(req) {
  return { user: req.user, sessionId: req.sessionId, ip: clientIp(req) };
}

// 인포바: URL 이동 (정책 평가 포함)
router.post('/navigate', async (req, res) => {
  let { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url 필요' });
  // 스킴 보정 + 검색어 처리
  if (!/^[a-z]+:\/\//i.test(url)) {
    url = url.includes('.') && !url.includes(' ')
      ? `https://${url}`
      : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
  }
  const result = await navigate(url, ctx(req));
  if (result.blocked) return res.status(403).json(result);
  res.json(result);
});

router.get('/current', async (req, res) => {
  res.json({ url: await currentUrl(), cdp: await isCdpAlive() });
});
router.post('/back', async (req, res) => res.json(await goBack()));
router.post('/forward', async (req, res) => res.json(await goForward()));
router.post('/reload', async (req, res) => res.json(await reload()));

// 워크스페이스 부트 정보: 워터마크/클립보드 등 클라이언트 오버레이 설정
router.get('/workspace', (req, res) => {
  const s = getAllSettings();
  const now = new Date();
  const watermarkText = (s.watermark_text || '')
    .replace('{username}', req.user.username)
    .replace('{datetime}', now.toLocaleString('ko-KR'))
    .replace('{date}', now.toLocaleDateString('ko-KR'));
  res.json({
    user: { username: req.user.username, role: req.user.role },
    watermark: {
      enabled: s.watermark_enabled === 'true',
      text: watermarkText,
      opacity: parseFloat(s.watermark_opacity || '0.12'),
    },
    clipboard: {
      pcToRb: s.clipboard_pc_to_rb,
      rbToPc: s.clipboard_rb_to_pc,
    },
  });
});

// 클립보드 행위 감사 (프론트에서 복사/붙여넣기 시도 시 기록)
router.post('/clipboard-event', (req, res) => {
  const { direction, length } = req.body || {};
  const setting = getSetting(direction === 'rb-to-pc' ? 'clipboard_rb_to_pc' : 'clipboard_pc_to_rb');
  const allowed = setting !== 'block';
  audit('clipboard', { ...ctx(req), detail: { direction, length, allowed } });
  res.json({ allowed });
});

// 세션 종료 — 격리 브라우저 흔적 폐기
router.post('/wipe', async (req, res) => {
  const r = await wipeSession();
  res.json(r);
});

export default router;
