/**
 * 잔차 패턴 분석 + 가중치/그룹 실험
 *
 * 목적:
 *   1) 현재 V_BIG2 학습 결과의 잔차를 그룹별로 분해
 *   2) "단일변수 통제 페어"가 다수(img24×13, case2×13 등)이라 옵티마이저가
 *      해당 클러스터에 끌려가는 현상을 정량화
 *   3) 그룹 가중치 동일화 / 가중 학습 / D_pen 자유화 등의 실험
 *
 * 실행: node scripts/analyze_residuals.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, '../SAMPLE_DATA.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

// ============================================================
// 그룹 분류 (이름 기반: 같은 베이스 캐릭터 = 한 그룹)
// ============================================================
function groupOf(name) {
  if (name.startsWith('img24')) return 'img24';
  if (name.startsWith('case1')) return 'case1';
  if (name.startsWith('case2')) return 'case2';
  if (name.startsWith('case3')) return 'case3';
  if (name.startsWith('case4')) return 'case4';
  return name; // 단독
}

// ============================================================
// V_BIG2 모델
// ============================================================
const D_PEN_FIXED = 25.0;

function model(d, p, dpen = D_PEN_FIXED) {
  const [K0, K1, K2, Dcrit, Ddmg, Ddom, Kg, base] = p;
  const maxDmg = d.최대뎀;
  const minDmg = Math.min(d.최소뎀, maxDmg);
  const aBase = d.주스탯 * K0 + d.공격력 * K1 + d.고댐 * K2;
  if (aBase <= 0) return 0;
  return (
    aBase *
    (1 + d.크댐 / Dcrit) *
    (1 + (minDmg + maxDmg) / Ddmg) *
    (1 + (d.일몬지 + d.보몬지) / Ddom) *
    (1 + d.근마효율 * Kg) *
    (1 + d.관통 / dpen) *
    base
  );
}

// 가중치 지원 loss
function lossLogW(yvec, dataset, weights, dpen = D_PEN_FIXED) {
  const p = yvec.map(Math.exp);
  let err = 0;
  let wsum = 0;
  for (let i = 0; i < dataset.length; i++) {
    const d = dataset[i];
    const w = weights[i];
    const pred = model(d, p, dpen);
    if (!Number.isFinite(pred) || pred <= 0) return 1e10;
    const r = (pred - d.전투력) / d.전투력;
    err += w * r * r;
    wsum += w;
  }
  return err / wsum;
}

// D_pen도 자유 파라미터로 두는 모델
function lossLogFree(yvec, dataset, weights) {
  const p = yvec.slice(0, 8).map(Math.exp);
  const dpen = Math.exp(yvec[8]);
  let err = 0;
  let wsum = 0;
  for (let i = 0; i < dataset.length; i++) {
    const d = dataset[i];
    const w = weights[i];
    const pred = model(d, p, dpen);
    if (!Number.isFinite(pred) || pred <= 0) return 1e10;
    const r = (pred - d.전투력) / d.전투력;
    err += w * r * r;
    wsum += w;
  }
  return err / wsum;
}

// ============================================================
// Nelder-Mead (간소화)
// ============================================================
function nelderMead(f, x0, opts = {}) {
  const { alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5,
    maxIter = 10000, tolFun = 1e-14, tolX = 1e-12, initStep = 0.05 } = opts;
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

function optimize(dataset, weights, nStarts, seed, free = false) {
  const ranges8 = [
    [0.5, 3], [80, 200], [0.01, 5], [20, 200],
    [10, 100000], [30, 500], [0.0001, 0.05], [1e-7, 1e-3],
  ];
  const rangesFree = [...ranges8, [10, 50]];
  const ranges = free ? rangesFree : ranges8;
  let bestLoss = Infinity, bestParams = null;
  const rng = mulberry32(seed);
  const lossFn = free
    ? (y) => lossLogFree(y, dataset, weights)
    : (y) => lossLogW(y, dataset, weights);
  for (let s = 0; s < nStarts; s++) {
    const x0 = ranges.map(([lo, hi]) => Math.log(lo + (hi - lo) * rng()));
    const r = nelderMead(lossFn, x0, { maxIter: 8000, initStep: 0.05 });
    if (r.fun < bestLoss) { bestLoss = r.fun; bestParams = r.x.map(Math.exp); }
  }
  return { params: bestParams, loss: bestLoss };
}

// ============================================================
// 평가 헬퍼
// ============================================================
function evalRMSE(dataset, params, dpen = D_PEN_FIXED) {
  const errs = dataset.map((d) => (model(d, params, dpen) - d.전투력) / d.전투력);
  const ss = errs.reduce((a, e) => a + e * e, 0);
  return Math.sqrt(ss / dataset.length) * 100;
}

function summary(label, dataset, params, dpen = D_PEN_FIXED) {
  const groups = {};
  for (const d of dataset) {
    const g = groupOf(d.name);
    if (!groups[g]) groups[g] = [];
    const pred = model(d, params, dpen);
    const err = ((pred - d.전투력) / d.전투력) * 100;
    groups[g].push({ name: d.name, actual: d.전투력, pred, err });
  }
  const totalRMSE = evalRMSE(dataset, params, dpen);
  console.log(`\n┃ ${label}`);
  console.log(`┃ 전체 RMSE: ${totalRMSE.toFixed(4)}%  |  n=${dataset.length}`);
  console.log(`┃ ─────────────────────────────────────────────────────────`);
  console.log(`┃ ${'그룹'.padEnd(10)} ${'n'.padStart(3)}  ${'RMSE%'.padStart(7)}  ${'평균err%'.padStart(8)}  ${'최대|err|%'.padStart(9)}`);
  for (const [g, rows] of Object.entries(groups)) {
    const errs = rows.map((r) => r.err);
    const meanE = errs.reduce((a, b) => a + b, 0) / errs.length;
    const rmse = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
    const maxAbs = Math.max(...errs.map((e) => Math.abs(e)));
    console.log(`┃ ${g.padEnd(10)} ${String(rows.length).padStart(3)}  ${rmse.toFixed(3).padStart(7)}  ${meanE.toFixed(3).padStart(8)}  ${maxAbs.toFixed(3).padStart(9)}`);
  }
}

// ============================================================
// 실험
// ============================================================
const physical = data.filter((d) => d.type === 'P');
const N_STARTS = 200;

console.log('═══════════════════════════════════════════════════════════════');
console.log(' 라테일 전투력 잔차 패턴 분석 + 가중치 실험');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`물리 데이터: ${physical.length}건`);

// 그룹 카운트
const counts = {};
for (const d of physical) {
  const g = groupOf(d.name);
  counts[g] = (counts[g] || 0) + 1;
}
console.log('그룹 분포:', counts);

// === 실험 A: 균등 가중치 (현행) — D_pen=25 고정 ===
const wEq = physical.map(() => 1);
const expA = optimize(physical, wEq, N_STARTS, 42, false);
summary('[A] 균등 가중치 + D_pen=25 고정 (현행 학습 방식)', physical, expA.params);

// === 실험 B: 그룹별 동일 가중치 (1 / group_size) ===
const wGrp = physical.map((d) => 1 / counts[groupOf(d.name)]);
const expB = optimize(physical, wGrp, N_STARTS, 42, false);
summary('[B] 그룹 가중치 동일화 (1/group_size) + D_pen=25 고정', physical, expB.params);

// === 실험 C: D_pen도 자유 파라미터 ===
const expC = optimize(physical, wEq, N_STARTS, 42, true);
const dpenC = expC.params[8];
summary(`[C] 균등 가중치 + D_pen 자유 (학습값 D_pen=${dpenC.toFixed(3)})`,
  physical, expC.params.slice(0, 8), dpenC);

// === 실험 D: 그룹 가중 + D_pen 자유 ===
const expD = optimize(physical, wGrp, N_STARTS, 42, true);
const dpenD = expD.params[8];
summary(`[D] 그룹 가중치 + D_pen 자유 (학습값 D_pen=${dpenD.toFixed(3)})`,
  physical, expD.params.slice(0, 8), dpenD);

// === 실험 E: case3/case4 제외 + D_pen 자유 ===
const noOutliers = physical.filter((d) => !d.name.startsWith('case3') && !d.name.startsWith('case4'));
const wE = noOutliers.map(() => 1);
const expE = optimize(noOutliers, wE, N_STARTS, 42, true);
const dpenE = expE.params[8];
console.log('\n┃ [E] case3/case4 제외(outlier 가설 검증)');
summary(`   학습된 모델로 전체 데이터 평가 (D_pen=${dpenE.toFixed(3)})`,
  physical, expE.params.slice(0, 8), dpenE);

// === 실험 F: B(그룹 가중) 결과를 case3/case4에 적용했을 때 잔차 패턴 ===
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' [B] 결과 상세: case3/case4에 잔존하는 편향 분석');
console.log('═══════════════════════════════════════════════════════════════');
const target = physical.filter((d) => d.name.startsWith('case3') || d.name.startsWith('case4'));
for (const d of target) {
  const pred = model(d, expB.params);
  const err = ((pred - d.전투력) / d.전투력) * 100;
  console.log(`  ${d.name.padEnd(15)} 실제=${d.전투력}  예측=${pred.toFixed(0)}  err=${err >= 0 ? '+' : ''}${err.toFixed(2)}%  (공격력=${d.공격력}, 최소뎀=${d.최소뎀}, 최대뎀=${d.최대뎀})`);
}

// 추천 파라미터 출력 (B 또는 D 중 RMSE 낮은 쪽)
const winner = expD.loss < expB.loss ? { params: expD.params.slice(0, 8), dpen: dpenD, label: 'D' }
                                      : { params: expB.params, dpen: D_PEN_FIXED, label: 'B' };
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(` 추천 파라미터 (실험 ${winner.label})`);
console.log('═══════════════════════════════════════════════════════════════');
console.log('export const PHYSICAL_PARAMS = Object.freeze({');
console.log(`  K0: ${winner.params[0].toExponential(8)},`);
console.log(`  K1: ${winner.params[1].toExponential(8)},`);
console.log(`  K2: ${winner.params[2].toExponential(8)},`);
console.log(`  D_crit: ${winner.params[3].toExponential(8)},`);
console.log(`  D_dmg: ${winner.params[4].toExponential(8)},`);
console.log(`  D_dom: ${winner.params[5].toExponential(8)},`);
console.log(`  K_geunma: ${winner.params[6].toExponential(8)},`);
console.log(`  D_pen: ${winner.dpen.toFixed(4)},`);
console.log(`  base: ${winner.params[7].toExponential(8)},`);
console.log('});');
