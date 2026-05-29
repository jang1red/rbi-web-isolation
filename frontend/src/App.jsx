import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { me } from './api.js';
import Login from './pages/Login.jsx';
import Workspace from './pages/Workspace.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined=로딩, null=비로그인

  useEffect(() => {
    me().then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="center muted">로딩 중…</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={setUser} />} />
      <Route path="/" element={user ? <Workspace user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" />} />
      <Route
        path="/admin"
        element={
          user?.role === 'admin' ? <Admin user={user} /> : <Navigate to={user ? '/' : '/login'} />
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
