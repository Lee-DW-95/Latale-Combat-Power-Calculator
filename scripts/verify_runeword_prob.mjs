/**
 * 룬워드 목표 확률 DP 검증
 *
 *   node scripts/verify_runeword_prob.mjs
 *
 * 조합론 DP(successProbability) 를
 *   ① 해석해가 있는 케이스(초기하분포 / 왕룬 1/30 / 포함배제)
 *   ② Monte Carlo 표본
 * 두 축으로 교차검증한다.
 *
 * 룬 하나 = 옵션 하나다. 헌신(최소 +50%) / 파괴(최대 +50%) / 헌신 & 파괴(둘 다) 는
 * 서로 다른 옵션이므로 목표도 룬 id 로 지정한다.
 */

import {
  successProbability,
  normalizeTarget,
  matchesTarget,
  rollRuneWord,
  maxAchievableTotal,
  sampleSatisfyingResult,
} from '../src/utils/runeWordSim.js';
import { MAX_TOTAL, RUNES } from '../src/data/runeWordData.js';

const N = 30;
const K = 8;

function comb(n, r) {
  if (r < 0 || r > n) return 0;
  const k = Math.min(r, n - r);
  let out = 1;
  for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
  return out;
}

// 지정한 룬들이 "하나도 안 뽑힐" 확률
const pNone = (m) => comb(N - m, K) / comb(N, K);
// 지정한 룬들 중 "1개 이상 뽑힐" 확률
const pAny = (m) => 1 - pNone(m);

function monteCarlo(target, runs) {
  let hit = 0;
  for (let i = 0; i < runs; i++) {
    if (matchesTarget(rollRuneWord(), target)) hit++;
  }
  return hit / runs;
}

const MC_RUNS = 2_000_000;

// 룬 id 참조
const 헌신 = 6, 파괴 = 8, 파멸 = 10, 통찰 = 19, 헌신파괴 = 25, 악몽죽음 = 28, 파멸폭주 = 29;

// 점수 상위 8종 — 왕룬 배분과 조합 추출 검증에 쓴다
const TOP8 = [...RUNES].sort((a, b) => b.score - a.score).slice(0, 8).map((r) => r.id);

const RUNE_CASES = [
  {
    label: '조건 없음',
    raw: { runeIds: [], mode: 'all', kingId: null, minTotal: 0 },
    analytic: 1,
  },
  {
    label: '통찰 포함',
    raw: { runeIds: [통찰], mode: 'all', kingId: null, minTotal: 0 },
    analytic: K / N,
  },
  {
    label: '왕룬 = 악몽&죽음',
    raw: { runeIds: [], mode: 'all', kingId: 악몽죽음, minTotal: 0 },
    analytic: 1 / N,
  },
  {
    label: '통찰 + 악몽&죽음 둘 다 포함',
    raw: { runeIds: [통찰, 악몽죽음], mode: 'all', kingId: null, minTotal: 0 },
    analytic: comb(N - 2, K - 2) / comb(N, K),
  },
  {
    label: '악몽&죽음이 왕룬 + 통찰 포함',
    raw: { runeIds: [통찰], mode: 'all', kingId: 악몽죽음, minTotal: 0 },
    analytic: (1 / N) * (comb(N - 2, K - 2) / comb(N - 1, K - 1)),
  },
  {
    label: '파멸/헌신&파괴/악몽&죽음 중 2개 이상',
    raw: { runeIds: [파멸, 헌신파괴, 악몽죽음], mode: 'atLeast', atLeast: 2, kingId: null, minTotal: 0 },
    analytic:
      (comb(3, 2) * comb(N - 3, K - 2) + comb(3, 3) * comb(N - 3, K - 3)) / comb(N, K),
  },
  {
    label: '총점 471 이상 (최상급)',
    raw: { runeIds: [], mode: 'all', kingId: null, minTotal: 471 },
    analytic: null,
  },
  {
    label: '통찰 포함 + 총점 400 이상',
    raw: { runeIds: [통찰], mode: 'all', kingId: null, minTotal: 400 },
    analytic: null,
  },
  {
    label: `이론 최대 총점 ${MAX_TOTAL}`,
    raw: { runeIds: [], mode: 'all', kingId: null, minTotal: MAX_TOTAL },
    analytic: null,
  },
];

