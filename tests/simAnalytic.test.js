/**
 * 시뮬레이터 해석적 확률 검증 테스트
 *
 * 실행: node tests/simAnalytic.test.js (순수 Node, 러너 의존성 없음)
 *
 * 메모리얼 / 인챈트 / 아이템 각성의 목표 시뮬은 "상한까지 굴려보고 못 만나면 실패"하는
 * brute-force 대신 닫힌 계산으로 확률을 구한다.
 * 그 계산이 실제 굴림 분포와 일치하는지가 이 테스트의 목적.
 *
 * 검증 항목:
 *   1) 메모리얼 — 해석적 p 가 몬테카를로 실측과 통계적으로 일치 (|z| ≤ 4)
 *   2) 메모리얼 — 조립된 "성공 카드"가 실제로 모든 목표를 충족
 *   3) 메모리얼 — 도달 불가능한 목표는 정확히 0 (부동소수 잔여 확률이 새면 안 됨)
 *   4) 메모리얼 — 희박한 목표(p ~ 1e-6)도 즉시 성공 카드를 반환 (예전엔 64% 확률로 "실패")
 *   5) 인챈트 — 해석적 평균 시도/파괴가 brute-force 실측과 일치
 *   6) 인챈트 — q 가 극히 작아도 completed:true 로 즉시 반환
 *   7) 아이템 각성 — 줄 구성 확률 전수 열거가 MC 와 일치하고, 98옵션 세트 4목표에서도
 *      0 으로 무너지지 않음 (예전 MC 는 200만 표본에서 0~1회만 관측)
 */

import { ALL_MEMORIALS } from '../src/data/memorialProbabilities.js';
import {
  singleCardSuccessRate,
  estimateSingleCardSuccessRate,
  simulateUntilSingleCardReaches,
  computeStatistics,
  cardSumFor,
} from '../src/utils/memorialSim.js';
import { getPart, rangeFor } from '../src/data/enchantData.js';
import {
  analyzeTargetProcess,
  computeTargetStats,
  simulateUntilTargetMet,
  tryNormalEnchant,
} from '../src/utils/enchantSim.js';
import { ITEM_AWAKENING_SETS } from '../src/data/itemAwakeningData.js';
import {
  estimateTargetProb,
  estimateTargetProbByMC,
  computeStatistics as itemAwakeningStats,
  buildSuccessCard,
  checkTargets,
  sumGroups,
} from '../src/utils/itemAwakeningSim.js';

