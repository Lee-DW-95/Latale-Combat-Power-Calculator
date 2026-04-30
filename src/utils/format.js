/**
 * 공통 포맷터 — UI 컴포넌트 간 중복 제거용.
 *
 * 컴포넌트별로 fmt/pct/signed 등이 산발적으로 정의돼 있던 것을 통합.
 * 동작 호환성 위해 기존 시그니처 그대로 유지.
 */

// 한국어 로케일 천단위 콤마 (정수 또는 소수 그대로). null/undefined → "0".
export const fmt = (n) => Number(n ?? 0).toLocaleString('ko-KR');

// 반올림 후 천단위 콤마 (전투력 등 정수 표시 전용).
export const fmtRound = (n) => Math.round(Number(n ?? 0)).toLocaleString('ko-KR');

// 소수 1자리. 유한수가 아니면 "0".
export const fmt1 = (n) =>
  Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '0';

// 비율(0~1)을 "%로 1자리". 예: 0.523 → "52.3%".
export const pct = (p) => (p * 100).toFixed(1) + '%';

// 메모리얼 시뮬 등 매우 작은 확률용. 1% 이상은 2자리, 0.01% 이상은 4자리, 그 미만은 지수표기.
export const pctSmart = (p) => {
  if (p >= 0.01) return (p * 100).toFixed(2) + '%';
  if (p >= 0.0001) return (p * 100).toFixed(4) + '%';
  return (p * 100).toExponential(2) + '%';
};

// 부호 붙은 천단위 표시. 양수면 +, 음수면 -. 0이면 "0".
export const signed = (n) => {
  const v = Number(n ?? 0);
  if (v > 0) return `+${fmt(v)}`;
  return fmt(v);
};

// 무한대 처리하는 정수 표시 — 시뮬 결과에서 mean=∞ 같은 케이스용.
export const fmtInf = (n) => {
  if (!Number.isFinite(Number(n))) return '∞';
  return fmt(n);
};
