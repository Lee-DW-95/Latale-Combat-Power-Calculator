/**
 * 성물 뽑기 시뮬 — 분석적 접근 (각성석 시뮬과 동일 패턴).
 *
 * 두 종류:
 *   - shared (공용석): rollOnceShared / computeStatisticsShared / simulateUntilTargetShared
 *   - exclusive (전용석): rollOnceExclusive / computeStatisticsExclusive / simulateUntilTargetExclusive
 *
 * 통계는 닫힌수식, 성공 카드는 조건부 분포에서 직접 조립, 시도횟수는 기하분포 역 CDF.
 */

import {
  SHARED_PICK_COUNT_DIST,
  SHARED_OPTIONS,
  SHARED_COST,
  getSharedOption,
  sharedHasPercentUnit,
  EXCLUSIVE_LEVEL_PROBS,
  EXCLUSIVE_STONES,
  EXCLUSIVE_COST,
} from '../data/relicGachaData.js';
import { rollValue } from './random.js';

// ============================================================
// 공통 헬퍼
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

function sampleGeometricTries(p) {
  if (p <= 0) return Infinity;
  if (p >= 1) return 1;
  const u = 1 - Math.random();
  return Math.max(1, Math.ceil(Math.log(u) / Math.log(1 - p)));
}

// 정수/소수 자동 판단해서 균등 추첨
function rollUniform(min, max) {
  const decimal = !Number.isInteger(min) || !Number.isInteger(max);
  if (decimal) return rollValue(min, max, 0.1);
  return rollValue(min, max);
}

// 정수 균등 카운트
function countInts(a, b) {
  return Math.max(0, Math.floor(b) - Math.ceil(a) + 1);
}
// 0.1 step 균등 카운트
function countSteps01(a, b) {
  if (b < a - 1e-9) return 0;
  return Math.max(0, Math.round((b - a) * 10) + 1);
}
// [min, max] 균등 분포가 target 이상일 확률
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

function rollUniformAtLeast(tier, target) {
  const decimal = !Number.isInteger(tier.min) || !Number.isInteger(tier.max);
  if (decimal) {
    const stepFloor = Math.ceil(target * 10) / 10;
    const lo = Math.max(tier.min, stepFloor);
    return rollValue(lo, tier.max, 0.1);
  }
  const lo = Math.max(tier.min, Math.ceil(target));
  return rollValue(lo, tier.max);
}

function combFactor(N, k, T) {
  if (k < T) return 0;
  let p = 1;
  for (let i = 0; i < T; i++) p *= (k - i) / (N - i);
  return p;
}

// 기하분포 통계 (mean, p50/p90/p99/p999)
function geometricStats(p) {
  if (p <= 0) {
    return {
      successRate: 0, mean: Infinity,
      p25: Infinity, p50: Infinity, p75: Infinity,
      p90: Infinity, p99: Infinity, p999: Infinity,
    };
  }
  const log1mp = Math.log(1 - p);
  const q = (qq) => Math.ceil(Math.log(1 - qq) / log1mp);
  return {
    successRate: p,
    mean: 1 / p,
    p25: q(0.25), p50: q(0.50), p75: q(0.75),
    p90: q(0.90), p99: q(0.99), p999: q(0.999),
  };
}

// ============================================================
// 공용석 (신성의 돌)
//
// 한 카드 = 옵션 1~4줄 (PICK_COUNT_DIST), 각 줄은 옵션 15종에서 무중복 균등 추첨,
// 5레벨 중 균등 1/5, [min,max] 균등.
// 타깃 = [{ type, value }] 모두 한 카드 안에 등장 + 값 ≥ value.
// ============================================================

const SHARED_N = SHARED_OPTIONS.length; // 15

function sharedOptionPassProb(option, target) {
  let sum = 0;
  for (const tier of option.tiers) sum += tierPassProb(tier, target);
  return sum / option.tiers.length;
}

// 타깃 dedup (같은 type 있으면 max value)
function dedupeSharedTargets(targets) {
  const map = new Map();
  for (const t of targets) {
    const prev = map.get(t.type);
    if (!prev || Number(t.value) > Number(prev.value)) {
      map.set(t.type, t);
    }
  }
  return Array.from(map.values());
}

// 분석적 단일 카드 성공률
export function analyticalSuccessRateShared(rawTargets) {
  if (!rawTargets || rawTargets.length === 0) return 0;
  const targets = dedupeSharedTargets(rawTargets);
  let valueProd = 1;
  for (const t of targets) {
    const opt = getSharedOption(t.type);
    if (!opt) return 0;
    const pp = sharedOptionPassProb(opt, t.value);
    if (pp <= 0) return 0;
    valueProd *= pp;
  }
  const T = targets.length;
  let lineSum = 0;
  for (const le of SHARED_PICK_COUNT_DIST) lineSum += le.p * combFactor(SHARED_N, le.k, T);
  return lineSum * valueProd;
}

export function computeStatisticsShared(rawTargets) {
  if (!rawTargets || rawTargets.length === 0) {
    return { successRate: 0, mean: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, p999: 0 };
  }
  return geometricStats(analyticalSuccessRateShared(rawTargets));
}

