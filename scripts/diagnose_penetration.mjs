// 관통 메커니즘 정밀 진단
// 가설들:
//   H1. D_pen 값 자체가 25 가 아닐 수 있음 (자유롭게 fit)
//   H2. 관통이 (1 + 관통/D) 형태가 아니라 (관통 - 임계값) 등 비선형 형태
//   H3. 관통 99 에 step bonus 가 존재 (관통 100 캡 근처 특수효과)
//   H4. 관통이 direct/summon 에 다른 분모로 들어감
//   H5. case2/3/4 페어와 cross-character 잔차가 모두 OCR 노이즈

import { readFileSync } from 'node:fs';

// ========= 데이터 로드 =========
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;

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
const sampleFull = sample
  .filter((d) => d.직접타격 && d.소환타격 && d.근마효율 !== undefined)
  .filter((d) => d.최소뎀 <= d.최대뎀);

// case2 페어 (관통 98 → 99 측정용) — SAMPLE_DATA 에 있음
const case2_pairs = sample.filter((d) => d.name?.startsWith('case2_') && d.최소뎀 <= d.최대뎀);

const dataset = [...katalkData, ...sampleFull];
console.log(`학습: 카톡 ${katalkData.length} + SAMPLE ${sampleFull.length} = ${dataset.length}건`);
console.log(`case2 페어 (관통 sensitivity 측정용, 별도): ${case2_pairs.length}건\n`);

// ========= 모델: D_pen 도 자유 파라미터 =========
//   파라미터 [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X, D_pen]
//   총 14개

function modelBP(d, p) {
  const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X, D_pen] = p;
  const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
  const maxDmg = Number(d.최대뎀 || 0);
  const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
  const M = (1 + (d.크댐 || 0) / Dcrit)
          * (1 + (minDmg + maxDmg) / Ddmg)
          * (1 + ((d.일몬지 || 0) + (d.보몬지 || 0)) / Ddom)
          * (1 + (d.관통 || 0) / D_pen)
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

