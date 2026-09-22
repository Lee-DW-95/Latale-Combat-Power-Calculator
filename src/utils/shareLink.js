// @ts-check
// 공유 링크 — 캐릭터(스탯 + 각성석 + 메모리얼 + 룬워드)를 주소 쿼리(?c=…)에 담아 주고받는다.
//
// 인코딩: JSON → (가능하면) deflate-raw 압축 → base64url. 앞 글자 하나가 형식 표식이다.
//   'z' + base64url(deflate-raw(JSON))  — CompressionStream 이 있는 브라우저
//   'j' + base64url(JSON)               — 폴백
// 스탯 60여 개 + 내실 정보가 압축하면 1 KB 안팎이라 URL 길이 제한(대개 2,000자 이상)에 넉넉하다.

const SHARE_VERSION = 1;

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, StreamCtor, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new StreamCtor(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 공유 payload 만들기 — 저장 형식과 같은 필드만 담는다 (id·시각 등은 제외) */
export function buildSharePayload({ name, stats, awakStones, memorials, runeword }) {
  return {
    v: SHARE_VERSION,
    name: name || '',
    stats: stats || {},
    awak_stones: Array.isArray(awakStones) ? awakStones : [],
    memorials: Array.isArray(memorials) ? memorials : [],
    runeword: Array.isArray(runeword) ? runeword : [],
  };
}

/** payload → 쿼리 값 */
export async function encodeShare(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'function') {
    try {
      const z = await pipe(json, CompressionStream, 'deflate-raw');
      return 'z' + toBase64Url(z);
    } catch {
      /* 압축 실패 시 폴백 */
    }
  }
  return 'j' + toBase64Url(json);
}

/** 쿼리 값 → payload. 형식이 아니면 null */
export async function decodeShare(value) {
  if (!value || typeof value !== 'string' || value.length < 2) return null;
  const kind = value[0];
  const body = value.slice(1);
  try {
    let bytes = fromBase64Url(body);
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') return null;
      bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
    } else if (kind !== 'j') {
      return null;
    }
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || obj.v !== SHARE_VERSION || !obj.stats || typeof obj.stats !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

/** 현재 주소에 ?c=… 를 붙인 공유 URL */
export function shareUrlFor(encoded) {
  const u = new URL(window.location.href);
  u.searchParams.set('c', encoded);
  u.hash = ''; // 공유 링크는 항상 전투력 계산 탭에서 열린다
  return u.toString();
}

/** 주소에서 ?c=… 를 읽고 지운다 (새로고침 때 다시 불러오지 않게) */
export function takeShareParam() {
  if (typeof window === 'undefined') return null;
  const u = new URL(window.location.href);
  const c = u.searchParams.get('c');
  if (!c) return null;
  u.searchParams.delete('c');
  history.replaceState(null, '', u.toString());
  return c;
}
