/**
 * (기간제) 상급 각성석 시뮬 유틸
 *
 * latale.info/60 인라인 시뮬 + latale.com 공식 확률표와 동일한 모델:
 *   - 각성석 종류 가중 추첨 (95% / 5%)
 *   - 라인 수 가중 추첨 (1~4줄, 40/40/15/5)
 *   - 라인 수만큼 옵션 타입을 균등 무중복 추첨 (Fisher-Yates 셔플)
 *   - 5개 티어 중 1개를 균등 추첨, [min,max] 균등 분포로 값 결정
 *
 * 통계/샘플 카드 산출 방식 — 분석적 (analytical) 접근:
 *   - 단일 카드 성공 확률 p 는 닫힌 수식으로 정확히 계산 (MC 불필요)
 *   - 평균/분위수는 기하분포 닫힌 수식
 *   - "성공 카드 1장"은 조건부 분포에서 직접 샘플링 (rejection sampling 우회)
 *   - "N회차에 도달"은 기하분포 역 CDF 로 1번만 추첨 (실측 분포와 동일)
 *
 *   → brute-force 시 평균 1/p 회 굴려야 만나는 희박 케이스도 즉시 (~1ms) 처리.
 *     수치(p, 평균, p50/p90/p99, 시도횟수 분포)는 brute-force 와 통계적으로 구별 불가.
 */

import {
  STONE_DIST,
  LINES_DIST,
  ROLL_COST,
  tableForStone,
  normalizeLabel,
  isGlowLine,
} from '../data/awakeningData.js';
import { rollValue } from './random.js';

// ============================================================
// 가중 추첨 헬퍼
// ============================================================
function pickWeighted(arr) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < arr.length; i++) {
    acc += arr[i].p;
    if (r <= acc + 1e-12) return arr[i];
  }
  return arr[arr.length - 1];
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickStone() {
  return pickWeighted(STONE_DIST);
}

function pickLineCount() {
  return pickWeighted(LINES_DIST).k;
}

function pickTier(tiers) {
  return tiers[Math.floor(Math.random() * tiers.length)];
}

function rollValueByTier(tier) {
  const decimal = !Number.isInteger(tier.min) || !Number.isInteger(tier.max);
  if (decimal) return rollValue(tier.min, tier.max, 0.1);
  return rollValue(tier.min, tier.max);
}

// ============================================================
// 1회 굴리기 — 자연 분포에서 한 카드 추첨 (1회 굴려보기 미리보기용)
// ============================================================
export function rollOnce() {
  const stone = pickStone();
  const table = tableForStone(stone.key);
  const k = pickLineCount();

  const idxs = Array.from({ length: table.length }, (_, i) => i);
  shuffleInPlace(idxs);

  const lines = [];
  for (let i = 0; i < k; i++) {
    const t = table[idxs[i]];
    const tier = pickTier(t.tiers);
    const value = rollValueByTier(tier);
    const { base, unit } = normalizeLabel(t.type);
    const glow = isGlowLine(base, unit);
    const displayLabel = unit ? `${base} ${unit}` : base;
    lines.push({ base, unit, value, glow, displayLabel });
  }
  return { stone, lineCount: k, lines };
}

// ============================================================
// 분석적 확률 계산 헬퍼
// ============================================================

// [a, b] 정수 갯수
function countInts(a, b) {
  return Math.max(0, Math.floor(b) - Math.ceil(a) + 1);
}
// [a, b] 0.1-step 갯수
function countSteps01(a, b) {
  if (b < a - 1e-9) return 0;
  return Math.max(0, Math.round((b - a) * 10) + 1);
}

