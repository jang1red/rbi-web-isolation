// 워크스페이스 — 격리 브라우저 화면(RBCloud Browser WebRTC) + 인포바 + 워터마크.
// 사용자는 로컬에 아무것도 설치하지 않고, 화면 스트림만 보고 조작합니다.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Infobar from '../components/Infobar.jsx';
import Watermark from '../components/Watermark.jsx';
import { workspace, logout, wipe, clipboardEvent } from '../api.js';

// RBCloud Browser 임베드 URL. 메뉴/툴바를 숨기고 화면만 표시.
const RBCLOUD_SRC = '/rbcloud/';

export default function Workspace({ user, onLogout }) {
  const nav = useNavigate();
  const [ws, setWs] = useState(null);

  useEffect(() => {
    workspace().then(setWs).catch(() => {});
  }, []);

  // 클립보드 행위 감사 (RB→PC 유출 추적). 실제 차단은 Chromium 관리정책에서 강제.
  useEffect(() => {
    const onCopy = (e) => {
      const len = (e.clipboardData?.getData('text') || '').length;
      clipboardEvent('rb-to-pc', len).then((r) => {
        if (!r.allowed) { e.preventDefault(); alert('격리 환경에서 로컬로의 복사가 정책상 차단되었습니다.'); }
      }).catch(() => {});
    };
    const onPaste = (e) => {
      const len = (e.clipboardData?.getData('text') || '').length;
      clipboardEvent('pc-to-rb', len).catch(() => {});
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste); };
  }, []);

  async function handleLogout() {
    try { await wipe(); } catch { /* best-effort */ }
    try { await logout(); } catch { /* ignore */ }
    onLogout();
    nav('/login');
  }

  return (
    <div className="workspace">
      <Infobar user={user} onLogout={handleLogout} onOpenAdmin={() => nav('/admin')} />
      <div className="screen">
        <iframe
          title="RBCloud 격리 브라우저"
          src={RBCLOUD_SRC}
          allow="autoplay; clipboard-read; clipboard-write; microphone; camera; display-capture"
          className="rbcloud-frame"
        />
        {ws?.watermark?.enabled && (
          <Watermark text={ws.watermark.text} opacity={ws.watermark.opacity} />
        )}
      </div>
    </div>
  );
}
