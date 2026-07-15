// V25 — 자료20 통제 실험으로 확정된 "정확 구조" 고정 재학습
//
//   자료20(동일 마법캐릭 6캡처: 근마 35/33/31/25, 지배력 -1.0/-2.5)의 정확 역산 결과:
//     ① D_dom = 200.000 (4개 스트림 × 3페어 전부, 오차 <0.007) → m_dom = 1 + (일몬지+보몬지)/200
//     ② 양 패널 cross 기울기 비율(1.143889)이 [크댐분모 100 + dmg 순비례 + min>max cap] 에서
//        오차 2e-6 으로 정확 성립 → m_crit = 1 + 크댐/100 (표시 % 그대로), m_dmg = (min_c+max) 비례
//        (min cap 미적용 시 D_crit 음수 모순 → cap 규칙 실재 확인)
//     ③ 근마 cross 완전 선형 (마 직접 12,336.5/1%p 정확, 물 직접 10,784.7)
//     ④ 지배력 직/소 기울기 비율 = 직/소 값 비율 → M 은 직·소 균일곱
//     ⑤ BP = floor((직+소)/2) 전건 성립
//   → 구조를 위 정확식으로 고정하고 남은 자유 파라미터만 재학습:
//     [K0, K1, K2, Kmon, Kc, base, U, V, W, X] + b_haet  (11 dims, 기존 19 슬롯 대비 -8)
//
//   사용법: node refit_v25_exact_structure.mjs [restarts=N] [xkatgm=0|1]
//     xkatgm 기본 1 (카톡 근마 페어 제외 유지 — 신규 구조에서의 재평가는 katDirDelta 로 리포트만)
//   출력: @@RESULT@@{...}

import { readFileSync } from 'node:fs';

let N_RESTART = 300;
let X_KATGM = true;
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  if (k === 'restarts') N_RESTART = Number(v);
  else if (k === 'xkatgm') X_KATGM = v !== '0';
  else { console.error('unknown arg: ' + k); process.exit(1); }
}

const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;
const F = Math.floor;

// ─── 카톡 18건 ───
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

// ─── 자료20 물리 패널 6건 (마법캐릭의 물리창 — 직/소 타깃만, 종합은 게임 미표시라 제외) ───
const j20physBase = { type: 'P', 주스탯: 8628968, 공격력: 33272, 관통: 97, 크댐: 9485, 최소뎀: 8392, 최대뎀: 8103, 고댐: 842996, 일몬추: 1101018, 보몬추: 1096327, 전투력: 0 };
const j20physData = [
  { name: 'j20p_근마35', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 35, 직접타격: 3127015, 소환타격: 4409537 },
  { name: 'j20p_근마33', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 33, 직접타격: 3105445, 소환타격: 4409537 },
  { name: 'j20p_근마31', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 31, 직접타격: 3083876, 소환타격: 4409537 },
  { name: 'j20p_근마25', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 25, 직접타격: 3019168, 소환타격: 4409537 },
  { name: 'j20p_지배-1.0', 일몬지: 60.6, 보몬지: 67.9, 근마효율: 35, 직접타격: 3108092, 소환타격: 4382853 },
  { name: 'j20p_지배-2.5', 일몬지: 59.1, 보몬지: 66.4, 근마효율: 35, 직접타격: 3079707, 소환타격: 4342827 },
].map((s) => ({ ...j20physBase, ...s }));

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
  ...j20physData.map((d) => ({ ...d, _w: 5, _haet: false })),
  ...sampleSplit.map((d) => ({ ...d, _w: d.name && d.name.startsWith('자료20') ? 5 : 1, _haet: false })),
  ...sampleBpOnly.map((d) => ({ ...d, _w: 1, _haet: false })),
];

// ── 모델 (구조 고정) ──
//   p: [0]K0 [1]K1 [2]K2 [3]Kmon [4]Kc [5]base [6]U [7]V [8]W [9]X
function modelBP(d, p) {
  const [K0, K1, K2, Kmon, Kc, base, U, V, W, X] = p;
  const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
  const maxDmg = Number(d.최대뎀 || 0);
  const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg); // min>max cap (자료20 물리 패널로 실재 확인)
  const m_crit = 1 + d.크댐 / 100;                    // 확정: 표시 크댐% 그대로
  const m_dmg = minDmg + maxDmg;                      // 확정: 순비례 (정규화는 base 가 흡수)
  const m_dom = 1 + (d.일몬지 + d.보몬지) / 200;      // 확정: D_dom = 200.000
  const m_pen = 1 + F(d.관통 / 25 * 100) / 100;
  const M = m_crit * m_dmg * m_dom * m_pen * base;

  const g = d.근마효율 || 0;
  const monVal = d.일몬추 + d.보몬추;
  const ab = (mode) => {
    let a = K0, b = K1e, gm = K2, dd = Kmon;
    if (mode === 'direct') { a -= U; b += V; gm -= W; dd -= X; }
    else                    { a += U; b -= V; gm += W; dd += X; }
    return F(a * d.주스탯) + F(b * d.공격력) + F(gm * d.고댐) + F(dd * monVal);
  };
  let ab_d = ab('direct');
  if (g > 0) ab_d += F(Kc * d.주스탯 * g / 100);     // 확정: 선형 cross (자료20 완전 선형)
  const ab_s = ab('summon');
  const dir = F(ab_d * M);
  const sum = F(ab_s * M);
  return { avg: F((dir + sum) / 2), direct: dir, summon: sum };
}

