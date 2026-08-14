/**
 * 라테일 인챈트 시뮬레이션 유틸
 *
 * 모델 가정:
 * 1) 일반 장비 인챈트
 *    - 1회 시도 = 1슬롯 부여 또는 장비 파괴
 *    - 일반 인챈트 50% / 슈퍼 인챈트 60% / 특별 인챈트 100% 성공률
 *      · 부위에 successRates 가 있으면 그 값 우선 (캔서 배찌 = 일반 40% / 슈퍼 50%)
 *      · 신화장비면 종류와 무관하게 100% — 파괴가 일어나지 않는다 (opts.mythic)
 *    - 성공: 선택 옵션의 [lo, hi] (또는 step 단위) 균등 분포로 값 결정 → 슬롯 1개 추가
 *      · lo 는 귀속/신화 여부로 달라짐 — 귀속 1% / 거래가능 20% / 신화 80% (opts.minPct)
 *    - 실패: 장비 전체 파괴, 모든 슬롯 사라짐, 새 장비로 재시작
 *    - 매 시도마다 인챈트 종류별 망치 소모 (성공률과 무관하게 차감)
 *
 * 2) 특수장비 인챈트
 *    - 옵션 슬롯별로 Lv.0 → Lv.5 단계 강화
 *    - 강화 시 해당 Lv 의 [lo, hi] 정수 균등으로 값 결정
 *    - 레벨별 재료/Ely 비용 차감 (확률 정보 미공개 → 100% 성공 가정)
 */

import {
  NORMAL_ENCHANT_TYPES,
  SPECIAL_ENCHANT_OPTIONS,
  SPECIAL_ENCHANT_COSTS,
  SPECIAL_ENCHANT_MAX_LEVEL,
  DEFAULT_BINDING_MIN_PCT,
  effectiveSuccessRate,
  rangeFor,
} from '../data/enchantData.js';
import { rollInt, rollValue } from './random.js';
import { sortNum, quantile, mean } from './stats.js';
import { ENCHANT_SIM } from './simConstants.js';

/**
 * 일반 장비 인챈트 공통 옵션.
 * @typedef {Object} NormalEnchantOpts
 * @property {number} [minPct]  인챈 수치 하한(%) — 귀속 1 / 거래가능 20 / 신화 80
 * @property {boolean} [mythic] 신화장비 — 성공률 100% 고정, 파괴 없음
 */
const DEFAULT_OPTS = { minPct: DEFAULT_BINDING_MIN_PCT, mythic: false };

function normalizeOpts(opts) {
  return { ...DEFAULT_OPTS, ...(opts || {}) };
}

// ============================================================
// 시뮬 결과 분포 → 평균/P50/P90/P99 통계 객체 빌더
// (computeNormalStats / computeTargetStats 공통)
// ============================================================
function buildDistributionStats(samples) {
  const keys = Object.keys(samples);
  const sorted = {};
  const out = { mean: {}, p50: {}, p90: {}, p99: {} };
  for (const k of keys) {
    sorted[k] = sortNum(samples[k]);
    out.mean[k] = mean(samples[k]);
    out.p50[k] = quantile(sorted[k], 0.50);
    out.p90[k] = quantile(sorted[k], 0.90);
    out.p99[k] = quantile(sorted[k], 0.99);
  }
  return out;
}

