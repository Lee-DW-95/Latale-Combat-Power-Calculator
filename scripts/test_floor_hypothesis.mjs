// 사용자 가설: 게임이 모든 중간 계산에서 소수점 버림(floor) 처리
//
// 예: (7+10)/2 = 8.5 → 게임은 8로 처리
//
// 가능한 floor 위치들 (각각 별도 학습으로 효과 측정):
//   F1. attackBase 합산 후 floor
//   F2. attackBase × K_cross_factor 후 floor (direct 만 영향)
//   F3. 각 multiplier 항 × 1000 후 floor / 1000 (소수 3자리)
//   F4. multiplier 합산 후 floor
//   F5. 직접BP, 소환BP 각각 floor 후 평균
//   F6. 최종 표시 BP floor (이미 round 사용 중)
//   F7. K_cross × 근마효율 결과 floor (백분율 boost 가 정수)
//   F8. 모든 단계 floor (가장 strict)

import { readFileSync } from 'node:fs';

const D_PEN = 25.0;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;

// 카톡 + SAMPLE 데이터 로드
const katalkDisplay = { 주스탯: 8112370, 공격력: 66821, 관통: 98, 크댐: 9014, 최소뎀: 8396, 최대뎀: 8670, 고댐: 789694, 일몬추: 1128458, 보몬추: 1141576, 일몬지: 69.5, 보몬지: 81.3, 근마효율: 27 };
const katalkRaw = { 주스탯: 1350799, 공격력: 13434, 크댐: 6468, 최소뎀: 5913, 최대뎀: 6283, 고댐: 446155, 일몬추: 999064, 보몬추: 1001383 };
const kCum = {};
for (const k of Object.keys(katalkRaw)) kCum[k] = katalkDisplay[k] / katalkRaw[k] - 1;

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
const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const sampleFull = sample.filter((d) => d.직접타격 && d.소환타격 && d.근마효율 !== undefined).filter((d) => d.최소뎀 <= d.최대뎀);
const dataset = [...katalkData, ...sampleFull];

const F = Math.floor;

