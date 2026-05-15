// 인증 상태 관리 — 글로벌 ref 로 단일 진실 공급원.
// - 토큰은 localStorage 에 보관 (탭 닫아도 유지).
// - 닉네임은 JWT 에 안 들어있어 별도 보관 (헤더 표시용).
// - API 클라이언트(setAuthHandler) 에 토큰/401 핸들러를 등록 → 모든 인증 요청에 자동 부착.

import { computed, ref } from 'vue';
import { api, setAuthHandler } from '../api/client.js';

const TOKEN_KEY = 'latale.auth.token.v1';
const NICKNAME_KEY = 'latale.auth.nickname.v1';

const token = ref(localStorage.getItem(TOKEN_KEY) || null);
const nickname = ref(localStorage.getItem(NICKNAME_KEY) || null);

function persist(newToken, newNickname) {
  token.value = newToken;
  nickname.value = newNickname;
  if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
  else localStorage.removeItem(TOKEN_KEY);
  if (newNickname) localStorage.setItem(NICKNAME_KEY, newNickname);
  else localStorage.removeItem(NICKNAME_KEY);
}

function logout() {
  persist(null, null);
}

// API 클라이언트에 토큰/401 핸들러 1회 등록. 모듈 평가 시 실행 — 어디서든 useAuth() 호출 전부터 동작.
setAuthHandler({
  getToken: () => token.value,
  onUnauthorized: () => logout(),
});

export function useAuth() {
  const isLoggedIn = computed(() => !!token.value);

  async function register(nick, pw) {
    const res = await api.register(nick.trim(), pw);
    persist(res.token, nick.trim());
    return res; // { token, recovery_code, token_type } — 호출자에게 복구코드 1회 표시 책임.
  }

  async function login(nick, pw) {
    const res = await api.login(nick.trim(), pw);
    persist(res.token, nick.trim());
    return res;
  }

  async function recover(nick, code, newPw) {
    const res = await api.recover(nick.trim(), code.trim(), newPw);
    persist(res.token, nick.trim());
    return res;
  }

  return { token, nickname, isLoggedIn, register, login, recover, logout };
}
