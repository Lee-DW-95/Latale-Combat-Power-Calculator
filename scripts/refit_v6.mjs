// V_BIG6 학습 — 카톡 페어 18건 + 자료6 세이버 1건 (총 19건)
//
// 자료6 기본스탯 (사용자 제공):
//   근력 1414291, 공격력 14116, 크댐 7097, 최소뎀 5946, 최대뎀 6787,
//   고댐 506824, 일몬추 998944, 보몬추 954585
//   → 누적% 모두 깔끔한 값(539/465.56/44/36/31/106/14/13%) 확인 완료.
//
// 자료6 추가의 의미:
//   - 카톡과 다른 캐릭터 (다른 누적%, 누적 33% 근마효율) → K_cross 직업/캐릭 의존성 검증
//   - 페어가 없어 sensitivity 학습엔 영향 작음. 베이스 절대값 fit 으로 SAMPLE_DATA 일반화 개선

import { readFileSync } from 'node:fs';

const D_PEN = 25.0;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;

// 카톡 베이스
const katalkDisplay = {
  주스탯: 8112370, 공격력: 66821, 관통: 98, 크댐: 9014,
  최소뎀: 8396, 최대뎀: 8670, 고댐: 789694, 일몬추: 1128458, 보몬추: 1141576,
  일몬지: 69.5, 보몬지: 81.3, 근마효율: 27,
};
const katalkRaw = {
  주스탯: 1350799, 공격력: 13434, 크댐: 6468, 최소뎀: 5913, 최대뎀: 6283,
  고댐: 446155, 일몬추: 999064, 보몬추: 1001383,
};
const kCum = {};
for (const k of Object.keys(katalkRaw)) kCum[k] = katalkDisplay[k] / katalkRaw[k] - 1;

// 자료6 베이스
const j6Display = {
  type: 'P',
  주스탯: 9037319, 공격력: 79835, 관통: 99, 크댐: 10219,
  최소뎀: 8086, 최대뎀: 8890, 고댐: 1044057, 일몬추: 1138796, 보몬추: 1078681,
  일몬지: 65.5, 보몬지: 78.2, 근마효율: 33,
};

