// 직/소 비율과 잔차의 진짜 관계 + 관통 step bonus 가설 검증
import { readFileSync } from 'node:fs';
import {
  calculateBattlePower, calculateDirectBP, calculateSummonBP,
} from '../src/utils/battlePower.js';

const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const cases = sample.filter((d) => d.직접타격 && d.소환타격 && d.최소뎀 <= d.최대뎀);

console.log('━ 직/소 실측 비율 vs 모델 예측 비율 vs 잔차 ━\n');
console.log('case                  관통 근마  실측D/S 예측D/S  Δ_ratio   e_종합   e_직      e_소');
console.log('-'.repeat(96));

const rows = cases.map((d) => {
  const totP = calculateBattlePower(d, 'base');
  const dirP = calculateDirectBP(d, 'base');
  const sumP = calculateSummonBP(d);
  const actualRatio = d.직접타격 / d.소환타격;
  const predRatio = dirP / sumP;
  return {
    name: d.name, 관통: d.관통, 근마: d.근마효율,
    actualRatio, predRatio,
    deltaRatio: predRatio - actualRatio,
    e_tot: (totP - d.전투력) / d.전투력 * 100,
    e_dir: (dirP - d.직접타격) / d.직접타격 * 100,
    e_sum: (sumP - d.소환타격) / d.소환타격 * 100,
    type: d.type,
  };
});

// 직/소 실측 비율 큰 순으로
const byDS = [...rows].sort((a, b) => b.actualRatio - a.actualRatio);
for (const r of byDS) {
  const sign = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
  console.log(
    `${r.name.padEnd(22)} ${String(r.관통).padStart(3)}  ${String(r.근마).padStart(3)}  ${r.actualRatio.toFixed(3)}   ${r.predRatio.toFixed(3)}   ${sign(r.deltaRatio).padStart(7)}   ${sign(r.e_tot).padStart(7)}% ${sign(r.e_dir).padStart(7)}% ${sign(r.e_sum).padStart(7)}%`
  );
}

// 상관관계
function correl(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

console.log('\n━ 진단: 무엇이 잔차의 진짜 원인인가? ━');
const r_pen = correl(rows.map((r) => r.관통), rows.map((r) => r.e_tot));
const r_ds = correl(rows.map((r) => r.actualRatio), rows.map((r) => r.e_tot));
const r_dsDir = correl(rows.map((r) => r.actualRatio), rows.map((r) => r.e_dir));
const r_dsSum = correl(rows.map((r) => r.actualRatio), rows.map((r) => r.e_sum));
const r_delta = correl(rows.map((r) => r.deltaRatio), rows.map((r) => r.e_tot));

console.log(`  관통 vs 잔차_종합:           r = ${r_pen.toFixed(2)}`);
console.log(`  실측 직/소 vs 잔차_종합:    r = ${r_ds.toFixed(2)}`);
console.log(`  실측 직/소 vs 잔차_직접:    r = ${r_dsDir.toFixed(2)}`);
console.log(`  실측 직/소 vs 잔차_소환:    r = ${r_dsSum.toFixed(2)}`);
console.log(`  (예측-실측)D/S vs 잔차_종합: r = ${r_delta.toFixed(2)}`);

// 잔차가 큰 케이스들의 직/소 패턴 정리
console.log('\n━ 큰 잔차 케이스 = 비전형 직/소 비율 ━');
const top5 = [...rows].sort((a, b) => Math.abs(b.e_tot) - Math.abs(a.e_tot)).slice(0, 5);
for (const r of top5) {
  const note = r.actualRatio > 1.05 ? '직접 위주 (이례)' :
               r.actualRatio < 0.9  ? '소환 위주 (이례)' :
               '균형';
  console.log(`  ${r.name.padEnd(22)} 실측D/S=${r.actualRatio.toFixed(3)} ${note.padEnd(16)} 잔차 종합 ${(r.e_tot >= 0 ? '+' : '') + r.e_tot.toFixed(3)}%`);
}

// 평균 직/소 비율 (universal SPLIT 의 작동 영역)
const meanDS = rows.reduce((a, r) => a + r.actualRatio, 0) / rows.length;
const medianDS = [...rows].sort((a, b) => a.actualRatio - b.actualRatio)[Math.floor(rows.length / 2)].actualRatio;
console.log(`\n━ universal SPLIT 의 작동 영역 ━`);
console.log(`  평균 실측 D/S = ${meanDS.toFixed(3)}`);
console.log(`  중앙값       = ${medianDS.toFixed(3)}`);
console.log(`  범위         = [${Math.min(...rows.map((r) => r.actualRatio)).toFixed(3)}, ${Math.max(...rows.map((r) => r.actualRatio)).toFixed(3)}]`);
