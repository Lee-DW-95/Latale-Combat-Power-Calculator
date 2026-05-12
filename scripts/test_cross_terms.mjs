// 모델 구조 확장 — cross-term 가설 동시 검증
//
// 표시값이 floor 처리되어 입력값과 동일하다는 사용자 가정 하에,
// 0.5% 잔차의 원인은 모델이 표현 못 하는 항이 있다는 뜻.
//
// 가설들 (각각 별도 학습):
//   H0. 현재 V_BIG8 (베이스라인)
//   H1. K_cross 가 직접+소환 양쪽 모두에 적용 (현재 직접만)
//   H2. 공격력 × 근마효율 cross-term 추가
//   H3. 주스탯 × 공격력 cross-term 추가
//   H4. 고댐 × 크댐 cross-term 추가
//   H5. 마법 K_cross 분리 (P 와 M 다른 K_cross)
//   H6. 일몬추 × 일몬지 explicit cross (bilinear)

import { readFileSync } from 'node:fs';

const D_PEN = 25.0;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;

// 카톡 페어
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

// 모델 변형들 - 각 가설마다 별도 함수
// 파라미터 슬롯: [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X, extra...]

function makeModel(applyCross, extraParamsCount) {
  return function modelBP(d, p) {
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const extras = p.slice(13);
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
    return applyCross(d, aBasePre, Kcross, extras, M);
  };
}

const MODELS = {
  'H0_baseline': {
    extras: 0,
    apply: (d, aBasePre, Kcross, ex, M) => {
      const ab_d = aBasePre('direct') * (1 + Kcross * (d.근마효율 || 0) / 100);
      const ab_s = aBasePre('summon');
      return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
    },
  },
  'H1_K_cross_both': {  // K_cross 직접+소환 양쪽에 적용
    extras: 0,
    apply: (d, aBasePre, Kcross, ex, M) => {
      const cross = 1 + Kcross * (d.근마효율 || 0) / 100;
      const ab_d = aBasePre('direct') * cross;
      const ab_s = aBasePre('summon') * cross;
      return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
    },
  },
  'H2_atk_x_geunma': {  // 공격력 × 근마효율 추가 cross
    extras: 1,  // K_atk_geunma
    apply: (d, aBasePre, Kcross, ex, M) => {
      const cross = 1 + Kcross * (d.근마효율 || 0) / 100;
      const atkCross = 1 + ex[0] * (d.공격력 || 0) * (d.근마효율 || 0) / 1e7;
      const ab_d = aBasePre('direct') * cross * atkCross;
      const ab_s = aBasePre('summon');
      return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
    },
  },
  'H3_jus_x_atk': {  // 주스탯 × 공격력 cross-term in attackBase
    extras: 1,  // K_jus_atk
    apply: (d, aBasePre, Kcross, ex, M) => {
      const cross = 1 + Kcross * (d.근마효율 || 0) / 100;
      const extra = ex[0] * (d.주스탯 || 0) * (d.공격력 || 0) / 1e8;
      const ab_d = (aBasePre('direct') + extra) * cross;
      const ab_s = aBasePre('summon') + extra;
      return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
    },
  },
  'H4_godam_x_crit': {  // 고댐 × 크댐 cross-term
    extras: 1,  // K_godam_crit
    apply: (d, aBasePre, Kcross, ex, M) => {
      const cross = 1 + Kcross * (d.근마효율 || 0) / 100;
      const extra = ex[0] * (d.고댐 || 0) * (d.크댐 || 0) / 1e9;
      const ab_d = (aBasePre('direct') + extra) * cross;
      const ab_s = aBasePre('summon') + extra;
      return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
    },
  },
  'H5_magic_K_cross': {  // P/M 별 K_cross 분리
    extras: 1,  // K_cross_M
    apply: (d, aBasePre, Kcross, ex, M) => {
      const effKcross = d.type === 'M' ? ex[0] : Kcross;
      const ab_d = aBasePre('direct') * (1 + effKcross * (d.근마효율 || 0) / 100);
      const ab_s = aBasePre('summon');
      return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
    },
  },
  'H6_bilinear_mon': {  // bilinear 일몬/보몬 분리 (재시도)
    extras: 0,
    apply: (d, aBasePre, Kcross, ex, M) => {
      // M 을 일/보 로 분리해야 하는데 modelBP 시그니처에 못 들어감 → 별도 모델 필요
      // 여기서는 단순 baseline 반환 (placeholder)
      const ab_d = aBasePre('direct') * (1 + Kcross * (d.근마효율 || 0) / 100);
      const ab_s = aBasePre('summon');
      return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
    },
  },
};

