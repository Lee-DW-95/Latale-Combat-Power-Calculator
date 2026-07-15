// V23 — 구조 대탐색 (오차 0 수렴 프로젝트 1단계: 함수형 구조 자체를 탐색)
//
//   배경: 파라미터 재학습만으론 RMSE ~0.3% 바닥이 안 깨짐 (모델 식 ≠ 게임 실제 식의 구조 갭).
//   카톡 근마계수(0.53) vs 세이버(0.24) 모순이 구조 갭의 직접 증거.
//   → 파라미터가 아니라 "식의 모양"을 축별로 바꿔가며 바닥이 깨지는 구조를 찾는다.
//
//   사용법: node refit_v23_structure_search.mjs [axis=opt ...] [restarts=N]
//     cross = powg(기본) | lin | atkg      : 근마효율 cross — 주스탯×g^Pexp | 주스탯×g | 공격력×g
//     crit  = fix(기본) | free | linear    : 크댐 — floor(269.5 고정) | floor(D 자유) | 선형(floor 없음)
//     dmg   = free(기본) | sep | floord    : (최소+최대) — 자유 D(사실상 선형) | min/max 별도 가중 | D 유계 floor%
//     dom   = lin(기본) | sep | floor      : 지배력 — 선형 합 | 일/보 별도 가중 | floor%
//     mon   = sum(기본) | sep              : 몬추 — 일+보 합산 | 별도 가중
//     pen   = fix(기본) | free             : 관통 — D=25 고정 | 자유
//   예: node refit_v23_structure_search.mjs crit=free dom=sep restarts=300
//
//   출력: @@RESULT@@{cfg, loss, sP, sM, ...}  (refit_v22 와 동일 지표 + cfg)

import { readFileSync } from 'node:fs';

// ── CLI ──
const CFG = { cross: 'powg', crit: 'fix', dmg: 'free', dom: 'lin', mon: 'sum', pen: 'fix' };
let N_RESTART = 80;
let DCRIT0 = null; // Dcrit 초기값 오버라이드 (crit=free 가 269.5 plateau 에 갇히는 문제 대응)
let X_KATGM = false; // 카톡 근마 페어(katalk_근마_-1pp) 학습 제외 — 유일한 모순 데이터 (2.0배 이상치, 사용자 지시)
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  if (k === 'restarts') N_RESTART = Number(v);
  else if (k === 'dcrit0') DCRIT0 = Number(v);
  else if (k === 'xkatgm') X_KATGM = v === '1';
  else if (k in CFG) CFG[k] = v;
  else { console.error('unknown axis: ' + k); process.exit(1); }
}

const D_PEN_FIX = 25.0;
const DCRIT_FIX = 269.5;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;
const F = Math.floor;

