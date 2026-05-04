/**
 * 분석적 시뮬 vs MC brute-force 비교
 *   - 단일 카드 성공률 p 가 일치하는가
 *   - 기하분포 시도횟수 분포가 brute-force 와 일치하는가
 *   - 응답 시간 비교
 */
import {
  analyticalSuccessRate,
  estimateSingleCardSuccessRate,
  computeStatistics,
  simulateUntilTargetReached,
  rollOnce,
  constructSuccessCard,
} from '../src/utils/awakeningSim.js';

const cases = [
  { label: '무기 공격력/속성력 ≥ 20', targets: [{ displayLabel: '무기 공격력/속성력', value: 20 }] },
  { label: '무기 공격력/속성력 ≥ 100', targets: [{ displayLabel: '무기 공격력/속성력', value: 100 }] },
  { label: '올스탯 ≥ 500', targets: [{ displayLabel: '올스탯', value: 500 }] },
  { label: '근력/마법력 ≥ 1000', targets: [{ displayLabel: '근력/마법력', value: 1000 }] },
  {
    label: '일반 지배력 ≥ 5% + 보스 지배력 ≥ 5% (한 카드)',
    targets: [
      { displayLabel: '일반 몬스터 지배력 %', value: 5 },
      { displayLabel: '보스 몬스터 지배력 %', value: 5 },
    ],
  },
  {
    label: '일반 지배력 ≥ 7% + 보스 지배력 ≥ 7% (한 카드)',
    targets: [
      { displayLabel: '일반 몬스터 지배력 %', value: 7 },
      { displayLabel: '보스 몬스터 지배력 %', value: 7 },
    ],
  },
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('1) 분석적 p vs MC p (200K samples)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
for (const c of cases) {
  const pA = analyticalSuccessRate(c.targets);
  const pMC = pA > 1e-5 ? estimateSingleCardSuccessRate(c.targets, 200_000) : null;
  const expected = pMC === null ? `(MC 생략 — 너무 희박)` : pMC.toExponential(3);
  const ratio = pMC && pA ? (pMC / pA).toFixed(3) : 'N/A';
  console.log(`  ${c.label.padEnd(54)} 분석 ${pA.toExponential(3)}  MC ${expected}  비율 ${ratio}`);
}

console.log();
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('2) 응답시간 (분석적 시뮬)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
for (const c of cases) {
  const t0 = process.hrtime.bigint();
  const stats = computeStatistics(c.targets);
  const sample = simulateUntilTargetReached(c.targets);
  const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  ${c.label.padEnd(54)} ${dt.toFixed(2)}ms`);
  console.log(`     평균 ${isFinite(stats.mean) ? Math.round(stats.mean).toLocaleString() : '∞'}회 · ` +
              `이번 시뮬 ${sample.tries.toLocaleString()}회차 ` +
              `[${sample.card?.stone.name} ${sample.card?.lineCount}줄]`);
}

console.log();
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('3) 시도횟수 분포 검증 — brute-force vs 기하분포 (KS 유사 체크)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
// 무기 공격력/속성력 ≥ 100 (p ≈ 0.011) — brute-force 가능
const tg = [{ displayLabel: '무기 공격력/속성력', value: 100 }];
const N = 5000;
const bruteTries = [];
for (let i = 0; i < N; i++) {
  let tries = 0;
  while (tries < 100_000) {
    const card = rollOnce();
    tries++;
    const hit = card.lines.find(
      (ln) => ln.displayLabel === '무기 공격력/속성력' && ln.value >= 100
    );
    if (hit) break;
  }
  bruteTries.push(tries);
}
const analyticalTries = [];
for (let i = 0; i < N; i++) analyticalTries.push(simulateUntilTargetReached(tg).tries);

const sorted = (a) => [...a].sort((x, y) => x - y);
const pct = (a, q) => sorted(a)[Math.floor(a.length * q)];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

console.log(`  N=${N} 샘플`);
console.log(`                 평균       p25       p50       p75       p90       p99`);
const fmt = (a) => `${Math.round(mean(a)).toString().padStart(8)}  ${pct(a, 0.25).toString().padStart(8)}  ${pct(a, 0.5).toString().padStart(8)}  ${pct(a, 0.75).toString().padStart(8)}  ${pct(a, 0.9).toString().padStart(8)}  ${pct(a, 0.99).toString().padStart(8)}`;
console.log(`  brute-force:  ${fmt(bruteTries)}`);
console.log(`  analytical:   ${fmt(analyticalTries)}`);
console.log(`  → 두 분포가 통계적으로 일치하면 변경이 안전함을 입증.`);
