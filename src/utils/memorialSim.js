/**
 * 메모리얼 시뮬레이션 — Monte Carlo 기반
 *
 * 핵심 함수:
 *   - simulateUntilTarget(): 1번의 시도 (목표 도달까지 몇 회)
 *   - runMonteCarlo(): N회 반복하여 분포(평균/percentile) 산출
 */

/**
 * 단계별 이산 분포에서 1회 샘플링.
 * @param {Array<{value: number, prob: number}>} dist
 * @returns {number} 샘플링된 값 (0이면 옵션 미등장)
 */
export function sampleOnce(dist) {
  const r = Math.random();
  let cum = 0;
  for (const item of dist) {
    cum += item.prob;
    if (r < cum) return item.value;
  }
  return 0; // 누적 확률 부족분(반올림 오차)이면 0 반환
}

/**
 * 목표값(targetValue) 도달까지 시뮬 반복.
 * 누적값이 target 이상이 되면 종료, 시도 횟수 반환.
 *
 * @param {Array<{value: number, prob: number}>} dist
 * @param {number} targetValue
 * @param {number} maxTries  안전장치 (무한루프 방지)
 * @returns {{ tries: number, finalValue: number }}
 */
export function simulateUntilTarget(dist, targetValue, maxTries = 1_000_000) {
  let acc = 0;
  let tries = 0;
  while (acc < targetValue && tries < maxTries) {
    acc += sampleOnce(dist);
    tries++;
  }
  return { tries, finalValue: acc };
}

/**
 * Monte Carlo: N회 반복 → 분포 통계 산출.
 *
 * @param {Array<{value: number, prob: number}>} dist
 * @param {number} targetValue
 * @param {number} runs  반복 횟수 (기본 10000)
 * @returns {{ runs, mean, median, p25, p50, p75, p90, p99, min, max, samples }}
 */
export function runMonteCarlo(dist, targetValue, runs = 10000) {
  if (targetValue <= 0) {
    return { runs: 0, mean: 0, p50: 0, p90: 0, p99: 0, min: 0, max: 0 };
  }

  const samples = new Array(runs);
  let sum = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateUntilTarget(dist, targetValue);
    samples[i] = r.tries;
    sum += r.tries;
  }
  samples.sort((a, b) => a - b);

  const pct = (p) => samples[Math.min(runs - 1, Math.floor(runs * p))];

  return {
    runs,
    mean: sum / runs,
    p25: pct(0.25),
    p50: pct(0.50),
    p75: pct(0.75),
    p90: pct(0.90),
    p99: pct(0.99),
    min: samples[0],
    max: samples[runs - 1],
    samples,
  };
}

/**
 * 분포의 기대값 (1회당 평균 증가량).
 * 이론치 평균 시도횟수 = targetValue / expectedValue
 */
export function expectedValuePerTry(dist) {
  return dist.reduce((sum, item) => sum + item.value * item.prob, 0);
}

/**
 * 1회 시뮬 결과를 사람이 읽기 쉬운 메시지로 변환.
 * Result 카드용.
 */
export function formatResult(targetValue, mc, options) {
  const ev = expectedValuePerTry(options);
  const theoretical = ev > 0 ? targetValue / ev : Infinity;
  return {
    target: targetValue,
    runs: mc.runs,
    mean: Math.round(mc.mean * 10) / 10,
    p50: mc.p50,
    p90: mc.p90,
    p99: mc.p99,
    min: mc.min,
    max: mc.max,
    theoretical: Math.round(theoretical * 10) / 10,
    expectedPerTry: Math.round(ev * 1000) / 1000,
  };
}
