// 카톡 페어 제외 학습 — 잔차 source 가 카톡 페어인지 SAMPLE_DATA 인지 판별
//
// 만약 카톡 빼고 학습 시 SAMPLE 잔차 큰 폭 줄면 → 카톡 페어가 wrong direction
// 만약 비슷하게 유지되면 → SAMPLE_DATA 자체 노이즈

import { readFileSync } from 'node:fs';

const D_PEN = 25.0;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;

const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const sampleFull = sample.filter((d) => d.직접타격 && d.소환타격 && d.근마효율 !== undefined).filter((d) => d.최소뎀 <= d.최대뎀);

console.log(`학습 데이터: SAMPLE 만 ${sampleFull.length}건 (카톡 페어 제외)`);
console.log(`  P: ${sampleFull.filter((d) => d.type === 'P').length}, M: ${sampleFull.filter((d) => d.type === 'M').length}`);

function modelBP(d, p) {
  const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
  const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
  const maxDmg = Number(d.최대뎀 || 0);
  const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
  const M = (1 + (d.크댐 || 0) / Dcrit)
          * (1 + (minDmg + maxDmg) / Ddmg)
          * (1 + ((d.일몬지 || 0) + (d.보몬지 || 0)) / Ddom)
          * (1 + (d.관통 || 0) / D_PEN)
          * base;
  const aBasePre = (mode) => {
    let alpha = K0, beta = K1e, gamma = K2, delta = Kmon;
    if (mode === 'direct') { alpha -= U; beta += V; gamma -= W; delta -= X; }
    else if (mode === 'summon') { alpha += U; beta -= V; gamma += W; delta += X; }
    return alpha * (d.주스탯 || 0) + beta * (d.공격력 || 0) + gamma * (d.고댐 || 0) + delta * ((d.일몬추 || 0) + (d.보몬추 || 0));
  };
  const ab_d_pre = aBasePre('direct');
  const ab_s = aBasePre('summon');
  const ab_d = ab_d_pre * (1 + Kcross * (d.근마효율 || 0) / 100);
  return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
}

function loss(yvec, ds) {
  const p = [
    Math.exp(yvec[0]), Math.exp(yvec[1]), Math.exp(yvec[2]), Math.exp(yvec[3]),
    Math.exp(yvec[4]), Math.exp(yvec[5]), Math.exp(yvec[6]), Math.exp(yvec[7]),
    Math.exp(yvec[8]), yvec[9], yvec[10], yvec[11], yvec[12],
  ];
  if (!p.every(Number.isFinite)) return 1e12;
  const [K0, K1, K2, Kmon, , , , , , U, V, W, X] = p;
  let penalty = 0;
  const margins = [K0 - Math.abs(U), K1 - Math.abs(V), K2 - Math.abs(W), Kmon - Math.abs(X)];
  for (const m of margins) if (m < 0) penalty += m * m * 1e4;
  let err = 0;
  for (const d of ds) {
    const pred = modelBP(d, p);
    if (!Number.isFinite(pred.avg + pred.direct + pred.summon)) return 1e12;
    if (d.전투력 > 0)    { const r = (pred.avg - d.전투력) / d.전투력;       err += r * r; }
    if (d.직접타격 > 0) { const r = (pred.direct - d.직접타격) / d.직접타격; err += r * r; }
    if (d.소환타격 > 0) { const r = (pred.summon - d.소환타격) / d.소환타격; err += r * r; }
  }
  return err + penalty;
}

