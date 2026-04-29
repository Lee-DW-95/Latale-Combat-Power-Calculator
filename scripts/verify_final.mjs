/**
 * 최종 파라미터로 물리 51건 + 마법 5건 전체 잔차 검증.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, '../SAMPLE_DATA.json'), 'utf-8'));

const PHYSICAL = {
  K0: 1.48838356e+0, K1: 1.46221296e+2, K2: 1.28057007e+0, K_mon: 4.04390549e-1,
  D_crit: 2.26209973e+2, D_dmg: 1.94551489e-34, D_dom: 1.88920615e+2,
  K_geunma: 1.01531112e-3, D_pen: 25.0, base: 6.18437351e-42,
};
const MAGIC = { ...PHYSICAL, K1: 1.47548700e+2 };

function predict(d, p) {
  const maxDmg = d.최대뎀;
  const minDmg = Math.min(d.최소뎀, maxDmg);
  const aBase =
    d.주스탯 * p.K0 +
    d.공격력 * p.K1 +
    d.고댐 * p.K2 +
    ((d.일몬추 || 0) + (d.보몬추 || 0)) * (p.K_mon || 0);
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
