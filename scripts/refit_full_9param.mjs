// 9-param + SPLIT 풀 재학습 (총 13 자유도, D_pen=25 고정)
//
// 카톡 페어 18건 + SAMPLE_DATA P 54건 + M 5건 (총 77건) 함께 사용.
// 손실: 종합/직접/소환 BP 의 상대 오차 제곱합 (전 entry 균등 가중).
// 마법 K1 은 PHYSICAL_PARAMS.K1 × 1.00908 비율 유지.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(resolve(__dirname, '../SAMPLE_DATA.json'), 'utf-8'));

const D_PEN = 25.0;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;  // 1.00908 (기존 비율)

function buildKatalk() {
  const base = {
    주스탯: 8112370, 공격력: 66821, 관통: 98, 크댐: 9014,
    최소뎀: 8396, 최대뎀: 8670, 고댐: 789694, 일몬추: 1128458, 보몬추: 1141576,
    일몬지: 69.5, 보몬지: 81.3, 근마효율: 27,
  };
  const cases = [
    { name: 'katalk_BASE',         diff: {},                                          전투력: 4779114, 직접타격: 4663530, 소환타격: 4894698 },
    { name: 'katalk_근력_-2%',      diff: { 주스탯: 8085284 },                          전투력: 4770945, 직접타격: 4659919, 소환타격: 4882971 },
    { name: 'katalk_무공_-1%',      diff: { 공격력: 66688 },                            전투력: 4775306, 직접타격: 4657525, 소환타격: 4893088 },
    { name: 'katalk_보몬지_-2%',    diff: { 보몬지: 79.3 },                             전투력: 4751867, 직접타격: 4636942, 소환타격: 4866792 },
    { name: 'katalk_깡근력_-1000',  diff: { 주스탯: 8106380 },                          전투력: 4777307, 직접타격: 4662510, 소환타격: 4892104 },
    { name: 'katalk_무공_-10',     diff: { 공격력: 66771 },                            전투력: 4777660, 직접타격: 4661238, 소환타격: 4894083 },
    { name: 'katalk_고댐_-1%',      diff: { 고댐: Math.round(789694 * 0.99) },          전투력: 4778145, 직접타격: 4662921, 소환타격: 4893369 },
    { name: 'katalk_고댐_-1500',    diff: { 고댐: 788194 },                             전투력: 4778537, 직접타격: 4663167, 소환타격: 4893907 },
    { name: 'katalk_일몬추_-200',   diff: { 일몬추: 1128258 },                          전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
    { name: 'katalk_보몬추_-200',   diff: { 보몬추: 1141376 },                          전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
    { name: 'katalk_일몬추_-1%',    diff: { 일몬추: Math.round(1128458 * 0.99) },       전투력: 4778029, 직접타격: 4662848, 소환타격: 4893211 },
    { name: 'katalk_보몬추_-1%',    diff: { 보몬추: Math.round(1141576 * 0.99) },       전투력: 4778027, 직접타격: 4662847, 소환타격: 4893207 },
    { name: 'katalk_깡최소_raw-14', diff: { 최소뎀: 8396 - 14 },                        전투력: 4775193, 직접타격: 4659703, 소환타격: 4890683 },
    { name: 'katalk_깡크_raw-14',   diff: { 크댐: 9014 - 14 },                          전투력: 4771759, 직접타격: 4655366, 소환타격: 4887152 },
    { name: 'katalk_최종최소_-1%',  diff: { 최소뎀: Math.round(8396 * 0.99) },          전투력: 4762591, 직접타격: 4647407, 소환타격: 4877775 },
    { name: 'katalk_최종최대_-1%',  diff: { 최대뎀: Math.round(8670 * 0.99) },          전투력: 4761471, 직접타격: 4646314, 소환타격: 4876629 },
    { name: 'katalk_최종크_-1%',    diff: { 크댐: Math.round(9014 * 0.99) },            전투력: 4744967, 직접타격: 4630270, 소환타격: 4859664 },
    { name: 'katalk_근마_-1%',     diff: { 근마효율: 26 },                              전투력: 4768241, 직접타격: 4641784, 소환타격: 4894698 },
  ];
  return cases.map((c) => ({ type: 'P', ...base, ...c.diff, name: c.name, 전투력: c.전투력, 직접타격: c.직접타격, 소환타격: c.소환타격 }));
}

// p = [K0, K1, K2, K_mon, K_cross, D_crit, D_dmg, D_dom, base, SPLIT_U, SPLIT_V, SPLIT_W, SPLIT_X]
function modelBP(d, p) {
  const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
  const K1_eff = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
  const maxDmg = Number(d.최대뎀 || 0);
  const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
  const M = (1 + (d.크댐 || 0) / Dcrit)
          * (1 + (minDmg + maxDmg) / Ddmg)
          * (1 + ((d.일몬지 || 0) + (d.보몬지 || 0)) / Ddom)
          * (1 + (d.관통 || 0) / D_PEN)
          * base;
  const aBase = (mode) => {
    let alpha = K0;
    let beta = K1_eff;
    let gamma = K2;
    let delta = Kmon;
    let cross = 0;
    if (mode === 'direct') {
      alpha -= U; beta += V; gamma -= W; delta -= X;
      cross = Kcross * (d.주스탯 || 0) * ((d.근마효율 || 0) / 100);
    } else if (mode === 'summon') {
      alpha += U; beta -= V; gamma += W; delta += X;
    }
    return alpha * (d.주스탯 || 0)
         + beta * (d.공격력 || 0)
         + gamma * (d.고댐 || 0)
         + delta * ((d.일몬추 || 0) + (d.보몬추 || 0))
         + cross;
  };
  const ab_d = aBase('direct');
  const ab_s = aBase('summon');
  return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
}

function loss(yvec, dataset) {
  // y[0..8] = log(positive), y[9..12] = SPLIT (linear, 양/음 가능)
  const p = [
    Math.exp(yvec[0]), Math.exp(yvec[1]), Math.exp(yvec[2]), Math.exp(yvec[3]),
    Math.exp(yvec[4]), Math.exp(yvec[5]), Math.exp(yvec[6]), Math.exp(yvec[7]),
    Math.exp(yvec[8]),
    yvec[9], yvec[10], yvec[11], yvec[12],
  ];
  if (!p.every(Number.isFinite)) return 1e12;
  let err = 0;
  for (const d of dataset) {
    const pred = modelBP(d, p);
    if (!Number.isFinite(pred.avg) || !Number.isFinite(pred.direct) || !Number.isFinite(pred.summon)) return 1e12;
    if (d.전투력 > 0) {
      const r = (pred.avg - d.전투력) / d.전투력;
      err += r * r;
    }
    if (d.직접타격 > 0) {
      const r = (pred.direct - d.직접타격) / d.직접타격;
      err += r * r;
    }
    if (d.소환타격 > 0) {
      const r = (pred.summon - d.소환타격) / d.소환타격;
      err += r * r;
    }
  }
  return err;
}

function nelderMead(f, x0, opts = {}) {
  const { alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5,
    maxIter = 50000, tolFun = 1e-15, tolX = 1e-13, initStep = 0.1 } = opts;
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i] = v[i] + (Math.abs(v[i]) < 1e-9 ? initStep : v[i] * initStep);
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

function rmsePct(dataset, p) {
  const errs = { 종합: [], 직접: [], 소환: [] };
  for (const d of dataset) {
    const pred = modelBP(d, p);
    if (d.전투력 > 0) errs.종합.push((pred.avg - d.전투력) / d.전투력);
    if (d.직접타격 > 0) errs.직접.push((pred.direct - d.직접타격) / d.직접타격);
    if (d.소환타격 > 0) errs.소환.push((pred.summon - d.소환타격) / d.소환타격);
  }
  const calc = (xs) => xs.length === 0 ? 0 : Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) * 100;
  const max = (xs) => xs.length === 0 ? 0 : Math.max(...xs.map((x) => Math.abs(x))) * 100;
  return {
    종합: { rmse: calc(errs.종합), max: max(errs.종합), n: errs.종합.length },
    직접: { rmse: calc(errs.직접), max: max(errs.직접), n: errs.직접.length },
    소환: { rmse: calc(errs.소환), max: max(errs.소환), n: errs.소환.length },
  };
}

// ─── 학습 ───
const sampleP = sample.filter((d) => d.type === 'P');
const sampleM = sample.filter((d) => d.type === 'M');
const katalk = buildKatalk();
const dataset = [...sampleP, ...sampleM, ...katalk];

console.log(`학습 데이터: SAMPLE_DATA P=${sampleP.length}건 + M=${sampleM.length}건 + 카톡 ${katalk.length}건 = ${dataset.length}건\n`);

// 시작점 = 현재 battlePower.js 값 (5-param 적용 후)
const x0_p = [
  1.45988696e+0,  // K0
  1.47842018e+2,  // K1
  1.67360980e+0,  // K2
  2.76714980e-1,  // K_mon
  6.62923686e-1,  // K_cross (5-param 학습값)
  2.26209973e+2,  // D_crit
  1.94551489e-34, // D_dmg
  1.88920615e+2,  // D_dom
  6.18437351e-42, // base
  0.780533,       // SPLIT_U (5-param 학습값)
  82.989171,      // SPLIT_V
  0.172950,       // SPLIT_W
  0.164558,       // SPLIT_X
];

// 첫 9개는 log-space, 마지막 4개(SPLIT)는 linear
function toY(p) {
  return [...p.slice(0, 9).map(Math.log), ...p.slice(9)];
}
function toP(y) {
  return [...y.slice(0, 9).map(Math.exp), ...y.slice(9)];
}

const y0 = toY(x0_p);
console.log(`시작 loss = ${loss(y0, dataset).toFixed(8)}`);
const before = rmsePct(dataset, x0_p);
console.log(`시작 RMSE: 종합 ${before.종합.rmse.toFixed(3)}%  직접 ${before.직접.rmse.toFixed(3)}%  소환 ${before.소환.rmse.toFixed(3)}%\n`);

const rng = mulberry32(42);
let bestLoss = loss(y0, dataset);
let bestY = y0.slice();

// 시작점에서 직접 학습
const r0 = nelderMead((y) => loss(y, dataset), y0, { maxIter: 50000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }

// 다중 시작점 탐색
const N_STARTS = 200;
const t0 = Date.now();
for (let s = 0; s < N_STARTS; s++) {
  const init = y0.map((v, i) => {
    const noise = (rng() * 2 - 1) * (i < 9 ? 0.4 : 0.3 * Math.abs(v));
    return i < 9 ? v + noise : v + noise;
  });
  const r = nelderMead((y) => loss(y, dataset), init, { maxIter: 30000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}

console.log(`학습 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s, ${N_STARTS} starts) — best loss = ${bestLoss.toFixed(8)}\n`);

const bestP = toP(bestY);

// 학습 결과 출력
const labels = ['K0', 'K1', 'K2', 'K_mon', 'K_cross', 'D_crit', 'D_dmg', 'D_dom', 'base', 'SPLIT_U', 'SPLIT_V', 'SPLIT_W', 'SPLIT_X'];
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`9-param + SPLIT 학습 결과 vs 시작점`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
for (let i = 0; i < labels.length; i++) {
  const before = x0_p[i];
  const after = bestP[i];
  const beforeStr = (Math.abs(before) < 1e-3 || Math.abs(before) > 1e6) ? before.toExponential(6) : before.toFixed(6);
  const afterStr = (Math.abs(after) < 1e-3 || Math.abs(after) > 1e6) ? after.toExponential(6) : after.toFixed(6);
  const change = ((after - before) / before * 100).toFixed(1);
  console.log(`  ${labels[i].padEnd(8)} ${beforeStr.padStart(16)} → ${afterStr.padStart(16)}  (Δ ${change}%)`);
}

// RMSE 비교
function reportRmse(label, ds) {
  const before = rmsePct(ds, x0_p);
  const after = rmsePct(ds, bestP);
  console.log(`\n[${label}] (n_종합=${before.종합.n}, n_직접=${before.직접.n}, n_소환=${before.소환.n})`);
  console.log(`  종합 RMSE  ${before.종합.rmse.toFixed(3)}% → ${after.종합.rmse.toFixed(3)}%   max ${before.종합.max.toFixed(3)}% → ${after.종합.max.toFixed(3)}%`);
  console.log(`  직접 RMSE  ${before.직접.rmse.toFixed(3)}% → ${after.직접.rmse.toFixed(3)}%   max ${before.직접.max.toFixed(3)}% → ${after.직접.max.toFixed(3)}%`);
  console.log(`  소환 RMSE  ${before.소환.rmse.toFixed(3)}% → ${after.소환.rmse.toFixed(3)}%   max ${before.소환.max.toFixed(3)}% → ${after.소환.max.toFixed(3)}%`);
}

reportRmse('전체', dataset);
reportRmse('SAMPLE_DATA P', sampleP);
reportRmse('SAMPLE_DATA M', sampleM);
reportRmse('카톡 페어 18건', katalk);

// 카톡 케이스별 후 오차
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`카톡 페어 학습 후 케이스별 (종합/직접/소환 오차%)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
for (const d of katalk) {
  const pred = modelBP(d, bestP);
  const e1 = ((pred.avg - d.전투력) / d.전투력) * 100;
  const e2 = ((pred.direct - d.직접타격) / d.직접타격) * 100;
  const e3 = ((pred.summon - d.소환타격) / d.소환타격) * 100;
  const fmt = (e) => (e >= 0 ? '+' : '') + e.toFixed(3) + '%';
  console.log(`  ${d.name.padEnd(28)}  종합 ${fmt(e1).padStart(8)}   직접 ${fmt(e2).padStart(8)}   소환 ${fmt(e3).padStart(8)}`);
}

// battlePower.js 적용용 출력
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`battlePower.js 패치용 (PHYSICAL_PARAMS + SPLIT 상수)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`export const PHYSICAL_PARAMS = Object.freeze({`);
console.log(`  K0: ${bestP[0].toExponential(8)},`);
console.log(`  K1: ${bestP[1].toExponential(8)},`);
console.log(`  K2: ${bestP[2].toExponential(8)},`);
console.log(`  K_mon: ${bestP[3].toExponential(8)},`);
console.log(`  D_crit: ${bestP[5].toExponential(8)},`);
console.log(`  D_dmg: ${bestP[6].toExponential(8)},`);
console.log(`  D_dom: ${bestP[7].toExponential(8)},`);
console.log(`  K_cross: ${bestP[4].toExponential(8)},`);
console.log(`  D_pen: 25.0,`);
console.log(`  base: ${bestP[8].toExponential(8)},`);
console.log(`});`);
console.log(`const SPLIT_U = ${bestP[9].toFixed(6)};`);
console.log(`const SPLIT_V = ${bestP[10].toFixed(6)};`);
console.log(`const SPLIT_W = ${bestP[11].toFixed(6)};`);
console.log(`const SPLIT_X = ${bestP[12].toFixed(6)};`);
console.log(`// MAGIC_PARAMS K1 = K1 × ${MAGIC_K1_RATIO.toFixed(8)} = ${(bestP[1] * MAGIC_K1_RATIO).toExponential(8)}`);
