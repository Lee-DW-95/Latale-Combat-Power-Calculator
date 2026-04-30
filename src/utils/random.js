/**
 * 공통 랜덤 유틸 — 메모리얼/인챈트 시뮬에서 동일하게 쓰이던 함수 통합.
 */

// [lo, hi] 정수 균등 분포.
export function rollInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// [lo, hi] 균등 분포. step 1 미만이면 step 단위로 균등 (소수 첫째자리 보정).
//   예: rollValue(0.1, 5.1, 0.1) → 0.1, 0.2, ..., 5.1 중 하나
//   step 미지정/1 이상이면 정수 균등.
export function rollValue(lo, hi, step) {
  if (!step || step >= 1) return rollInt(lo, hi);
  const n = Math.round((hi - lo) / step) + 1;
  const i = Math.floor(Math.random() * n);
  const v = lo + i * step;
  return Math.round(v * 10) / 10;
}
