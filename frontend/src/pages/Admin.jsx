// 관리자 콘솔 — 사용자, URL 정책, 파일 정책, 워터마크/클립보드 설정, 감사 로그.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { admin } from '../api.js';

const TABS = [
  ['users', '사용자'],
  ['url', 'URL 정책'],
  ['file', '파일 정책'],
  ['settings', '워터마크·클립보드'],
  ['audit', '감사 로그'],
];

export default function Admin() {
  const nav = useNavigate();
  const [tab, setTab] = useState('users');
  return (
    <div className="admin">
      <header className="admin-top">
        <h1>🛡️ RBI 관리자 콘솔</h1>
        <button className="ghost" onClick={() => nav('/')}>워크스페이스로</button>
      </header>
      <nav className="admin-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      <main className="admin-body">
        {tab === 'users' && <Users />}
        {tab === 'url' && <UrlPolicies />}
        {tab === 'file' && <FilePolicies />}
        {tab === 'settings' && <Settings />}
        {tab === 'audit' && <Audit />}
      </main>
    </div>
  );
}

function useList(loader, deps = []) {
  const [rows, setRows] = useState([]);
  const reload = () => loader().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, deps); // eslint-disable-line
  return [rows, reload];
}

function Users() {
  const [rows, reload] = useList(admin.users);
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  const add = async () => {
    if (!form.username || !form.password) return;
    await admin.addUser(form); setForm({ username: '', password: '', role: 'user' }); reload();
  };
  return (
    <section>
      <div className="row">
        <input placeholder="아이디" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder="초기 비밀번호" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="user">user</option><option value="admin">admin</option>
        </select>
        <button onClick={add}>사용자 추가</button>
      </div>
      <table>
        <thead><tr><th>아이디</th><th>역할</th><th>MFA</th><th>상태</th><th></th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td><td>{u.role}</td>
              <td>{u.mfa_enabled ? '✅' : '—'}</td>
              <td>{u.disabled ? '🚫 비활성' : '활성'}</td>
              <td className="actions">
                <button className="ghost" onClick={() => admin.updateUser(u.id, { disabled: !u.disabled }).then(reload)}>
                  {u.disabled ? '활성화' : '비활성화'}
                </button>
                <button className="danger ghost" onClick={() => confirm(`${u.username} 삭제?`) && admin.delUser(u.id).then(reload)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UrlPolicies() {
  const [rows, reload] = useList(admin.urlPolicies);
  const [form, setForm] = useState({ pattern: '', action: 'block', category: '' });
  const add = async () => {
    if (!form.pattern) return;
    await admin.addUrlPolicy(form); setForm({ pattern: '', action: 'block', category: '' }); reload();
  };
  return (
    <section>
      <p className="muted">차단이 허용보다 우선. 허용 항목이 하나라도 있으면 <b>화이트리스트 모드</b>로 동작합니다.</p>
      <div className="row">
        <input placeholder="패턴 (예: naver.com)" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
        <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
          <option value="block">차단</option><option value="allow">허용</option>
        </select>
        <input placeholder="카테고리(선택)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <button onClick={add}>정책 추가</button>
      </div>
      <table>
        <thead><tr><th>패턴</th><th>동작</th><th>카테고리</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.pattern}</td>
              <td><span className={`badge ${p.action}`}>{p.action === 'block' ? '차단' : '허용'}</span></td>
              <td>{p.category || '—'}</td>
              <td className="actions"><button className="danger ghost" onClick={() => admin.delUrlPolicy(p.id).then(reload)}>삭제</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FilePolicies() {
  const [rows, reload] = useList(admin.filePolicies);
  const [form, setForm] = useState({ direction: 'download', ext: '', action: 'block' });
  const add = async () => {
    if (!form.ext) return;
    await admin.addFilePolicy(form); setForm({ direction: 'download', ext: '', action: 'block' }); reload();
  };
  return (
    <section>
      <p className="muted">CDR = 콘텐츠 무해화 후 전달. exe/bat 등 실행파일은 차단 권장.</p>
      <div className="row">
        <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
          <option value="download">다운로드</option><option value="upload">업로드</option>
        </select>
        <input placeholder="확장자 (예: pdf, exe, *)" value={form.ext} onChange={(e) => setForm({ ...form, ext: e.target.value })} />
        <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
          <option value="block">차단</option><option value="allow">허용</option><option value="cdr">CDR</option>
        </select>
        <button onClick={add}>정책 추가</button>
      </div>
      <table>
        <thead><tr><th>방향</th><th>확장자</th><th>동작</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.direction === 'download' ? '다운로드' : '업로드'}</td>
              <td>.{p.ext}</td>
              <td><span className={`badge ${p.action}`}>{p.action.toUpperCase()}</span></td>
              <td className="actions"><button className="danger ghost" onClick={() => admin.delFilePolicy(p.id).then(reload)}>삭제</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => { admin.settings().then(setS); }, []);
  if (!s) return <div className="muted">로딩…</div>;
  const upd = (k, v) => setS({ ...s, [k]: v });
  const save = () => admin.saveSettings(s).then(setS).then(() => alert('저장됨'));
  return (
    <section className="settings">
      <label className="check">
        <input type="checkbox" checked={s.watermark_enabled === 'true'}
               onChange={(e) => upd('watermark_enabled', e.target.checked ? 'true' : 'false')} />
        워터마크 사용
      </label>
      <label>워터마크 텍스트 <small className="muted">({'{username}'}, {'{datetime}'} 토큰 사용 가능)</small>
        <input value={s.watermark_text} onChange={(e) => upd('watermark_text', e.target.value)} />
      </label>
      <label>워터마크 투명도 (0~1)
        <input type="number" step="0.01" min="0" max="1" value={s.watermark_opacity}
               onChange={(e) => upd('watermark_opacity', e.target.value)} />
      </label>
      <label>클립보드 PC → 격리(붙여넣기)
        <select value={s.clipboard_pc_to_rb} onChange={(e) => upd('clipboard_pc_to_rb', e.target.value)}>
          <option value="allow">허용</option><option value="block">차단</option>
        </select>
      </label>
      <label>클립보드 격리 → PC(복사·유출)
        <select value={s.clipboard_rb_to_pc} onChange={(e) => upd('clipboard_rb_to_pc', e.target.value)}>
          <option value="block">차단(권장)</option><option value="allow">허용</option>
        </select>
      </label>
      <button onClick={save}>설정 저장</button>
    </section>
  );
}

function Audit() {
  const [type, setType] = useState('');
  const [rows, reload] = useList(() => admin.audit(type ? `?type=${type}&limit=300` : '?limit=300'), [type]);
  return (
    <section>
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">전체</option>
          {['login', 'login-fail', 'navigate', 'blocked', 'download', 'upload', 'clipboard', 'admin', 'wipe'].map((t) =>
            <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="ghost" onClick={reload}>새로고침</button>
      </div>
      <table className="audit">
        <thead><tr><th>시각</th><th>유형</th><th>사용자</th><th>IP</th><th>상세</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="nowrap">{r.ts}</td>
              <td><span className={`badge t-${r.type}`}>{r.type}</span></td>
              <td>{r.username || '—'}</td>
              <td className="nowrap">{r.ip || '—'}</td>
              <td className="detail">{r.detail ? JSON.stringify(r.detail) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
