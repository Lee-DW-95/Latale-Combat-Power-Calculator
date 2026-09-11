// 보유 메모리얼 카드 데이터 헬퍼 — App.vue / MemorialLoadoutPanel / 스펙업 방향 분석이 공유.
//
// 카드 1장 = { key: ALL_MEMORIALS 의 키, variant: 표시 이름 구분(없으면 null), lines: [{ label, value }, ...] }
//   - 세트 메모리얼: 카드 1장 = 옵션 최대 4줄이 한 번에 굴려지는 단위 (lines 길이 4)
//   - 일반 메모리얼: 개별 옵션 슬롯 9개가 각각 따로 굴려진다 (lines 길이 9, 줄 하나 = 슬롯 하나)
//   - variant: 리리/제릴/판도라/아르케는 확률표(LZPA_SET)가 같아 데이터가 하나로 묶여 있지만
//     실제로는 서로 다른 메모리얼이라 카드를 따로 등록해야 한다. 표시 이름만 갈라 준다.
//   label 은 티어 prefix 가 없는 베이스 라벨("근력/마법력", "최종 크리티컬 대미지")이다.
//   rollEquiv.normalizeMemorialCard 가 baseLabelOf() 로 한 번 더 벗기므로 그대로 넘겨도 된다.

import { ALL_MEMORIALS } from '../data/memorialProbabilities.js';

export const SET_CARD_LINES = 4;     // 세트 옵션 최대 줄 수
export const NORMAL_CARD_SLOTS = 9;  // 일반(개별) 옵션 슬롯 수
export const MEMORIAL_CARD_MAX = 24;
export const DEFAULT_MEMORIAL_KEY = 'CHOENPAM_SET';

/** 확률표를 공유하지만 별개 메모리얼인 항목 — 선택 목록에서 갈라 보여준다. */
export const MEMORIAL_VARIANTS = Object.freeze({
  LZPA_SET: ['리리', '제릴', '판도라', '아르케'],
});

export function isNormalMemorialKey(key) {
  return ALL_MEMORIALS[key]?.type === 'normal';
}

/** 카드 종류별 입력 줄 수 — 일반 9 슬롯, 세트 4 줄 */
export function memorialLineCount(key) {
  return isNormalMemorialKey(key) ? NORMAL_CARD_SLOTS : SET_CARD_LINES;
}

/** 표시 이름 — variant 가 있으면 "리리 메모리얼 - 세트" 처럼 앞부분을 바꿔 준다. */
export function memorialDisplayName(key, variant = null) {
  const m = ALL_MEMORIALS[key];
  if (!m) return String(key);
  if (!variant) return m.name;
  // "리리/제릴/판도라/아르케 메모리얼 - 세트" → "리리 메모리얼 - 세트"
  return m.name.replace(/^[^ ]+/, variant);
}

/** 선택 목록 — value 는 "KEY" 또는 "KEY|variant". ALL_MEMORIALS 순서 유지. */
export function memorialChoices() {
  const out = [];
  for (const key of Object.keys(ALL_MEMORIALS)) {
    const variants = MEMORIAL_VARIANTS[key];
    if (variants) {
      for (const v of variants) out.push({ value: `${key}|${v}`, key, variant: v, name: memorialDisplayName(key, v) });
    } else {
      out.push({ value: key, key, variant: null, name: memorialDisplayName(key) });
    }
  }
  return out;
}

export function choiceValueOf(card) {
  return card?.variant ? `${card.key}|${card.variant}` : card?.key;
}

export function parseChoiceValue(value) {
  const [key, variant] = String(value).split('|');
  return { key, variant: variant || null };
}

function emptyLines(n) {
  return Array.from({ length: n }, () => ({ label: '', value: '' }));
}

export function makeEmptyMemorialCard(key = DEFAULT_MEMORIAL_KEY, variant = null) {
  return { key, variant, lines: emptyLines(memorialLineCount(key)) };
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
      const n = memorialLineCount(c.key);
      const lines = Array.isArray(c.lines) ? c.lines : [];
      const fixed = Array.from({ length: n }, (_, i) => ({
        label: typeof lines[i]?.label === 'string' ? lines[i].label : '',
        value: lines[i]?.value ?? '',
      }));
      const allowed = MEMORIAL_VARIANTS[c.key];
      const variant = allowed && allowed.includes(c.variant) ? c.variant : null;
      return { key: c.key, variant, lines: fixed };
    });
}
