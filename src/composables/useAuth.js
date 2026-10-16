// 인증 상태 관리 — 글로벌 ref 로 단일 진실 공급원.
// - 토큰은 localStorage 에 보관 (탭 닫아도 유지).
// - 닉네임은 JWT 에 안 들어있어 별도 보관 (헤더 표시용).
// - API 클라이언트(setAuthHandler) 에 토큰/401 핸들러를 등록 → 모든 인증 요청에 자동 부착.
// - 제한 탭 권한(privileged)은 서버 DB(users.privileged) 기준 — 접속·로그인마다 /auth/me 로 갱신.
//   localStorage 값은 새로고침 직후 탭이 깜빡이지 않게 하는 캐시일 뿐이다.

import { computed, ref } from 'vue';
import { api, setAuthHandler } from '../api/client.js';

const TOKEN_KEY = 'latale.auth.token.v1';
const NICKNAME_KEY = 'latale.auth.nickname.v1';
const PRIVILEGED_KEY = 'latale.auth.privileged.v1';

const token = ref(localStorage.getItem(TOKEN_KEY) || null);
const nickname = ref(localStorage.getItem(NICKNAME_KEY) || null);
const privileged = ref(!!token.value && localStorage.getItem(PRIVILEGED_KEY) === '1');

function setPrivileged(val) {
  privileged.value = !!val;
  if (val) localStorage.setItem(PRIVILEGED_KEY, '1');
  else localStorage.removeItem(PRIVILEGED_KEY);
}

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
  setPrivileged(false);
}

// 서버에서 권한을 다시 읽는다. 네트워크 실패 시엔 캐시를 유지 (401 은 client 가 로그아웃 처리).
async function refreshMe() {
  if (!token.value) return;
  try {
    const me = await api.me();
    setPrivileged(me.privileged);
    if (me.nickname && me.nickname !== nickname.value) persist(token.value, me.nickname);
  } catch {
    /* 서버 미기동 등 — 캐시 값 유지 */
  }
}

// API 클라이언트에 토큰/401 핸들러 1회 등록. 모듈 평가 시 실행 — 어디서든 useAuth() 호출 전부터 동작.
setAuthHandler({
  getToken: () => token.value,
  onUnauthorized: () => logout(),
});

// 새로고침으로 로그인 상태가 복원됐을 때 1회 갱신 — DB 에서 권한을 바꾸면 다음 접속부터 반영된다.
refreshMe();

export function useAuth() {
  const isLoggedIn = computed(() => !!token.value);

  async function register(nick, pw) {
    const res = await api.register(nick.trim(), pw);
    persist(res.token, nick.trim());
    await refreshMe();
    return res; // { token, recovery_code, token_type } — 호출자에게 복구코드 1회 표시 책임.
  }

  async function login(nick, pw) {
    const res = await api.login(nick.trim(), pw);
    persist(res.token, nick.trim());
    await refreshMe();
    return res;
  }

  async function recover(nick, code, newPw) {
    const res = await api.recover(nick.trim(), code.trim(), newPw);
    persist(res.token, nick.trim());
    await refreshMe();
    return res;
  }

  return { token, nickname, privileged, isLoggedIn, register, login, recover, logout, refreshMe };
}
