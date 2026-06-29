// V_BIG22 — 근마효율 cross-term 메커니즘 재설계 탐색.
//   사용법: node refit_v22_geunma_mainstat.mjs <wholebase|mainlin|mainlin_sq|mainpow>
//
//   게임 메커니즘(사용자 도메인): 근마효율 = "근력/마법력 효율" 줄임말.
//     근력/마법력이 높을수록 직접타격 전투력이 오르도록 설계된 스탯.
//     → cross 보너스는 직접타격 전용이며 "근력/마법력(주스탯)에 비례"해야 함.
//
//   FORM 변이:
//     wholebase  : ab_d = floor(ab_d_sum × (1 + Kc·g/100))         [기존 V_BIG21 균일곱 — 베이스라인]
//     mainlin    : ab_d = ab_d_sum + floor(Kc·주스탯·g/100)         [사용자 요청 형태: 근력비례 가산]
//     mainlin_sq : mainlin + 주스탯² 비선형 항(K0_sq)
//     mainpow    : ab_d = ab_d_sum + floor(Kc·주스탯·g^Pexp/100)    [g 거듭제곱(오목 가능) — 카톡/세이버 모순 검증용]
//
//   핵심 검증 페어:
//     카톡 근마_-1pp (g27→26): 직타 Δ 실측 -21,746
//     세이버 (자료6, g33→32):  BP   Δ 실측 -6,742
//   균일곱은 두 페어가 단일 Kc로 모순(카톡 0.53 vs 세이버 0.24). 새 형태가 동시 적합하는지 본다.

import { readFileSync } from 'node:fs';

const FORM = (process.argv[2] || 'mainlin').toLowerCase();
const FORMS = ['wholebase', 'mainlin', 'mainlin_sq', 'mainpow'];
if (!FORMS.includes(FORM)) {
  console.error('FORM 은 ' + FORMS.join('|') + ' 중 하나');
  process.exit(1);
}
// KATW: 카톡 근마 직타 Δ(-21746) 직접 매칭 가중치 (0=기존, 클수록 카톡 신뢰)
const KATW = Number(process.argv[3] || 0);

const D_PEN = 25.0;
// Dcrit↔base 비식별성(축퇴) 제거 — 생산 모델 V_BIG21 안정값으로 고정.
//   고정 안 하면 옵티마이저가 Dcrit 0.4~272 로 제멋대로 떠다녀 cross 형태 비교가 오염됨.
const DCRIT_FIX = 269.5;
const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;
const F = Math.floor;

// ─── 카톡 18건 ───
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
const katalkData = katalkCases.map((c) => ({ type: 'P', src: 'kat', ...katalkDisplay, ...c.diff, name: c.name, 전투력: c.전투력, 직접타격: c.직접타격, 소환타격: c.소환타격 }));

