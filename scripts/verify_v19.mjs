// V_BIG19 검증 — 실제 battlePower.js 모듈로 SAMPLE 전체 재현 (refit 스크립트와 일치 확인)
import { readFileSync } from 'node:fs';
import { calculateBattlePower, calculateDirectBP, calculateSummonBP } from '../src/utils/battlePower.js';

const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const rmse = (xs) => xs.length ? Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) * 100 : 0;
const mx = (xs) => xs.length ? Math.max(...xs.map(Math.abs)) * 100 : 0;

const P = sample.filter(d => d.type === 'P');
const M = sample.filter(d => d.type === 'M');
const eP = P.map(d => (calculateBattlePower(d, 'base') - d.전투력) / d.전투력);
const eM = M.map(d => (calculateBattlePower(d, 'base') - d.전투력) / d.전투력);

console.log(`물리 ${P.length}건  RMSE ${rmse(eP).toFixed(3)}%  max ${mx(eP).toFixed(3)}%`);
console.log(`마법 ${M.length}건  RMSE ${rmse(eM).toFixed(3)}%  max ${mx(eM).toFixed(3)}%`);

console.log('\n=== 신규/관심 데이터 개별 검증 (종합 / 직접 / 소환) ===');
for (const nm of ['자료14_물리_고보몬추_보스특화', '자료15_물리_고근력_소환위주', '자료13_소드댄서_물리', '자료6_세이버']) {
  const d = sample.find(x => x.name === nm);
  if (!d) continue;
  const e = (p, a) => (((p - a) / a) * 100).toFixed(3) + '%';
  const bp = calculateBattlePower(d, 'base');
  const dir = d.직접타격 ? `직 ${e(calculateDirectBP(d, 'base'), d.직접타격)}` : '';
  const sum = d.소환타격 ? `소 ${e(calculateSummonBP(d), d.소환타격)}` : '';
  console.log(`  ${nm.padEnd(28)} 종합 ${e(bp, d.전투력)}  ${dir}  ${sum}`);
}

const all = sample.map(d => ({ name: d.name, e: (calculateBattlePower(d, 'base') - d.전투력) / d.전투력 * 100 }));
all.sort((a, b) => Math.abs(b.e) - Math.abs(a.e));
console.log('\n=== 전체 최악 6건 ===');
for (const x of all.slice(0, 6)) console.log(`  ${x.e >= 0 ? '+' : ''}${x.e.toFixed(3)}%  ${x.name}`);