// ============================================================
// 일반 장비 인챈트 — 1회 시도
// stage: 'base' | 'full' — 노강 / 풀강 옵션 풀 선택
// returns:
//   { success: true,  hammerUsed, elyUsed, optionKey, label, unit, value }
//   { success: false, hammerUsed, elyUsed }
// ============================================================
export function tryNormalEnchant(part, optionKey, enchantTypeKey, stage = 'base', opts) {
  const { minPct, mythic } = normalizeOpts(opts);
  const type = NORMAL_ENCHANT_TYPES[enchantTypeKey];
  if (!type) throw new Error(`unknown enchant type: ${enchantTypeKey}`);

  // 신화장비는 종류와 무관하게 100% — 파괴 분기 자체가 발생하지 않는다.
  // 부위 고유 성공률(part.successRates)이 있으면 그쪽 우선 — 캔서 배찌 일반 40% / 슈퍼 50%.
  const rate = effectiveSuccessRate(enchantTypeKey, mythic, part);
  const success = rate >= 1 || Math.random() < rate;
  if (!success) {
    return { success: false, hammerUsed: type.hammerCost, elyUsed: type.elyCost };
  }

  const opt = part.options.find((o) => o.key === optionKey);
  if (!opt) throw new Error(`unknown option: ${optionKey}`);
  const r = rangeFor(opt, stage, minPct);

  return {
    success: true,
    hammerUsed: type.hammerCost,
    elyUsed: type.elyCost,
    optionKey,
    label: opt.label,
    unit: opt.unit,
    value: rollValue(r.lo, r.hi, r.step),
    stage,
  };
}

// ============================================================
// 일반 장비 인챈트 — 풀강(slotCount슬롯) 도달까지 시뮬
//
// 한 장비에 같은 옵션은 한 번만 들어갈 수 있다 (게임 메커니즘).
// 매 시도마다 part.options 에서 아직 슬롯에 안 들어간 옵션을 순서대로 골라 시도한다.
// 시도 실패 → 장비 파괴 → 모든 슬롯 사라짐 → 첫 옵션부터 다시.
// ============================================================
export function simulateUntilFull(
  part,
  enchantTypeKey,
  stage = 'base',
  maxAttempts = ENCHANT_SIM.FULL_MAX_ATTEMPTS,
  opts,
) {
  let tries = 0;
  let hammerUsed = 0;
  let elyUsed = 0;
  let destroyed = 0;
  let slots = [];
  const slotMax = part.slotCount ?? 5;
  const allOpts = part.options || [];

  while (tries < maxAttempts && slots.length < slotMax) {
    const usedKeys = new Set(slots.map((s) => s.optionKey));
    const nextOpt = allOpts.find((o) => !usedKeys.has(o.key));
    if (!nextOpt) break; // 모든 옵션 사용됨 (이론상 slotMax > options.length 일 때만)

    const r = tryNormalEnchant(part, nextOpt.key, enchantTypeKey, stage, opts);
    tries++;
    hammerUsed += r.hammerUsed;
    elyUsed += r.elyUsed;
    if (r.success) {
      slots.push({ optionKey: r.optionKey, label: r.label, unit: r.unit, value: r.value });
    } else {
      destroyed++;
      slots = []; // 장비 파괴 → 빈 장비로 재시작
    }
  }

  return {
    completed: slots.length >= slotMax,
    tries,
    hammerUsed,
    elyUsed,
    destroyed,
    finalSlots: slots,
  };
}

// ============================================================
// 일반 장비 인챈트 — 통계 (Monte Carlo)
//   풀강(slotMax)까지 도달하는 시도 횟수의 분포·평균
// ============================================================
export function computeNormalStats(
  part,
  enchantTypeKey,
  stage = 'base',
  runs = ENCHANT_SIM.FULL_MC_RUNS,
  opts,
) {
  const samples = { tries: [], hammer: [], ely: [], destroyed: [] };
  let completedCount = 0;

  for (let i = 0; i < runs; i++) {
    const r = simulateUntilFull(part, enchantTypeKey, stage, ENCHANT_SIM.FULL_MC_INNER_CAP, opts);
    if (r.completed) {
      completedCount++;
      samples.tries.push(r.tries);
      samples.hammer.push(r.hammerUsed);
      samples.ely.push(r.elyUsed);
      samples.destroyed.push(r.destroyed);
    }
  }

  if (completedCount === 0) return null;
  return {
    completedRate: completedCount / runs,
    runs: completedCount,
    ...buildDistributionStats(samples),
  };
}

