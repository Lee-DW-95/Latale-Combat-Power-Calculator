/**
 * 메모리얼 시뮬레이션 (Monte Carlo 기반)
 *
 * 한 번 굴림 = 1 카드:
 *   1) Qdist 분포로 줄 수 K 결정 (1~4)
 *   2) K개의 줄 각각에 대해 weight 정규화 후 tier 선택
 *   3) 선택된 tier의 [lo, hi] 안에서 정수 균등 분포로 값 결정
 *
 * 시뮬 모드 (사용자 의도): 단일 카드 합 도달 (베이스 라벨 기준)
 *   - 한 카드에서 목표 베이스 옵션의 값 합이 목표 ≥ 일 때 성공
 *   - 같은 옵션의 모든 티어([1]~[5])가 합산됨
 *   - 올스탯 라인은 다른 스탯 목표에도 기여 (게임 내 올스탯 = 전 스탯)
 *   - 카드 간 누적 X (각 카드는 독립 시도)
 *   - Monte Carlo: 평균 몇 회 굴려야 그런 카드를 만나는지
 */

import { lineContributesTo } from '../data/memorialProbabilities.js';
import { rollValue } from './random.js';
import { MEMORIAL_SIM } from './simConstants.js';

// ============================================================
// 헬퍼
// ============================================================
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

// 라벨에 [N] 프리픽스가 없으면 같은 라벨 그룹 내 순번을 계산해 부여.
// 같은 라벨이 1개뿐이면 단계 구분이 없으므로 그대로 둔다.
function decorateLabelWithTier(tiers, pickedTier, label) {
  if (/^\[\d+\]/.test(label)) return label;
  const sameLabel = tiers.filter((t) => t[3] === label);
  if (sameLabel.length <= 1) return label;
  const idx = sameLabel.indexOf(pickedTier);
  if (idx < 0) return label;
  return `[${idx + 1}] ${label}`;
}

// ============================================================
// 한 카드 1회 굴리기 — [{ label, value }, ...]
// tier 형식: [lo, hi, weight, label, step?] — step 생략 시 정수 균등
// ============================================================
export function rollOnce(memorial) {
  const k = pickByQdist(memorial.qdist);
  const lines = [];
  for (let i = 0; i < k; i++) {
    const pickedTier = pickTierByWeight(memorial.tiers);
    const [lo, hi, , label, step] = pickedTier;
    const value = rollValue(lo, hi, step);
    const displayLabel = decorateLabelWithTier(memorial.tiers, pickedTier, label);
    lines.push({ label: displayLabel, value });
  }
  return lines;
}

// 한 카드에서 한 목표(base)에 해당하는 줄들의 값 합
export function cardSumFor(lines, targetBase) {
  let sum = 0;
  for (const line of lines) {
    if (lineContributesTo(line.label, targetBase)) sum += line.value;
  }
  return sum;
}

// 한 카드가 모든 목표를 동시에 만족하는지 판정
// targets = [{ base, value }, ...]  (value는 양의 정수)
function cardMeetsAllTargets(lines, targets) {
  for (const t of targets) {
    if (cardSumFor(lines, t.base) < t.value) return false;
  }
  return true;
}

// 한 카드의 목표별 합산 (UI 표시용)
function perTargetSums(lines, targets) {
  return targets.map((t) => ({
    base: t.base,
    value: t.value,
    sum: cardSumFor(lines, t.base),
  }));
}

// ============================================================
// 1번 시도: 한 카드가 모든 목표를 동시 만족할 때까지
// 응답시간 보장 위해 maxTries=100K로 cap (~100ms).
// 못 찾으면 success=false 로 반환 (매우 희박한 목표 케이스).
// targets = [{ base, value }, ...]
// ============================================================
export function simulateUntilSingleCardReaches(
  memorial,
  targets,
  maxTries = MEMORIAL_SIM.SAMPLE_MAX_TRIES,
) {
  let tries = 0;
  while (tries < maxTries) {
    const lines = rollOnce(memorial);
    tries++;
    if (cardMeetsAllTargets(lines, targets)) {
      return {
        tries,
        sums: perTargetSums(lines, targets),
        winningLines: lines,
        success: true,
      };
    }
  }
  return { tries: maxTries, sums: [], winningLines: [], success: false };
}