// 룬 하나 = 옵션 하나이므로 "옵션 목표" 도 룬 id 로 지정한다.
// 여러 룬 중 아무거나를 원하는 경우만 mode='atLeast' 로 표현한다.
const OPTION_CASES = [
  {
    label: '파멸 (크리티컬 대미지 +50%)',
    raw: { runeIds: [파멸], mode: 'all', kingId: null, minTotal: 0 },
    analytic: K / N,
  },
  {
    label: '파멸 & 폭주 (크댐 +50%, 크확 +1%)',
    raw: { runeIds: [파멸폭주], mode: 'all', kingId: null, minTotal: 0 },
    analytic: K / N,
  },
  {
    label: '★크댐이 붙기만 하면 됨 = 파멸 | 파멸 & 폭주 중 1개 이상',
    raw: { runeIds: [파멸, 파멸폭주], mode: 'atLeast', atLeast: 1, kingId: null, minTotal: 0 },
    analytic: pAny(2),
  },
  {
    label: '★헌신 & 파괴 (최소 +50%, 최대 +50% 한 룬)',
    raw: { runeIds: [헌신파괴], mode: 'all', kingId: null, minTotal: 0 },
    analytic: K / N,
  },
  {
    label: '★헌신 + 파괴 둘 다 (별개 룬 2개)',
    raw: { runeIds: [헌신, 파괴], mode: 'all', kingId: null, minTotal: 0 },
    analytic: comb(N - 2, K - 2) / comb(N, K),
  },
  {
    label: '★최소·최대가 어떻게든 붙음 = 셋 중 하나 이상 조합',
    // 헌신 & 파괴 단독이거나, 헌신+파괴 둘 다이거나 → 아래 대조 케이스와 값이 다름을 확인
    raw: { runeIds: [헌신, 파괴, 헌신파괴], mode: 'atLeast', atLeast: 1, kingId: null, minTotal: 0 },
    analytic: pAny(3),
  },
  {
    label: '통찰 + 파멸 & 폭주 (둘 다 등장)',
    raw: { runeIds: [통찰, 파멸폭주], mode: 'all', kingId: null, minTotal: 0 },
    analytic: comb(N - 2, K - 2) / comb(N, K),
  },
  {
    label: '파멸 + 왕룬 통찰',
    raw: { runeIds: [파멸], mode: 'all', kingId: 통찰, minTotal: 0 },
    analytic: (1 / N) * (comb(N - 2, K - 2) / comb(N - 1, K - 1)),
  },
  {
    label: '헌신 & 파괴 + 총점 400 이상',
    raw: { runeIds: [헌신파괴], mode: 'all', kingId: null, minTotal: 400 },
    analytic: null,
  },
];

function runSection(title, cases) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
  console.log(
    '케이스'.padEnd(40),
    'DP(정확)'.padStart(16),
    '해석해'.padStart(16),
    'MC'.padStart(16),
    '  판정'
  );

  let ok = true;
  for (const c of cases) {
    const t = normalizeTarget(c.raw);
    const dp = successProbability(t);
    const mc = monteCarlo(t, MC_RUNS);

    const analyticOk = c.analytic === null ? true : Math.abs(dp - c.analytic) < 1e-12;
    const se = Math.sqrt(Math.max(dp, 1e-12) * (1 - dp) / MC_RUNS);
    // 기대 성공 표본이 5개 미만이면 MC 로는 판별 불가 → 검증 생략
    const mcOk = dp * MC_RUNS < 5 ? true : Math.abs(mc - dp) <= 4 * se + 1e-9;

    if (!analyticOk || !mcOk) ok = false;

    console.log(
      c.label.padEnd(38),
      dp.toExponential(6).padStart(18),
      (c.analytic === null ? '-' : c.analytic.toExponential(6)).padStart(18),
      mc.toExponential(6).padStart(18),
      `  ${analyticOk && mcOk ? 'OK' : 'FAIL'}${!analyticOk ? ' (해석해 불일치)' : ''}${!mcOk ? ' (MC 이탈)' : ''}`
    );
  }
  return ok;
}

console.log(`MC 표본 = ${MC_RUNS.toLocaleString('ko-KR')}회`);

let allOk = true;
allOk = runSection('기본 조건 (룬 / 왕룬 / 총점)', RUNE_CASES) && allOk;
allOk = runSection('옵션 목표 (룬 = 옵션 1:1)', OPTION_CASES) && allOk;

// ── 데이터 정합성: 룬 = 옵션 1:1 ──
console.log('\n── 데이터 정합성 ' + '─'.repeat(48));

