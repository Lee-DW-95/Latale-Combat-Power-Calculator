/**
 * 메모리얼 시뮬레이션 (Monte Carlo 기반)
 *
 * 한 번 굴림 = 1 카드:
 *   1) Qdist 분포로 줄 수 K 결정 (1~4)
 *   2) K개의 줄 각각에 대해 weight 정규화 후 tier 선택
 *   3) 선택된 tier의 [lo, hi] 안에서 정수 균등 분포로 값 결정
 *
 * 시뮬 모드 (사용자 의도): 단일 카드 합 도달
 *   - 한 카드에서 목표 옵션 줄들의 값 합이 목표 ≥ 일 때 성공
 *   - 즉 동일 카드 안에서 같은 옵션이 여러 줄로 떴을 때만 누적
 *   - 카드 간 누적 X (각 카드는 독립 시도)
 *   - Monte Carlo: 평균 몇 회 굴려야 그런 카드를 만나는지
 */

// ============================================================
// 헬퍼
// ============================================================
function rollInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function pickByQdist(qdist) {
  const r = Math.random();
  let acc = 0;
  for (const k of Object.keys(qdist)) {
    acc += qdist[k];
    if (r <= acc) return Number(k);
  }
  const keys = Object.keys(qdist);
  return Number(keys[keys.length - 1]);
}

function pickTierByWeight(tiers) {
  const sumW = tiers.reduce((s, t) => s + t[2], 0);
  const r = Math.random() * sumW;
  let acc = 0;
  for (const t of tiers) {
    acc += t[2];
    if (r <= acc) return t;
  }
  return tiers[tiers.length - 1];
}

// ============================================================
// 한 카드 1회 굴리기 — [{ label, value }, ...]
// ============================================================
export function rollOnce(memorial) {
  const k = pickByQdist(memorial.qdist);
  const lines = [];
  for (let i = 0; i < k; i++) {
    const [lo, hi, , label] = pickTierByWeight(memorial.tiers);
    const value = rollInt(lo, hi);
    lines.push({ label, value });
  }
  return lines;
}

function cardSumOf(lines, targetLabel) {
  let sum = 0;
  for (const line of lines) {
    if (line.label === targetLabel) sum += line.value;
  }
  return sum;
}

// ============================================================
// 1번 시도: 한 카드에서 목표 합 ≥ targetValue 인 카드를 만날 때까지
// ============================================================
export function simulateUntilSingleCardReaches(memorial, targetLabel, targetValue, maxTries = 10_000_000) {
  let tries = 0;
  while (tries < maxTries) {
    const lines = rollOnce(memorial);
    tries++;
    const cardSum = cardSumOf(lines, targetLabel);
    if (cardSum >= targetValue) {
      return { tries, cardSum, winningLines: lines, success: true };
    }
  }
  return { tries: maxTries, cardSum: 0, winningLines: [], success: false };
}

// ============================================================
// Monte Carlo
// ============================================================
export function runMonteCarlo(memorial, targetLabel, targetValue, runs = 10000) {
  if (targetValue <= 0) {
    return { runs: 0, mean: 0, p50: 0, p90: 0, p99: 0, min: 0, max: 0, failureCount: 0 };
  }

  const samples = new Array(runs);
  let sum = 0;
  let failureCount = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateUntilSingleCardReaches(memorial, targetLabel, targetValue);
    samples[i] = r.tries;
    sum += r.tries;
    if (!r.success) failureCount++;
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
    failureCount,
  };
}

// ============================================================
// 단일 카드 성공 확률을 빠르게 추정 (UI 정보용)
// ============================================================
export function estimateSingleCardSuccessRate(memorial, targetLabel, targetValue, samples = 100_000) {
  let success = 0;
  for (let i = 0; i < samples; i++) {
    const lines = rollOnce(memorial);
    if (cardSumOf(lines, targetLabel) >= targetValue) success++;
  }
  return success / samples;
}

// ============================================================
// 라벨 통계 (UI 표시용 — 분포 정보 카드)
// ============================================================
export function perLineLabelProb(memorial, label) {
  const sumW = memorial.tiers.reduce((s, t) => s + t[2], 0);
  const labelW = memorial.tiers
    .filter((t) => t[3] === label)
    .reduce((s, t) => s + t[2], 0);
  return sumW > 0 ? labelW / sumW : 0;
}

export function perLineLabelExpected(memorial, label) {
  const sumW = memorial.tiers.reduce((s, t) => s + t[2], 0);
  if (sumW === 0) return 0;
  let exp = 0;
  for (const [lo, hi, w, lb] of memorial.tiers) {
    if (lb !== label) continue;
    const meanVal = (lo + hi) / 2;
    exp += (w / sumW) * meanVal;
  }
  return exp;
}

export function perCardLabelExpected(memorial, label) {
  const avgLines = Object.entries(memorial.qdist)
    .reduce((s, [k, p]) => s + Number(k) * p, 0);
  return perLineLabelExpected(memorial, label) * avgLines;
}

// ============================================================
// 최대 가능 단일 카드 합 (UI 가이드용)
//   = 4줄 모두 그 라벨, 모두 max tier hi
// ============================================================
export function maxPossibleSingleCard(memorial, label) {
  const tiersOfLabel = memorial.tiers.filter((t) => t[3] === label);
  if (tiersOfLabel.length === 0) return 0;
  const maxLineValue = Math.max(...tiersOfLabel.map((t) => t[1]));
  // qdist 의 최대 줄 수
  const maxK = Math.max(...Object.keys(memorial.qdist).map(Number));
  return maxLineValue * maxK;
}

// ============================================================
// 결과 포맷
// ============================================================
export function formatResult(memorial, targetLabel, targetValue, mc, successRate) {
  const theoretical = successRate > 0 ? 1 / successRate : Infinity;
  return {
    target: targetValue,
    runs: mc.runs,
    mean: Math.round(mc.mean * 10) / 10,
    p50: mc.p50,
    p90: mc.p90,
    p99: mc.p99,
    min: mc.min,
    max: mc.max,
    failureCount: mc.failureCount,
    theoretical: Number.isFinite(theoretical) ? Math.round(theoretical) : Infinity,
    successRate, // 0~1
  };
}