// ─── 박햇님 15건 (buff factor 학습 대상) ───
const haetDisplay = { 주스탯: 8888384, 공격력: 48427, 관통: 99, 크댐: 8529, 최소뎀: 7252, 최대뎀: 7748, 고댐: 1097014, 일몬추: 0, 보몬추: 0, 일몬지: 69.3, 보몬지: 71.8, 근마효율: 0 };
const haetRaw = { 주스탯: 1440581, 공격력: 10834, 크댐: 6462, 최소뎀: 5412, 최대뎀: 6101, 고댐: 537752 };
const hCum = {};
for (const k of Object.keys(haetRaw)) hCum[k] = haetDisplay[k] / haetRaw[k] - 1;
const haetCases = [
  { name: 'haet_BASE',          diff: {},                                                                  전투력: 3648734, 직접타격: 3188580, 소환타격: 4108889 },
  { name: 'haet_마법력_+1pp',    diff: { 주스탯:  haetRaw.주스탯  * (1 + hCum.주스탯  + 0.01) },           전투력: 3662251, 직접타격: 3190455, 소환타격: 4113935 },
  { name: 'haet_마법력_-1pp',    diff: { 주스탯:  haetRaw.주스탯  * (1 + hCum.주스탯  - 0.01) },           전투력: 3645274, 직접타격: 3186705, 소환타격: 4103844 },
  { name: 'haet_속성력_+1pp',    diff: { 공격력:  haetRaw.공격력  * (1 + hCum.공격력  + 0.01) },           전투력: 3651297, 직접타격: 3192622, 소환타격: 4109973 },
  { name: 'haet_속성력_-1pp',    diff: { 공격력:  haetRaw.공격력  * (1 + hCum.공격력  - 0.01) },           전투력: 3646195, 직접타격: 3184574, 소환타격: 4107816 },
  { name: 'haet_크댐_+1pp',      diff: { 크댐:    haetRaw.크댐    * (1 + hCum.크댐    + 0.01) },           전투력: 3676278, 직접타격: 3212599, 소환타격: 4139957 },
  { name: 'haet_크댐_-1pp',      diff: { 크댐:    haetRaw.크댐    * (1 + hCum.크댐    - 0.01) },           전투력: 3621615, 직접타격: 3164931, 소환타격: 4078299 },
  { name: 'haet_최대뎀_+1pp',    diff: { 최대뎀:  haetRaw.최대뎀  * (1 + hCum.최대뎀  + 0.01) },           전투력: 3663573, 직접타격: 3201547, 소환타격: 4125599 },
  { name: 'haet_최대뎀_-1pp',    diff: { 최대뎀:  haetRaw.최대뎀  * (1 + hCum.최대뎀  - 0.01) },           전투력: 3633896, 직접타격: 3175613, 소환타격: 4092180 },
  { name: 'haet_최소뎀_+1pp',    diff: { 최소뎀:  haetRaw.최소뎀  * (1 + hCum.최소뎀  + 0.01) },           전투력: 3661870, 직접타격: 3200059, 소환타격: 4123681 },
  { name: 'haet_최소뎀_-1pp',    diff: { 최소뎀:  haetRaw.최소뎀  * (1 + hCum.최소뎀  - 0.01) },           전투력: 3635355, 직접타격: 3176888, 소환타격: 4093823 },
  { name: 'haet_보몬지_+1pp',    diff: { 보몬지: 72.8 },                                                    전투력: 3659431, 직접타격: 3197928, 소환타격: 4120935 },
  { name: 'haet_보몬지_-1pp',    diff: { 보몬지: 70.8 },                                                    전투력: 3638037, 직접타격: 3179232, 소환타격: 4095843 },
  { name: 'haet_고댐_+1pp',      diff: { 고댐:    haetRaw.고댐    * (1 + hCum.고댐    + 0.01) },           전투력: 3649678, 직접타격: 3189173, 소환타격: 4110184 },
  { name: 'haet_고댐_-1pp',      diff: { 고댐:    haetRaw.고댐    * (1 + hCum.고댐    - 0.01) },           전투력: 3647790, 직접타격: 3187986, 소환타격: 4107594 },
];
const haetData = haetCases.map((c) => ({ type: 'M', src: 'haet', ...haetDisplay, ...c.diff, name: c.name, 전투력: c.전투력, 직접타격: c.직접타격, 소환타격: c.소환타격 }));

// ─── SAMPLE 직타/소타 분리 + 총BP-only ───
const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const sampleSplit = sample.filter((d) => d.직접타격 || d.소환타격);
const sampleBpOnly = sample.filter((d) => !(d.직접타격 || d.소환타격));

const seibo = sample.find((d) => d.name === '자료6_세이버');
const img24Pairs = sample
  .filter((d) => d.name && d.name.startsWith('img24'))
  .map((d) => ({ ...d, src: 'img24pair', baseBP: seibo.전투력, deltaBP: d.전투력 - seibo.전투력 }));

const allData = [
  ...katalkData.map((d) => ({ ...d, src: 'kat', _w: 5, _haet: false })),
  ...haetData.map((d) => ({ ...d, src: 'haet', _w: 5, _haet: true })),
  ...sampleSplit.map((d) => ({ ...d, src: 'smp_split', _w: 1, _haet: false })),
  ...sampleBpOnly.map((d) => ({ ...d, src: 'smp_bp', _w: 1, _haet: false })),
];