// 가설별 modelBP — 다양한 floor 위치
const MODELS = {
  'F0_baseline (current)': (d, p) => {
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
    const maxDmg = Number(d.최대뎀 || 0);
    const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
    const M = (1 + d.크댐 / Dcrit) * (1 + (minDmg + maxDmg) / Ddmg)
            * (1 + (d.일몬지 + d.보몬지) / Ddom) * (1 + d.관통 / D_PEN) * base;
    const ab = (mode) => {
      let a = K0, b = K1e, g = K2, dd = Kmon;
      if (mode === 'direct') { a -= U; b += V; g -= W; dd -= X; }
      else { a += U; b -= V; g += W; dd += X; }
      return a * d.주스탯 + b * d.공격력 + g * d.고댐 + dd * (d.일몬추 + d.보몬추);
    };
    const ab_d = ab('direct') * (1 + Kcross * d.근마효율 / 100);
    const ab_s = ab('summon');
    return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
  },
  'F1_attackBase floor': (d, p) => {
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
    const maxDmg = Number(d.최대뎀 || 0);
    const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
    const M = (1 + d.크댐 / Dcrit) * (1 + (minDmg + maxDmg) / Ddmg)
            * (1 + (d.일몬지 + d.보몬지) / Ddom) * (1 + d.관통 / D_PEN) * base;
    const ab = (mode) => {
      let a = K0, b = K1e, g = K2, dd = Kmon;
      if (mode === 'direct') { a -= U; b += V; g -= W; dd -= X; }
      else { a += U; b -= V; g += W; dd += X; }
      return F(a * d.주스탯 + b * d.공격력 + g * d.고댐 + dd * (d.일몬추 + d.보몬추));
    };
    const ab_d = F(ab('direct') * (1 + Kcross * d.근마효율 / 100));
    const ab_s = ab('summon');
    return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
  },
  'F5_direct,summon floor each': (d, p) => {
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
    const maxDmg = Number(d.최대뎀 || 0);
    const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
    const M = (1 + d.크댐 / Dcrit) * (1 + (minDmg + maxDmg) / Ddmg)
            * (1 + (d.일몬지 + d.보몬지) / Ddom) * (1 + d.관통 / D_PEN) * base;
    const ab = (mode) => {
      let a = K0, b = K1e, g = K2, dd = Kmon;
      if (mode === 'direct') { a -= U; b += V; g -= W; dd -= X; }
      else { a += U; b -= V; g += W; dd += X; }
      return a * d.주스탯 + b * d.공격력 + g * d.고댐 + dd * (d.일몬추 + d.보몬추);
    };
    const ab_d = ab('direct') * (1 + Kcross * d.근마효율 / 100);
    const ab_s = ab('summon');
    const dir = F(ab_d * M);
    const sum = F(ab_s * M);
    return { avg: F((dir + sum) / 2), direct: dir, summon: sum };
  },
  'F7_K_cross x 근마 floor': (d, p) => {
    // K_cross × 근마효율 결과를 floor (정수 백분율 boost)
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
    const maxDmg = Number(d.최대뎀 || 0);
    const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
    const M = (1 + d.크댐 / Dcrit) * (1 + (minDmg + maxDmg) / Ddmg)
            * (1 + (d.일몬지 + d.보몬지) / Ddom) * (1 + d.관통 / D_PEN) * base;
    const ab = (mode) => {
      let a = K0, b = K1e, g = K2, dd = Kmon;
      if (mode === 'direct') { a -= U; b += V; g -= W; dd -= X; }
      else { a += U; b -= V; g += W; dd += X; }
      return a * d.주스탯 + b * d.공격력 + g * d.고댐 + dd * (d.일몬추 + d.보몬추);
    };
    // K_cross × 근마효율 을 정수 % 로 floor
    const crossPct = F(Kcross * d.근마효율) / 100;
    const ab_d = ab('direct') * (1 + crossPct);
    const ab_s = ab('summon');
    return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
  },
  'F8_every step floor': (d, p) => {
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
    const maxDmg = Number(d.최대뎀 || 0);
    const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
    const M = (1 + d.크댐 / Dcrit) * (1 + (minDmg + maxDmg) / Ddmg)
            * (1 + (d.일몬지 + d.보몬지) / Ddom) * (1 + d.관통 / D_PEN) * base;
    const ab = (mode) => {
      let a = K0, b = K1e, g = K2, dd = Kmon;
      if (mode === 'direct') { a -= U; b += V; g -= W; dd -= X; }
      else { a += U; b -= V; g += W; dd += X; }
      return F(F(a * d.주스탯) + F(b * d.공격력) + F(g * d.고댐) + F(dd * (d.일몬추 + d.보몬추)));
    };
    const crossPct = F(Kcross * d.근마효율) / 100;
    const ab_d = F(ab('direct') * (1 + crossPct));
    const ab_s = ab('summon');
    const dir = F(ab_d * M);
    const sum = F(ab_s * M);
    return { avg: F((dir + sum) / 2), direct: dir, summon: sum };
  },
  'F_combined': (d, p) => {
    // F1 + F5 + F7 결합
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
    const maxDmg = Number(d.최대뎀 || 0);
    const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
    const M = (1 + d.크댐 / Dcrit) * (1 + (minDmg + maxDmg) / Ddmg)
            * (1 + (d.일몬지 + d.보몬지) / Ddom) * (1 + d.관통 / D_PEN) * base;
    const ab = (mode) => {
      let a = K0, b = K1e, g = K2, dd = Kmon;
      if (mode === 'direct') { a -= U; b += V; g -= W; dd -= X; }
      else { a += U; b -= V; g += W; dd += X; }
      return F(a * d.주스탯 + b * d.공격력 + g * d.고댐 + dd * (d.일몬추 + d.보몬추));
    };
    const crossPct = F(Kcross * d.근마효율) / 100;
    const ab_d = F(ab('direct') * (1 + crossPct));
    const ab_s = ab('summon');
    const dir = F(ab_d * M);
    const sum = F(ab_s * M);
    return { avg: F((dir + sum) / 2), direct: dir, summon: sum };
  },
};

