import { useState } from 'react';
import { login } from '../api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await login(username, password, mfaToken || undefined);
      // 비밀번호 변경 강제 제거 — 변경은 관리자 콘솔에서 가능. 바로 진입.
      onLogin(res.user);
    } catch (e2) {
      if (e2.data?.mfaRequired) { setMfaRequired(true); setErr(e2.message); }
      else setErr(e2.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/rbcloud-logo.svg" alt="RBCloud" className="brand-logo" />
        <p className="muted">격리된 원격 브라우저로 안전하게 인터넷을 사용합니다.</p>
        <input placeholder="아이디" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mfaRequired && (
          <input placeholder="MFA 6자리 코드" value={mfaToken} inputMode="numeric"
                 onChange={(e) => setMfaToken(e.target.value)} />
        )}
        {err && <div className="error">{err}</div>}
        <button disabled={busy || !username || !password}>{busy ? '전용 격리 브라우저 준비 중…' : '로그인'}</button>
        <div className="muted small">Zero-Trust · 사용자별 독립 컨테이너 · 모든 접속 기록</div>
      </form>
    </div>
  );
}