function nelderMead(f, x0, opts = {}) {
  const { alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5,
    maxIter = 100000, tolFun = 1e-16, tolX = 1e-14, initStep = 0.1 } = opts;
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
    simplex = idx.map((i) => simplex[i]); scores = idx.map((i) => scores[i]);
    if (Math.abs(scores[n] - scores[0]) < tolFun) break;
    let xs = 0;
    for (let j = 0; j < n; j++) {
      let mn = simplex[0][j], mx = simplex[0][j];
      for (let i = 1; i <= n; i++) { if (simplex[i][j] < mn) mn = simplex[i][j]; if (simplex[i][j] > mx) mx = simplex[i][j]; }
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
    } else if (fr < scores[n - 1]) { simplex[n] = xr; scores[n] = fr; }
    else {
      const useOuter = fr < scores[n];
      const target = useOuter ? xr : simplex[n];
      const xc = c.map((cc, j) => cc + rho * (target[j] - cc));
      const fc = f(xc);
      if (fc < (useOuter ? fr : scores[n])) { simplex[n] = xc; scores[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          for (let j = 0; j < n; j++) simplex[i][j] = simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]);
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

function rmsePct(ds, p) {
  const errs = { 종합: [], 직접: [], 소환: [] };
  for (const d of ds) {
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

const x0_p = [
  2.44391297e+0, 2.36693700e+2, 2.83992943e+0, 6.44782260e-1,
  2.11597980e-1, 2.38977295e+2, 1.85877760e-37, 1.79620650e+2,
  3.67549462e-45, 1.221786, 131.972520, 0.214665, 0.345657,
];

function toY(p) { return [...p.slice(0, 9).map(Math.log), ...p.slice(9)]; }
function toP(y) { return [...y.slice(0, 9).map(Math.exp), ...y.slice(9)]; }

const y0 = toY(x0_p);
const rng = mulberry32(13);
let bestLoss = loss(y0, sampleFull);
let bestY = y0.slice();
const r0 = nelderMead((y) => loss(y, sampleFull), y0, { maxIter: 100000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }

const N = 1500;
const t0 = Date.now();
for (let s = 0; s < N; s++) {
  const init = y0.map((v, i) => v + (rng() * 2 - 1) * (i < 9 ? 0.2 : 0.3));
  const r = nelderMead((y) => loss(y, sampleFull), init, { maxIter: 50000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}
console.log(`\n학습 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) — best loss = ${bestLoss.toExponential(3)}\n`);

const bestP = toP(bestY);
const after = rmsePct(sampleFull, bestP);
console.log(`━ 학습 후 SAMPLE ${sampleFull.length}건 ━`);
console.log(`  종합 RMSE ${after.종합.rmse.toFixed(3)}%  max ${after.종합.max.toFixed(3)}%`);
console.log(`  직접 RMSE ${after.직접.rmse.toFixed(3)}%  max ${after.직접.max.toFixed(3)}%`);
console.log(`  소환 RMSE ${after.소환.rmse.toFixed(3)}%  max ${after.소환.max.toFixed(3)}%`);

console.log(`\n━ 케이스별 잔차 ━`);
for (const d of sampleFull) {
  const pred = modelBP(d, bestP);
  const e1 = ((pred.avg - d.전투력) / d.전투력) * 100;
  const e2 = ((pred.direct - d.직접타격) / d.직접타격) * 100;
  const e3 = ((pred.summon - d.소환타격) / d.소환타격) * 100;
  const fmt = (e) => (e >= 0 ? '+' : '') + e.toFixed(3) + '%';
  console.log(`  ${d.name.padEnd(22)} ${d.type}  종합 ${fmt(e1).padStart(10)}   직 ${fmt(e2).padStart(10)}   소 ${fmt(e3).padStart(10)}`);
}

console.log(`\n━ 비교 결론 ━`);
console.log(`  V_BIG8 (카톡 포함) SAMPLE 종합 RMSE: 0.382%, max 0.83%`);
console.log(`  카톡 제외 SAMPLE 만 학습:           ${after.종합.rmse.toFixed(3)}%, max ${after.종합.max.toFixed(2)}%`);
if (after.종합.rmse < 0.20) {
  console.log(`  → 카톡 페어가 학습을 wrong direction 으로 끌고 갔음. SAMPLE 만으로 학습하면 fit 향상.`);
} else if (after.종합.rmse < 0.30) {
  console.log(`  → 카톡 페어 영향이 약간 있음. 둘 사이 미세한 calibration 차이.`);
} else {
  console.log(`  → 카톡 빼도 SAMPLE 자체에 ~0.4% 잔차. SAMPLE_DATA 의 OCR 또는 직업별 차이가 원인.`);
}
