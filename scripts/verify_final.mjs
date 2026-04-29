/**
 * 최종 파라미터로 물리 51건 + 마법 5건 전체 잔차 검증.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, '../SAMPLE_DATA.json'), 'utf-8'));

const PHYSICAL = {
  K0: 3.11084133e-1, K1: 3.04944138e+1, K2: 2.92501642e-1,
  D_crit: 4.45313835e+2, D_dmg: 5.18950946e-10, D_dom: 1.93570364e+2,
  K_geunma: 8.31043452e-4, D_pen: 25.0, base: 1.59521867e-16,
};
const MAGIC = { ...PHYSICAL, K1: 3.09868000e+1 };

function predict(d, p) {
  const maxDmg = d.최대뎀;
  const minDmg = Math.min(d.최소뎀, maxDmg);
  const aBase = d.주스탯 * p.K0 + d.공격력 * p.K1 + d.고댐 * p.K2;
  if (aBase <= 0) return 0;
  return aBase
    * (1 + d.크댐 / p.D_crit)
    * (1 + (minDmg + maxDmg) / p.D_dmg)
    * (1 + (d.일몬지 + d.보몬지) / p.D_dom)
    * (1 + d.근마효율 * p.K_geunma)
    * (1 + d.관통 / p.D_pen)
    * p.base;
}

const physical = data.filter((d) => d.type === 'P');
const magic = data.filter((d) => d.type === 'M');

function report(label, dataset, params) {
  const errs = dataset.map((d) => ((predict(d, params) - d.전투력) / d.전투력) * 100);
  const rmse = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
  const maxAbs = Math.max(...errs.map(Math.abs));
  const meanAbs = errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length;
  const over1 = errs.filter((e) => Math.abs(e) >= 1).length;
  const over2 = errs.filter((e) => Math.abs(e) >= 2).length;
  console.log(`\n┃ ${label}  (n=${dataset.length})`);
  console.log(`┃   RMSE        : ${rmse.toFixed(3)}%`);
  console.log(`┃   평균 |오차| : ${meanAbs.toFixed(3)}%`);
  console.log(`┃   최대 |오차| : ${maxAbs.toFixed(3)}%`);
  console.log(`┃   1% 초과    : ${over1}/${dataset.length}`);
  console.log(`┃   2% 초과    : ${over2}/${dataset.length}`);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' 최종 파라미터 검증 — 물리 51건 + 마법 5건');
console.log('═══════════════════════════════════════════════════════════════');

report('물리 (PHYSICAL_PARAMS)', physical, PHYSICAL);
report('마법 (MAGIC_PARAMS, K1만 +1.59%)', magic, MAGIC);

console.log('\n┃ 마법 5건 상세');
for (const d of magic) {
  const err = ((predict(d, MAGIC) - d.전투력) / d.전투력) * 100;
  const mark = Math.abs(err) < 0.5 ? '✓' : Math.abs(err) < 1 ? '~' : '✗';
  console.log(`  ${mark} ${d.name.padEnd(20)} 오차 ${err >= 0 ? '+' : ''}${err.toFixed(3)}%`);
}