// k 가중 추첨 (P(k) × P(T개 모두 포함 | k))
function sampleSharedLineCount(T) {
  const weights = SHARED_PICK_COUNT_DIST.map((le) => le.p * combFactor(SHARED_N, le.k, T));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return T;
  let r = Math.random() * total;
  for (let i = 0; i < SHARED_PICK_COUNT_DIST.length; i++) {
    r -= weights[i];
    if (r <= 1e-12) return SHARED_PICK_COUNT_DIST[i].k;
  }
  return SHARED_PICK_COUNT_DIST[SHARED_PICK_COUNT_DIST.length - 1].k;
}

// 타깃 값에 도달 가능한 레벨 중 가중 추첨 (uniform 1/5 prior × tierPassProb)
function sampleLevelForTargetValue(option, target) {
  const cands = option.tiers
    .map((t, i) => ({ tier: t, idx: i, w: tierPassProb(t, target) }))
    .filter((x) => x.w > 0);
  if (cands.length === 0) return null;
  const total = cands.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const c of cands) {
    r -= c.w;
    if (r <= 1e-12) return c;
  }
  return cands[cands.length - 1];
}

// 1회 굴리기 (자연 분포)
export function rollOnceShared() {
  const k = pickWeighted(SHARED_PICK_COUNT_DIST).k;
  const idxs = SHARED_OPTIONS.map((_, i) => i);
  shuffleInPlace(idxs);
  const lines = [];
  for (let i = 0; i < k; i++) {
    const opt = SHARED_OPTIONS[idxs[i]];
    const lvIdx = Math.floor(Math.random() * opt.tiers.length);
    const tier = opt.tiers[lvIdx];
    const value = rollUniform(tier.min, tier.max);
    lines.push({
      type: opt.type,
      level: lvIdx + 1,
      value,
      unit: sharedHasPercentUnit(opt.type) ? '%' : '',
    });
  }
  return { lineCount: k, lines };
}

// 성공 카드 조립
export function constructSuccessCardShared(rawTargets) {
  if (!rawTargets || rawTargets.length === 0) return null;
  const targets = dedupeSharedTargets(rawTargets);
  // 각 타깃의 옵션 인덱스
  const targetIdxs = targets.map((t) => SHARED_OPTIONS.findIndex((o) => o.type === t.type));
  if (targetIdxs.includes(-1)) return null;

  const T = targets.length;
  const k = sampleSharedLineCount(T);

  // 비타깃 인덱스 셔플 → k - T개 필러
  const nonTarget = SHARED_OPTIONS.map((_, i) => i).filter((i) => !targetIdxs.includes(i));
  shuffleInPlace(nonTarget);
  const fillerIdxs = nonTarget.slice(0, k - T);
  const allIdxs = [...targetIdxs, ...fillerIdxs];
  shuffleInPlace(allIdxs);

  const lines = [];
  for (const idx of allIdxs) {
    const opt = SHARED_OPTIONS[idx];
    const tIdx = targetIdxs.indexOf(idx);
    const isTarget = tIdx >= 0;
    let lvIdx, tier, value;
    if (isTarget) {
      const sel = sampleLevelForTargetValue(opt, targets[tIdx].value);
      lvIdx = sel.idx;
      tier = sel.tier;
      value = rollUniformAtLeast(tier, targets[tIdx].value);
    } else {
      lvIdx = Math.floor(Math.random() * opt.tiers.length);
      tier = opt.tiers[lvIdx];
      value = rollUniform(tier.min, tier.max);
    }
    lines.push({
      type: opt.type,
      level: lvIdx + 1,
      value,
      unit: sharedHasPercentUnit(opt.type) ? '%' : '',
      isTarget,
    });
  }
  return { lineCount: k, lines };
}

export function simulateUntilTargetShared(rawTargets) {
  if (!rawTargets || rawTargets.length === 0) {
    return { tries: 0, card: null, success: false };
  }
  const card = constructSuccessCardShared(rawTargets);
  if (!card) return { tries: 0, card: null, success: false };
  const p = analyticalSuccessRateShared(rawTargets);
  return { tries: sampleGeometricTries(p), card, success: true };
}

// ============================================================
// 전용석 (6종 명품 성물석)
//
// 한 번 굴림 = pickWeighted(LEVEL_PROBS) → {level: 1~10, grade: 0~5}
//   grade 0 (level 1)        : 추가 옵션 없음
//   grade 1 (level 2~3)      : 추가 옵션 = lv1 (확정)
//   grade 2 (level 4~5)      : 추가 옵션 = lv1~2 균등
//   grade 3 (level 6~7)      : 추가 옵션 = lv1~3 균등
//   grade 4 (level 8~9)      : 추가 옵션 = lv1~4 균등
//   grade 5 (level 10)       : 추가 옵션 = lv1~5 균등
//
// 타깃 = "Lv ≥ N" — 메인 레벨이 N 이상이면 성공.
// ============================================================