function makeLoss(modelBP) {
  return function loss(yvec, ds) {
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
      const w = d.name?.startsWith('katalk_') ? 5 : 1;
      if (d.전투력 > 0)    { const r = (pred.avg - d.전투력) / d.전투력;       err += w * r * r; }
      if (d.직접타격 > 0) { const r = (pred.direct - d.직접타격) / d.직접타격; err += w * r * r; }
      if (d.소환타격 > 0) { const r = (pred.summon - d.소환타격) / d.소환타격; err += w * r * r; }
    }
    return err + penalty;
  };
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

function rmsePct(modelBP, ds, p) {
  const errs = { 종합: [], 직접: [], 소환: [] };
  for (const d of ds) {
    const pred = modelBP(d, p);
    if (d.전투력 > 0) errs.종합.push((pred.avg - d.전투력) / d.전투력);
    if (d.직접타격 > 0) errs.직접.push((pred.direct - d.직접타격) / d.직접타격);
    if (d.소환타격 > 0) errs.소환.push((pred.summon - d.소환타격) / d.소환타격);
  }
  const calc = (xs) => xs.length === 0 ? 0 : Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) * 100;
  const max = (xs) => xs.length === 0 ? 0 : Math.max(...xs.map((x) => Math.abs(x))) * 100;
  return { 종합: { rmse: calc(errs.종합), max: max(errs.종합) },
           직접: { rmse: calc(errs.직접), max: max(errs.직접) },
           소환: { rmse: calc(errs.소환), max: max(errs.소환) } };
}

const x0_p = [
  2.44391297e+0, 2.36693700e+2, 2.83992943e+0, 6.44782260e-1,
  2.11597980e-1, 2.38977295e+2, 1.85877760e-37, 1.79620650e+2,
  3.67549462e-45, 1.221786, 131.972520, 0.214665, 0.345657,
];

const rng = mulberry32(13);
console.log(`데이터: 카톡 ${katalkData.length} + SAMPLE ${sampleFull.length} = ${dataset.length}건\n`);
console.log('가설별 학습 결과 (큰 폭 RMSE 감소 = floor 가설 옳음):');
console.log('-'.repeat(90));

for (const [hName, modelBP] of Object.entries(MODELS)) {
  const lossFn = makeLoss(modelBP);
  const toY = (p) => [...p.slice(0, 9).map(Math.log), ...p.slice(9)];
  const toP = (y) => [...y.slice(0, 9).map(Math.exp), ...y.slice(9)];

  const y0 = toY(x0_p);
  let bestLoss = lossFn(y0, dataset);
  let bestY = y0.slice();
  const r0 = nelderMead((y) => lossFn(y, dataset), y0, { maxIter: 100000, initStep: 0.05 });
  if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }

  const N = 500;
  for (let s = 0; s < N; s++) {
    const init = y0.map((v, i) => v + (rng() * 2 - 1) * (i < 9 ? 0.15 : 0.2));
    const r = nelderMead((y) => lossFn(y, dataset), init, { maxIter: 30000, initStep: 0.05 });
    if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
  }
  const bestP = toP(bestY);
  const total = rmsePct(modelBP, dataset, bestP);
  const katalk_r = rmsePct(modelBP, katalkData, bestP);
  const sample_r = rmsePct(modelBP, sampleFull, bestP);
  console.log(`${hName.padEnd(28)} loss=${bestLoss.toExponential(3)}   학습 종합 ${total.종합.rmse.toFixed(3)}% (max ${total.종합.max.toFixed(2)}%)   카톡 ${katalk_r.종합.rmse.toFixed(3)}%   SAMPLE max ${sample_r.종합.max.toFixed(2)}%`);
}