// 한 티어 내 균등 추첨이 target 이상일 확률
function tierPassProb(tier, target) {
  const decimal = !Number.isInteger(tier.min) || !Number.isInteger(tier.max);
  if (decimal) {
    const total = countSteps01(tier.min, tier.max);
    if (total === 0) return 0;
    const minPass = Math.max(tier.min, Math.ceil(target * 10) / 10);
    if (minPass > tier.max + 1e-9) return 0;
    return countSteps01(minPass, tier.max) / total;
  }
  const total = countInts(tier.min, tier.max);
  if (total === 0) return 0;
  const minPass = Math.max(tier.min, Math.ceil(target));
  if (minPass > tier.max) return 0;
  return countInts(minPass, tier.max) / total;
}

// 한 옵션을 추첨했을 때 값이 target 이상 나올 확률
//   = (1/티어수) Σ tierPassProb  (티어 균등 가정)
function optionPassProb(option, target) {
  let sum = 0;
  for (const tier of option.tiers) sum += tierPassProb(tier, target);
  return sum / option.tiers.length;
}

// stone 의 displayLabel → option 매핑
function buildLabelToOption(stoneKey) {
  const map = new Map();
  for (const opt of tableForStone(stoneKey)) {
    const { base, unit } = normalizeLabel(opt.type);
    map.set(unit ? `${base} ${unit}` : base, opt);
  }
  return map;
}

// k줄 카드에 특정 T개 옵션이 모두 포함될 확률
//   = C(N-T, k-T) / C(N, k) = (k * (k-1) * ... * (k-T+1)) / (N * (N-1) * ... * (N-T+1))
function combFactor(N, k, T) {
  if (k < T) return 0;
  let p = 1;
  for (let i = 0; i < T; i++) p *= (k - i) / (N - i);
  return p;
}

// 같은 displayLabel을 가진 타깃들은 max value로 통합.
//   공식 spec: 한 카드에 같은 옵션 타입은 최대 1번 등장. 사용자가 실수로 같은 옵션을
//   여러 번 추가해도 max value 1개로 합치는 게 의미 있는 유일한 해석.
function dedupeTargets(targets) {
  const map = new Map();
  for (const t of targets) {
    const prev = map.get(t.displayLabel);
    if (!prev || Number(t.value) > Number(prev.value)) {
      map.set(t.displayLabel, t);
    }
  }
  return Array.from(map.values());
}

// 단일 카드 성공 확률 (분석적 — 정확값)
//
//   p = Σ_stones P(stone)
//         × [ Σ_k P(k) × P(타깃 T개 모두 포함 | k, stone) ]
//         × Π_t P(option_t 의 값 ≥ target_t)
//
//   타깃 옵션이 stone 에 없거나 어떤 티어로도 도달 불가하면 그 stone 기여는 0.
export function analyticalSuccessRate(rawTargets) {
  if (!rawTargets || rawTargets.length === 0) return 0;
  const targets = dedupeTargets(rawTargets);
  let totalP = 0;
  for (const stoneEntry of STONE_DIST) {
    const labelMap = buildLabelToOption(stoneEntry.key);
    let valueProd = 1;
    let feasible = true;
    for (const t of targets) {
      const opt = labelMap.get(t.displayLabel);
      if (!opt) { feasible = false; break; }
      const pp = optionPassProb(opt, t.value);
      if (pp <= 0) { feasible = false; break; }
      valueProd *= pp;
    }
    if (!feasible) continue;

    const N = tableForStone(stoneEntry.key).length;
    const T = targets.length;
    let lineSum = 0;
    for (const le of LINES_DIST) lineSum += le.p * combFactor(N, le.k, T);
    totalP += stoneEntry.p * lineSum * valueProd;
  }
  return totalP;
}