function loss(yvec, ds, case2pairs) {
  // y0..y8: log space params, y9-12: SPLITs, y13: log(D_pen)
  const p = [
    Math.exp(yvec[0]), Math.exp(yvec[1]), Math.exp(yvec[2]), Math.exp(yvec[3]),
    Math.exp(yvec[4]), Math.exp(yvec[5]), Math.exp(yvec[6]), Math.exp(yvec[7]),
    Math.exp(yvec[8]), yvec[9], yvec[10], yvec[11], yvec[12],
    Math.exp(yvec[13]),
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

  // case2 페어 보존: 관통 98→99 = +0.81% 측정값에 강한 가중치
  //   (직타/소타가 없어도 종합 BP 변화 ratio 로 D_pen 을 강하게 제약)
  const base = case2pairs.find((d) => d.name === 'case2_base');
  const pen99 = case2pairs.find((d) => d.name === 'case2_관통99');
  if (base && pen99) {
    const predBase = modelBP(base, p).avg;
    const predPen99 = modelBP(pen99, p).avg;
    const predRatio = predPen99 / predBase;
    const actualRatio = pen99.전투력 / base.전투력;
    const r = (predRatio - actualRatio) / actualRatio;
    err += 50 * r * r; // case2 페어 ratio 보존에 50x 가중치
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

// 시작점: V_BIG8 + D_pen=25
const x0_p = [
  3.57251570e+0, 3.44198514e+2, 3.83087727e+0, 4.22714834e-1,
  2.20885520e-1, 4.18276923e+2, 1.47222137e-37, 1.98519008e+2,
  3.66938472e-45, 1.767616, 183.595704, 0.213070, 0.324357,
  25.0,
];

function toY(p) { return [...p.slice(0, 9).map(Math.log), ...p.slice(9, 13), Math.log(p[13])]; }
function toP(y) { return [...y.slice(0, 9).map(Math.exp), ...y.slice(9, 13), Math.exp(y[13])]; }

const y0 = toY(x0_p);
const before = rmsePct(dataset, x0_p);
console.log(`시작점 V_BIG8 (D_pen=25 고정):`);
console.log(`  종합 RMSE ${before.종합.rmse.toFixed(3)}%  max ${before.종합.max.toFixed(3)}%`);

const rng = mulberry32(7);
let bestLoss = loss(y0, dataset, case2_pairs);
let bestY = y0.slice();
const r0 = nelderMead((y) => loss(y, dataset, case2_pairs), y0, { maxIter: 100000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }

const N = 2000;
const t0 = Date.now();
for (let s = 0; s < N; s++) {
  const init = y0.map((v, i) => v + (rng() * 2 - 1) * (i < 9 || i === 13 ? 0.4 : 0.5));
  const r = nelderMead((y) => loss(y, dataset, case2_pairs), init, { maxIter: 50000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}
console.log(`학습 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s, ${N} starts) — best loss = ${bestLoss.toExponential(4)}\n`);

const bestP = toP(bestY);
const labels = ['K0', 'K1', 'K2', 'K_mon', 'K_cross', 'D_crit', 'D_dmg', 'D_dom', 'base', 'SPLIT_U', 'SPLIT_V', 'SPLIT_W', 'SPLIT_X', 'D_pen'];
console.log(`━ V_BIG9 학습 결과 (D_pen 자유) ━`);
for (let i = 0; i < labels.length; i++) {
  const b = x0_p[i], a = bestP[i];
  const bs = (Math.abs(b) < 1e-3 || Math.abs(b) > 1e6) ? b.toExponential(6) : b.toFixed(6);
  const as = (Math.abs(a) < 1e-3 || Math.abs(a) > 1e6) ? a.toExponential(6) : a.toFixed(6);
  console.log(`  ${labels[i].padEnd(8)} ${bs.padStart(16)} → ${as.padStart(16)}`);
}

const after = rmsePct(dataset, bestP);
const after_katalk = rmsePct(katalkData, bestP);
const after_sample = rmsePct(sampleFull, bestP);
console.log(`\n[학습 ${dataset.length}건] 종합 RMSE ${after.종합.rmse.toFixed(3)}% max ${after.종합.max.toFixed(3)}%   직 ${after.직접.rmse.toFixed(3)}% max ${after.직접.max.toFixed(3)}%   소 ${after.소환.rmse.toFixed(3)}% max ${after.소환.max.toFixed(3)}%`);
console.log(`[카톡 18]  종합 ${after_katalk.종합.rmse.toFixed(3)}% max ${after_katalk.종합.max.toFixed(3)}%`);
console.log(`[SAMPLE 15] 종합 ${after_sample.종합.rmse.toFixed(3)}% max ${after_sample.종합.max.toFixed(3)}%`);

// case2 페어 보존 확인
const base_p = case2_pairs.find((d) => d.name === 'case2_base');
const pen99_p = case2_pairs.find((d) => d.name === 'case2_관통99');
const predRatio = modelBP(pen99_p, bestP).avg / modelBP(base_p, bestP).avg;
const actualRatio = pen99_p.전투력 / base_p.전투력;
console.log(`\ncase2 페어 (관통 98 → 99) 변화율:`);
console.log(`  실측: ${((actualRatio - 1) * 100).toFixed(4)}%`);
console.log(`  예측: ${((predRatio - 1) * 100).toFixed(4)}%`);

// 관통 별 잔차 분석
console.log(`\n━ 관통별 SAMPLE 잔차 ━`);
for (const pen of [98, 99]) {
  const subset = sampleFull.filter((d) => d.관통 === pen);
  const r = rmsePct(subset, bestP);
  const errs = subset.map((d) => (modelBP(d, bestP).avg - d.전투력) / d.전투력 * 100);
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  console.log(`  관통 ${pen} (${subset.length}건): mean ${mean.toFixed(3)}%  RMSE ${r.종합.rmse.toFixed(3)}%  max ${r.종합.max.toFixed(3)}%`);
}

// 케이스별 잔차
console.log(`\n━ SAMPLE 케이스별 잔차 (V_BIG9) ━`);
for (const d of sampleFull) {
  const pred = modelBP(d, bestP);
  const e1 = ((pred.avg - d.전투력) / d.전투력) * 100;
  const e2 = ((pred.direct - d.직접타격) / d.직접타격) * 100;
  const e3 = ((pred.summon - d.소환타격) / d.소환타격) * 100;
  const fmt = (e) => (e >= 0 ? '+' : '') + e.toFixed(3) + '%';
  console.log(`  ${d.name.padEnd(22)}  관통${d.관통}  종합 ${fmt(e1).padStart(10)}   직 ${fmt(e2).padStart(10)}   소 ${fmt(e3).padStart(10)}`);
}

const sampleP = sample.filter((d) => d.type === 'P');
const sP_after = rmsePct(sampleP, bestP);
console.log(`\n[SAMPLE_DATA P 전체 55건]  종합 RMSE ${sP_after.종합.rmse.toFixed(3)}%  max ${sP_after.종합.max.toFixed(3)}%`);

console.log(`\n${'━'.repeat(60)}`);
console.log(`핵심 발견: D_pen = ${bestP[13].toFixed(2)}`);
const ratio98to99 = (1 + 99/bestP[13]) / (1 + 98/bestP[13]) - 1;
console.log(`이 D_pen 값으로 관통 98→99 ratio = ${(ratio98to99 * 100).toFixed(4)}%`);
console.log(`case2 실측 ratio = ${((actualRatio - 1) * 100).toFixed(4)}%`);
