/**
 * 메모리얼 시뮬레이션
 *
 * 한 번 굴림 = 1 카드:
 *   1) Qdist 분포로 줄 수 K 결정 (1~4)
 *   2) K개의 줄 각각에 대해 weight 정규화 후 tier 선택
 *   3) 선택된 tier의 [lo, hi] 안에서 정수(또는 step) 균등 분포로 값 결정
 *
 * 시뮬 모드 (사용자 의도): 단일 카드 합 도달 (베이스 라벨 기준)
 *   - 한 카드에서 목표 베이스 옵션의 값 합이 목표 ≥ 일 때 성공
 *   - 같은 옵션의 모든 티어([1]~[5])가 합산됨
 *   - 올스탯 라인은 다른 스탯 목표에도 기여 (게임 내 올스탯 = 전 스탯)
 *   - 카드 간 누적 X (각 카드는 독립 시도)
 *
 * ── 통계/샘플 카드 산출 방식 — 해석적 (analytical) 접근 ──────────
 *   - 단일 카드 성공 확률 p 를 닫힌 계산으로 정확히 구한다 (MC 추정 아님)
 *   - 평균/분위수는 기하분포 닫힌 수식
 *   - "성공 카드 1장"은 성공 조건부 분포에서 직접 조립 (rejection sampling 우회)
 *   - "N회차에 도달"은 기하분포 역 CDF 로 1번만 추첨
 *
 *   → p ~ 1e-6 처럼 희박한 목표(brute-force 로는 평균 수십만 회)도 즉시 처리되고,
 *     "도달 실패" 오탐이나 실행마다 몇 배씩 흔들리는 평균 회차가 사라진다.
 *
 * ── p 계산 원리 ──────────────────────────────────────────────
 * 줄 하나는 티어 하나를 뽑는 것과 같으므로, 카드는 "티어 k개의 조합"이다.
 * 목표에 전혀 기여하지 않는 티어는 전부 하나의 "무관" 클래스로 합쳐도 결과가
 * 같으므로, 열거 대상은 (목표 기여 티어 + 무관 1개) 의 크기 k 중복조합뿐이다.
 *
 * 조합이 정해지면 목표별 합은 독립 균등분포의 합 → 컨볼루션으로 정확히 계산한다.
 * 유일한 예외가 올스탯 라인인데, 이건 모든 목표에 같은 값을 동시에 더하므로
 * "올스탯 합 A" 하나로만 목표들이 얽힌다. A 로 조건부를 걸면 나머지는 다시 독립:
 *
 *   P(성공 | 조합) = Σ_a P(A = a) × Π_t P(목표 t 의 전용 라인 합 ≥ 목표치_t − a)
 */

import { lineContributesTo } from '../data/memorialProbabilities.js';
import { rollValue } from './random.js';
import { MEMORIAL_SIM } from './simConstants.js';

// ============================================================
// 헬퍼 — 자연 분포 굴림
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

