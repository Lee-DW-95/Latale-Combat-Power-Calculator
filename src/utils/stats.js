/**
 * 몬테카를로 시뮬 결과 통계 유틸.
 *
 * enchantSim.js 안에서 computeNormalStats / computeTargetStats 가
 * 같은 sortNum / quantile / mean 을 두 번씩 정의하던 것 통합.
 */

// 숫자 배열 오름차순 정렬 사본.
export const sortNum = (a) => [...a].sort((x, y) => x - y);

// 정렬된 배열에서 분위수 q (0~1) 위치 값. 빈 배열은 0.
export const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
};

// 산술 평균. 빈 배열은 0.
export const mean = (a) =>
  a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