// ============================================================
// 단일 카드 성공 확률 추정 (빠른 표본 추출)
//
// 1차 200K 샘플 → 약 100ms.
// success가 너무 적게 잡히면(< 30) 1M까지 확장 (~500ms 한계).
// 그래도 부족하면 추정 한계로 인정하고 반환 (매우 희박한 케이스).
// ============================================================
export function estimateSingleCardSuccessRate(memorial, targets) {
  const { ESTIMATE_PHASE1: PHASE1, ESTIMATE_PHASE2: PHASE2, ESTIMATE_PHASE2_THRESHOLD } = MEMORIAL_SIM;

  let success = 0;
  for (let i = 0; i < PHASE1; i++) {
    const lines = rollOnce(memorial);
    if (cardMeetsAllTargets(lines, targets)) success++;
  }

  if (success < ESTIMATE_PHASE2_THRESHOLD) {
    const extra = PHASE2 - PHASE1;
    let extraSuccess = 0;
    for (let i = 0; i < extra; i++) {
      const lines = rollOnce(memorial);
      if (cardMeetsAllTargets(lines, targets)) extraSuccess++;
    }
    return (success + extraSuccess) / PHASE2;
  }
  return success / PHASE1;
}

// ============================================================
// 기하분포 기반 해석적 통계 계산
//
// 각 카드 시도가 독립이고 단일 카드 성공 확률 p가 일정하면
// "첫 성공까지 시도 횟수 X"는 기하분포(Geometric)를 따른다.
//   E[X] = 1/p
//   P(X ≤ k) = 1 - (1-p)^k
//   분위수 k_q = ⌈ln(1-q) / ln(1-p)⌉
//
// Monte Carlo 10,000 × ~수천 카드 = 수천만 roll 을 우회.
// p 추정만 수행 → 모든 통계는 닫힌 수식으로 즉시 산출.
// ============================================================
export function computeStatistics(memorial, targets) {
  if (!targets || targets.length === 0) {
    return { successRate: 0, mean: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, p999: 0 };
  }

  const p = estimateSingleCardSuccessRate(memorial, targets);

  if (p <= 0) {
    return {
      successRate: 0,
      mean: Infinity,
      p25: Infinity, p50: Infinity, p75: Infinity, p90: Infinity, p99: Infinity, p999: Infinity,
    };
  }

  const log1mp = Math.log(1 - p);
  const quantile = (q) => Math.ceil(Math.log(1 - q) / log1mp);

  return {
    successRate: p,
    mean: 1 / p,
    p25: quantile(0.25),
    p50: quantile(0.50),
    p75: quantile(0.75),
    p90: quantile(0.90),
    p99: quantile(0.99),
    p999: quantile(0.999),
  };
}

// ============================================================
// 라벨 통계 (UI 표시용 — 분포 정보 카드)
//
// targetBase = 베이스 옵션 이름. 기여 규칙(같은 베이스 + 올스탯)을
// 따르는 모든 티어를 집계.
// ============================================================
export function perLineLabelProb(memorial, targetBase) {
  const sumW = memorial.tiers.reduce((s, t) => s + t[2], 0);
  const labelW = memorial.tiers
    .filter((t) => lineContributesTo(t[3], targetBase))
    .reduce((s, t) => s + t[2], 0);
  return sumW > 0 ? labelW / sumW : 0;
}

export function perLineLabelExpected(memorial, targetBase) {
  const sumW = memorial.tiers.reduce((s, t) => s + t[2], 0);
  if (sumW === 0) return 0;
  let exp = 0;
  for (const [lo, hi, w, lb] of memorial.tiers) {
    if (!lineContributesTo(lb, targetBase)) continue;
    const meanVal = (lo + hi) / 2;
    exp += (w / sumW) * meanVal;
  }
  return exp;
}

export function perCardLabelExpected(memorial, targetBase) {
  const avgLines = Object.entries(memorial.qdist)
    .reduce((s, [k, p]) => s + Number(k) * p, 0);
  return perLineLabelExpected(memorial, targetBase) * avgLines;
}

// ============================================================
// 최대 가능 단일 카드 합 (UI 가이드용)
//   = 모든 줄이 기여 가능한 티어 중 max hi, qdist 최대 줄 수만큼
// ============================================================
export function maxPossibleSingleCard(memorial, targetBase) {
  const contributing = memorial.tiers.filter((t) => lineContributesTo(t[3], targetBase));
  if (contributing.length === 0) return 0;
  const maxLineValue = Math.max(...contributing.map((t) => t[1]));
  // qdist 의 최대 줄 수
  const maxK = Math.max(...Object.keys(memorial.qdist).map(Number));
  return maxLineValue * maxK;
}

// ============================================================
// 결과 포맷
// ============================================================
export function formatResult(memorial, targets, stats) {
  const round1 = (n) => Number.isFinite(n) ? Math.round(n * 10) / 10 : Infinity;
  return {
    targets: targets.map((t) => ({ base: t.base, value: t.value })),
    successRate: stats.successRate,
    mean: round1(stats.mean),
    p50: stats.p50,
    p90: stats.p90,
    p99: stats.p99,
    p999: stats.p999,
  };
}