// ============================================================
// 통계 (기하분포 닫힌수식)
// ============================================================
export function computeStatistics(rawTargets) {
  if (!rawTargets || rawTargets.length === 0) {
    return { successRate: 0, mean: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, p999: 0 };
  }
  const p = analyticalSuccessRate(rawTargets);
  if (p <= 0) {
    return {
      successRate: 0, mean: Infinity,
      p25: Infinity, p50: Infinity, p75: Infinity, p90: Infinity, p99: Infinity, p999: Infinity,
    };
  }
  const log1mp = Math.log(1 - p);
  const quantile = (q) => Math.ceil(Math.log(1 - q) / log1mp);
  return {
    successRate: p,
    mean: 1 / p,
    p25: quantile(0.25), p50: quantile(0.50), p75: quantile(0.75),
    p90: quantile(0.90), p99: quantile(0.99), p999: quantile(0.999),
  };
}

// ============================================================
// 조건부 샘플링 (성공 카드 직접 조립)
// ============================================================

// target 값에 도달 가능한 티어 중에서 capacity 가중 추첨
//   (uniform 1/5 prior × tierPassProb / Σ → tierPassProb 비율로 정규화)
function sampleTierForTargetValue(option, target) {
  const fts = option.tiers.filter((t) => tierPassProb(t, target) > 0);
  if (fts.length === 0) return null;
  const weights = fts.map((t) => tierPassProb(t, target));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < fts.length; i++) {
    r -= weights[i];
    if (r <= 1e-12) return fts[i];
  }
  return fts[fts.length - 1];
}

// 한 티어 내에서 값 ≥ target 으로 잘라낸 균등 분포 샘플
function rollValueAtLeast(tier, target) {
  const decimal = !Number.isInteger(tier.min) || !Number.isInteger(tier.max);
  if (decimal) {
    const stepFloor = Math.ceil(target * 10) / 10;
    const lo = Math.max(tier.min, stepFloor);
    return rollValue(lo, tier.max, 0.1);
  }
  const lo = Math.max(tier.min, Math.ceil(target));
  return rollValue(lo, tier.max);
}

// stone 가중 추첨: P(stone) × P(success | stone) — 조건부 stone 분포
//   targets 는 이미 dedup 되어 있다고 가정 (호출자에서 보장)
function sampleStoneConditional(targets) {
  const valid = [];
  for (const stoneEntry of STONE_DIST) {
    const labelMap = buildLabelToOption(stoneEntry.key);
    let valueProd = 1;
    let feasible = true;
    for (const t of targets) {
      const opt = labelMap.get(t.displayLabel);
      if (!opt) { feasible = false; break; }
      const pp = optionPassProb(opt, t.value);
      if (pp <= 0) { feasible = false; break; }
      valueProd *= pp;
    }
    if (!feasible) continue;

    const N = tableForStone(stoneEntry.key).length;
    const T = targets.length;
    let stoneSucc = 0;
    for (const le of LINES_DIST) stoneSucc += le.p * combFactor(N, le.k, T);
    valid.push({ stoneEntry, labelMap, weight: stoneEntry.p * stoneSucc * valueProd });
  }
  if (valid.length === 0) return null;
  const total = valid.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of valid) {
    r -= v.weight;
    if (r <= 1e-12) return v;
  }
  return valid[valid.length - 1];
}

// 라인 수 가중 추첨: P(k) × P(타깃 T개 포함 | k) — 조건부 k 분포
function sampleLineCountConditional(stoneKey, targetCount) {
  const T = targetCount;
  const N = tableForStone(stoneKey).length;
  const weights = LINES_DIST.map((le) => le.p * combFactor(N, le.k, T));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return T;
  let r = Math.random() * total;
  for (let i = 0; i < LINES_DIST.length; i++) {
    r -= weights[i];
    if (r <= 1e-12) return LINES_DIST[i].k;
  }
  return LINES_DIST[LINES_DIST.length - 1].k;
}

