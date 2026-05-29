// 인포바 — 소개서의 "인포바를 통한 안전 브라우징", "격리 환경 내 사이트 이동이 가능한 전용 주소창".
// 실제 브라우저 크롬(주소창)은 격리 컨테이너 안에 숨겨지고, 사용자는 이 전용 주소창만 사용.
// 입력한 URL 은 게이트웨이 정책 평가를 거쳐 원격 브라우저로 전달됨.
import { useState, useEffect } from 'react';
import { navigate, currentUrl, navBack, navForward, navReload } from '../api.js';

export default function Infobar({ user, onLogout, onOpenAdmin }) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState({ type: 'idle', msg: '' });
  const [cdp, setCdp] = useState(true);

  // 현재 URL 주기적 동기화
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { url, cdp } = await currentUrl();
        if (alive) { setCdp(cdp); if (url && document.activeElement?.id !== 'infobar-input') setInput(url); }
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  async function go(e) {
    e?.preventDefault();
    if (!input.trim()) return;
    setStatus({ type: 'loading', msg: '이동 중…' });
    try {
      const res = await navigate(input.trim());
      if (res.degraded) setStatus({ type: 'warn', msg: 'CDP 미연결 — 정책 평가만 수행됨' });
      else setStatus({ type: 'ok', msg: '격리 브라우저로 이동' });
    } catch (e2) {
      if (e2.status === 403) {
        const cat = e2.data?.category ? ` (${e2.data.category})` : '';
        setStatus({ type: 'blocked', msg: `🚫 차단됨: ${e2.data?.reason || '정책'}${cat}` });
      } else setStatus({ type: 'error', msg: e2.message });
    }
  }

  const act = (fn) => async () => { try { await fn(); } catch { /* ignore */ } };

  return (
    <div className="infobar">
      <div className="infobar-nav">
        <button title="뒤로" onClick={act(navBack)}>◀</button>
        <button title="앞으로" onClick={act(navForward)}>▶</button>
        <button title="새로고침" onClick={act(navReload)}>⟳</button>
      </div>
      <form className="infobar-url" onSubmit={go}>
        <span className="lock" title={cdp ? '격리 세션 활성' : 'CDP 미연결'}>{cdp ? '🔒' : '⚠️'}</span>
        <input id="infobar-input" value={input} placeholder="URL 또는 검색어 입력 (격리 환경에서 열림)"
               onChange={(e) => setInput(e.target.value)} spellCheck={false} />
        <button type="submit">이동</button>
      </form>
      <div className={`infobar-status ${status.type}`}>{status.msg}</div>
      <div className="infobar-right">
        <span className="who" title="현재 사용자">👤 {user.username}</span>
        {user.role === 'admin' && <button className="ghost" onClick={onOpenAdmin}>관리자</button>}
        <button className="danger" onClick={onLogout}>종료</button>
      </div>
    </div>
  );
}
