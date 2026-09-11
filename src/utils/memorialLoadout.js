// 보유 메모리얼 카드 데이터 헬퍼 — App.vue / MemorialLoadoutPanel / 스펙업 방향 분석이 공유.
//
// 카드 1장 = { key: ALL_MEMORIALS 의 키, lines: [{ label: 베이스 라벨, value }, ...] }
//   label 은 티어 prefix 가 없는 베이스 라벨("근력/마법력", "최종 크리티컬 대미지")이다.
//   rollEquiv.normalizeMemorialCard 가 baseLabelOf() 로 한 번 더 벗기므로 그대로 넘겨도 된다.

import { ALL_MEMORIALS } from '../data/memorialProbabilities.js';

export const MEMORIAL_CARD_LINES = 4;
export const MEMORIAL_CARD_MAX = 12;
export const DEFAULT_MEMORIAL_KEY = 'CHOENPAM_SET';

export function makeEmptyMemorialCard(key = DEFAULT_MEMORIAL_KEY) {
  return {
    key,
    lines: Array.from({ length: MEMORIAL_CARD_LINES }, () => ({ label: '', value: '' })),
  };
}

/** 옵션이 선택되고 값이 양수인 줄만 — 환산·분석 입력용 */
export function activeMemorialLines(card) {
  return (card?.lines || [])
    .filter((l) => l.label && Number(l.value) > 0)
    .map((l) => ({ label: l.label, value: Number(l.value) }));
}

/** 카드의 메모리얼 정의. 키가 데이터에 없으면(구버전 저장 등) null. */
export function memorialOf(card) {
  return ALL_MEMORIALS[card?.key] || null;
}

/** 저장 데이터 정규화 — 서버/로컬에서 온 배열이 형식에 어긋나도 UI 가 깨지지 않게 한다. */
export function sanitizeMemorialCards(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && ALL_MEMORIALS[c.key])
    .slice(0, MEMORIAL_CARD_MAX)
    .map((c) => {
      const lines = Array.isArray(c.lines) ? c.lines : [];
      const fixed = Array.from({ length: MEMORIAL_CARD_LINES }, (_, i) => ({
        label: typeof lines[i]?.label === 'string' ? lines[i].label : '',
        value: lines[i]?.value ?? '',
      }));
      return { key: c.key, lines: fixed };
    });
}