// 학습 데이터 — 카톡 18 페어 + 자료6 1건
const katalkCases = [
  { name: 'katalk_BASE',        diff: {},                                                                        전투력: 4779114, 직접타격: 4663530, 소환타격: 4894698 },
  { name: 'katalk_근력_-2pp',    diff: { 주스탯:  katalkRaw.주스탯  * (1 + kCum.주스탯  - 0.02) },               전투력: 4770945, 직접타격: 4659919, 소환타격: 4882971 },
  { name: 'katalk_무공_-1pp',    diff: { 공격력:  katalkRaw.공격력  * (1 + kCum.공격력  - 0.01) },               전투력: 4775306, 직접타격: 4657525, 소환타격: 4893088 },
  { name: 'katalk_보몬지_-2pp',  diff: { 보몬지: 79.3 },                                                          전투력: 4751867, 직접타격: 4636942, 소환타격: 4866792 },
  { name: 'katalk_깡근력_-1000', diff: { 주스탯: (katalkRaw.주스탯  - 1000) * (1 + kCum.주스탯) },               전투력: 4777307, 직접타격: 4662510, 소환타격: 4892104 },
  { name: 'katalk_무공_깡-10',   diff: { 공격력: (katalkRaw.공격력  - 10)   * (1 + kCum.공격력) },               전투력: 4777660, 직접타격: 4661238, 소환타격: 4894083 },
  { name: 'katalk_고댐_-1pp',    diff: { 고댐:    katalkRaw.고댐    * (1 + kCum.고댐    - 0.01) },               전투력: 4778145, 직접타격: 4662921, 소환타격: 4893369 },
  { name: 'katalk_고댐_-1500',   diff: { 고댐:   (katalkRaw.고댐    - 1500) * (1 + kCum.고댐) },                 전투력: 4778537, 직접타격: 4663167, 소환타격: 4893907 },
  { name: 'katalk_일몬추_-200',  diff: { 일몬추: (katalkRaw.일몬추  - 200)  * (1 + kCum.일몬추) },               전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
  { name: 'katalk_보몬추_-200',  diff: { 보몬추: (katalkRaw.보몬추  - 200)  * (1 + kCum.보몬추) },               전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
  { name: 'katalk_일몬추_-1pp',  diff: { 일몬추:  katalkRaw.일몬추  * (1 + kCum.일몬추  - 0.01) },               전투력: 4778029, 직접타격: 4662848, 소환타격: 4893211 },
  { name: 'katalk_보몬추_-1pp',  diff: { 보몬추:  katalkRaw.보몬추  * (1 + kCum.보몬추  - 0.01) },               전투력: 4778027, 직접타격: 4662847, 소환타격: 4893207 },
  { name: 'katalk_깡최소_-10',   diff: { 최소뎀: (katalkRaw.최소뎀  - 10)   * (1 + kCum.최소뎀) },               전투력: 4775193, 직접타격: 4659703, 소환타격: 4890683 },
  { name: 'katalk_깡크_-10',     diff: { 크댐:   (katalkRaw.크댐    - 10)   * (1 + kCum.크댐) },                  전투력: 4771759, 직접타격: 4655366, 소환타격: 4887152 },
  { name: 'katalk_최종최소_-1pp', diff: { 최소뎀:  katalkRaw.최소뎀  * (1 + kCum.최소뎀  - 0.01) },               전투력: 4762591, 직접타격: 4647407, 소환타격: 4877775 },
  { name: 'katalk_최종최대_-1pp', diff: { 최대뎀:  katalkRaw.최대뎀  * (1 + kCum.최대뎀  - 0.01) },               전투력: 4761471, 직접타격: 4646314, 소환타격: 4876629 },
  { name: 'katalk_최종크_-1pp',   diff: { 크댐:    katalkRaw.크댐    * (1 + kCum.크댐    - 0.01) },               전투력: 4744967, 직접타격: 4630270, 소환타격: 4859664 },
  { name: 'katalk_근마_-1pp',    diff: { 근마효율: 26 },                                                          전투력: 4768241, 직접타격: 4641784, 소환타격: 4894698 },
];

const katalkData = katalkCases.map((c) => ({ type: 'P', ...katalkDisplay, ...c.diff, name: c.name, 전투력: c.전투력, 직접타격: c.직접타격, 소환타격: c.소환타격 }));

const j6Data = [{
  ...j6Display,
  name: 'j6_세이버_BASE',
  전투력: 6150950,
  직접타격: 6154329,
  소환타격: 6147571,
}];

const dataset = [...katalkData, ...j6Data];

console.log(`학습 데이터: 카톡 ${katalkData.length}건 + 자료6 ${j6Data.length}건 = ${dataset.length}건\n`);

// 모델 (V_BIG5: cross-term multiplicative)
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
  let err = 0;
  for (const d of ds) {
    const pred = modelBP(d, p);
    if (!Number.isFinite(pred.avg + pred.direct + pred.summon)) return 1e12;
    if (d.전투력 > 0)    { const r = (pred.avg - d.전투력) / d.전투력;       err += r * r; }
    if (d.직접타격 > 0) { const r = (pred.direct - d.직접타격) / d.직접타격; err += r * r; }
    if (d.소환타격 > 0) { const r = (pred.summon - d.소환타격) / d.소환타격; err += r * r; }
  }
  return err;
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

// 시작점 = V_BIG5
const x0_p = [
  1.70746000e+0, 1.83072616e+2, 1.61635234e+0, 7.10785305e-1, 5.57603730e-1,
  1.99239848e+2, 8.53746608e-38, 2.01343932e+2, 1.94129186e-45,
  1.052791, 92.030099, 0.084326, 0.117403,
];

function toY(p) { return [...p.slice(0, 9).map(Math.log), ...p.slice(9)]; }
function toP(y) { return [...y.slice(0, 9).map(Math.exp), ...y.slice(9)]; }

const y0 = toY(x0_p);
const before_dataset = rmsePct(dataset, x0_p);
console.log(`시작점 V_BIG5 — 학습 데이터(19건)에서:`);
console.log(`  종합 RMSE ${before_dataset.종합.rmse.toFixed(3)}%  max ${before_dataset.종합.max.toFixed(3)}%`);
console.log(`  직접 RMSE ${before_dataset.직접.rmse.toFixed(3)}%  max ${before_dataset.직접.max.toFixed(3)}%`);
console.log(`  소환 RMSE ${before_dataset.소환.rmse.toFixed(3)}%  max ${before_dataset.소환.max.toFixed(3)}%`);
console.log(`  loss = ${loss(y0, dataset).toExponential(4)}\n`);

const rng = mulberry32(42);
let bestLoss = loss(y0, dataset);
let bestY = y0.slice();
const r0 = nelderMead((y) => loss(y, dataset), y0, { maxIter: 100000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }

const N = 800;
const t0 = Date.now();
for (let s = 0; s < N; s++) {
  const init = y0.map((v) => v + (rng() * 2 - 1) * 0.5);
  const r = nelderMead((y) => loss(y, dataset), init, { maxIter: 50000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}
console.log(`학습 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s, ${N} starts) — best loss = ${bestLoss.toExponential(4)}\n`);

const bestP = toP(bestY);
const labels = ['K0', 'K1', 'K2', 'K_mon', 'K_cross', 'D_crit', 'D_dmg', 'D_dom', 'base', 'SPLIT_U', 'SPLIT_V', 'SPLIT_W', 'SPLIT_X'];
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`V_BIG6 학습 결과 vs V_BIG5`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
for (let i = 0; i < labels.length; i++) {
  const b = x0_p[i], a = bestP[i];
  const bs = (Math.abs(b) < 1e-3 || Math.abs(b) > 1e6) ? b.toExponential(6) : b.toFixed(6);
  const as = (Math.abs(a) < 1e-3 || Math.abs(a) > 1e6) ? a.toExponential(6) : a.toFixed(6);
  console.log(`  ${labels[i].padEnd(8)} ${bs.padStart(16)} → ${as.padStart(16)}`);
}

const after = rmsePct(dataset, bestP);
const after_katalk = rmsePct(katalkData, bestP);
const after_j6 = rmsePct(j6Data, bestP);
console.log(`\n[학습 데이터 19건 전체]`);
console.log(`  종합 RMSE ${before_dataset.종합.rmse.toFixed(3)}% → ${after.종합.rmse.toFixed(3)}%   max ${before_dataset.종합.max.toFixed(3)}% → ${after.종합.max.toFixed(3)}%`);
console.log(`  직접 RMSE ${before_dataset.직접.rmse.toFixed(3)}% → ${after.직접.rmse.toFixed(3)}%   max ${before_dataset.직접.max.toFixed(3)}% → ${after.직접.max.toFixed(3)}%`);
console.log(`  소환 RMSE ${before_dataset.소환.rmse.toFixed(3)}% → ${after.소환.rmse.toFixed(3)}%   max ${before_dataset.소환.max.toFixed(3)}% → ${after.소환.max.toFixed(3)}%`);

console.log(`\n[카톡 18건만]`);
console.log(`  종합 RMSE ${after_katalk.종합.rmse.toFixed(3)}%  max ${after_katalk.종합.max.toFixed(3)}%`);
console.log(`  직접 RMSE ${after_katalk.직접.rmse.toFixed(3)}%  max ${after_katalk.직접.max.toFixed(3)}%`);
console.log(`  소환 RMSE ${after_katalk.소환.rmse.toFixed(3)}%  max ${after_katalk.소환.max.toFixed(3)}%`);

console.log(`\n[자료6만]`);
console.log(`  종합 ${after_j6.종합.rmse.toFixed(3)}%   직접 ${after_j6.직접.rmse.toFixed(3)}%   소환 ${after_j6.소환.rmse.toFixed(3)}%`);

console.log(`\n케이스별 잔차:`);
for (const d of dataset) {
  const pred = modelBP(d, bestP);
  const e1 = ((pred.avg - d.전투력) / d.전투력) * 100;
  const e2 = ((pred.direct - d.직접타격) / d.직접타격) * 100;
  const e3 = ((pred.summon - d.소환타격) / d.소환타격) * 100;
  const fmt = (e) => (e >= 0 ? '+' : '') + e.toFixed(4) + '%';
  console.log(`  ${d.name.padEnd(22)}  종합 ${fmt(e1).padStart(11)}   직접 ${fmt(e2).padStart(11)}   소환 ${fmt(e3).padStart(11)}`);
}

// SAMPLE_DATA 회귀 (참고)
const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const sampleP = sample.filter((d) => d.type === 'P');
const sampleM = sample.filter((d) => d.type === 'M');
const sP_after = rmsePct(sampleP, bestP);
const sM_after = rmsePct(sampleM, bestP);
console.log(`\n[SAMPLE_DATA P 회귀] (참고 — 자료6 외엔 학습 미사용)`);
console.log(`  종합 ${sP_after.종합.rmse.toFixed(3)}%  max ${sP_after.종합.max.toFixed(3)}%`);
console.log(`[SAMPLE_DATA M 회귀]`);
console.log(`  종합 ${sM_after.종합.rmse.toFixed(3)}%  max ${sM_after.종합.max.toFixed(3)}%`);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`battlePower.js 패치용`);
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
console.log(`MAGIC K1 = ${(bestP[1] * MAGIC_K1_RATIO).toExponential(8)}`);
console.log(`const SPLIT_U = ${bestP[9].toFixed(6)};`);
console.log(`const SPLIT_V = ${bestP[10].toFixed(6)};`);
console.log(`const SPLIT_W = ${bestP[11].toFixed(6)};`);
console.log(`const SPLIT_X = ${bestP[12].toFixed(6)};`);