// ============================================================
// 일반 장비 인챈트 — 목표 옵션 모두 만족까지
//
// 모델 (가정):
//   - targets = [{ optionKey, minValue }, ...] 1~slotMax 개
//   - 한 장비에 사용자 입력 순서대로 옵션 1개씩 시도
//   - 시도 실패 → 장비 파괴 → 새 장비 처음부터 (망치 소모, slot 모두 사라짐)
//   - 시도 성공 but 추첨 값 < minValue → 그 슬롯이 미달이라 장비 포기 (망치는 이미 소모됨)
//   - 모든 target 슬롯이 minValue 이상이면 성공 종료
//
// 추첨 값 미달 시 장비 포기는 "리롤 시스템 없음" 가정. 실제 게임 메커니즘이
// 다르면 (예: 같은 슬롯 재인챈트 가능) 추후 모델 변경 필요.
//
// ── 산출 방식 ─────────────────────────────────────────────
// 장비 1개(= 한 사이클)의 성공 확률 q 는 닫힌 수식으로 정확히 구할 수 있다.
//
//   a_i = 성공률 × P(값 ≥ minValue_i)      … 슬롯 i 통과 확률
//   R_i = Π_{j<i} a_j                        … 슬롯 i 까지 도달할 확률
//   q   = Π a_i                              … 장비 1개가 끝까지 통과할 확률
//
// 여기서 총 시도 횟수의 기대값이 정확히 (Σ R_i) / q 로 떨어진다.
// 예전 구현은 "10만 시도 상한 안에 끝난 표본만" 평균에 넣어서, q 가 작으면
// 운 좋게 일찍 끝난 표본만 남는 생존편향으로 평균을 수십 배 과소보고했다.
// (아마란스 무기 5슬롯 90% 목표: 실제 약 200만 회인데 4.9만 회로 표시)
// ============================================================

/** 한 슬롯의 추첨 값이 minValue 이상일 확률 — 균등 격자의 꼬리확률 (정확값) */
export function valuePassProb(part, target, stage = 'base', minPct = DEFAULT_BINDING_MIN_PCT) {
  const opt = (part.options || []).find((o) => o.key === target.optionKey);
  if (!opt) return 0;
  const r = rangeFor(opt, stage, minPct);
  const step = r.step && r.step > 0 ? r.step : 1;
  const n = Math.floor((r.hi - r.lo) / step + 1e-9) + 1;
  if (n <= 0) return 0;
  const need = Number(target.minValue);
  if (!Number.isFinite(need) || need <= r.lo) return 1;
  if (need > r.hi + 1e-9) return 0;
  const jMin = Math.ceil((need - r.lo) / step - 1e-9);
  return Math.max(0, n - jMin) / n;
}

/**
 * 목표 프로세스의 해석적 파라미터.
 *   q          — 장비 1개가 모든 목표를 통과할 확률
 *   expTries   — 장비 1개당 평균 시도 횟수 (Σ R_i)
 *   muFail/sdFail — 실패한 장비 1개의 시도 횟수 평균/표준편차
 *   pDestroyFail  — 실패한 장비가 "파괴"로 끝났을 확률 (나머지는 값 미달 포기)
 */
export function analyzeTargetProcess(part, targets, enchantTypeKey, stage = 'base', opts) {
  const type = NORMAL_ENCHANT_TYPES[enchantTypeKey];
  if (!type) throw new Error(`unknown enchant type: ${enchantTypeKey}`);
  const { minPct, mythic } = normalizeOpts(opts);
  const rate = effectiveSuccessRate(enchantTypeKey, mythic, part);

  const T = targets.length;
  const a = targets.map((t) => rate * valuePassProb(part, t, stage, minPct));

  const R = [];
  let acc = 1;
  for (let i = 0; i < T; i++) {
    R.push(acc);
    acc *= a[i];
  }
  const q = acc;
  const expTries = R.reduce((s, r) => s + r, 0);
  const reachSum = expTries; // Σ R_i — 파괴 기대값 계산에도 그대로 쓰인다

  // 실패 사이클 조건부 분포
  const failPmf = [];
  for (let i = 0; i < T; i++) failPmf.push(R[i] * (1 - a[i]));
  const failTotal = 1 - q;
  let muFail = 0;
  let m2Fail = 0;
  if (failTotal > 0) {
    for (let i = 0; i < T; i++) {
      const p = failPmf[i] / failTotal;
      muFail += (i + 1) * p;
      m2Fail += (i + 1) * (i + 1) * p;
    }
  }
  const sdFail = Math.sqrt(Math.max(0, m2Fail - muFail * muFail));
  const pDestroyFail = failTotal > 0 ? ((1 - rate) * reachSum) / failTotal : 0;

  return {
    rate,
    a,
    R,
    q,
    T,
    expTries,
    expDestroyed: (1 - rate) * reachSum,
    muFail,
    sdFail,
    pDestroyFail,
    failPmf,
    failTotal,
    hammerCost: type.hammerCost,
    elyCost: type.elyCost,
    minPct,
  };
}