let failures = 0;
function checkTrue(name, cond, note = '') {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}${note ? `  (${note})` : ''}`);
  if (!cond) failures++;
}
function checkClose(name, actual, expected, relTol, note = '') {
  const ok = Math.abs(actual - expected) <= relTol * Math.abs(expected);
  console.log(
    `${ok ? '✓ PASS' : '✗ FAIL'}  ${name}  (해석=${actual.toPrecision(6)}, 실측=${expected.toPrecision(6)}${note ? `, ${note}` : ''})`,
  );
  if (!ok) failures++;
}

console.log('═══════════════════════════════════════════════════');
console.log('  시뮬레이터 해석적 확률 검증');
console.log('═══════════════════════════════════════════════════');

// ───────────────────────────────────────────────────
// 1. 메모리얼 — 해석값 vs 몬테카를로
// ───────────────────────────────────────────────────
console.log('\n[1] 메모리얼 해석값 vs 몬테카를로');

const MC_RUNS = 300_000;
const MEMORIAL_CASES = [
  ['CHOENPAM_SET', [{ base: '최종 최대 대미지', value: 2 }]],
  ['CHOENPAM_SET', [{ base: '최종 크리티컬 대미지', value: 2 }, { base: '최종 최대 대미지', value: 2 }]],
  ['LEVI_SET', [{ base: '무기 공격력/속성력%', value: 3 }, { base: '크리티컬 확률%', value: 2 }]],
  // 올스탯 라인이 다른 스탯 목표에도 기여하는 케이스 (목표들이 서로 얽힘)
  ['MUWEN_SET', [{ base: '올스탯', value: 2 }, { base: '근력/마법력', value: 4 }]],
  ['HEUKWOL_SET', [{ base: '방어력', value: 5 }, { base: '체력', value: 3 }]],
  // 0.1 단위 step 이 섞인 메모리얼
  ['GENEPE_SET', [{ base: '보스 몬스터 지배력%', value: 1.5 }, { base: '최소/최대 대미지%', value: 20 }]],
  ['SYAM_SET', [{ base: '스킬 쿨타임 감소%', value: 2.5 }]],
  // 줄 수가 1로 고정된 일반 메모리얼
  ['HEUKWOL_NORMAL', [{ base: '올스탯', value: 300 }]],
  ['LZPA_SET', [{ base: '최소 대미지%', value: 12 }, { base: '최대 대미지%', value: 12 }]],
];

for (const [key, targets] of MEMORIAL_CASES) {
  const m = ALL_MEMORIALS[key];
  const pa = singleCardSuccessRate(m, targets);
  const pm = estimateSingleCardSuccessRate(m, targets, MC_RUNS);
  const se = Math.sqrt((Math.max(pm, 1 / MC_RUNS) * (1 - pm)) / MC_RUNS);
  const z = se > 0 ? Math.abs(pa - pm) / se : 0;
  const desc = targets.map((t) => `${t.base}≥${t.value}`).join(' + ');
  checkTrue(
    `${key} ${desc}`,
    z <= 4,
    `해석=${pa.toExponential(3)} MC=${pm.toExponential(3)} z=${z.toFixed(2)}`,
  );
}

// ───────────────────────────────────────────────────
// 2. 조립된 성공 카드가 실제로 목표를 충족하는가
// ───────────────────────────────────────────────────
console.log('\n[2] 조립된 성공 카드의 목표 충족');

for (const [key, targets] of MEMORIAL_CASES) {
  const m = ALL_MEMORIALS[key];
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const r = simulateUntilSingleCardReaches(m, targets);
    if (!r.success) { bad++; continue; }
    if (!targets.every((t) => cardSumFor(r.winningLines, t.base) >= t.value - 1e-9)) bad++;
  }
  checkTrue(`${key} 성공카드 300장 전부 조건 충족`, bad === 0, `미달 ${bad}장`);
}

// ───────────────────────────────────────────────────
// 3. 도달 불가능한 목표는 정확히 0
//    (컨볼루션을 `1 - Σ` 로 구하면 상쇄오차로 1e-17 짜리 유령 확률이 남는다)
// ───────────────────────────────────────────────────
console.log('\n[3] 도달 불가능한 목표 = 정확히 0');

const IMPOSSIBLE = [
  // 최종 크리티컬 대미지 최대 4 × 4줄 = 16
  ['CHOENPAM_SET', [{ base: '최종 크리티컬 대미지', value: 17 }]],
  // 올스탯 최대 5 × 4줄 = 20
  ['MUWEN_SET', [{ base: '올스탯', value: 21 }]],
  // 존재하지 않는 옵션
  ['CHOENPAM_SET', [{ base: '없는 옵션', value: 1 }]],
  // 줄이 4개뿐인데 3개 목표가 각각 최대치를 요구
  ['CHOENPAM_SET', [
    { base: '최종 크리티컬 대미지', value: 13 },
    { base: '최종 최대 대미지', value: 13 },
    { base: '최종 최소 대미지', value: 13 },
  ]],
];
for (const [key, targets] of IMPOSSIBLE) {
  const st = computeStatistics(ALL_MEMORIALS[key], targets);
  const run = simulateUntilSingleCardReaches(ALL_MEMORIALS[key], targets);
  const desc = targets.map((t) => `${t.base}≥${t.value}`).join(' + ');
  checkTrue(`${key} ${desc} → p=0`, st.successRate === 0 && !run.success, `p=${st.successRate}`);
}

// ───────────────────────────────────────────────────
// 4. 희박한 목표도 즉시 성공 카드 반환
//    (예전 brute-force 구현은 10만회 상한 때문에 약 64% 확률로 "도달 실패")
// ───────────────────────────────────────────────────
console.log('\n[4] 희박한 목표(p ~ 1e-6)의 안정성');

const RARE = [
  { base: '최종 크리티컬 대미지', value: 3 },
  { base: '최종 최대 대미지', value: 2 },
  { base: '무기 공격력/속성력%', value: 6 },
];
const rareP = singleCardSuccessRate(ALL_MEMORIALS.CHOENPAM_SET, RARE);
checkTrue('초엔팜 세트 3조건 p 가 1e-6 대', rareP > 1e-6 && rareP < 1e-5, `p=${rareP.toExponential(4)}`);

let rareFail = 0;
for (let i = 0; i < 50; i++) {
  const r = simulateUntilSingleCardReaches(ALL_MEMORIALS.CHOENPAM_SET, RARE);
  if (!r.success || !Number.isFinite(r.tries) || r.tries < 1) rareFail++;
}
checkTrue('50회 실행 전부 성공 카드 반환', rareFail === 0, `실패 ${rareFail}회`);

// p 추정이 실행마다 흔들리지 않아야 한다 (예전 MC 추정은 6배까지 요동)
const repeats = Array.from({ length: 5 }, () => singleCardSuccessRate(ALL_MEMORIALS.CHOENPAM_SET, RARE));
checkTrue('p 가 실행마다 동일 (결정론적)', new Set(repeats).size === 1, `distinct=${new Set(repeats).size}`);

// ───────────────────────────────────────────────────
// 5. 인챈트 목표 시뮬 — 해석값 vs brute-force
// ───────────────────────────────────────────────────
console.log('\n[5] 인챈트 목표 시뮬 해석값 vs brute-force');

function bruteEnchantRun(part, targets, typeKey, stage, opts) {
  let tries = 0;
  let destroyed = 0;
  for (;;) {
    let ok = true;
    for (const t of targets) {
      const r = tryNormalEnchant(part, t.optionKey, typeKey, stage, opts);
      tries++;
      if (!r.success) { destroyed++; ok = false; break; }
      if (r.value < t.minValue) { ok = false; break; }
    }
    if (ok) return { tries, destroyed };
  }
}

{
  const part = getPart('아마란스 노바', '아마란스 노바 무기');
  const opts = { minPct: 1, mythic: false };
  const targets = ['crit', 'maxd'].map((key) => {
    const o = part.options.find((x) => x.key === key);
    const r = rangeFor(o, 'base', opts.minPct);
    return { optionKey: key, minValue: Math.round(r.lo + (r.hi - r.lo) * 0.5) };
  });

  const st = computeTargetStats(part, targets, 'normal', 'base', 20_000, opts);
  const N = 20_000;
  let sumTries = 0;
  let sumDestroyed = 0;
  for (let i = 0; i < N; i++) {
    const r = bruteEnchantRun(part, targets, 'normal', 'base', opts);
    sumTries += r.tries;
    sumDestroyed += r.destroyed;
  }
  checkClose('아마란스 무기 2목표 평균 시도', st.mean.tries, sumTries / N, 0.05);
  checkClose('아마란스 무기 2목표 평균 파괴', st.mean.destroyed, sumDestroyed / N, 0.05);
  checkTrue('망치 = 시도 × 망치단가', Math.abs(st.mean.hammer - st.mean.tries) < 1e-9);
}

// ───────────────────────────────────────────────────
// 6. q 가 극히 작아도 결과가 나오고, 생존편향이 없다
// ───────────────────────────────────────────────────
console.log('\n[6] 극히 낮은 q 에서의 인챈트 결과');

{
  const part = getPart('아마란스 노바', '아마란스 노바 무기');
  const opts = { minPct: 1, mythic: false };
  const hard = part.options.slice(0, 5).map((o) => {
    const r = rangeFor(o, 'base', opts.minPct);
    return { optionKey: o.key, minValue: Math.round(r.hi * 0.9) };
  });

  const A = analyzeTargetProcess(part, hard, 'normal', 'base', opts);
  const st = computeTargetStats(part, hard, 'normal', 'base', 5_000, opts);
  const run = simulateUntilTargetMet(part, hard, 'normal', 'base', undefined, opts);

  checkTrue('q 가 1e-6 미만인 극단 조건', A.q < 1e-6, `q=${A.q.toExponential(3)}`);
  // E[시도] = (Σ R_i) / q — 닫힌 수식과 일치해야 한다
  checkClose('평균 시도 = ΣR_i / q', st.mean.tries, A.expTries / A.q, 1e-9);
  checkTrue(
    '평균 시도가 예전 구현(4.9만회)의 생존편향을 벗어남',
    st.mean.tries > 1_000_000,
    `평균=${Math.round(st.mean.tries).toLocaleString()}회`,
  );
  checkTrue('1번 실행이 항상 completed', run.completed && run.finalSlots.length === hard.length);
  checkTrue(
    '성공 장비의 모든 슬롯이 목표치 이상',
    run.finalSlots.every((s, i) => s.value >= hard[i].minValue),
  );
  checkTrue('P50 < P90 < P99 단조', st.p50.tries <= st.p90.tries && st.p90.tries <= st.p99.tries);
}

// ───────────────────────────────────────────────────
// 7. 아이템 각성 — 줄 구성 확률 전수 열거 vs MC
// ───────────────────────────────────────────────────
console.log('\n[7] 아이템 각성 줄 구성 확률');

{
  // 구성 확률이 충분히 큰 영역에서 전수 열거와 MC 가 일치하는지
  for (const set of ITEM_AWAKENING_SETS.slice(0, 5)) {
    const ranked = set.rows
      .map((r, i) => ({ i, p: Number(r.prob), name: r.name }))
      .sort((a, b) => b.p - a.p);
    const chosen = [];
    const seen = new Set();
    for (const x of ranked) {
      if (seen.has(x.name)) continue;
      seen.add(x.name);
      chosen.push(x);
      if (chosen.length === 2) break;
    }
    const targets = chosen.map((x) => ({
      mode: 'row',
      rowIndex: x.i,
      minValue: Number(set.rows[x.i].min),
    }));
    if (!checkTargets(set.rows, targets).ok) continue;

    const ex = estimateTargetProb(set.rows, targets);
    const mc = estimateTargetProbByMC(set.rows, targets);
    const se = Math.sqrt(
      (Math.max(mc.compositionRate, 1 / mc.samples) * (1 - mc.compositionRate)) / mc.samples,
    );
    const z = se > 0 ? Math.abs(ex.compositionRate - mc.compositionRate) / se : 0;
    checkTrue(
      `${set.label.slice(0, 22)} 구성확률 일치`,
      ex.exact && z <= 4,
      `열거=${ex.compositionRate.toExponential(3)} MC=${mc.compositionRate.toExponential(3)} z=${z.toFixed(2)}`,
    );
  }

  // 합계(sum) 목표도 동일하게 일치해야 한다
  const setWithGroups = ITEM_AWAKENING_SETS.find((s) => sumGroups(s.rows).length >= 2);
  if (setWithGroups) {
    const gs = sumGroups(setWithGroups.rows);
    const targets = gs.slice(0, 2).map((g) => ({
      mode: 'sum',
      name: g.name,
      minValue: Math.round(Number(setWithGroups.rows[g.rowIndexes[0]].min) * 1.5),
    }));
    if (checkTargets(setWithGroups.rows, targets).ok) {
      const ex = estimateTargetProb(setWithGroups.rows, targets);
      const mc = estimateTargetProbByMC(setWithGroups.rows, targets);
      const se = Math.sqrt(
        (Math.max(mc.successRate, 1 / mc.samples) * (1 - mc.successRate)) / mc.samples,
      );
      const z = se > 0 ? Math.abs(ex.successRate - mc.successRate) / se : 0;
      checkTrue(
        '합계 목표 2개 p 일치',
        z <= 4,
        `열거=${ex.successRate.toExponential(3)} MC=${mc.successRate.toExponential(3)} z=${z.toFixed(2)}`,
      );
    }
  }

  // 예전에 MC 해상도 부족으로 무너지던 영역 — 98옵션 세트에 최저확률 4목표
  const big = ITEM_AWAKENING_SETS.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
  const rare = big.rows
    .map((r, i) => ({ i, p: Number(r.prob), name: r.name }))
    .sort((a, b) => a.p - b.p);
  const picked = [];
  const seenNames = new Set();
  for (const x of rare) {
    if (seenNames.has(x.name)) continue;
    seenNames.add(x.name);
    picked.push(x);
    if (picked.length === 4) break;
  }
  const hardTargets = picked.map((x) => ({
    mode: 'row',
    rowIndex: x.i,
    minValue: Number(big.rows[x.i].max),
  }));

  const st = itemAwakeningStats(big.rows, hardTargets);
  checkTrue(
    `${big.rows.length}옵션 세트 4목표 구성확률 > 0`,
    st.compositionRate > 0 && Number.isFinite(st.mean),
    `구성확률=${st.compositionRate.toExponential(3)} 평균=${Math.round(st.mean).toLocaleString()}회`,
  );

  const repeats = Array.from(
    { length: 4 },
    () => estimateTargetProb(big.rows, hardTargets).successRate,
  );
  checkTrue('반복 실행 시 p 동일 (결정론)', new Set(repeats).size === 1);

  const card = st.composition ? buildSuccessCard(big.rows, hardTargets, st.composition) : null;
  checkTrue(
    '성공 카드가 4개 목표를 모두 충족',
    !!card &&
      hardTargets.every((t) =>
        card.lines.some((l) => l.rowIndex === t.rowIndex && l.value >= t.minValue),
      ),
  );
}

console.log('───────────────────────────────────────────────────');
if (failures > 0) {
  console.error(`✗ ${failures}개 항목 실패`);
  process.exit(1);
}
console.log('✓ 시뮬레이터 해석적 확률 전체 통과');
