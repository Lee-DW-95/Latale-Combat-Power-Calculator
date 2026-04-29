/**
 * 마법 직업 데이터에 현행 PHYSICAL_PARAMS를 적용해 오차 측정.
 *
 * 현재 MAGIC_PARAMS = PHYSICAL_PARAMS (데이터 부족으로 차용 중).
 * 3건뿐이지만 편향 방향과 크기를 보고 별도 학습 가치를 판단.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, '../SAMPLE_DATA.json'), 'utf-8'));

// src/utils/battlePower.js와 동기화된 신규 파라미터
const P = {
  K0: 5.11348549e-1,
  K1: 5.02477070e+1,
  K2: 4.72083875e-1,
  D_crit: 4.24975333e+2,
  D_dmg: 2.04444640e-22,
  D_dom: 1.99000358e+2,
  K_geunma: 8.37034559e-4,
  D_pen: 25.0,
  base: 3.69816387e-29,
};

function predict(d, p) {
  const maxDmg = d.최대뎀;
  const minDmg = Math.min(d.최소뎀, maxDmg);
  const aBase = d.주스탯 * p.K0 + d.공격력 * p.K1 + d.고댐 * p.K2;
  if (aBase <= 0) return 0;
  return (
    aBase *
    (1 + d.크댐 / p.D_crit) *
    (1 + (minDmg + maxDmg) / p.D_dmg) *
    (1 + (d.일몬지 + d.보몬지) / p.D_dom) *
    (1 + d.근마효율 * p.K_geunma) *
    (1 + d.관통 / p.D_pen) *
    p.base
  );
}

const magic = data.filter((d) => d.type === 'M');
const physical = data.filter((d) => d.type === 'P');

console.log('═══════════════════════════════════════════════════════════════');
console.log(' 마법 직업 데이터 오차 측정 (현행 PHYSICAL_PARAMS 적용)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`마법 데이터: ${magic.length}건`);
console.log();

const errs = [];
for (const d of magic) {
  const pred = predict(d, P);
  const err = ((pred - d.전투력) / d.전투력) * 100;
  errs.push(err);
  const mark = Math.abs(err) < 2 ? '✓' : Math.abs(err) < 5 ? '⚠' : '✗';
  console.log(
    `  ${mark} ${d.name.padEnd(20)} ` +
    `실제 ${d.전투력.toLocaleString().padStart(10)}  ` +
    `예측 ${Math.round(pred).toLocaleString().padStart(10)}  ` +
    `오차 ${err >= 0 ? '+' : ''}${err.toFixed(2)}%`
  );
  console.log(
    `    └ 주스탯=${d.주스탯.toLocaleString()} 속성력=${d.공격력} 크댐=${d.크댐} ` +
    `최소=${d.최소뎀} 최대=${d.최대뎀} 고댐=${d.고댐.toLocaleString()}`
  );
}

const meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;
const rmse = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
const maxAbs = Math.max(...errs.map(Math.abs));

console.log();
console.log(`  평균 편향: ${meanErr >= 0 ? '+' : ''}${meanErr.toFixed(2)}%`);
console.log(`  RMSE     : ${rmse.toFixed(2)}%`);
console.log(`  최대 |오차|: ${maxAbs.toFixed(2)}%`);

console.log();
console.log('  [참고] 물리 51건 RMSE: ' +
  (Math.sqrt(physical.reduce((a, d) => {
    const r = (predict(d, P) - d.전투력) / d.전투력;
    return a + r * r;
  }, 0) / physical.length) * 100).toFixed(2) + '%');

// 평균 편향 분석: 마법 일관 편향이 있다면 base 보정만으로 1차 fit 가능한지 검토
const adjustedBase = P.base / (1 + meanErr / 100);
console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log(' 간이 보정안: 마법용 base 상수만 조정 (계수 비율은 물리와 동일 유지)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  평균 편향 ${meanErr.toFixed(2)}% 만큼 base 역보정 → MAGIC_PARAMS.base = ${adjustedBase.toExponential(8)}`);

const adjustedP = { ...P, base: adjustedBase };
console.log();
console.log('  보정 후 마법 데이터 잔차:');
let adjSS = 0;
for (const d of magic) {
  const pred = predict(d, adjustedP);
  const err = ((pred - d.전투력) / d.전투력) * 100;
  adjSS += err * err;
  const mark = Math.abs(err) < 2 ? '✓' : Math.abs(err) < 5 ? '⚠' : '✗';
  console.log(`  ${mark} ${d.name.padEnd(20)} 오차 ${err >= 0 ? '+' : ''}${err.toFixed(2)}%`);
}
console.log(`  보정 후 RMSE: ${Math.sqrt(adjSS / magic.length).toFixed(2)}%`);
