// 장착 룬워드 데이터 헬퍼 — App.vue / RuneWordLoadoutPanel / 스펙업 방향 분석이 공유.
//
// 저장 형식: 룬 id 8개 배열 (index 7 = 왕룬), 빈 칸은 null. 예: [10, 19, null, …, 28]

import { RUNES, RUNE_SLOTS } from '../data/runeWordData.js';

export function makeEmptyRuneword() {
  return Array.from({ length: RUNE_SLOTS }, () => null);
}

/** 저장 데이터 정규화 — 길이 8 · 유효 id 만 · 중복 제거(게임 규칙: 같은 룬 두 번 없음) */
export function sanitizeRuneword(arr) {
  const out = makeEmptyRuneword();
  if (!Array.isArray(arr)) return out;
  const seen = new Set();
  for (let i = 0; i < RUNE_SLOTS; i += 1) {
    const id = Number(arr[i]);
    if (!Number.isInteger(id) || !RUNES[id] || seen.has(id)) continue;
    seen.add(id);
    out[i] = id;
  }
  return out;
}

/** 장착 칸 수 (null 제외) */
export function runewordFilledCount(arr) {
  return (arr || []).filter((id) => id !== null && id !== undefined).length;
}

/**
 * 저장 배열 → runeWordSim.buildResult 와 같은 모양의 rows (isKing 포함).
 * 빈 칸은 건너뛴다. 정규화 어댑터(normalizeRuneWordCard)가 이 rows 를 받는다.
 */
export function runewordRows(arr) {
  const rows = [];
  (arr || []).forEach((id, i) => {
    if (id === null || id === undefined || !RUNES[id]) return;
    rows.push({ runeId: id, isKing: i === RUNE_SLOTS - 1, name: RUNES[id].name });
  });
  return rows;
}