// ─── 카톡 18건 ─── (refit_v22 와 동일)
const katalkDisplay = { 주스탯: 8112370, 공격력: 66821, 관통: 98, 크댐: 9014, 최소뎀: 8396, 최대뎀: 8670, 고댐: 789694, 일몬추: 1128458, 보몬추: 1141576, 일몬지: 69.5, 보몬지: 81.3, 근마효율: 27 };
const katalkRaw = { 주스탯: 1350799, 공격력: 13434, 크댐: 6468, 최소뎀: 5913, 최대뎀: 6283, 고댐: 446155, 일몬추: 999064, 보몬추: 1001383 };
const kCum = {};
for (const k of Object.keys(katalkRaw)) kCum[k] = katalkDisplay[k] / katalkRaw[k] - 1;
const katalkCases = [
  { name: 'katalk_BASE',        diff: {},                                                          전투력: 4779114, 직접타격: 4663530, 소환타격: 4894698 },
  { name: 'katalk_근력_-2pp',    diff: { 주스탯:  katalkRaw.주스탯  * (1 + kCum.주스탯  - 0.02) }, 전투력: 4770945, 직접타격: 4659919, 소환타격: 4882971 },
  { name: 'katalk_무공_-1pp',    diff: { 공격력:  katalkRaw.공격력  * (1 + kCum.공격력  - 0.01) }, 전투력: 4775306, 직접타격: 4657525, 소환타격: 4893088 },
  { name: 'katalk_보몬지_-2pp',  diff: { 보몬지: 79.3 },                                            전투력: 4751867, 직접타격: 4636942, 소환타격: 4866792 },
  { name: 'katalk_깡근력_-1000', diff: { 주스탯: (katalkRaw.주스탯  - 1000) * (1 + kCum.주스탯) }, 전투력: 4777307, 직접타격: 4662510, 소환타격: 4892104 },
  { name: 'katalk_무공_깡-10',   diff: { 공격력: (katalkRaw.공격력  - 10)   * (1 + kCum.공격력) }, 전투력: 4777660, 직접타격: 4661238, 소환타격: 4894083 },
  { name: 'katalk_고댐_-1pp',    diff: { 고댐:    katalkRaw.고댐    * (1 + kCum.고댐    - 0.01) }, 전투력: 4778145, 직접타격: 4662921, 소환타격: 4893369 },
  { name: 'katalk_고댐_-1500',   diff: { 고댐:   (katalkRaw.고댐    - 1500) * (1 + kCum.고댐) },   전투력: 4778537, 직접타격: 4663167, 소환타격: 4893907 },
  { name: 'katalk_일몬추_-200',  diff: { 일몬추: (katalkRaw.일몬추  - 200)  * (1 + kCum.일몬추) }, 전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
  { name: 'katalk_보몬추_-200',  diff: { 보몬추: (katalkRaw.보몬추  - 200)  * (1 + kCum.보몬추) }, 전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
  { name: 'katalk_일몬추_-1pp',  diff: { 일몬추:  katalkRaw.일몬추  * (1 + kCum.일몬추  - 0.01) }, 전투력: 4778029, 직접타격: 4662848, 소환타격: 4893211 },
  { name: 'katalk_보몬추_-1pp',  diff: { 보몬추:  katalkRaw.보몬추  * (1 + kCum.보몬추  - 0.01) }, 전투력: 4778027, 직접타격: 4662847, 소환타격: 4893207 },
  { name: 'katalk_깡최소_-10',   diff: { 최소뎀: (katalkRaw.최소뎀  - 10)   * (1 + kCum.최소뎀) }, 전투력: 4775193, 직접타격: 4659703, 소환타격: 4890683 },
  { name: 'katalk_깡크_-10',     diff: { 크댐:   (katalkRaw.크댐    - 10)   * (1 + kCum.크댐) },   전투력: 4771759, 직접타격: 4655366, 소환타격: 4887152 },
  { name: 'katalk_최종최소_-1pp', diff: { 최소뎀:  katalkRaw.최소뎀  * (1 + kCum.최소뎀  - 0.01) }, 전투력: 4762591, 직접타격: 4647407, 소환타격: 4877775 },
  { name: 'katalk_최종최대_-1pp', diff: { 최대뎀:  katalkRaw.최대뎀  * (1 + kCum.최대뎀  - 0.01) }, 전투력: 4761471, 직접타격: 4646314, 소환타격: 4876629 },
  { name: 'katalk_최종크_-1pp',   diff: { 크댐:    katalkRaw.크댐    * (1 + kCum.크댐    - 0.01) }, 전투력: 4744967, 직접타격: 4630270, 소환타격: 4859664 },
  { name: 'katalk_근마_-1pp',    diff: { 근마효율: 26 },                                            전투력: 4768241, 직접타격: 4641784, 소환타격: 4894698 },
];
const katalkData = katalkCases.map((c) => ({ type: 'P', ...katalkDisplay, ...c.diff, name: c.name, 전투력: c.전투력, 직접타격: c.직접타격, 소환타격: c.소환타격 }));

// ─── 박햇님 15건 ───
const haetDisplay = { 주스탯: 8888384, 공격력: 48427, 관통: 99, 크댐: 8529, 최소뎀: 7252, 최대뎀: 7748, 고댐: 1097014, 일몬추: 0, 보몬추: 0, 일몬지: 69.3, 보몬지: 71.8, 근마효율: 0 };
const haetRaw = { 주스탯: 1440581, 공격력: 10834, 크댐: 6462, 최소뎀: 5412, 최대뎀: 6101, 고댐: 537752 };
const hCum = {};
for (const k of Object.keys(haetRaw)) hCum[k] = haetDisplay[k] / haetRaw[k] - 1;
const haetCases = [
  { name: 'haet_BASE',          diff: {},                                                        전투력: 3648734, 직접타격: 3188580, 소환타격: 4108889 },
  { name: 'haet_마법력_+1pp',    diff: { 주스탯:  haetRaw.주스탯  * (1 + hCum.주스탯  + 0.01) }, 전투력: 3662251, 직접타격: 3190455, 소환타격: 4113935 },
  { name: 'haet_마법력_-1pp',    diff: { 주스탯:  haetRaw.주스탯  * (1 + hCum.주스탯  - 0.01) }, 전투력: 3645274, 직접타격: 3186705, 소환타격: 4103844 },
  { name: 'haet_속성력_+1pp',    diff: { 공격력:  haetRaw.공격력  * (1 + hCum.공격력  + 0.01) }, 전투력: 3651297, 직접타격: 3192622, 소환타격: 4109973 },
  { name: 'haet_속성력_-1pp',    diff: { 공격력:  haetRaw.공격력  * (1 + hCum.공격력  - 0.01) }, 전투력: 3646195, 직접타격: 3184574, 소환타격: 4107816 },
  { name: 'haet_크댐_+1pp',      diff: { 크댐:    haetRaw.크댐    * (1 + hCum.크댐    + 0.01) }, 전투력: 3676278, 직접타격: 3212599, 소환타격: 4139957 },
  { name: 'haet_크댐_-1pp',      diff: { 크댐:    haetRaw.크댐    * (1 + hCum.크댐    - 0.01) }, 전투력: 3621615, 직접타격: 3164931, 소환타격: 4078299 },
  { name: 'haet_최대뎀_+1pp',    diff: { 최대뎀:  haetRaw.최대뎀  * (1 + hCum.최대뎀  + 0.01) }, 전투력: 3663573, 직접타격: 3201547, 소환타격: 4125599 },
  { name: 'haet_최대뎀_-1pp',    diff: { 최대뎀:  haetRaw.최대뎀  * (1 + hCum.최대뎀  - 0.01) }, 전투력: 3633896, 직접타격: 3175613, 소환타격: 4092180 },
  { name: 'haet_최소뎀_+1pp',    diff: { 최소뎀:  haetRaw.최소뎀  * (1 + hCum.최소뎀  + 0.01) }, 전투력: 3661870, 직접타격: 3200059, 소환타격: 4123681 },
  { name: 'haet_최소뎀_-1pp',    diff: { 최소뎀:  haetRaw.최소뎀  * (1 + hCum.최소뎀  - 0.01) }, 전투력: 3635355, 직접타격: 3176888, 소환타격: 4093823 },
  { name: 'haet_보몬지_+1pp',    diff: { 보몬지: 72.8 },                                          전투력: 3659431, 직접타격: 3197928, 소환타격: 4120935 },
  { name: 'haet_보몬지_-1pp',    diff: { 보몬지: 70.8 },                                          전투력: 3638037, 직접타격: 3179232, 소환타격: 4095843 },
  { name: 'haet_고댐_+1pp',      diff: { 고댐:    haetRaw.고댐    * (1 + hCum.고댐    + 0.01) }, 전투력: 3649678, 직접타격: 3189173, 소환타격: 4110184 },
  { name: 'haet_고댐_-1pp',      diff: { 고댐:    haetRaw.고댐    * (1 + hCum.고댐    - 0.01) }, 전투력: 3647790, 직접타격: 3187986, 소환타격: 4107594 },
];
const haetData = haetCases.map((c) => ({ type: 'M', ...haetDisplay, ...c.diff, name: c.name, 전투력: c.전투력, 직접타격: c.직접타격, 소환타격: c.소환타격 }));

// ─── SAMPLE ───
const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const sampleSplit = sample.filter((d) => d.직접타격 || d.소환타격);
const sampleBpOnly = sample.filter((d) => !(d.직접타격 || d.소환타격));
const seibo = sample.find((d) => d.name === '자료6_세이버');
const img24Pairs = sample
  .filter((d) => d.name && d.name.startsWith('img24'))
  .map((d) => ({ ...d, baseBP: seibo.전투력, deltaBP: d.전투력 - seibo.전투력 }));

const katalkTrain = X_KATGM ? katalkData.filter((d) => d.name !== 'katalk_근마_-1pp') : katalkData;
const allData = [
  ...katalkTrain.map((d) => ({ ...d, _w: 5, _haet: false })),
  ...haetData.map((d) => ({ ...d, _w: 5, _haet: true })),
  ...sampleSplit.map((d) => ({ ...d, _w: 1, _haet: false })),
  ...sampleBpOnly.map((d) => ({ ...d, _w: 1, _haet: false })),
];

// ── 모델 ──
//   p (19 slots, cfg 에 따라 일부만 활성):
//   [0]K0 [1]K1 [2]K2 [3]Kmon [4]Kc [5]Dcrit [6]Ddmg [7]Ddom [8]base
//   [9]U [10]V [11]W [12]X [13]Pexp [14]Wmin [15]DomB [16]MonB [17]Dpen
function modelBP(d, p) {
  const [K0, K1, K2, Kmon, Kc, Dcrit_p, Ddmg, Ddom, base, U, V, W, X, Pexp, Wmin, DomB, MonB, Dpen] = p;
  const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
  const maxDmg = Number(d.최대뎀 || 0);
  const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);

  let m_crit;
  if (CFG.crit === 'fix')       m_crit = 1 + F(d.크댐 / DCRIT_FIX * 100) / 100;
  else if (CFG.crit === 'free') m_crit = 1 + F(d.크댐 / Dcrit_p * 100) / 100;
  else                          m_crit = 1 + d.크댐 / Dcrit_p; // linear

  let dmgVal;
  if (CFG.dmg === 'sep') dmgVal = Wmin * minDmg + maxDmg;
  else                   dmgVal = minDmg + maxDmg;
  const m_dmg = 1 + F(dmgVal / Ddmg * 100) / 100; // free/floord 는 Ddmg 값 범위(패널티)로만 구분

  let m_dom;
  if (CFG.dom === 'sep')        m_dom = 1 + (d.일몬지 + DomB * d.보몬지) / Ddom;
  else if (CFG.dom === 'floor') m_dom = 1 + F((d.일몬지 + d.보몬지) / Ddom * 100) / 100;
  else                          m_dom = 1 + (d.일몬지 + d.보몬지) / Ddom;

  const m_pen = CFG.pen === 'free'
    ? 1 + F(d.관통 / Dpen * 100) / 100
    : 1 + F(d.관통 / D_PEN_FIX * 100) / 100;

  const M = m_crit * m_dmg * m_dom * m_pen * base;

  const g = d.근마효율 || 0;
  const monVal = CFG.mon === 'sep' ? d.일몬추 + MonB * d.보몬추 : d.일몬추 + d.보몬추;
  const ab = (mode) => {
    let a = K0, b = K1e, gm = K2, dd = Kmon;
    if (mode === 'direct') { a -= U; b += V; gm -= W; dd -= X; }
    else                    { a += U; b -= V; gm += W; dd += X; }
    return F(a * d.주스탯) + F(b * d.공격력) + F(gm * d.고댐) + F(dd * monVal);
  };

  let ab_d = ab('direct');
  if (g > 0) {
    if (CFG.cross === 'lin')       ab_d += F(Kc * d.주스탯 * g / 100);
    else if (CFG.cross === 'atkg') ab_d += F(Kc * d.공격력 * g / 100);
    else { const pe = Math.max(0.05, Math.min(3, Pexp)); ab_d += F(Kc * d.주스탯 * Math.pow(g, pe) / 100); } // powg
  }
  const ab_s = ab('summon');
  const dir = F(ab_d * M);
  const sum = F(ab_s * M);
  return { avg: F((dir + sum) / 2), direct: dir, summon: sum };
}

// y-vector 인코딩: exp 슬롯 [0,1,2,3,5,6,7,8,17], raw 슬롯 [4,9..16], b_haet=[18](log)
const EXP_IDX = new Set([0, 1, 2, 3, 5, 6, 7, 8, 17]);
function toP(y) { return y.slice(0, 18).map((v, i) => (EXP_IDX.has(i) ? Math.exp(v) : v)); }

function loss(yvec) {
  const p = toP(yvec);
  const b_haet = Math.exp(yvec[18]);
  if (!p.every(Number.isFinite) || !Number.isFinite(b_haet)) return 1e12;
  const [K0, K1, K2, Kmon, Kc, Dcrit_p, Ddmg, , , U, V, W, X, , Wmin, DomB, MonB, Dpen] = p;
  let penalty = 0;
  const margins = [K0 - Math.abs(U), K1 - Math.abs(V), K2 - Math.abs(W), Kmon - Math.abs(X)];
  for (const m of margins) if (m < 0) penalty += m * m * 1e4;
  if (b_haet < 0.9 || b_haet > 1.2) penalty += (b_haet - 1.05) ** 2 * 100;
  if (Kc < 0) penalty += Kc * Kc * 1e4;
  if (CFG.crit !== 'fix' && (Dcrit_p < 50 || Dcrit_p > 3000)) penalty += 10;   // 축퇴 방지 완충
  if (CFG.dmg === 'floord' && (Ddmg < 100 || Ddmg > 1e6)) penalty += 10;        // floor% 가 실제 의미를 갖는 범위 강제
  if (CFG.dmg === 'sep' && (Wmin < -2 || Wmin > 4)) penalty += (Wmin - 1) ** 2;
  if (CFG.dom === 'sep' && (DomB < -2 || DomB > 4)) penalty += (DomB - 1) ** 2;
  if (CFG.mon === 'sep' && (MonB < -2 || MonB > 4)) penalty += (MonB - 1) ** 2;
  if (CFG.pen === 'free' && (Dpen < 5 || Dpen > 200)) penalty += 10;

  let err = 0;
  for (const d of allData) {
    const pred = modelBP(d, p);
    if (!Number.isFinite(pred.avg + pred.direct + pred.summon)) return 1e12;
    const bf = d._haet ? b_haet : 1;
    if (d.전투력 > 0)    { const r = (pred.avg    * bf - d.전투력)    / d.전투력;    err += d._w * r * r; }
    if (d.직접타격 > 0) { const r = (pred.direct * bf - d.직접타격) / d.직접타격; err += d._w * r * r; }
    if (d.소환타격 > 0) { const r = (pred.summon * bf - d.소환타격) / d.소환타격; err += d._w * r * r; }
  }
  const seiBasePred = modelBP({ ...seibo, type: 'P' }, p);
  for (const pair of img24Pairs) {
    const pred = modelBP({ ...pair, type: 'P' }, p);
    const dPred = pred.avg - seiBasePred.avg;
    const dReal = pair.deltaBP;
    if (dReal === 0 && dPred === 0) continue;
    const r = (dPred - dReal) / Math.max(Math.abs(dReal), 1000);
    err += 3 * r * r;
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
  return () => { a = (a + 0x6d2b79f5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function rmsePct(ds, p, b_haet) {
  const errs = { 종합: [], 직접: [], 소환: [] };
  for (const d of ds) {
    const pred = modelBP(d, p);
    const bf = d._haet ? b_haet : 1;
    if (d.전투력 > 0) errs.종합.push((pred.avg * bf - d.전투력) / d.전투력);
    if (d.직접타격 > 0) errs.직접.push((pred.direct * bf - d.직접타격) / d.직접타격);
    if (d.소환타격 > 0) errs.소환.push((pred.summon * bf - d.소환타격) / d.소환타격);
  }
  const calc = (xs) => xs.length === 0 ? 0 : Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) * 100;
  const mx = (xs) => xs.length === 0 ? 0 : Math.max(...xs.map((x) => Math.abs(x))) * 100;
  return { 종합: { rmse: calc(errs.종합), max: mx(errs.종합) },
           직접: { rmse: calc(errs.직접), max: mx(errs.직접) },
           소환: { rmse: calc(errs.소환), max: mx(errs.소환) } };
}

// ── 초기값 (V_BIG26 mainpow 채택값 기준) ──
const baseInit = CFG.dmg === 'floord' ? 7.7e-5 : 4.315028576156123e-45; // floor% dmg 는 base 스케일 재조정
const ddmgInit = CFG.dmg === 'floord' ? 2000 : 1.9492221736258325e-37;
const x0_p = [
  2.5719141035328517, 260.18959807829776, 1.9212706817860603, 0.7529237540262035,
  CFG.cross === 'atkg' ? 60 : 0.63,   // Kc — atkg 는 공격력(~1e5)×g 스케일 보정
  DCRIT0 ?? (CFG.crit === 'linear' ? 269.5 : DCRIT_FIX),
  ddmgInit, 199.46684683252687, baseInit,
  1.3195973546324828, 148.72873240962542, 0.20120531533840375, 0.5370014938117683,
  1.145475946807748,  // Pexp
  1.0,                // Wmin
  1.0,                // DomB
  1.0,                // MonB
  25.0,               // Dpen
];
const y0 = x0_p.map((v, i) => (EXP_IDX.has(i) ? Math.log(v) : v)).concat([Math.log(1.055)]);

// 축별 활성 슬롯만 흔든다 (비활성 슬롯 scale 0 — 무의미한 차원 탐색 방지)
function restartScale(i) {
  if (i === 4) return 0.3;                                    // Kc
  if (i === 5) return CFG.crit === 'fix' ? 0 : 0.3;           // Dcrit
  if (i === 13) return CFG.cross === 'powg' ? 0.15 : 0;       // Pexp
  if (i === 14) return CFG.dmg === 'sep' ? 0.3 : 0;           // Wmin
  if (i === 15) return CFG.dom === 'sep' ? 0.3 : 0;           // DomB
  if (i === 16) return CFG.mon === 'sep' ? 0.3 : 0;           // MonB
  if (i === 17) return CFG.pen === 'free' ? 0.3 : 0;          // Dpen
  if (i === 18) return 0.05;                                  // b_haet
  return 0.2;
}

const rng = mulberry32(13);
let bestLoss = loss(y0);
let bestY = y0.slice();
const r0 = nelderMead(loss, y0, { maxIter: 80000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }
const t0 = Date.now();
for (let s = 0; s < N_RESTART; s++) {
  const yi = y0.map((v, i) => v + (rng() * 2 - 1) * restartScale(i));
  const r = nelderMead(loss, yi, { maxIter: 30000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const bestP = toP(bestY);
const b_haet = Math.exp(bestY[18]);

const sP = rmsePct(sample.filter(d => d.type === 'P').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const sM = rmsePct(sample.filter(d => d.type === 'M').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_kat = rmsePct(katalkTrain.map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_haet = rmsePct(haetData.map(d => ({ ...d, _haet: true })), bestP, b_haet);

const seiBase = modelBP({ ...seibo, type: 'P' }, bestP);
const sei32 = modelBP({ ...seibo, 근마효율: 32, type: 'P' }, bestP);
const katBase = modelBP(katalkData[0], bestP);
const katG = modelBP(katalkData[17], bestP);

const out = {
  cfg: CFG, xkatgm: X_KATGM, restarts: N_RESTART, loss: bestLoss, elapsed: Number(elapsed), b_haet,
  params: bestP,
  sP, sM, r_kat종합: r_kat.종합.rmse, r_haet종합: r_haet.종합.rmse,
  seiDeltaBP: sei32.avg - seiBase.avg, seiTarget: -6742,
  katDirDelta: katG.direct - katBase.direct, katTarget: -21746,
};
console.log('@@RESULT@@' + JSON.stringify(out));