// ── 모델 ──
//   p = [K0,K1,K2,Kmon,Kc,Dcrit,Ddmg,Ddom,base,U,V,W,X,K0sq,Pexp]  (15)
function modelBP(d, p) {
  const [K0, K1, K2, Kmon, Kc, /* Dcrit 고정 */, Ddmg, Ddom, base, U, V, W, X, K0sq, Pexp] = p;
  const Dcrit = DCRIT_FIX;
  const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
  const maxDmg = Number(d.최대뎀 || 0);
  const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
  const m_crit = 1 + F(d.크댐 / Dcrit * 100) / 100;
  const m_dmg  = 1 + F((minDmg + maxDmg) / Ddmg * 100) / 100;
  const m_dom  = 1 + (d.일몬지 + d.보몬지) / Ddom;
  const m_pen  = 1 + F(d.관통 / D_PEN * 100) / 100;
  const M = m_crit * m_dmg * m_dom * m_pen * base;

  const g = d.근마효율 || 0;
  const 주스탯 = d.주스탯;
  const ab = (mode) => {
    let a = K0, b = K1e, gm = K2, dd = Kmon;
    if (mode === 'direct') { a -= U; b += V; gm -= W; dd -= X; }
    else                    { a += U; b -= V; gm += W; dd += X; }
    let r = F(a * 주스탯) + F(b * d.공격력) + F(gm * d.고댐) + F(dd * (d.일몬추 + d.보몬추));
    if (FORM === 'mainlin_sq') r += F(K0sq * 주스탯 * 주스탯 / 1e7);
    return r;
  };

  let ab_d = ab('direct');
  // 근마효율 cross — 직접타격 전용
  if (FORM === 'wholebase') {
    ab_d = F(ab_d * (1 + Kc * g / 100));
  } else if (FORM === 'mainlin' || FORM === 'mainlin_sq') {
    ab_d = ab_d + F(Kc * 주스탯 * g / 100);
  } else if (FORM === 'mainpow') {
    const pe = Math.max(0.05, Math.min(3, Pexp));
    if (g > 0) ab_d = ab_d + F(Kc * 주스탯 * Math.pow(g, pe) / 100);
  }
  const ab_s = ab('summon');
  const dir = F(ab_d * M);
  const sum = F(ab_s * M);
  return { avg: F((dir + sum) / 2), direct: dir, summon: sum };
}

