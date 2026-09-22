// @ts-check
// 재화 시세 (엘리 단가) — 스펙업 방향 분석에서 시스템별 1회 비용을 엘리로 통일하는 데 쓴다.
//
// 시세는 계정·캐릭터와 무관한 시장 값이라 localStorage 에 하나만 둔다.
// 기본값은 2026-09-11 사용자 제공 시세.

import { ref, watch } from 'vue';

const STORAGE_KEY = 'latale.prices.v1';

/** 기본 시세의 기준일 — 화면에 표시해 "언제 시세인지" 를 알린다 */
export const PRICE_DEFAULTS_DATE = '2026-09-11';

export const PRICE_DEFS = Object.freeze([
  { key: 'awakMaterial', label: '최종 인던 재료 (1개)', unit: '개', defaultEly: 2_500_000, note: '2,000개당 50억 기준' },
  { key: 'hammer',       label: '플래티넘 망치 (1개)',  unit: '개', defaultEly: 150_000_000 },
  { key: 'memoFrag',     label: '메모리얼 파편 (1개)',  unit: '개', defaultEly: 50_000_000 },
  { key: 'memoCrystal',  label: '초기화 결정 (1개)',    unit: '개', defaultEly: 40_000_000 },
  { key: 'runeScroll',   label: '룬워드 스크롤 (1개)',  unit: '개', defaultEly: 150_000_000 },
]);

function defaults() {
  const out = {};
  for (const d of PRICE_DEFS) out[d.key] = d.defaultEly;
  return out;
}

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    for (const k of Object.keys(base)) {
      const v = Number(saved?.[k]);
      if (Number.isFinite(v) && v >= 0) base[k] = v;
    }
  } catch {
    /* localStorage 불가 환경 — 기본값 사용 */
  }
  return base;
}

// 모듈 전역 — 어디서 호출해도 같은 시세를 본다.
const prices = ref(load());

watch(
  prices,
  (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    } catch {
      /* 저장 실패는 무시 */
    }
  },
  { deep: true },
);

export function usePrices() {
  function resetPrices() {
    prices.value = defaults();
  }
  /** costItems: [{ key, count }] → 엘리 합계 */
  function elyFor(costItems) {
    let sum = 0;
    for (const it of costItems || []) sum += (Number(prices.value[it.key]) || 0) * (Number(it.count) || 0);
    return sum;
  }
  return { prices, resetPrices, elyFor };
}
