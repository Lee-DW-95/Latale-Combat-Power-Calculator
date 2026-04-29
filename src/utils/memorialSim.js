/**
 * 메모리얼 시뮬레이션 — latale.info JS 메커니즘 정확 포팅
 *
 * 한 번 굴림 = 1 카드:
 *   1) Qdist 분포로 줄 수 K 결정 (1~4)
 *   2) K개의 줄 각각에 대해:
 *      - 모든 tier weight 합으로 정규화 → cumulative weight로 tier 선택
 *      - 선택된 tier의 [lo, hi] 안에서 정수 균등 분포로 값 결정
 *   3) 한 카드의 결과 = K개의 (label, value) 쌍
 *
 * 사용자 시뮬:
 *   - 목표 옵션 라벨 + 목표 누적값 지정
 *   - 카드를 굴려가며 해당 라벨이 등장하면 값을 누적
 *   - 누적이 목표값에 도달하면 시도 종료
 *   - Monte Carlo로 N회 반복 → 분포 통계
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
  // fallback: 마지막 키
  const keys = Object.keys(qdist);
  return Number(keys[keys.length - 1]);
}

/**
 * 모든 tier weight 합을 정규화해서 하나 선택.
 * latale.info 의 pickTierSet 그대로 포팅.
 */
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
// 한 카드 1회 굴리기
// returns: [{ label, value }, ...]
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

/**
 * 카드 1회 굴림 결과에서 특정 라벨의 값 합 추출.
 */
function extractTargetValue(lines, targetLabel) {
  let sum = 0;
  for (const line of lines) {
    if (line.label === targetLabel) sum += line.value;
  }
  return sum;
}

// ============================================================
// 1번의 시도: 목표 라벨이 누적 targetValue 이상 도달까지 굴림
// ============================================================
export function simulateUntilTarget(memorial, targetLabel, targetValue, maxTries = 1_000_000) {
  let acc = 0;
  let tries = 0;
  while (acc < targetValue && tries < maxTries) {
    const lines = rollOnce(memorial);
    acc += extractTargetValue(lines, targetLabel);
    tries++;
  }
  return { tries, finalValue: acc };
}

/**
 * 위와 동일하나 모든 카드의 모든 줄을 로그로 반환 (UI 상세 표시용).
 * @returns {{ tries, finalValue, log }} log: [{ cardNo, lines, cumulative }]
 */
export function simulateUntilTargetWithLog(memorial, targetLabel, targetValue, maxTries = 1_000_000) {
  let acc = 0;
  let tries = 0;
  const log = [];
  while (acc < targetValue && tries < maxTries) {
    const lines = rollOnce(memorial);
    tries++;
    let addedThisCard = 0;
    for (const line of lines) {
      if (line.label === targetLabel) addedThisCard += line.value;
    }
    acc += addedThisCard;
    log.push({ cardNo: tries, lines, addedThisCard, cumulative: acc });
  }
  return { tries, finalValue: acc, log };
}

// ============================================================
// Monte Carlo: N회 반복 → 분포 통계
// ============================================================
export function runMonteCarlo(memorial, targetLabel, targetValue, runs = 10000) {
  if (targetValue <= 0) {
    return { runs: 0, mean: 0, p50: 0, p90: 0, p99: 0, min: 0, max: 0 };
  }

  const samples = new Array(runs);
  let sum = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateUntilTarget(memorial, targetLabel, targetValue);
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
  };
}

// ============================================================
// 라벨이 한 줄에 등장할 확률 (정규화 후) — UI 표시용
// 한 카드에 여러 줄이라도 라벨 출현 빈도는 줄당 동일.
// ============================================================
export function perLineLabelProb(memorial, label) {
  const sumW = memorial.tiers.reduce((s, t) => s + t[2], 0);
  const labelW = memorial.tiers
    .filter((t) => t[3] === label)
    .reduce((s, t) => s + t[2], 0);
  return sumW > 0 ? labelW / sumW : 0;
}

// ============================================================
// 라벨의 줄당 기대값 (선택 시 lo~hi 균등 분포 평균 기여)
// ============================================================
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

/**
 * 한 카드당 라벨의 기대값 (= 줄당 기대값 × 평균 줄 수)
 */
export function perCardLabelExpected(memorial, label) {
  const avgLines = Object.entries(memorial.qdist)
    .reduce((s, [k, p]) => s + Number(k) * p, 0);
  return perLineLabelExpected(memorial, label) * avgLines;
}

// ============================================================
// 결과 포맷 (UI용)
// ============================================================
export function formatResult(memorial, targetLabel, targetValue, mc) {
  const evCard = perCardLabelExpected(memorial, targetLabel);
  const theoretical = evCard > 0 ? targetValue / evCard : Infinity;
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
    expectedPerCard: Math.round(evCard * 1000) / 1000,
  };
}