// 첫 성공 전까지의 "실패한 장비 수" — 기하분포 역 CDF (0, 1, 2, ... )
function sampleFailedCycles(q) {
  if (!(q > 0)) return Infinity;
  if (q >= 1) return 0;
  const u = 1 - Math.random(); // (0, 1]
  return Math.max(0, Math.ceil(Math.log(u) / Math.log(1 - q)) - 1);
}

function gauss() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 실패 사이클 하나를 추첨 → { tries, destroyed }
function sampleFailCycle(A) {
  let r = Math.random() * A.failTotal;
  let slot = A.T;
  for (let i = 0; i < A.T; i++) {
    r -= A.failPmf[i];
    if (r <= 1e-15) {
      slot = i + 1;
      break;
    }
  }
  // 그 슬롯에서 멈춘 이유가 "파괴"였을 확률
  const aI = A.a[slot - 1];
  const pDestroy = 1 - aI > 0 ? (1 - A.rate) / (1 - aI) : 0;
  return { tries: slot, destroyed: Math.random() < pDestroy ? 1 : 0 };
}

// 실패 사이클이 이 개수를 넘으면 개별 추첨 대신 정규근사로 합산 (분포는 사실상 동일)
const EXACT_CYCLE_LIMIT = 300;

// 첫 성공까지의 누적 소모를 1회 추첨 — 실패 사이클을 하나씩 굴리지 않는다
function sampleTotals(A) {
  const m = sampleFailedCycles(A.q);
  let tries = A.T;
  let destroyed = 0;
  if (!Number.isFinite(m)) return { tries: Infinity, destroyed: Infinity };
  if (m <= EXACT_CYCLE_LIMIT) {
    for (let j = 0; j < m; j++) {
      const c = sampleFailCycle(A);
      tries += c.tries;
      destroyed += c.destroyed;
    }
  } else {
    tries += Math.max(m, Math.round(m * A.muFail + Math.sqrt(m) * A.sdFail * gauss()));
    const pd = A.pDestroyFail;
    destroyed = Math.max(
      0,
      Math.min(m, Math.round(m * pd + Math.sqrt(m * pd * (1 - pd)) * gauss())),
    );
  }
  return { tries, destroyed };
}

// 목표치 이상으로 잘라낸 균등 분포에서 값 추첨
function rollValueAtLeast(range, minValue) {
  const step = range.step && range.step > 0 ? range.step : 1;
  const lo = Math.max(range.lo, Math.ceil((minValue - range.lo) / step - 1e-9) * step + range.lo);
  return rollValue(Math.min(lo, range.hi), range.hi, range.step);
}

/**
 * 1번 실행 — 목표를 만족한 장비 1개와 거기까지의 누적 소모.
 * 성공 장비는 조건부 분포에서 직접 조립하므로 q 가 아무리 작아도 즉시 반환된다.
 * maxAttempts 인자는 후방 호환용으로 남겨두지만 사용하지 않는다.
 */
