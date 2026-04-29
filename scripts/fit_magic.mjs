/**
 * 마법 직업 전용 파라미터 fit
 *
 * 5건의 마법 데이터로는 8개 파라미터 전체 학습 시 underdetermined.
 * 따라서 물리 파라미터를 baseline으로 하고, 마법에서 다를 가능성이 큰
 * 파라미터(K1, base)만 자유롭게 fit하여 비교한다.
 *
 * 비교 변형:
 *   V0  : 현행 (PHYSICAL_PARAMS 그대로)
 *   V_b : base만 자유 (1 param)
 *   V_k : K1만 자유 (1 param)
 *   V_kb: K1 + base 자유 (2 params)
 *   V_full: 전체 8 params 자유 (overfit 위험)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, '../SAMPLE_DATA.json'), 'utf-8'));
const magic = data.filter((d) => d.type === 'M');

// 현행 PHYSICAL_PARAMS (src/utils/battlePower.js와 동기화)
const P = {
  K0: 1.48838356e+0,
  K1: 1.46221296e+2,
  K2: 1.28057007e+0,
  K_mon: 4.04390549e-1,
  D_crit: 2.26209973e+2,
  D_dmg: 1.94551489e-34,
  D_dom: 1.88920615e+2,
  K_geunma: 1.01531112e-3,
  D_pen: 25.0,
  base: 6.18437351e-42,
};

function predict(d, p) {
  const maxDmg = d.최대뎀;
  const minDmg = Math.min(d.최소뎀, maxDmg);
  const aBase =
    d.주스탯 * p.K0 +
    d.공격력 * p.K1 +
    d.고댐 * p.K2 +
    ((d.일몬추 || 0) + (d.보몬추 || 0)) * (p.K_mon || 0);
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

function rmse(dataset, p) {
  const ss = dataset.reduce((a, d) => {
    const r = (predict(d, p) - d.전투력) / d.전투력;
    return a + r * r;
  }, 0);
  return Math.sqrt(ss / dataset.length) * 100;
}

// 1D Golden-section search (단일 파라미터 fit)
function goldenMin(f, lo, hi, tol = 1e-10) {
  const phi = (1 + Math.sqrt(5)) / 2;
  let a = lo, b = hi;
  let c = b - (b - a) / phi;
  let d = a + (b - a) / phi;
  while (Math.abs(b - a) > tol) {
    if (f(c) < f(d)) b = d; else a = c;
    c = b - (b - a) / phi;
    d = a + (b - a) / phi;
  }
  return (a + b) / 2;
}

// 2D coordinate descent (K1 + base 동시 fit)
function fit2D(dataset, init = { K1: P.K1, base: P.base }) {
  let { K1, base } = init;
  for (let iter = 0; iter < 50; iter++) {
    const baseOpt = goldenMin(
      (b) => rmse(dataset, { ...P, K1, base: b }),
      P.base * 0.8, P.base * 1.3
    );
    base = baseOpt;
    const K1Opt = goldenMin(
      (k) => rmse(dataset, { ...P, K1: k, base }),
      P.K1 * 0.8, P.K1 * 1.2
    );
    K1 = K1Opt;
  }
  return { K1, base };
}

// Nelder-Mead simplex (전체 8 param fit)
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

function fitFull(dataset, nStarts = 200, seed = 42) {
  const ranges = [
    [0.5, 3], [80, 200], [0.01, 5], [20, 200],
    [10, 100000], [30, 500], [0.0001, 0.05], [1e-7, 1e-3],
  ];
  let bestLoss = Infinity, bestP = null;
  const rng = mulberry32(seed);
  const lossFn = (yvec) => {
    const p = yvec.map(Math.exp);
    let err = 0;
    for (const d of dataset) {
      const pp = { K0: p[0], K1: p[1], K2: p[2], D_crit: p[3], D_dmg: p[4],
                   D_dom: p[5], K_geunma: p[6], D_pen: 25, base: p[7] };
      const pred = predict(d, pp);
      if (!Number.isFinite(pred) || pred <= 0) return 1e10;
      const r = (pred - d.전투력) / d.전투력;
      err += r * r;
    }
    return err;
  };
  for (let s = 0; s < nStarts; s++) {
    const x0 = ranges.map(([lo, hi]) => Math.log(lo + (hi - lo) * rng()));
    const r = nelderMead(lossFn, x0, { maxIter: 8000, initStep: 0.05 });
    if (r.fun < bestLoss) { bestLoss = r.fun; bestP = r.x.map(Math.exp); }
  }
  return {
    K0: bestP[0], K1: bestP[1], K2: bestP[2], D_crit: bestP[3],
    D_dmg: bestP[4], D_dom: bestP[5], K_geunma: bestP[6], D_pen: 25, base: bestP[7],
  };
}

function summary(label, dataset, p) {
  const r = rmse(dataset, p);
  console.log(`\n┃ ${label}  (RMSE ${r.toFixed(3)}%)`);
  for (const d of dataset) {
    const pred = predict(d, p);
    const err = ((pred - d.전투력) / d.전투력) * 100;
    const mark = Math.abs(err) < 1 ? '✓' : Math.abs(err) < 2 ? '~' : '✗';
    console.log(`  ${mark} ${d.name.padEnd(20)} 오차 ${err >= 0 ? '+' : ''}${err.toFixed(3)}%`);
  }
}

// ============================================================
// 실험 실행
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log(` 마법 5건 전용 파라미터 학습 (PHYSICAL 대비 변형 비교)`);
console.log('═══════════════════════════════════════════════════════════════');
console.log(`마법 데이터: ${magic.length}건`);

// V0: 현행
summary('[V0] 현행 PHYSICAL_PARAMS 그대로', magic, P);

// V_b: base만 자유
const meanBias = magic.reduce((a, d) =>
  a + (predict(d, P) - d.전투력) / d.전투력, 0) / magic.length;
const Vb = { ...P, base: P.base / (1 + meanBias) };
summary(`[V_b] base 1개만 보정 (base = ${Vb.base.toExponential(8)})`, magic, Vb);

// V_k: K1만 자유
const K1opt = goldenMin(
  (k) => rmse(magic, { ...P, K1: k }),
  P.K1 * 0.9, P.K1 * 1.1
);
const Vk = { ...P, K1: K1opt };
summary(`[V_k] K1 1개만 자유 (K1 = ${K1opt.toFixed(4)} = K1_phys × ${(K1opt / P.K1).toFixed(4)})`,
  magic, Vk);

// V_kb: K1 + base 동시 자유
const { K1: K1kb, base: baseKb } = fit2D(magic);
const Vkb = { ...P, K1: K1kb, base: baseKb };
summary(`[V_kb] K1+base 자유  (K1=${K1kb.toFixed(4)}, base=${baseKb.toExponential(8)})`,
  magic, Vkb);

// V_full: 전체 8 params (overfit 위험, 참고용)
console.log('\n전체 8 params fit 진행 (200 random starts)...');
const Vfull = fitFull(magic, 200);
summary(`[V_full] 전체 8 params (overfit 위험)`, magic, Vfull);

// ============================================================
// 추천안 출력
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' 종합 비교');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`V0    : RMSE ${rmse(magic, P).toFixed(3)}%  (현행, 보정 없음)`);
console.log(`V_b   : RMSE ${rmse(magic, Vb).toFixed(3)}%  (base만)`);
console.log(`V_k   : RMSE ${rmse(magic, Vk).toFixed(3)}%  (K1만 — 사용자 가설 정합)`);
console.log(`V_kb  : RMSE ${rmse(magic, Vkb).toFixed(3)}%  (K1+base)`);
console.log(`V_full: RMSE ${rmse(magic, Vfull).toFixed(3)}%  (전체 8 params, overfit)`);

console.log('\n추천: V_kb (K1+base) — 사용자 가설(max vs avg) 반영 + 전체 fit 균형');
console.log('\n[V_kb 적용용 MAGIC_PARAMS]');
console.log('export const MAGIC_PARAMS = Object.freeze({');
console.log(`  K0: ${P.K0.toExponential(8)},  // 물리와 동일`);
console.log(`  K1: ${Vkb.K1.toExponential(8)},  // 마법 전용 (속성력 단일값 보정)`);
console.log(`  K2: ${P.K2.toExponential(8)},  // 물리와 동일`);
console.log(`  D_crit: ${P.D_crit.toExponential(8)},`);
console.log(`  D_dmg: ${P.D_dmg.toExponential(8)},`);
console.log(`  D_dom: ${P.D_dom.toExponential(8)},`);
console.log(`  K_geunma: ${P.K_geunma.toExponential(8)},`);
console.log(`  D_pen: 25.0,`);
console.log(`  base: ${Vkb.base.toExponential(8)},  // 마법 전용 (잔여 편향 흡수)`);
console.log('});');
