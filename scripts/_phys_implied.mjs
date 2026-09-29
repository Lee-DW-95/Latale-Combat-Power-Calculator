import { calculateDirectBP, calculateSummonBP } from '../src/utils/battlePower.js';
import { PHYS } from './_phys5.mjs';
// 직접·소환 BP 를 맞추는 무기공격력 역산 (이분 탐색, 나머지 입력 고정)
function solve(c, fn, target) {
  let lo = c.공격력 * 0.9, hi = c.공격력 * 1.1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (fn({ ...c, 공격력: m }) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
for (const c of PHYS) {
  const ad = solve(c, (s) => calculateDirectBP(s, 'base'), c.직접);
  const as = solve(c, calculateSummonBP, c.소환);
  const mid = c.공격력;
  console.log(c.name.padEnd(12), '표시중간', mid.toFixed(1).padStart(9), '| 직접이 요구', ad.toFixed(1).padStart(9), `(${(ad - mid).toFixed(1)})`, '| 소환이 요구', as.toFixed(1).padStart(9), `(${(as - mid).toFixed(1)})`, '| 범위', c.무기공표시min, '~', c.무기공표시max);
}