// 옵션 목록은 룬 30종과 1:1 이어야 한다 ("A 또는 B" 식 묶음 항목이 없어야 함)
const uniqueDescs = new Set(RUNES.map((r) => r.desc));
const oneToOne = RUNES.length === 30 && uniqueDescs.size === 30;
if (!oneToOne) allOk = false;
console.log(
  `룬 ${RUNES.length}종 · 옵션 문구 ${uniqueDescs.size}종 (1:1) → ${oneToOne ? 'OK' : 'FAIL'}`
);

// 헌신 / 파괴 / 헌신 & 파괴 는 서로 다른 옵션이어야 한다
const trio = [헌신, 파괴, 헌신파괴].map((id) => RUNES[id]);
const trioDistinct = new Set(trio.map((r) => r.desc)).size === 3;
if (!trioDistinct) allOk = false;
console.log(`헌신 / 파괴 / 헌신 & 파괴 옵션 상이 → ${trioDistinct ? 'OK' : 'FAIL'}`);
for (const r of trio) {
  console.log(`   ${r.name.padEnd(12)} ${String(r.score).padStart(3)}점  ${r.desc}`);
}

// ── 목표 달성 조합 추출기 ──
//   확률이 낮아 실제로 굴려서는 못 만나는 목표도 조합을 직접 구성해 보여준다.
//   ① 추출한 조합이 반드시 목표를 만족해야 하고
//   ② 왕룬 지정이 없으면 가능한 왕룬들이 고르게 나와야 한다.
console.log('\n── 목표 달성 조합 추출 ' + '─'.repeat(42));

const SAMPLER_CASES = [
  ['상위 8종 + 총점 530 (평균 4천만 회)', { runeIds: TOP8, mode: 'all', kingId: null, minTotal: 530 }],
  ['상위 8종 (조건 없음)', { runeIds: TOP8, mode: 'all', kingId: null, minTotal: 0 }],
  ['왕룬 통찰 + 총점 450', { runeIds: [], mode: 'all', kingId: 통찰, minTotal: 450 }],
  ['헌신 & 파괴 + 파멸 & 폭주', { runeIds: [헌신파괴, 파멸폭주], mode: 'all', kingId: null, minTotal: 0 }],
];
for (const [label, raw] of SAMPLER_CASES) {
  const t = normalizeTarget(raw);
  let bad = 0;
  for (let i = 0; i < 500; i++) {
    const r = sampleSatisfyingResult(t);
    if (!r || !matchesTarget(r, t)) bad++;
  }
  if (bad) allOk = false;
  console.log(`${label.padEnd(34)} 500회 추출 · 목표 불만족 ${bad}건 → ${bad ? 'FAIL' : 'OK'}`);
}

// 왕룬 미지정이면 선택한 8종이 고르게 왕룬이 되어야 한다 (χ² 대신 편차 상한으로 확인)
{
  const t = normalizeTarget({ runeIds: TOP8, mode: 'all', kingId: null, minTotal: 0 });
  const RUNS = 8000;
  const cnt = new Map();
  for (let i = 0; i < RUNS; i++) {
    const k = sampleSatisfyingResult(t).rows[K - 1].runeId;
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
  }
  const expected = RUNS / TOP8.length;
  const allKings = cnt.size === TOP8.length;
  const maxDev = Math.max(...[...cnt.values()].map((v) => Math.abs(v - expected) / expected));
  const uniform = allKings && maxDev < 0.2;
  if (!uniform) allOk = false;
  console.log(
    `왕룬 미지정 → 8종 모두 왕룬 등장(${cnt.size}/8) · 최대 편차 ${(maxDev * 100).toFixed(1)}% → ${uniform ? 'OK' : 'FAIL'}`
  );
}

// ── 최대 달성 총점 ──
const maxNoCond = maxAchievableTotal(
  normalizeTarget({ runeIds: [], mode: 'all', kingId: null, minTotal: 0 })
);
const maxOk = maxNoCond === MAX_TOTAL;
if (!maxOk) allOk = false;
console.log(`\nmaxAchievableTotal(조건없음) = ${maxNoCond} / MAX_TOTAL = ${MAX_TOTAL} → ${maxOk ? 'OK' : 'FAIL'}`);

console.log(`\n${allOk ? '✅ 전체 통과' : '❌ 실패 항목 있음'}`);
process.exit(allOk ? 0 : 1);
