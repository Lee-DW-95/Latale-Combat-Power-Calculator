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
 * 특히 "옵션으로 선택" 은 그룹이 겹칠 수 있어서(파멸 & 폭주는 크댐·크확 양쪽에 속함)
 * 단순 카운트 DP 로는 틀린다. 겹침 케이스를 반드시 포함한다.
 */

import {
  successProbability,
  normalizeTarget,
  matchesTarget,
  rollRuneWord,
  maxAchievableTotal,
} from '../src/utils/runeWordSim.js';
import { MAX_TOTAL, RUNE_OPTION_BY_KEY } from '../src/data/runeWordData.js';

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
const 파멸 = 10, 통찰 = 19, 헌신파괴 = 25, 악몽죽음 = 28, 파멸폭주 = 29;

// 옵션 키
const OPT_CRIT_DMG = '크리티컬 대미지 +50%';   // 파멸, 파멸 & 폭주
const OPT_CRIT_RATE = '크리티컬 확률 +1%';      // 파멸 & 폭주
const OPT_PEN = '물리/마법 관통력 +10%';        // 통찰
const OPT_ATK_PCT = '공격력/속성력 +5%';        // 격노, 열광 & 격노
const OPT_MAX_DMG = '최대 대미지 +50%';         // 파괴, 헌신 & 파괴

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

const OPTION_CASES = [
  {
    label: '옵션: 크리티컬 대미지 (파멸|파멸&폭주)',
    raw: { selectMode: 'option', optionKeys: [OPT_CRIT_DMG], mode: 'all', kingId: null, minTotal: 0 },
    analytic: pAny(2),
  },
  {
    label: '옵션: 물리/마법 관통력 (통찰 단독)',
    raw: { selectMode: 'option', optionKeys: [OPT_PEN], mode: 'all', kingId: null, minTotal: 0 },
    analytic: K / N,
  },
  {
    label: '옵션: 크댐 + 관통 (겹치지 않는 두 그룹)',
    raw: { selectMode: 'option', optionKeys: [OPT_CRIT_DMG, OPT_PEN], mode: 'all', kingId: null, minTotal: 0 },
    // 통찰 포함 && (파멸 또는 파멸&폭주 포함)
    analytic: (comb(N - 1, K - 1) - comb(N - 3, K - 1)) / comb(N, K),
  },
  {
    label: '★겹침: 크댐 + 크확 (크확⊂크댐 → 크확과 동일)',
    raw: { selectMode: 'option', optionKeys: [OPT_CRIT_DMG, OPT_CRIT_RATE], mode: 'all', kingId: null, minTotal: 0 },
    // 크확은 파멸&폭주뿐이라, 그게 뽑히면 크댐도 자동 충족 → P = 파멸&폭주 등장 확률
    analytic: K / N,
  },
  {
    label: '옵션: 크댐/공속%/최대뎀 중 2개 이상',
    raw: {
      selectMode: 'option',
      optionKeys: [OPT_CRIT_DMG, OPT_ATK_PCT, OPT_MAX_DMG],
      mode: 'atLeast',
      atLeast: 2,
      kingId: null,
      minTotal: 0,
    },
    analytic: null,
  },
  {
    label: '옵션: 크댐 + 왕룬 통찰',
    raw: { selectMode: 'option', optionKeys: [OPT_CRIT_DMG], mode: 'all', kingId: 통찰, minTotal: 0 },
    // 왕룬 통찰(1/30) × 나머지 7개에 파멸|파멸&폭주 중 1개 이상
    analytic: (1 / N) * (1 - comb(N - 3, K - 1) / comb(N - 1, K - 1)),
  },
  {
    label: '옵션: 크댐 + 관통 + 총점 400 이상',
    raw: {
      selectMode: 'option',
      optionKeys: [OPT_CRIT_DMG, OPT_PEN],
      mode: 'all',
      kingId: null,
      minTotal: 400,
    },
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
allOk = runSection('룬으로 선택 (싱글톤 그룹)', RUNE_CASES) && allOk;
allOk = runSection('옵션으로 선택 (OR 그룹 — 겹침 포함)', OPTION_CASES) && allOk;

// ── 옵션 인덱스 정합성 ──
console.log('\n── 옵션 인덱스 ' + '─'.repeat(48));
const idxChecks = [
  [OPT_CRIT_DMG, [파멸, 파멸폭주]],
  [OPT_CRIT_RATE, [파멸폭주]],
  [OPT_PEN, [통찰]],
];
for (const [key, expect] of idxChecks) {
  const actual = [...(RUNE_OPTION_BY_KEY[key]?.runeIds ?? [])];
  const same = actual.length === expect.length && actual.every((v, i) => v === expect[i]);
  if (!same) allOk = false;
  console.log(`${key.padEnd(28)} → [${actual}] ${same ? 'OK' : `FAIL (기대 [${expect}])`}`);
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
