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
import { MAX_TOTAL, RUNES, RUNE_OPTIONS } from '../src/data/runeWordData.js';

// 옵션 key 는 "담당 룬 집합" 기준이라 효과 문구로 찾아 쓴다.
//   effects 를 정확히 이 목록으로 갖는 항목을 고른다 (단일 효과 / 조합 구분).
function optKey(...effectTexts) {
  const o = RUNE_OPTIONS.find(
    (x) =>
      x.effects.length === effectTexts.length && effectTexts.every((e) => x.effects.includes(e))
  );
  if (!o) throw new Error(`옵션을 찾을 수 없음: ${effectTexts.join(' + ')}`);
  return o.key;
}

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

// 옵션 키
const OPT_CRIT_DMG = optKey('크리티컬 대미지 +50%');   // 파멸, 파멸 & 폭주
// 크확은 파멸 & 폭주 단독이라 크댐까지 보장 효과로 묶인다
const OPT_CRIT_BOTH = optKey('크리티컬 대미지 +50%', '크리티컬 확률 +1%');
const OPT_PEN = optKey('물리/마법 관통력 +10%', '타격 시 0.1% 확률로 쿨타임 1초 감소'); // 통찰
const OPT_ATK_PCT = optKey('공격력/속성력 +5%');        // 격노, 열광 & 격노
const OPT_MIN_DMG = optKey('최소 대미지 +50%');         // 헌신, 헌신 & 파괴
const OPT_MAX_DMG = optKey('최대 대미지 +50%');         // 파괴, 헌신 & 파괴
// 한 룬(헌신 & 파괴)이 최소·최대를 같이 주는 조합 목표
const OPT_MINMAX_DMG = optKey('최소 대미지 +50%', '최대 대미지 +50%');

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
    label: '★겹침: 크댐 + 크댐&크확 (후자⊂전자 → 후자와 동일)',
    raw: { selectMode: 'option', optionKeys: [OPT_CRIT_DMG, OPT_CRIT_BOTH], mode: 'all', kingId: null, minTotal: 0 },
    // 크댐&크확은 파멸&폭주뿐이라, 그게 뽑히면 크댐도 자동 충족 → P = 파멸&폭주 등장 확률
    analytic: K / N,
  },
  {
    label: '★조합: 최소 & 최대 동시 (헌신 & 파괴 단독)',
    raw: { selectMode: 'option', optionKeys: [OPT_MINMAX_DMG], mode: 'all', kingId: null, minTotal: 0 },
    analytic: K / N,
  },
  {
    label: '★대조: 최소 / 최대 따로 (헌신+파괴 분리도 인정)',
    raw: { selectMode: 'option', optionKeys: [OPT_MIN_DMG, OPT_MAX_DMG], mode: 'all', kingId: null, minTotal: 0 },
    // 포함배제: 1 - P(헌신·헌신&파괴 없음) - P(파괴·헌신&파괴 없음) + P(셋 다 없음)
    analytic: 1 - 2 * (comb(N - 2, K) / comb(N, K)) + comb(N - 3, K) / comb(N, K),
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

// 담당 룬 집합이 같은 효과들은 하나로 병합돼야 한다 (목표로서 구별 불가하므로)
const dupSets = new Map();
for (const o of RUNE_OPTIONS) {
  const k = o.runeIds.join(',');
  dupSets.set(k, (dupSets.get(k) ?? 0) + 1);
}
const noDup = [...dupSets.values()].every((n) => n === 1);
if (!noDup) allOk = false;
console.log(`옵션 ${RUNE_OPTIONS.length}종 · 담당 룬 집합 중복 없음 → ${noDup ? 'OK' : 'FAIL'}`);

// 복합 효과 룬은 전부 "그 룬 단독" 을 목표로 지정할 수 있어야 한다
//   (헌신 & 파괴처럼 두 효과가 모두 단일 룬과 겹치면 예전엔 지정할 방법이 없었다)
const carrierSets = new Set(RUNE_OPTIONS.map((o) => o.runeIds.join(',')));
const comboRunes = RUNES.filter((r) => r.desc.split(', ').length > 1);
const missing = comboRunes.filter((r) => !carrierSets.has(String(r.id)));
if (missing.length) allOk = false;
console.log(
  `복합 효과 룬 ${comboRunes.length}종 단독 지정 가능 → ` +
    (missing.length ? `FAIL (불가: ${missing.map((r) => r.name).join(', ')})` : 'OK')
);

const idxChecks = [
  [['크리티컬 대미지 +50%'], [파멸, 파멸폭주]],
  [['크리티컬 대미지 +50%', '크리티컬 확률 +1%'], [파멸폭주]],
  [['물리/마법 관통력 +10%', '타격 시 0.1% 확률로 쿨타임 1초 감소'], [통찰]],
  [['최소 대미지 +50%'], [헌신, 헌신파괴]],
  [['최대 대미지 +50%'], [파괴, 헌신파괴]],
  [['최소 대미지 +50%', '최대 대미지 +50%'], [헌신파괴]],
];
for (const [effects, expectRunes] of idxChecks) {
  const o = RUNE_OPTIONS.find(
    (x) => x.effects.length === effects.length && effects.every((e) => x.effects.includes(e))
  );
  const runes = [...(o?.runeIds ?? [])];
  const same = runes.length === expectRunes.length && runes.every((v, i) => v === expectRunes[i]);
  if (!same) allOk = false;
  console.log(
    `${effects.join(' + ').padEnd(46)} → 룬 [${runes}] ` +
      `${same ? 'OK' : `FAIL (기대 [${expectRunes}])`}`
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