export function simulateUntilTargetMet(
  part,
  targets,
  enchantTypeKey,
  stage = 'base',
  maxAttempts, // eslint-disable-line no-unused-vars
  opts,
) {
  if (!targets || targets.length === 0) {
    return { completed: false, tries: 0, hammerUsed: 0, elyUsed: 0, destroyed: 0, finalSlots: [] };
  }
  const A = analyzeTargetProcess(part, targets, enchantTypeKey, stage, opts);
  if (!(A.q > 0)) {
    return { completed: false, tries: 0, hammerUsed: 0, elyUsed: 0, destroyed: 0, finalSlots: [] };
  }

  const { tries, destroyed } = sampleTotals(A);
  const finalSlots = targets.map((t) => {
    const opt = part.options.find((o) => o.key === t.optionKey);
    const r = rangeFor(opt, stage, A.minPct);
    return {
      optionKey: t.optionKey,
      label: opt.label,
      unit: opt.unit,
      value: rollValueAtLeast(r, Number(t.minValue)),
    };
  });

  return {
    completed: true,
    tries,
    hammerUsed: tries * A.hammerCost,
    elyUsed: tries * A.elyCost,
    destroyed,
    finalSlots,
  };
}

// ============================================================
// 일반 장비 인챈트 — 목표 도달 통계
//   평균은 해석적 정확값, 분위수는 누적 소모를 직접 추첨한 표본에서 산출.
//   (실패 사이클을 하나씩 굴리지 않으므로 q ~ 1e-13 이어도 즉시 끝난다)
// ============================================================
export function computeTargetStats(
  part,
  targets,
  enchantTypeKey,
  stage = 'base',
  runs = ENCHANT_SIM.TARGET_MC_RUNS,
  opts,
) {
  if (!targets || targets.length === 0) return null;
  const A = analyzeTargetProcess(part, targets, enchantTypeKey, stage, opts);
  if (!(A.q > 0)) {
    return {
      feasible: false,
      cycleSuccessRate: 0,
      runs: 0,
      mean: { tries: Infinity, hammer: Infinity, ely: Infinity, destroyed: Infinity },
      p50: { tries: Infinity, hammer: Infinity, ely: Infinity, destroyed: Infinity },
      p90: { tries: Infinity, hammer: Infinity, ely: Infinity, destroyed: Infinity },
      p99: { tries: Infinity, hammer: Infinity, ely: Infinity, destroyed: Infinity },
    };
  }

  const samples = { tries: [], hammer: [], ely: [], destroyed: [] };
  for (let i = 0; i < runs; i++) {
    const s = sampleTotals(A);
    samples.tries.push(s.tries);
    samples.hammer.push(s.tries * A.hammerCost);
    samples.ely.push(s.tries * A.elyCost);
    samples.destroyed.push(s.destroyed);
  }

  const dist = buildDistributionStats(samples);
  // 평균은 표본이 아니라 닫힌 수식의 정확값으로 대체 — E[시도] = (Σ R_i) / q
  const meanTries = A.expTries / A.q;
  dist.mean = {
    tries: meanTries,
    hammer: meanTries * A.hammerCost,
    ely: meanTries * A.elyCost,
    destroyed: A.expDestroyed / A.q,
  };

  return {
    feasible: true,
    cycleSuccessRate: A.q,
    meanCycles: 1 / A.q,
    runs,
    ...dist,
  };
}

// ============================================================
// 특수장비 인챈트 — 옵션 1슬롯을 1단계 강화
// ============================================================
export function levelUpSpecial(optionKey, currentLevel) {
  if (currentLevel >= SPECIAL_ENCHANT_MAX_LEVEL) {
    return { success: false, reason: 'max level' };
  }
  const opt = SPECIAL_ENCHANT_OPTIONS[optionKey];
  if (!opt) throw new Error(`unknown special option: ${optionKey}`);

  const nextLv = currentLevel + 1;
  const range = opt.levels[nextLv - 1];
  const value = rollInt(range.lo, range.hi);
  const cost = SPECIAL_ENCHANT_COSTS[nextLv - 1];

  return {
    success: true,
    optionKey,
    label: opt.label,
    unit: opt.unit,
    level: nextLv,
    value,
    cost: { material: cost.material, ely: cost.ely },
  };
}
