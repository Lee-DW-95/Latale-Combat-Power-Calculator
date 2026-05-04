/**
 * production battlePower.js 의 calculateDirectBP / calculateSummonBP 가
 * 실측 직접타격 / 소환타격 과 얼마나 일치하는지 게이트.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { calculateBattlePower, calculateDirectBP, calculateSummonBP } from '../src/utils/battlePower.js';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(here, '..', 'SAMPLE_DATA.json'), 'utf8'));

const split = data.filter((d) => d.직접타격 != null && d.소환타격 != null);
console.log(`Split data: ${split.length}건`);
console.log('');

let sumD = 0, sumS = 0, sumA = 0, n = 0;
const rows = [];
for (const s of split) {
  // base target (조건부 환산 미적용 — 게임 T창 BP 와 동일 정의)
  const predD = calculateDirectBP(s, 'base');
  const predS = calculateSummonBP(s);
  const predA = calculateBattlePower(s, 'base');
  const errD = (predD - s.직접타격) / s.직접타격 * 100;
  const errS = (predS - s.소환타격) / s.소환타격 * 100;
  const errA = (predA - s.전투력) / s.전투력 * 100;
  sumD += errD * errD;
  sumS += errS * errS;
  sumA += errA * errA;
  n++;
  rows.push({ name: s.name, type: s.type, errD, errS, errA, dActual: s.직접타격, sActual: s.소환타격, dPred: predD, sPred: predS });
}

const rmseD = Math.sqrt(sumD / n);
const rmseS = Math.sqrt(sumS / n);
const rmseA = Math.sqrt(sumA / n);

console.log(`▶ 직접타격 RMSE: ${rmseD.toFixed(3)}%`);
console.log(`▶ 소환타격 RMSE: ${rmseS.toFixed(3)}%`);
console.log(`▶ 평균 BP RMSE:  ${rmseA.toFixed(3)}%`);
console.log('');

// 순서(직≷소) 정확도
let orderOK = 0;
for (const r of rows) {
  const actualSign = Math.sign(r.dActual - r.sActual);
  const predSign = Math.sign(r.dPred - r.sPred);
  if (actualSign === predSign) orderOK++;
}
console.log(`▶ 직≷소 순서 정확도: ${orderOK}/${n}`);

// 1.5% 이상 잔차 항목
const big = rows.filter((r) => Math.abs(r.errD) > 1.5 || Math.abs(r.errS) > 1.5);
if (big.length > 0) {
  console.log(`\n▶ 1.5% 초과 잔차 (${big.length}건):`);
  for (const r of big) {
    console.log(`   ${r.name.padEnd(24)} (${r.type})  직 ${r.errD.toFixed(2).padStart(7)}%   소 ${r.errS.toFixed(2).padStart(7)}%`);
  }
}