// y-vector: exp 슬롯 [0..5] (양수 제약), raw [6..9], [10]=log(b_haet)
const EXP_IDX = new Set([0, 1, 2, 3, 4, 5]);
function toP(y) { return y.slice(0, 10).map((v, i) => (EXP_IDX.has(i) ? Math.exp(v) : v)); }

function loss(yvec) {
  const p = toP(yvec);
  const b_haet = Math.exp(yvec[10]);
  if (!p.every(Number.isFinite) || !Number.isFinite(b_haet)) return 1e12;
  const [K0, K1, K2, Kmon, , , U, V, W, X] = p;
  let penalty = 0;
  const margins = [K0 - Math.abs(U), K1 - Math.abs(V), K2 - Math.abs(W), Kmon - Math.abs(X)];
  for (const m of margins) if (m < 0) penalty += m * m * 1e4;
  if (b_haet < 0.9 || b_haet > 1.2) penalty += (b_haet - 1.05) ** 2 * 100;

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

// ── 초기값 (V_BIG28 채택값, base 는 신규 M 스케일로 환산) ──
const x0_p = [
  1.9269218378219373, 196.544726924835, 1.4550241303930722, 0.6433980050039184,
  0.9088168498484678, 1.1e-8,
  1.0030491813532825, 111.2564512062554, 0.04376654041329761, 0.45838234457609517,
];
const y0 = x0_p.map((v, i) => (EXP_IDX.has(i) ? Math.log(v) : v)).concat([Math.log(1.068)]);

const rng = mulberry32(13);
let bestLoss = loss(y0);
let bestY = y0.slice();
const r0 = nelderMead(loss, y0, { maxIter: 80000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }
const t0 = Date.now();
for (let s = 0; s < N_RESTART; s++) {
  const yi = y0.map((v, i) => v + (rng() * 2 - 1) * (i === 10 ? 0.05 : 0.25));
  const r = nelderMead(loss, yi, { maxIter: 30000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const bestP = toP(bestY);
const b_haet = Math.exp(bestY[10]);

const sP = rmsePct(sample.filter(d => d.type === 'P').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const sM = rmsePct(sample.filter(d => d.type === 'M').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_kat = rmsePct(katalkTrain.map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_haet = rmsePct(haetData.map(d => ({ ...d, _haet: true })), bestP, b_haet);
const r_j20p = rmsePct(j20physData.map(d => ({ ...d, _haet: false })), bestP, b_haet);

const seiBase = modelBP({ ...seibo, type: 'P' }, bestP);
const sei32 = modelBP({ ...seibo, 근마효율: 32, type: 'P' }, bestP);
const katBase = modelBP(katalkData[0], bestP);
const katG = modelBP(katalkData[17], bestP);

// 자료20 마법 통제 페어 재현 검증 (기울기)
const j20m = sample.find((d) => d.name === '자료20_마법_통제_근마35_기준');
const j20m25 = modelBP({ ...j20m, 근마효율: 25 }, bestP);
const j20mBase = modelBP(j20m, bestP);
const j20mDom = modelBP({ ...j20m, 일몬지: 59.1, 보몬지: 66.4 }, bestP);

const out = {
  xkatgm: X_KATGM, restarts: N_RESTART, loss: bestLoss, elapsed: Number(elapsed), b_haet,
  params: bestP,
  sP, sM, r_kat종합: r_kat.종합.rmse, r_haet종합: r_haet.종합.rmse, r_j20p직접: r_j20p.직접.rmse, r_j20p소환: r_j20p.소환.rmse,
  seiDeltaBP: sei32.avg - seiBase.avg, seiTarget: -6742,
  katDirDelta: katG.direct - katBase.direct, katTarget: -21746,
  j20CrossDelta: j20m25.direct - j20mBase.direct, j20CrossTarget: -123365,
  j20DomDelta: j20mDom.avg - j20mBase.avg, j20DomTarget: 4813312 - 4887249,
};
console.log('@@RESULT@@' + JSON.stringify(out));
