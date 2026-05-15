// 백엔드 통신 단일 fetch 래퍼.
// - VITE_API_BASE 환경변수로 base URL 결정 (개발/운영 분리).
// - 토큰 보관 핸들러를 외부에서 주입 (순환 의존 방지 — useAuth 가 setAuthHandler 로 등록).
// - 401 응답 시 자동 로그아웃 (토큰 만료/위변조 케이스).

const BASE_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '');

let _getToken = () => null;
let _onUnauthorized = () => {};

export function setAuthHandler({ getToken, onUnauthorized }) {
  if (typeof getToken === 'function') _getToken = getToken;
  if (typeof onUnauthorized === 'function') _onUnauthorized = onUnauthorized;
}

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = _getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    // 네트워크 단계 실패 (서버 미기동, DNS 실패, CORS 거부 등).
    throw new ApiError('서버에 연결할 수 없습니다.', { status: 0, body: { reason: err.message } });
  }

  if (response.status === 204) return null;

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) _onUnauthorized();
    const msg =
      (payload && (payload.detail || payload.message)) ||
      `요청 실패 (${response.status})`;
    throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), {
      status: response.status,
      body: payload,
    });
  }

  return payload;
}

export const api = {
  // ── Auth ──
  register: (nickname, password) =>
    request('/auth/register', { method: 'POST', body: { nickname, password } }),

  login: (nickname, password) =>
    request('/auth/login', { method: 'POST', body: { nickname, password } }),

  recover: (nickname, recovery_code, new_password) =>
    request('/auth/recover', {
      method: 'POST',
      body: { nickname, recovery_code, new_password },
    }),

  // ── Characters ──
  listCharacters: () => request('/characters', { auth: true }),

  createCharacter: (data) =>
    request('/characters', { method: 'POST', body: data, auth: true }),

  updateCharacter: (id, data) =>
    request(`/characters/${id}`, { method: 'PUT', body: data, auth: true }),

  deleteCharacter: (id) =>
    request(`/characters/${id}`, { method: 'DELETE', auth: true }),

  // ── Meta ──
  health: () => request('/health'),
};