function makeLoss(modelBP, paramCount) {
  return function loss(yvec, ds) {
    const p = [];
    for (let i = 0; i < 9; i++) p.push(Math.exp(yvec[i]));
    for (let i = 9; i < 13; i++) p.push(yvec[i]);
    for (let i = 13; i < paramCount; i++) p.push(yvec[i]); // extras (linear)
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
  return {
    종합: { rmse: calc(errs.종합), max: max(errs.종합) },
    직접: { rmse: calc(errs.직접), max: max(errs.직접) },
    소환: { rmse: calc(errs.소환), max: max(errs.소환) },
  };
}

// 시작점 (V_BIG8 최신 + extras=0)
const base_x0 = [
  2.44391297e+0, 2.36693700e+2, 2.83992943e+0, 6.44782260e-1,
  2.11597980e-1, 2.38977295e+2, 1.85877760e-37, 1.79620650e+2,
  3.67549462e-45, 1.221786, 131.972520, 0.214665, 0.345657,
];

const rng = mulberry32(13);

console.log(`데이터: 카톡 ${katalkData.length} + SAMPLE ${sampleFull.length} = ${dataset.length}건\n`);
console.log('가설별 학습 결과:');
console.log('-'.repeat(85));

for (const [hName, hCfg] of Object.entries(MODELS)) {
  if (hName === 'H6_bilinear_mon') continue; // 별도 처리
  const paramCount = 13 + hCfg.extras;
  const x0 = [...base_x0];
  for (let i = 0; i < hCfg.extras; i++) x0.push(0); // extras 초기값 0
  if (hName === 'H5_magic_K_cross') x0[13] = base_x0[4]; // K_cross_M 초기값 = K_cross

  const modelBP = makeModel(hCfg.apply, hCfg.extras);
  const lossFn = makeLoss(modelBP, paramCount);
  const toY = (p) => [...p.slice(0, 9).map(Math.log), ...p.slice(9)];
  const toP = (y) => [...y.slice(0, 9).map(Math.exp), ...y.slice(9)];

  const y0 = toY(x0);
  let bestLoss = lossFn(y0, dataset);
  let bestY = y0.slice();
  const r0 = nelderMead((y) => lossFn(y, dataset), y0, { maxIter: 100000, initStep: 0.05 });
  if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }

  const N = 600;
  for (let s = 0; s < N; s++) {
    const init = y0.map((v, i) => v + (rng() * 2 - 1) * (i < 9 || i === 13 + (hCfg.extras > 0 ? 0 : 99) ? 0.15 : 0.2));
    const r = nelderMead((y) => lossFn(y, dataset), init, { maxIter: 50000, initStep: 0.05 });
    if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
  }
  const bestP = toP(bestY);
  const total = rmsePct(modelBP, dataset, bestP);
  const katalk_r = rmsePct(modelBP, katalkData, bestP);
  const sample_r = rmsePct(modelBP, sampleFull, bestP);
  console.log(`${hName.padEnd(20)} loss=${bestLoss.toExponential(3)}   학습RMSE종합 ${total.종합.rmse.toFixed(3)}%(max ${total.종합.max.toFixed(2)}%)   카톡 ${katalk_r.종합.rmse.toFixed(3)}%   SAMPLE ${sample_r.종합.rmse.toFixed(3)}%(max ${sample_r.종합.max.toFixed(2)}%)   extra=${bestP.slice(13).map((x) => x.toFixed(4)).join(', ') || '(none)'}`);
}
