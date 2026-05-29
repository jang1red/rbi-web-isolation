import { useState } from 'react';
import { login, changePassword } from '../api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(null); // 비밀번호 변경 강제 시 user
  const [newPw, setNewPw] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await login(username, password, mfaToken || undefined);
      if (res.mustChangePassword) {
        setChanging(res.user);
      } else {
        onLogin(res.user);
      }
    } catch (e2) {
      if (e2.data?.mfaRequired) { setMfaRequired(true); setErr(e2.message); }
      else setErr(e2.message);
    } finally { setBusy(false); }
  }

  async function doChange(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await changePassword(newPw);
      onLogin(changing);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  if (changing) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={doChange}>
          <div className="brand">🛡️ RBI 웹 격리</div>
          <p className="muted">초기 비밀번호입니다. 새 비밀번호로 변경하세요.</p>
          <input type="password" placeholder="새 비밀번호 (8자 이상)" value={newPw}
                 onChange={(e) => setNewPw(e.target.value)} autoFocus />
          {err && <div className="error">{err}</div>}
          <button disabled={busy || newPw.length < 8}>변경하고 시작</button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">🛡️ RBI 웹 격리</div>
        <p className="muted">격리된 원격 브라우저로 안전하게 인터넷을 사용합니다.</p>
        <input placeholder="아이디" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mfaRequired && (
          <input placeholder="MFA 6자리 코드" value={mfaToken} inputMode="numeric"
                 onChange={(e) => setMfaToken(e.target.value)} />
        )}
        {err && <div className="error">{err}</div>}
        <button disabled={busy || !username || !password}>{busy ? '확인 중…' : '로그인'}</button>
        <div className="muted small">Zero-Trust · 모든 접속은 검증·기록됩니다</div>
      </form>
    </div>
  );
}