function makeLine(memorial, tier, value) {
  const [lo, hi, , label] = tier;
  return {
    label: decorateLabelWithTier(memorial.tiers, tier, label),
    value,
    lo,
    hi,
  };
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// 한 카드 1회 굴리기 — [{ label, value, lo, hi }, ...]
// tier 형식: [lo, hi, weight, label, step?] — step 생략 시 정수 균등
// ============================================================
export function rollOnce(memorial) {
  const k = pickByQdist(memorial.qdist);
  const lines = [];
  for (let i = 0; i < k; i++) {
    const tier = pickTierByWeight(memorial.tiers);
    lines.push(makeLine(memorial, tier, rollValue(tier[0], tier[1], tier[4])));
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

function cardMeetsAllTargets(lines, targets) {
  for (const t of targets) {
    if (cardSumFor(lines, t.base) < t.value - 1e-9) return false;
  }
  return true;
}

function perTargetSums(lines, targets) {
  return targets.map((t) => ({
    base: t.base,
    value: t.value,
    sum: Math.round(cardSumFor(lines, t.base) * 10) / 10,
  }));
}

// ============================================================
// 해석 모델 — 정수 스케일 위에서의 이산 분포 계산
// ============================================================

// 같은 베이스를 두 번 고른 경우 큰 목표치 하나로 합친다.
// (한 카드의 같은 베이스 합은 하나의 값이므로 max 만 남기는 게 유일한 해석)
function dedupeTargets(rawTargets) {
  const map = new Map();
  for (const t of rawTargets || []) {
    const v = Number(t.value);
    if (!t.base || !Number.isFinite(v) || v <= 0) continue;
    const prev = map.get(t.base);
    if (prev === undefined || v > prev) map.set(t.base, v);
  }
  return Array.from(map, ([base, value]) => ({ base, value }));
}

function tierIsFractional(tier) {
  const step = tier[4];
  return (step != null && step < 1) || !Number.isInteger(tier[0]) || !Number.isInteger(tier[1]);
}

// 티어를 정수 스케일 위의 균등분포 스펙으로 — {lo, hi, stride, m}
function scaledSpec(tier, scale) {
  const step = tier[4] != null && tier[4] > 0 ? tier[4] : 1;
  const lo = Math.round(tier[0] * scale);
  const hi = Math.round(tier[1] * scale);
  const stride = Math.max(1, Math.round(step * scale));
  const m = Math.max(1, Math.floor((hi - lo) / stride) + 1);
  return { lo, hi, stride, m };
}

// f(길이 cap+1, f[cap] = P(합 ≥ cap)) 에 균등분포 하나를 컨볼루션.
// 등차수열 위의 균등분포이므로 stride 잉여류별 누적합으로 O(cap) 에 처리한다.
function convolveUniform(f, cap, spec) {
  const { lo, hi, stride, m } = spec;
  const g = new Float64Array(cap + 1);
  // P[y] = Σ_{t ≤ y, t ≡ y (mod stride)} f[t]   — cap 버킷(초과분)은 제외
  const P = new Float64Array(cap + 1);
  for (let y = 0; y <= cap; y++) {
    const base = y === cap ? 0 : f[y];
    P[y] = base + (y - stride >= 0 ? P[y - stride] : 0);
  }
  const span = m * stride;
  for (let y = lo; y < cap; y++) {
    const i = y - lo;
    const j = i - span;
    const v = (P[i] - (j >= 0 ? P[j] : 0)) / m;
    if (v > 0) g[y] = v;
  }

  // cap 버킷 = P(합 ≥ cap). `1 - Σ` 로 구하면 상쇄오차 때문에 확률이 0인 조합에도
  // 1e-17 짜리 유령 질량이 남아 "불가능한 목표가 가능해 보이는" 결과를 만든다.
  // 꼬리 쪽에서 직접 더해 정확히 계산한다.
  let over = f[cap]; // 이미 ≥cap 인 질량은 무엇을 더해도 ≥cap
  for (let y = 0; y < cap; y++) {
    const fv = f[y];
    if (fv === 0) continue;
    const need = cap - y;
    let cnt;
    if (need <= lo) cnt = m;
    else if (need > hi) cnt = 0;
    else cnt = m - Math.ceil((need - lo) / stride);
    if (cnt > 0) over += fv * (cnt / m);
  }
  g[cap] = over;
  return g;
}

// 티어 목록의 합 분포 → 꼬리확률 배열 tail[r] = P(합 ≥ r), r = 0..cap
function tailArray(tiers, cap, scale) {
  let f = new Float64Array(cap + 1);
  f[0] = 1;
  for (const tier of tiers) f = convolveUniform(f, cap, scaledSpec(tier, scale));
  const tail = new Float64Array(cap + 1);
  let acc = 0;
  for (let r = cap; r >= 0; r--) {
    acc += f[r];
    tail[r] = Math.min(1, acc);
  }
  return tail;
}

// 티어 목록의 합 분포 (절단 없는 정확 pmf) — 올스탯 합 A 처럼 지지집합이 작을 때만 사용
function exactPmf(tiers, scale) {
  let maxSum = 0;
  for (const tier of tiers) maxSum += Math.round(tier[1] * scale);
  let f = new Float64Array(maxSum + 1);
  f[0] = 1;
  let cur = 0;
  for (const tier of tiers) {
    const { lo, stride, m } = scaledSpec(tier, scale);
    const next = new Float64Array(maxSum + 1);
    for (let y = 0; y <= cur; y++) {
      const p = f[y];
      if (p === 0) continue;
      const share = p / m;
      for (let j = 0; j < m; j++) next[y + lo + j * stride] += share;
    }
    cur += Math.round(tier[1] * scale);
    f = next;
  }
  return f;
}

const MAX_DP_LEN = 400_000;

// 어떤 카드로도 목표를 만족할 수 없음이 확정된 경우 (기여 티어 부재)
const IMPOSSIBLE = Symbol('impossible');

/**
 * 목표 조건을 해석적으로 계산하기 위한 모델.
 *   - 정상: model 객체
 *   - IMPOSSIBLE: p = 0 확정
 *   - null: 해석 모델의 가정을 벗어남 → 호출자가 MC 로 폴백
 */
function buildModel(memorial, rawTargets) {
  const targets = dedupeTargets(rawTargets);
  const T = targets.length;
  if (T === 0) return null;

  const W = memorial.tiers.reduce((s, t) => s + t[2], 0);
  if (!(W > 0)) return null;

  // 티어별 기여 마스크
  const relevant = [];
  const irrelevant = [];
  let irrelevantW = 0;
  for (const tier of memorial.tiers) {
    let mask = 0;
    for (let i = 0; i < T; i++) {
      if (lineContributesTo(tier[3], targets[i].base)) mask |= 1 << i;
    }
    if (mask === 0) {
      irrelevant.push(tier);
      irrelevantW += tier[2];
    } else {
      relevant.push({ tier, mask });
    }
  }
  // 기여 티어가 하나도 없는 목표가 있으면 그 목표는 어떤 카드로도 충족 불가 → p = 0 확정
  for (let i = 0; i < T; i++) {
    if (!relevant.some((r) => r.mask & (1 << i))) return IMPOSSIBLE;
  }

  // 여러 목표에 동시에 기여하는 라인(=올스탯)은 전 목표에 같은 값을 더하는 형태여야
  // "합 A 하나로 조건부" 분해가 성립한다. 데이터상 항상 성립하지만 방어적으로 검사.
  const fullMask = (1 << T) - 1;
  let sharedMask = 0;
  for (const r of relevant) {
    if (r.mask === fullMask && T > 1) sharedMask = fullMask;
    else if (r.mask !== 0 && (r.mask & (r.mask - 1)) !== 0) return null; // 부분 다중 기여 → 미지원
  }

  const scale = relevant.some((r) => tierIsFractional(r.tier)) ? 10 : 1;

  // 격자 위의 "목표 이상" 경계 — 0.4 처럼 격자에 없는 목표는 올림이 정답
  const caps = targets.map((t) => Math.max(0, Math.ceil(t.value * scale - 1e-9)));
  if (caps.some((c) => c > MAX_DP_LEN)) return null;

  // 클래스 = 목표 기여 티어 각각 + (있으면) 무관 티어 묶음 1개
  const classes = relevant.map((r) => ({ ...r, p: r.tier[2] / W }));
  const irrelevantClassIdx = irrelevantW > 0 ? classes.length : -1;
  if (irrelevantW > 0) classes.push({ tier: null, mask: 0, p: irrelevantW / W });

  return {
    memorial,
    targets,
    T,
    scale,
    caps,
    classes,
    irrelevant,
    irrelevantClassIdx,
    sharedMask,
    tailCache: new Map(),
    pmfCache: new Map(),
  };
}

function tailFor(model, targetIdx, tierIdxs) {
  const key = `${targetIdx}|${tierIdxs.join(',')}`;
  let v = model.tailCache.get(key);
  if (v === undefined) {
    v = tailArray(
      tierIdxs.map((i) => model.classes[i].tier),
      model.caps[targetIdx],
      model.scale,
    );
    model.tailCache.set(key, v);
  }
  return v;
}

function pmfFor(model, tierIdxs) {
  const key = tierIdxs.join(',');
  let v = model.pmfCache.get(key);
  if (v === undefined) {
    v = exactPmf(
      tierIdxs.map((i) => model.classes[i].tier),
      model.scale,
    );
    model.pmfCache.set(key, v);
  }
  return v;
}

// 한 조합(클래스 인덱스 배열)의 성공 확률
function combinationSuccess(model, pick) {
  const { T, caps, classes, sharedMask } = model;
  const shared = [];
  const own = Array.from({ length: T }, () => []);
  for (const ci of pick) {
    const mask = classes[ci].mask;
    if (mask === 0) continue;
    if (sharedMask !== 0 && mask === sharedMask) {
      shared.push(ci);
      continue;
    }
    for (let t = 0; t < T; t++) {
      if (mask & (1 << t)) own[t].push(ci);
    }
  }

  const tails = own.map((list, t) => tailFor(model, t, list));

  if (shared.length === 0) {
    let p = 1;
    for (let t = 0; t < T; t++) {
      p *= tails[t][caps[t]];
      if (p === 0) return { p: 0, shared, own, tails, pmfA: null };
    }
    return { p, shared, own, tails, pmfA: null };
  }

  const pmfA = pmfFor(model, shared);
  let p = 0;
  for (let a = 0; a < pmfA.length; a++) {
    const pa = pmfA[a];
    if (pa === 0) continue;
    let prod = 1;
    for (let t = 0; t < T; t++) {
      const r = caps[t] - a;
      if (r <= 0) continue;
      prod *= tails[t][r];
      if (prod === 0) break;
    }
    p += pa * prod;
  }
  return { p, shared, own, tails, pmfA };
}

function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/**
 * 크기 k 중복조합 전수 열거 → [{ pick, weight }] (weight = 그 조합이 나올 확률 × 성공확률)
 * pick 은 비내림차순 클래스 인덱스 배열.
 */
function enumerateCombinations(model, k) {
  const C = model.classes.length;
  const out = [];
  const pick = new Array(k);
  const kFact = factorial(k);

  const walk = (pos, start, prob) => {
    if (prob === 0) return;
    if (pos === k) {
      // 다항계수 = k! / Π (같은 클래스 반복수)!
      let coeff = kFact;
      let run = 1;
      for (let i = 1; i <= k; i++) {
        if (i < k && pick[i] === pick[i - 1]) run++;
        else {
          coeff /= factorial(run);
          run = 1;
        }
      }
      const succ = combinationSuccess(model, pick);
      if (succ.p > 0) {
        out.push({ pick: pick.slice(), weight: coeff * prob * succ.p, detail: succ });
      }
      return;
    }
    for (let c = start; c < C; c++) {
      pick[pos] = c;
      walk(pos + 1, c, prob * model.classes[c].p);
    }
  };
  walk(0, 0, 1);
  return out;
}

/**
 * 단일 카드 성공 확률 (해석적 정확값) + 성공 조건부 조합 표본.
 * 반환: { p, byK: [{ k, weight, combos }] }  — 실패(모델 불가) 시 null
 */
function analyze(memorial, rawTargets) {
  const model = buildModel(memorial, rawTargets);
  if (model === IMPOSSIBLE) return { p: 0, byK: [], model: null };
  if (!model) return null;

  let p = 0;
  const byK = [];
  for (const [kStr, pk] of Object.entries(memorial.qdist)) {
    const k = Number(kStr);
    if (!(pk > 0) || k <= 0) continue;
    const combos = enumerateCombinations(model, k);
    let sub = 0;
    for (const c of combos) sub += c.weight;
    if (sub > 0) byK.push({ k, weight: pk * sub, combos });
    p += pk * sub;
  }
  return { p: Math.min(1, p), byK, model };
}

// ============================================================
// 조건부 샘플링 — 성공 카드 조립
// ============================================================
function pickWeighted(items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  if (!(total > 0)) return items[items.length - 1] ?? null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r <= 1e-12) return it;
  }
  return items[items.length - 1];
}

// 합이 정확히 a 가 되도록 티어별 값을 순차 조건부 추첨 (스케일 정수 단위)
function sampleValuesWithSum(model, tierIdxs, a) {
  const out = [];
  let remaining = a;
  for (let i = 0; i < tierIdxs.length; i++) {
    const spec = scaledSpec(model.classes[tierIdxs[i]].tier, model.scale);
    const restPmf = pmfFor(model, tierIdxs.slice(i + 1));
    const cands = [];
    for (let j = 0; j < spec.m; j++) {
      const x = spec.lo + j * spec.stride;
      const need = remaining - x;
      const w = need >= 0 && need < restPmf.length ? restPmf[need] : 0;
      if (w > 0) cands.push({ x, w });
    }
    const chosen = pickWeighted(cands, (c) => c.w);
    const x = chosen ? chosen.x : spec.lo;
    out.push(x);
    remaining -= x;
  }
  return out;
}

// 합이 r 이상이 되도록 티어별 값을 순차 조건부 추첨 (스케일 정수 단위)
function sampleValuesAtLeast(model, targetIdx, tierIdxs, r) {
  const cap = model.caps[targetIdx];
  const out = [];
  let remaining = r;
  for (let i = 0; i < tierIdxs.length; i++) {
    const spec = scaledSpec(model.classes[tierIdxs[i]].tier, model.scale);
    const restTail = tailFor(model, targetIdx, tierIdxs.slice(i + 1));
    const cands = [];
    for (let j = 0; j < spec.m; j++) {
      const x = spec.lo + j * spec.stride;
      const need = remaining - x;
      const w = need <= 0 ? 1 : need <= cap ? restTail[need] : 0;
      if (w > 0) cands.push({ x, w });
    }
    const chosen = pickWeighted(cands, (c) => c.w);
    const x = chosen ? chosen.x : spec.hi;
    out.push(x);
    remaining -= x;
  }
  return out;
}

/**
 * 모든 목표를 만족하는 카드 한 장을, 성공 카드의 조건부 분포에서 직접 조립한다.
 * 재추첨이 없으므로 p 가 아무리 작아도 즉시 반환된다.
 */
function constructSuccessCard(analysis) {
  const { byK, model } = analysis;
  if (byK.length === 0) return null;

  const kEntry = pickWeighted(byK, (e) => e.weight);
  const combo = pickWeighted(kEntry.combos, (c) => c.weight);
  if (!combo) return null;

  const { shared, own, tails, pmfA } = combo.detail;
  const { scale, caps, T } = model;

  // 올스탯 합 A — 성공 조건부 분포에서 추첨
  let a = 0;
  if (shared.length > 0) {
    const cands = [];
    for (let v = 0; v < pmfA.length; v++) {
      if (pmfA[v] === 0) continue;
      let prod = 1;
      for (let t = 0; t < T; t++) {
        const r = caps[t] - v;
        if (r <= 0) continue;
        prod *= tails[t][r];
        if (prod === 0) break;
      }
      if (prod > 0) cands.push({ v, w: pmfA[v] * prod });
    }
    const chosen = pickWeighted(cands, (c) => c.w);
    a = chosen ? chosen.v : 0;
  }

  const lines = [];
  const push = (classIdx, scaledValue) => {
    const tier = model.classes[classIdx].tier;
    lines.push(makeLine(model.memorial, tier, scale === 1 ? scaledValue : Math.round(scaledValue) / scale));
  };

  if (shared.length > 0) {
    const vals = sampleValuesWithSum(model, shared, a);
    shared.forEach((ci, i) => push(ci, vals[i]));
  }
  for (let t = 0; t < T; t++) {
    if (own[t].length === 0) continue;
    const vals = sampleValuesAtLeast(model, t, own[t], caps[t] - a);
    own[t].forEach((ci, i) => push(ci, vals[i]));
  }

  // 무관 라인 — 자연 분포 그대로
  const irrelevantCount = combo.pick.filter((ci) => ci === model.irrelevantClassIdx).length;
  for (let i = 0; i < irrelevantCount; i++) {
    const tier = pickTierByWeight(model.irrelevant);
    lines.push(makeLine(model.memorial, tier, rollValue(tier[0], tier[1], tier[4])));
  }

  return shuffleInPlace(lines);
}

// ============================================================
// 시도 횟수 추첨 (기하분포 역 CDF)
//   X ~ Geom(p) ⇒ X = ⌈ln(U)/ln(1-p)⌉, U ~ Uniform(0, 1]
//   brute-force 로 실제 굴렸을 때 만나는 회차 분포와 통계적으로 동일.
// ============================================================
export function sampleGeometricTries(p) {
  if (!(p > 0)) return Infinity;
  if (p >= 1) return 1;
  const u = 1 - Math.random(); // (0, 1]
  return Math.max(1, Math.ceil(Math.log(u) / Math.log(1 - p)));
}

// ============================================================
// 1번 실행 — 성공 카드 + 도달 회차
//   maxTries 인자는 후방 호환용으로 남겨두지만 사용하지 않는다.
// ============================================================
export function simulateUntilSingleCardReaches(memorial, rawTargets /* , maxTries */) {
  const targets = dedupeTargets(rawTargets);
  if (targets.length === 0) {
    return { tries: 0, sums: [], winningLines: [], success: false };
  }

  const analysis = analyze(memorial, targets);
  if (analysis) {
    // p = 0 이면 어떤 카드로도 불가능하다는 뜻 — 굴려볼 필요가 없다
    const lines = analysis.p > 0 ? constructSuccessCard(analysis) : null;
    if (!lines) return { tries: 0, sums: [], winningLines: [], success: false };
    return {
      tries: sampleGeometricTries(analysis.p),
      sums: perTargetSums(lines, targets),
      winningLines: lines,
      success: true,
    };
  }

  // 해석 모델의 가정을 벗어난 구조에서만 기존 방식으로 폴백 (실제 데이터에선 도달하지 않음)
  const maxTries = MEMORIAL_SIM.SAMPLE_MAX_TRIES;
  for (let tries = 1; tries <= maxTries; tries++) {
    const lines = rollOnce(memorial);
    if (cardMeetsAllTargets(lines, targets)) {
      return { tries, sums: perTargetSums(lines, targets), winningLines: lines, success: true };
    }
  }
  return { tries: maxTries, sums: [], winningLines: [], success: false };
}

// ============================================================
// 단일 카드 성공 확률 — 해석적 정확값
// ============================================================
export function singleCardSuccessRate(memorial, rawTargets) {
  const analysis = analyze(memorial, rawTargets);
  if (analysis) return analysis.p;
  return estimateSingleCardSuccessRate(memorial, rawTargets);
}

// ============================================================
// (참고/검증용) Monte Carlo 추정 — 해석값 교차검증에 사용
// ============================================================
export function estimateSingleCardSuccessRate(memorial, rawTargets, runs = MEMORIAL_SIM.ESTIMATE_PHASE1) {
  const targets = dedupeTargets(rawTargets);
  if (targets.length === 0) return 0;
  let success = 0;
  for (let i = 0; i < runs; i++) {
    if (cardMeetsAllTargets(rollOnce(memorial), targets)) success++;
  }
  return success / runs;
}

// ============================================================
// 기하분포 기반 통계
//   E[X] = 1/p,  P(X ≤ k) = 1 - (1-p)^k,  분위수 k_q = ⌈ln(1-q)/ln(1-p)⌉
// ============================================================
export function computeStatistics(memorial, rawTargets) {
  const targets = dedupeTargets(rawTargets);
  if (targets.length === 0) {
    return { successRate: 0, mean: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, p999: 0 };
  }

  const p = singleCardSuccessRate(memorial, targets);
  if (!(p > 0)) {
    return {
      successRate: 0,
      mean: Infinity,
      p25: Infinity, p50: Infinity, p75: Infinity, p90: Infinity, p99: Infinity, p999: Infinity,
    };
  }
  if (p >= 1) {
    return { successRate: 1, mean: 1, p25: 1, p50: 1, p75: 1, p90: 1, p99: 1, p999: 1 };
  }

  const log1mp = Math.log(1 - p);
  const quantile = (q) => Math.max(1, Math.ceil(Math.log(1 - q) / log1mp));

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
    exp += (w / sumW) * ((lo + hi) / 2);
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
//   = 기여 가능한 티어 중 max hi × qdist 최대 줄 수
// ============================================================
export function maxPossibleSingleCard(memorial, targetBase) {
  const contributing = memorial.tiers.filter((t) => lineContributesTo(t[3], targetBase));
  if (contributing.length === 0) return 0;
  const maxLineValue = Math.max(...contributing.map((t) => t[1]));
  const maxK = Math.max(...Object.keys(memorial.qdist).map(Number));
  return Math.round(maxLineValue * maxK * 10) / 10;
}

// ============================================================
// 결과 포맷
// ============================================================
export function formatResult(memorial, targets, stats) {
  const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : Infinity);
  return {
    targets: dedupeTargets(targets).map((t) => ({ base: t.base, value: t.value })),
    successRate: stats.successRate,
    mean: round1(stats.mean),
    p50: stats.p50,
    p90: stats.p90,
    p99: stats.p99,
    p999: stats.p999,
  };
}