function exclusiveGradeCandidates(grade) {
  if (grade === 0) return [];
  return Array.from({ length: grade }, (_, i) => i); // [0, 1, ..., grade-1]
}

// 1회 굴리기 (자연 분포)
export function rollOnceExclusive(stoneName) {
  const spec = EXCLUSIVE_STONES[stoneName];
  if (!spec) return null;
  const pick = pickWeighted(EXCLUSIVE_LEVEL_PROBS);
  const cands = exclusiveGradeCandidates(pick.grade);
  let extra = null;
  if (cands.length > 0) {
    const i = cands[Math.floor(Math.random() * cands.length)];
    const range = spec.lv[i];
    const value = spec.isPercent
      ? rollValue(range.min, range.max, 0.1)
      : rollValue(range.min, range.max);
    extra = {
      lvIdx: i,
      level: i + 1,
      key: spec.key,
      value,
      unit: spec.isPercent || spec.forcePercent ? '%' : '',
    };
  }
  return {
    stone: stoneName,
    level: pick.level,
    grade: pick.grade,
    extra,
  };
}

// 전용석 한 번 굴림이 (메인 Lv, 추가 옵션 lvIdx, 추가 옵션 값) 으로 풀어졌을 때
//   추가 옵션 값이 targetValue 이상일 분석적 확률.
//
//   p = Σ_levelEntry P(level) × (1/grade) × Σ_{i=0..grade-1} tierPassProb(spec.lv[i], target)
//
//   grade=0 (Lv1) 은 추가 옵션 자체가 없으므로 기여 없음.
export function analyticalSuccessRateExclusive(stoneName, targetValue) {
  const spec = EXCLUSIVE_STONES[stoneName];
  if (!spec || !targetValue || targetValue <= 0) return 0;
  let p = 0;
  for (const e of EXCLUSIVE_LEVEL_PROBS) {
    if (e.grade === 0) continue;
    let cond = 0;
    for (let i = 0; i < e.grade; i++) {
      cond += tierPassProb(spec.lv[i], targetValue);
    }
    cond /= e.grade;
    p += e.p * cond;
  }
  return p;
}

export function computeStatisticsExclusive(stoneName, targetValue) {
  return geometricStats(analyticalSuccessRateExclusive(stoneName, targetValue));
}

// 성공 카드 조립 (추가 옵션 값 ≥ targetValue 조건부)
//   가능한 (levelEntry, extraIdx) 쌍 전부에 가중치 = P(level) × (1/grade) × tierPassProb 부여 후 1개 추첨.
//   추첨된 쌍의 [target, max] 안에서 균등 값 추첨.
export function constructSuccessCardExclusive(stoneName, targetValue) {
  const spec = EXCLUSIVE_STONES[stoneName];
  if (!spec || !targetValue || targetValue <= 0) return null;

  const cands = [];
  for (const e of EXCLUSIVE_LEVEL_PROBS) {
    if (e.grade === 0) continue;
    for (let i = 0; i < e.grade; i++) {
      const pass = tierPassProb(spec.lv[i], targetValue);
      if (pass > 0) {
        cands.push({
          levelEntry: e,
          extraIdx: i,
          weight: e.p * (1 / e.grade) * pass,
        });
      }
    }
  }
  if (cands.length === 0) return null;

  const total = cands.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  let chosen = cands[cands.length - 1];
  for (const c of cands) {
    r -= c.weight;
    if (r <= 1e-12) { chosen = c; break; }
  }

  const tier = spec.lv[chosen.extraIdx];
  const value = rollUniformAtLeast(tier, targetValue);

  return {
    stone: stoneName,
    level: chosen.levelEntry.level,
    grade: chosen.levelEntry.grade,
    extra: {
      lvIdx: chosen.extraIdx,
      level: chosen.extraIdx + 1,
      key: spec.key,
      value,
      unit: spec.isPercent || spec.forcePercent ? '%' : '',
    },
  };
}

export function simulateUntilTargetExclusive(stoneName, targetValue) {
  if (!stoneName || !targetValue || targetValue <= 0) {
    return { tries: 0, card: null, success: false };
  }
  const card = constructSuccessCardExclusive(stoneName, targetValue);
  if (!card) return { tries: 0, card: null, success: false };
  const p = analyticalSuccessRateExclusive(stoneName, targetValue);
  return { tries: sampleGeometricTries(p), card, success: true };
}

// stone 의 옵션 단위 / 최대 가능 수치
export function exclusiveOptionUnit(stoneName) {
  const spec = EXCLUSIVE_STONES[stoneName];
  if (!spec) return '';
  return spec.isPercent || spec.forcePercent ? '%' : '';
}

export function exclusiveMaxValue(stoneName) {
  const spec = EXCLUSIVE_STONES[stoneName];
  if (!spec) return 0;
  return spec.lv[spec.lv.length - 1].max; // 최상위 티어 max
}

// ============================================================
// 비용 export
// ============================================================
export const COST_SHARED = SHARED_COST;
export const COST_EXCLUSIVE = EXCLUSIVE_COST;
