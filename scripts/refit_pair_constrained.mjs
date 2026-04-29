/**
 * 페어 제약 학습 — case2 페어 데이터에서 도출한 K_mon/K2 비율을 강제 적용.
 *
 * case2 페어 측정:
 *   - 고댐 -150 → BP -57 (per unit: 0.38)
 *   - 일몬추 -100 → BP -12 (per unit: 0.12)
 *   - 보몬추 -100 → BP -12 (per unit: 0.12)
 *   - 비율: K_mon / K2 = 0.12 / 0.38 = 0.3158
 *
 * K_mon = K2 × 0.3158 로 제약하고 8 params + base 학습 (실질 8개 자유도, K_mon 제거).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, '../SAMPLE_DATA.json'), 'utf-8'));

const D_PEN_FIXED = 25.0;
const KMON_RATIO = 12 / 57 * (150 / 100);  // = 0.3158 (단위 보정 포함: 12/(150/100)/57)

// 위 KMON_RATIO 단위 정정:
// d(BP)/d(고댐) = 57/150 = 0.38, d(BP)/d(일몬추) = 12/100 = 0.12
// 비율 = 0.12 / 0.38 = 0.3158
// 모델 측: K_mon × multiplier×base / (K2 × multiplier×base) = K_mon / K2
// 따라서 K_mon = K2 × 0.3158
const RATIO = 0.12 / 0.38;
console.log(`K_mon / K2 비율 = ${RATIO.toFixed(4)} (case2 페어 데이터 기반)`);

function modelBig(d, p) {
  // p = [K0, K1, K2, Dcrit, Ddmg, Ddom, Kgeunma, base]
  // K_mon = K2 × RATIO (제약)
  const [K0, K1, K2, Dcrit, Ddmg, Ddom, Kgeunma, base] = p;
  const Kmon = K2 * RATIO;
  const maxDmg = d.최대뎀;
  const minDmg = Math.min(d.최소뎀, maxDmg);
  const aBase =
    d.주스탯 * K0 +
    d.공격력 * K1 +
    d.고댐 * K2 +
    ((d.일몬추 || 0) + (d.보몬추 || 0)) * Kmon;
  if (aBase <= 0) return 0;
  return (
    aBase *
    (1 + d.크댐 / Dcrit) *
    (1 + (minDmg + maxDmg) / Ddmg) *
    (1 + (d.일몬지 + d.보몬지) / Ddom) *
    (1 + d.근마효율 * Kgeunma) *
    (1 + d.관통 / D_PEN_FIXED) *
    base
  );
}

function lossLog(yvec, dataset) {
  const p = yvec.map(Math.exp);
  let err = 0;
  for (const d of dataset) {
    const pred = modelBig(d, p);
    if (!Number.isFinite(pred) || pred <= 0) return 1e10;
    const r = (pred - d.전투력) / d.전투력;
    err += r * r;
  }
  return err;
}

// Nelder-Mead (간단 버전)
function nelderMead(f, x0, opts = {}) {
  const { alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5,
    maxIter = 20000, tolFun = 1e-14, tolX = 1e-12, initStep = 0.05 } = opts;
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i] = v[i] + (v[i] === 0 ? initStep : v[i] * initStep);
    simplex.push(v);
  }
  let scores = simplex.map(f);
  for (let iter = 0; iter < maxIter; iter++) {
    const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
    simplex = idx.map((i) => simplex[i]);
    scores = idx.map((i) => scores[i]);
    if (Math.abs(scores[n] - scores[0]) < tolFun) break;
    let xs = 0;
    for (let j = 0; j < n; j++) {
      let mn = simplex[0][j], mx = simplex[0][j];
      for (let i = 1; i <= n; i++) {
        if (simplex[i][j] < mn) mn = simplex[i][j];
        if (simplex[i][j] > mx) mx = simplex[i][j];
      }
      xs = Math.max(xs, mx - mn);
    }
    if (xs < tolX) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j];
    for (let j = 0; j < n; j++) c[j] /= n;
    const xr = c.map((cc, j) => cc + alpha * (cc - simplex[n][j]));
    const fr = f(xr);
    if (fr < scores[0]) {
      const xe = c.map((cc, j) => cc + gamma * (xr[j] - cc));
      const fe = f(xe);
      if (fe < fr) { simplex[n] = xe; scores[n] = fe; }
      else { simplex[n] = xr; scores[n] = fr; }
    } else if (fr < scores[n - 1]) {
      simplex[n] = xr; scores[n] = fr;
    } else {
      const useOuter = fr < scores[n];
      const target = useOuter ? xr : simplex[n];
      const xc = c.map((cc, j) => cc + rho * (target[j] - cc));
      const fc = f(xc);
      if (fc < (useOuter ? fr : scores[n])) { simplex[n] = xc; scores[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          for (let j = 0; j < n; j++) {
            simplex[i][j] = simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]);
          }
          scores[i] = f(simplex[i]);
        }
      }
    }
  }
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  return { x: simplex[idx[0]], fun: scores[idx[0]] };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function optimize(dataset, nStarts = 500, seed = 42) {
  // [K0, K1, K2, Dcrit, Ddmg, Ddom, Kgeunma, base]
  const ranges = [
    [0.5, 3], [80, 200], [0.01, 5],
    [20, 200], [10, 100000], [30, 500],
    [0.0001, 0.05], [1e-7, 1e-3],
  ];
  let bestLoss = Infinity, bestParams = null;
  const rng = mulberry32(seed);
  for (let s = 0; s < nStarts; s++) {
    const x0 = ranges.map(([lo, hi]) => Math.log(lo + (hi - lo) * rng()));
    const r = nelderMead((y) => lossLog(y, dataset), x0, { maxIter: 10000, initStep: 0.05 });
    if (r.fun < bestLoss) { bestLoss = r.fun; bestParams = r.x.map(Math.exp); }
  }
  return { params: bestParams, loss: bestLoss };
}

const physical = data.filter((d) => d.type === 'P');
console.log(`물리 데이터: ${physical.length}건, 학습 시작...`);
const t0 = Date.now();
const { params } = optimize(physical, 500, 42);
console.log(`학습 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

const Kmon = params[2] * RATIO;
const rmse = Math.sqrt(physical.reduce((acc, d) => {
  const r = (modelBig(d, params) - d.전투력) / d.전투력;
  return acc + r * r;
}, 0) / physical.length) * 100;

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`물리 (제약: K_mon = K2 × ${RATIO.toFixed(4)}) | RMSE=${rmse.toFixed(4)}%`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`export const PHYSICAL_PARAMS = Object.freeze({`);
console.log(`  K0: ${params[0].toExponential(8)},`);
console.log(`  K1: ${params[1].toExponential(8)},`);
console.log(`  K2: ${params[2].toExponential(8)},`);
console.log(`  K_mon: ${Kmon.toExponential(8)},  // K2 × ${RATIO.toFixed(4)} (페어 제약)`);
console.log(`  D_crit: ${params[3].toExponential(8)},`);
console.log(`  D_dmg: ${params[4].toExponential(8)},`);
console.log(`  D_dom: ${params[5].toExponential(8)},`);
console.log(`  K_geunma: ${params[6].toExponential(8)},`);
console.log(`  D_pen: ${D_PEN_FIXED},`);
console.log(`  base: ${params[7].toExponential(8)},`);
console.log(`});`);

// case2 페어 검증
console.log(`\n[case2 페어 검증]`);
for (const name of ['case2_base', 'case2_일몬추100다운', 'case2_보몬추100다운', 'case2_고댐150다운']) {
  const d = physical.find((x) => x.name === name);
  if (!d) continue;
  const pred = modelBig(d, params);
  const err = ((pred - d.전투력) / d.전투력) * 100;
  console.log(`  ${name.padEnd(22)} 실제 ${d.전투력}  예측 ${Math.round(pred)}  오차 ${err >= 0 ? '+' : ''}${err.toFixed(3)}%`);
}
const base = physical.find((x) => x.name === 'case2_base');
const ilmon = physical.find((x) => x.name === 'case2_일몬추100다운');
const godam = physical.find((x) => x.name === 'case2_고댐150다운');
const pBase = modelBig(base, params);
const pIlmon = modelBig(ilmon, params);
const pGodam = modelBig(godam, params);
console.log(`\n[페어 차이 비교]`);
console.log(`  일몬추 -100 실제 ΔBP: ${ilmon.전투력 - base.전투력}, 모델 예측: ${(pIlmon - pBase).toFixed(2)}`);
console.log(`  고댐 -150 실제 ΔBP: ${godam.전투력 - base.전투력}, 모델 예측: ${(pGodam - pBase).toFixed(2)}`);
