/**
 * 옵션 동등 환산 솔버 검증 — solveEquivalentAmount
 *
 * 회귀 방지 목적:
 *   - 근력 +1% → 크댐 환산이 '도달 불가' 가 아니라 합리적 근사값을 내야 한다
 *     (floor 양자화 때문에 기존 brittle 이분법이 수렴 실패하던 버그).
 *   - 관통 cap(99)·최소뎀(≤최대뎀) 같은 게임상 천장은 reachable:false 로 구분돼야 한다.
 *   - 공격력/고댐/최대뎀처럼 충분히 도달 가능한 스탯은 목표 ΔBP 에 근접해야 한다.
 *
 * 실행: node tests/equivalence.test.js  (외부 러너 의존 없음)
 *
 * EfficiencyPanel.vue 의 bpWithOption 메커니즘을 동일하게 재현한다
 * (컴포넌트는 Vue 런타임 없이 import 불가하므로 핵심 로직만 미러링).
 */

import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
  calculateBPVsMonster,
  equipDelta,
  solveEquivalentAmount,
  STAT_KEYS,
} from '../src/utils/battlePower.js';

const NATURAL_UNIT = {
  주스탯: 'pct', 공격력: 'pct', 고댐: 'pct', 일몬추: 'pct', 보몬추: 'pct',
  크댐: 'raw', 최소뎀: 'raw', 최대뎀: 'raw',
  일몬지: 'raw', 보몬지: 'raw', 근마효율: 'raw', 관통: 'raw',
};
const PEN_CAP = 99;

function bpFor(s, mode) {
  if (mode === 'direct') return calculateDirectBP(s);
  if (mode === 'summon') return calculateSummonBP(s);
  if (mode === 'normal') return calculateBPVsMonster(s, 'normal');
  if (mode === 'boss') return calculateBPVsMonster(s, 'boss');
  return calculateBattlePower(s);
}

function bpWithOption(stats, statKey, amount, mode = 'avg') {
  const newStats = { ...stats };
  const unit = NATURAL_UNIT[statKey];
  if (unit === 'pct') {
    const d = equipDelta(stats, { [`${statKey}_퍼`]: amount });
    for (const k of STAT_KEYS) newStats[k] = (Number(stats[k]) || 0) + (d[k] || 0);
    return bpFor(newStats, mode);
  }
  if (statKey === '근마효율') {
    newStats.근마효율 = (Number(stats.근마효율) || 0) + amount;
    return bpFor(newStats, mode);
  }
  if (statKey === '일몬지' || statKey === '보몬지') {
    const SCALE = 10000;
    newStats[statKey] = (Number(stats[statKey]) || 0) + amount * SCALE;
    return bpFor(stats, mode) + (bpFor(newStats, mode) - bpFor(stats, mode)) / SCALE;
  }
  if (statKey === '관통') {
    newStats.관통 = Math.max(0, Math.min(PEN_CAP, (Number(stats.관통) || 0) + amount));
    return bpFor(newStats, mode);
  }
  const d = equipDelta(stats, { [statKey]: amount });
  for (const k of STAT_KEYS) newStats[k] = (Number(stats[k]) || 0) + (d[k] || 0);
  return bpFor(newStats, mode);
}

// 기존1 (관통 99 cap, 최소뎀≈최대뎀) — SAMPLE_DATA 의 대표 고스펙 케이스
const stats = {
  type: 'P', 주스탯: 4681991, 공격력: 73740, 관통: 99, 크댐: 9298,
  최소뎀: 8076, 최대뎀: 8078, 고댐: 941345, 일몬추: 1614773, 보몬추: 1049719,
  일몬지: 53.7, 보몬지: 58.8, 근마효율: 15,
};

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`✓ PASS  ${name}`); }
  else { fail++; console.log(`✗ FAIL  ${name}  ${detail}`); }
}

const mode = 'avg';
const baseBP = bpFor(stats, mode);
const target = bpWithOption(stats, '주스탯', 1, mode) - baseBP; // 근력 +1% 의 ΔBP
console.log(`기준: 근력 +1% → 목표 ΔBP = ${target} (baseBP=${baseBP})\n`);

// deltaFn(amount) = 해당 스탯에 amount 옵션 적용 시의 ΔBP (= BP - baseBP)
const deltaFn = (k) => (amt) => bpWithOption(stats, k, amt, mode) - baseBP;

// 1) 핵심 회귀: 근력 1% → 크댐 환산이 도달 가능 + 합리적 근사값(±10% 이내)
{
  const r = solveEquivalentAmount(deltaFn('크댐'), target);
  check('근력1% → 크댐 환산이 도달 불가가 아님', r.reachable === true,
    `reachable=${r.reachable}`);
  check('근력1% → 크댐 환산값이 합리적 범위(20~50)', r.reachable && r.amount > 20 && r.amount < 50,
    `amount=${r.amount}`);
  check('근력1% → 크댐 achieved 가 목표의 90% 이상', r.reachable && Math.abs(r.achieved) >= Math.abs(target) * 0.9,
    `achieved=${r.achieved}/${target}`);
}

// 2) 도달 가능 스탯들은 목표 ΔBP 에 근접(±1% 이내)해야 한다
for (const k of ['공격력', '고댐', '최대뎀', '일몬지', '보몬지']) {
  const r = solveEquivalentAmount(deltaFn(k), target);
  check(`근력1% → ${k} 도달 가능 + achieved≈목표`,
    r.reachable && Math.abs(r.achieved - target) <= Math.abs(target) * 0.01,
    `reachable=${r.reachable} achieved=${r.achieved}/${target}`);
}

// 3) 게임상 천장: 관통(cap 99 도달)·최소뎀(≤최대뎀)은 reachable:false
{
  const rPen = solveEquivalentAmount(deltaFn('관통'), target);
  check('관통(cap 99 도달) → reachable:false', rPen.reachable === false,
    `reachable=${rPen.reachable} amount=${rPen.amount}`);

  const rMin = solveEquivalentAmount(deltaFn('최소뎀'), target);
  check('최소뎀(≤최대뎀 한계) → reachable:false', rMin.reachable === false,
    `reachable=${rMin.reachable} amount=${rMin.amount}`);
}

// 4) 여유 있는 캐릭(저관통·최소<최대)에선 관통/최소뎀도 도달 가능
{
  const s2 = {
    type: 'P', 주스탯: 2000000, 공격력: 50000, 관통: 50, 크댐: 5000,
    최소뎀: 3000, 최대뎀: 6000, 고댐: 500000, 일몬추: 800000, 보몬추: 700000,
    일몬지: 40, 보몬지: 45, 근마효율: 10,
  };
  const base2 = bpFor(s2, mode);
  const t2 = bpWithOption(s2, '주스탯', 1, mode) - base2;
  const dfn2 = (k) => (amt) => bpWithOption(s2, k, amt, mode) - base2;
  const rPen = solveEquivalentAmount(dfn2('관통'), t2);
  check('저관통 캐릭 → 관통 도달 가능', rPen.reachable === true, `reachable=${rPen.reachable}`);
  const rMin = solveEquivalentAmount(dfn2('최소뎀'), t2);
  check('최소<최대 캐릭 → 최소뎀 도달 가능', rMin.reachable === true, `reachable=${rMin.reachable}`);
}

// 5) targetDelta=0 → amount 0
{
  const r = solveEquivalentAmount(deltaFn('크댐'), 0);
  check('목표 ΔBP 0 → amount 0', r.reachable && r.amount === 0, JSON.stringify(r));
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
