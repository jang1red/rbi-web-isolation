// 게이트웨이 API 클라이언트 (쿠키 기반 인증).
async function req(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { status: res.status, data });
  return data;
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b),
  put: (p, b) => req('PUT', p, b),
  del: (p) => req('DELETE', p),
};

// 인증
export const login = (username, password, mfaToken) =>
  api.post('/auth/login', { username, password, mfaToken });
export const logout = () => api.post('/auth/logout');
export const me = () => api.get('/auth/me');
export const changePassword = (newPassword) => api.post('/auth/change-password', { newPassword });
export const mfaEnroll = () => api.post('/auth/mfa/enroll');
export const mfaConfirm = (token) => api.post('/auth/mfa/confirm', { token });

// 세션/워크스페이스
export const workspace = () => api.get('/session/workspace');
export const navigate = (url) => api.post('/session/navigate', { url });
export const currentUrl = () => api.get('/session/current');
export const navBack = () => api.post('/session/back');
export const navForward = () => api.post('/session/forward');
export const navReload = () => api.post('/session/reload');
export const wipe = () => api.post('/session/wipe');
export const clipboardEvent = (direction, length) =>
  api.post('/session/clipboard-event', { direction, length });

// 관리자
export const admin = {
  users: () => api.get('/admin/users'),
  addUser: (b) => api.post('/admin/users', b),
  updateUser: (id, b) => api.patch(`/admin/users/${id}`, b),
  delUser: (id) => api.del(`/admin/users/${id}`),
  urlPolicies: () => api.get('/admin/url-policies'),
  addUrlPolicy: (b) => api.post('/admin/url-policies', b),
  delUrlPolicy: (id) => api.del(`/admin/url-policies/${id}`),
  filePolicies: () => api.get('/admin/file-policies'),
  addFilePolicy: (b) => api.post('/admin/file-policies', b),
  delFilePolicy: (id) => api.del(`/admin/file-policies/${id}`),
  settings: () => api.get('/admin/settings'),
  saveSettings: (b) => api.put('/admin/settings', b),
  audit: (q = '') => api.get(`/admin/audit${q}`),
};