// 모든 타깃을 만족하는 카드 한 장 조립 (성공 카드의 조건부 분포에서 샘플링)
export function constructSuccessCard(rawTargets) {
  if (!rawTargets || rawTargets.length === 0) return null;
  const targets = dedupeTargets(rawTargets);

  const stoneSamp = sampleStoneConditional(targets);
  if (!stoneSamp) return null;
  const { stoneEntry: stone, labelMap } = stoneSamp;

  const k = sampleLineCountConditional(stone.key, targets.length);
  const table = tableForStone(stone.key);

  // 타깃 옵션 인덱스
  const targetEntries = targets.map((t) => ({
    target: t,
    option: labelMap.get(t.displayLabel),
  }));
  const targetIdxs = targetEntries.map((e) => table.indexOf(e.option));

  // 나머지(필러) 인덱스 — 비타깃에서 무중복 균등 추첨
  const nonTargetIdxs = [];
  for (let i = 0; i < table.length; i++) {
    if (!targetIdxs.includes(i)) nonTargetIdxs.push(i);
  }
  shuffleInPlace(nonTargetIdxs);
  const fillerIdxs = nonTargetIdxs.slice(0, k - targets.length);

  // 합쳐서 셔플 — 타깃 라인이 항상 위에 오는 어색함 제거
  const allIdxs = [...targetIdxs, ...fillerIdxs];
  shuffleInPlace(allIdxs);

  const lines = [];
  for (const idx of allIdxs) {
    const opt = table[idx];
    const tEntryIdx = targetIdxs.indexOf(idx);
    const isTarget = tEntryIdx >= 0;
    let tier, value;
    if (isTarget) {
      const tval = targetEntries[tEntryIdx].target.value;
      tier = sampleTierForTargetValue(opt, tval);
      value = rollValueAtLeast(tier, tval);
    } else {
      tier = pickTier(opt.tiers);
      value = rollValueByTier(tier);
    }
    const { base, unit } = normalizeLabel(opt.type);
    const glow = isGlowLine(base, unit);
    const displayLabel = unit ? `${base} ${unit}` : base;
    lines.push({ base, unit, value, glow, displayLabel });
  }

  return { stone, lineCount: k, lines };
}

// ============================================================
// 시도횟수 추첨 (기하분포 역 CDF)
//   X ~ Geom(p) ⇒ X = ⌈ln(U)/ln(1-p)⌉ where U ~ Uniform(0, 1].
//   brute-force 로 실제 굴렸을 때 만나는 회차 분포와 통계적으로 동일.
// ============================================================
function sampleGeometricTries(p) {
  if (p <= 0) return Infinity;
  if (p >= 1) return 1;
  const u = 1 - Math.random(); // (0, 1]
  return Math.max(1, Math.ceil(Math.log(u) / Math.log(1 - p)));
}

// ============================================================
// 1번 실행 (성공 카드 + 시도 횟수)
//   - card: 성공 조건부 분포에서 직접 추첨 (즉시)
//   - tries: 기하분포에서 1회 추첨 (즉시)
//   maxTries 인자는 후방 호환을 위해 유지하지만 무시됨.
// ============================================================
export function simulateUntilTargetReached(rawTargets /* , maxTries */) {
  if (!rawTargets || rawTargets.length === 0) {
    return { tries: 0, card: null, success: false };
  }
  const card = constructSuccessCard(rawTargets);
  if (!card) {
    return { tries: 0, card: null, success: false };
  }
  const p = analyticalSuccessRate(rawTargets);
  const tries = sampleGeometricTries(p);
  return { tries, card, success: true };
}

// ============================================================
// (참고용) MC 기반 추정 — 분석적 결과 검증에 사용
// ============================================================
export function estimateSingleCardSuccessRate(targets, runs = 200_000) {
  let success = 0;
  for (let i = 0; i < runs; i++) {
    const card = rollOnce();
    let ok = true;
    for (const t of targets) {
      const hit = card.lines.find(
        (ln) => ln.displayLabel === t.displayLabel && ln.value >= t.value
      );
      if (!hit) { ok = false; break; }
    }
    if (ok) success++;
  }
  return success / runs;
}

// ============================================================
// 1회 비용 (UI 표시용)
// ============================================================
export const COST_PER_ROLL = ROLL_COST;
