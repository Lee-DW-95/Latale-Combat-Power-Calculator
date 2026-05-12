// F7 성공 — K_cross × 근마효율 floor 가 효과 있음
// 다른 multiplier 들도 정수% floor 처리되는지 확장 시험
//
// 각 multiplier 가 게임 내부에서 정수 % 또는 0.1% 단위로 저장된다고 가정:
//   (1 + 크댐/D_crit)        → 1 + floor(크댐 × K_crit) / 100 형태
//   (1 + (일+보)지배력/D_dom) → 1 + floor((일+보)지배력 × K_dom) / 100
//   (1 + 관통/D_pen)         → 1 + floor(관통 × K_pen) / 100
//   (1 + K_cross × 근마)      → 1 + floor(K_cross × 근마) / 100 ✓ F7
//
// 다양한 floor 정밀도 (1%, 0.1%, 0.01%) 시험

import { readFileSync } from 'node:fs';

const D_PEN = 25.0;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;
const F = Math.floor;

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

// floor precision 별 멀티플라이어 함수 — quantum=100 = 1%, =1000 = 0.1%, =10000 = 0.01%
function makeMult(quantum, fields) {
  return function modelBP(d, p) {
    const [K0, K1, K2, Kmon, Kcross, Dcrit, Ddmg, Ddom, base, U, V, W, X] = p;
    const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
    const maxDmg = Number(d.최대뎀 || 0);
    const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);

    const flr = (val) => fields.includes(val.name) ? (1 + F(val.x * quantum) / quantum) : (1 + val.x);
    const m_crit = flr({ name: 'crit', x: d.크댐 / Dcrit });
    const m_dmg  = flr({ name: 'dmg',  x: (minDmg + maxDmg) / Ddmg });
    const m_dom  = flr({ name: 'dom',  x: (d.일몬지 + d.보몬지) / Ddom });
    const m_pen  = flr({ name: 'pen',  x: d.관통 / D_PEN });
    const M = m_crit * m_dmg * m_dom * m_pen * base;

    const ab = (mode) => {
      let a = K0, b = K1e, g = K2, dd = Kmon;
      if (mode === 'direct') { a -= U; b += V; g -= W; dd -= X; }
      else { a += U; b -= V; g += W; dd += X; }
      return a * d.주스탯 + b * d.공격력 + g * d.고댐 + dd * (d.일몬추 + d.보몬추);
    };
    // K_cross × 근마 floor (F7)
    const crossPct = F(Kcross * d.근마효율 * 100) / 10000; // 0.01% 정밀도
    const ab_d = ab('direct') * (1 + crossPct);
    const ab_s = ab('summon');
    return { avg: (ab_d * M + ab_s * M) / 2, direct: ab_d * M, summon: ab_s * M };
  };
}

// 모델 변형들 — F7 baseline + 추가 multiplier floor
const MODELS = {
  'F7_only (K_cross × 근마 floor)': makeMult(100, []),
  'F7 + 지배력 floor 1%':            makeMult(100, ['dom']),
  'F7 + 관통 floor 1%':              makeMult(100, ['pen']),
  'F7 + 크댐 floor 1%':              makeMult(100, ['crit']),
  'F7 + 모든 mult floor 1%':         makeMult(100, ['crit', 'dom', 'pen']),
  'F7 + 모든 mult floor 0.1%':       makeMult(1000, ['crit', 'dom', 'pen']),
  'F7 + 지배력+관통 floor 1%':       makeMult(100, ['dom', 'pen']),
  'F7 + 지배력+관통 floor 0.1%':     makeMult(1000, ['dom', 'pen']),
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

for (const [hName, modelBP] of Object.entries(MODELS)) {
  const lossFn = makeLoss(modelBP);
  const toY = (p) => [...p.slice(0, 9).map(Math.log), ...p.slice(9)];
  const toP = (y) => [...y.slice(0, 9).map(Math.exp), ...y.slice(9)];

  const y0 = toY(x0_p);
  let bestLoss = lossFn(y0, dataset);
  let bestY = y0.slice();
  const r0 = nelderMead((y) => lossFn(y, dataset), y0, { maxIter: 100000, initStep: 0.05 });
  if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }

  const N = 800;
  for (let s = 0; s < N; s++) {
    const init = y0.map((v, i) => v + (rng() * 2 - 1) * (i < 9 ? 0.18 : 0.25));
    const r = nelderMead((y) => lossFn(y, dataset), init, { maxIter: 30000, initStep: 0.05 });
    if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
  }
  const bestP = toP(bestY);
  const total = rmsePct(modelBP, dataset, bestP);
  const katalk_r = rmsePct(modelBP, katalkData, bestP);
  const sample_r = rmsePct(modelBP, sampleFull, bestP);
  console.log(`${hName.padEnd(35)} 학습 ${total.종합.rmse.toFixed(3)}% (max ${total.종합.max.toFixed(2)}%)   카톡 ${katalk_r.종합.rmse.toFixed(3)}%   SAMPLE max ${sample_r.종합.max.toFixed(2)}%`);
}