function loss(yvec) {
  const p = [
    Math.exp(yvec[0]), Math.exp(yvec[1]), Math.exp(yvec[2]), Math.exp(yvec[3]),
    yvec[4],
    Math.exp(yvec[5]), Math.exp(yvec[6]), Math.exp(yvec[7]), Math.exp(yvec[8]),
    yvec[9], yvec[10], yvec[11], yvec[12],
    yvec[13], yvec[14],
  ];
  const b_haet = Math.exp(yvec[15]);
  if (!p.every(Number.isFinite) || !Number.isFinite(b_haet)) return 1e12;
  const [K0, K1, K2, Kmon, , , , , , U, V, W, X] = p;
  let penalty = 0;
  const margins = [K0 - Math.abs(U), K1 - Math.abs(V), K2 - Math.abs(W), Kmon - Math.abs(X)];
  for (const m of margins) if (m < 0) penalty += m * m * 1e4;
  if (b_haet < 0.9 || b_haet > 1.2) penalty += (b_haet - 1.05) ** 2 * 100;
  if (p[4] < 0) penalty += p[4] * p[4] * 1e4; // Kc >= 0

  let err = 0;
  for (const d of allData) {
    const pred = modelBP(d, p);
    if (!Number.isFinite(pred.avg + pred.direct + pred.summon)) return 1e12;
    const bf = d._haet ? b_haet : 1;
    if (d.전투력 > 0)    { const r = (pred.avg    * bf - d.전투력)    / d.전투력;       err += d._w * r * r; }
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
  // 카톡 근마 직타 Δ 직접 매칭 (KATW>0 일 때만) — "카톡 신뢰" 시뮬레이션
  if (KATW > 0) {
    const kb = modelBP(katalkData[0], p);    // g27
    const kg = modelBP(katalkData[17], p);   // g26
    const r = ((kg.direct - kb.direct) - (-21746)) / 21746;
    err += KATW * r * r;
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

// ── 초기값 / 학습 ──
const KC0 = FORM === 'wholebase' ? 0.235 : 0.6;
const x0_base = [
  2.86, 267.0, 2.0, 0.837,
  KC0,
  269.5, 2.33e-37, 198.0, 4.77e-45,
  1.34, 144.0, 0.29, 0.38,
  -0.01,   // K0sq (mainlin_sq 만 사용)
  1.0,     // Pexp (mainpow 만 사용)
  Math.log(1.05),
];
function toY(p) {
  return [
    Math.log(p[0]), Math.log(p[1]), Math.log(p[2]), Math.log(p[3]),
    p[4],
    Math.log(p[5]), Math.log(p[6]), Math.log(p[7]), Math.log(p[8]),
    p[9], p[10], p[11], p[12],
    p[13], p[14],
    p[15],
  ];
}
function toP(y) {
  return [
    Math.exp(y[0]), Math.exp(y[1]), Math.exp(y[2]), Math.exp(y[3]),
    y[4],
    Math.exp(y[5]), Math.exp(y[6]), Math.exp(y[7]), Math.exp(y[8]),
    y[9], y[10], y[11], y[12],
    y[13], y[14],
  ];
}

const N_RESTART = 300;
const y0 = toY(x0_base);
const rng = mulberry32(13);
let bestLoss = loss(y0);
let bestY = y0.slice();
const r0 = nelderMead(loss, y0, { maxIter: 80000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }
const t0 = Date.now();
for (let s = 0; s < N_RESTART; s++) {
  const yi = y0.map((v, i) => {
    let scale;
    if (i === 4) scale = 0.3;                                  // Kc
    else if (i === 5) scale = 0;                               // Dcrit 고정(DCRIT_FIX) — 미사용
    else if (i === 13) scale = FORM === 'mainlin_sq' ? 0.02 : 0; // K0sq
    else if (i === 14) scale = FORM === 'mainpow' ? 0.15 : 0;    // Pexp
    else if (i === 15) scale = 0.05;                           // b_haet
    else scale = 0.2;
    return v + (rng() * 2 - 1) * scale;
  });
  const r = nelderMead(loss, yi, { maxIter: 30000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const bestP = toP(bestY);
const b_haet = Math.exp(bestY[15]);

const sP = rmsePct(sample.filter(d => d.type === 'P').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const sM = rmsePct(sample.filter(d => d.type === 'M').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_kat = rmsePct(katalkData.map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_haet = rmsePct(haetData.map(d => ({ ...d, _haet: true })), bestP, b_haet);

// 핵심 페어 — 예측 vs 실측
const seiBase = modelBP({ ...seibo, type: 'P' }, bestP);
const sei32 = modelBP({ ...seibo, 근마효율: 32, type: 'P' }, bestP);
const seiDeltaBP = sei32.avg - seiBase.avg;          // 실측 -6742
const katBase = modelBP(katalkData[0], bestP);
const katG = modelBP(katalkData[17], bestP);
const katDirDelta = katG.direct - katBase.direct;    // 실측 -21746

const out = {
  form: FORM, KATW, loss: bestLoss, elapsed: Number(elapsed), b_haet,
  params: bestP, Kc: bestP[4], K0sq: bestP[13], Pexp: bestP[14],
  magicK1: bestP[1] * MAGIC_K1_RATIO,
  sP, sM, r_kat종합: r_kat.종합.rmse, r_haet종합: r_haet.종합.rmse,
  seiDeltaBP, seiTarget: -6742, katDirDelta, katTarget: -21746,
};
console.log('@@RESULT@@' + JSON.stringify(out));
