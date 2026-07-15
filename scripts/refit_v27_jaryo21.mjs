// V27 — V26 + 자료21 깡 주스탯 통제페어 (기본 근력·마법력 동시 -1000/-2000/-10000, 4캡처)
//
//   자료21 (2026-07-15, 동일 마법캐릭·자료20과 다른 상태: 관통 98, 크댐 9445/10156):
//     기본 스탯 차감 정확 검증 완료 (표시 Δ = raw Δ × 6.22 정확). 4점 완전 선형:
//     마직 -1195 / 마소 -2860.6 / 물직 -1057.6 / 물소 -2531 per -1000 raw (근+마 동시)
//     → a축(K0·u_r)의 깨끗한 방정식 — 카톡의 신뢰 불가 근력 프로브 대체.
//
//   워크플로 확정 사항 (2026-07-15, wf_5def544e):
//     ① Kc×base = 9.97746e-9 (±0.0007%) — 자료20 마/물 기울기 교차 확증 → Kc 를 base 종속으로 경성 제약
//     ② 몬추 계수 = 고댐 계수 / 2 (직·소 모두 d/c=0.5 정확) → Kmon=K2/2, X=W/2 (자유도 -2)
//     ③ 직/소 분리는 계수 비례 구조 (캐릭터 무관 불변): U=u_r×K0, V=v_r×K1e, W=w_r×K2
//        실측: u_r≈0.458(박햇님 순수측정), v_r≈0.5773, w_r≈0.3715 — V29 의 W≈0 은 미분과 전면 모순
//     ④ 카톡 근마 페어: Δg=2 (27→25) 재라벨로 모순 해소 (실측이 기울기의 정확히 2.000배) → 재편입
//     ⑤ 카톡 깡크_-10 페어가 진짜 이상치 (직/소 13.5% 모순, 기록/OCR 오류) → 제외
//     ⑥ cross 는 raw(기본) 주스탯 기반 증거 (근력 -2pp vs 깡-1000 기울기 1.27배 판별) → mode=raw 로 검증
//
//   사용법: node refit_v26_derivative_constrained.mjs [mode=disp|raw] [cluster=0|1] [restarts=N]
//     mode=disp: cross = floor(Kc×표시주스탯×g/100), Kc=T_disp/base
//     mode=raw:  cross = floor(Kc×기본주스탯×g/100), Kc=T_raw/base (기본_주스탯 없으면 표시×rf 폴백, rf 학습)
//     cluster=1: 클린 클러스터 고정 (K2=1.5, a소=K0(1+u_r)=3.0)
//   출력: @@RESULT@@{...}

import { readFileSync } from 'node:fs';

let MODE = 'disp';
let CLUSTER = false;
let N_RESTART = 1200;
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  if (k === 'restarts') N_RESTART = Number(v);
  else if (k === 'mode') MODE = v;
  else if (k === 'cluster') CLUSTER = v === '1';
  else { console.error('unknown arg: ' + k); process.exit(1); }
}

const MAGIC_K1_RATIO = 1.49184424e+2 / 1.47842018e+2;
const F = Math.floor;

// ── Kc×base 경성 제약 상수 (자료20 마법 기울기 12336.5/1%p 에서 도출) ──
const M_OVER_BASE_J20M = (1 + 10197 / 100) * 17111 * (1 + 130.5 / 200) * (1 + F(97 * 4) / 100);
const T_DISP = 12336.5 * 100 / (8702091 * M_OVER_BASE_J20M);  // Kc_disp × base
const T_RAW  = 12336.5 * 100 / (1399050 * M_OVER_BASE_J20M);  // Kc_raw × base

// ─── 카톡 (근마 페어 Δg=2 재라벨 편입, 깡크_-10 제외) ───
const katalkDisplay = { 주스탯: 8112370, 공격력: 66821, 관통: 98, 크댐: 9014, 최소뎀: 8396, 최대뎀: 8670, 고댐: 789694, 일몬추: 1128458, 보몬추: 1141576, 일몬지: 69.5, 보몬지: 81.3, 근마효율: 27, 기본_주스탯: 1350799 };
const katalkRaw = { 주스탯: 1350799, 공격력: 13434, 크댐: 6468, 최소뎀: 5913, 최대뎀: 6283, 고댐: 446155, 일몬추: 999064, 보몬추: 1001383 };
const kCum = {};
for (const k of Object.keys(katalkRaw)) kCum[k] = katalkDisplay[k] / katalkRaw[k] - 1;
const katalkCases = [
  { name: 'katalk_BASE',        diff: {},                                                          전투력: 4779114, 직접타격: 4663530, 소환타격: 4894698 },
  { name: 'katalk_근력_-2pp',    diff: { 주스탯:  katalkRaw.주스탯  * (1 + kCum.주스탯  - 0.02) }, 전투력: 4770945, 직접타격: 4659919, 소환타격: 4882971 },
  { name: 'katalk_무공_-1pp',    diff: { 공격력:  katalkRaw.공격력  * (1 + kCum.공격력  - 0.01) }, 전투력: 4775306, 직접타격: 4657525, 소환타격: 4893088 },
  { name: 'katalk_보몬지_-2pp',  diff: { 보몬지: 79.3 },                                            전투력: 4751867, 직접타격: 4636942, 소환타격: 4866792 },
  { name: 'katalk_깡근력_-1000', diff: { 주스탯: (katalkRaw.주스탯  - 1000) * (1 + kCum.주스탯), 기본_주스탯: katalkRaw.주스탯 - 1000 }, 전투력: 4777307, 직접타격: 4662510, 소환타격: 4892104 },
  { name: 'katalk_무공_깡-10',   diff: { 공격력: (katalkRaw.공격력  - 10)   * (1 + kCum.공격력) }, 전투력: 4777660, 직접타격: 4661238, 소환타격: 4894083 },
  { name: 'katalk_고댐_-1pp',    diff: { 고댐:    katalkRaw.고댐    * (1 + kCum.고댐    - 0.01) }, 전투력: 4778145, 직접타격: 4662921, 소환타격: 4893369 },
  { name: 'katalk_고댐_-1500',   diff: { 고댐:   (katalkRaw.고댐    - 1500) * (1 + kCum.고댐) },   전투력: 4778537, 직접타격: 4663167, 소환타격: 4893907 },
  { name: 'katalk_일몬추_-200',  diff: { 일몬추: (katalkRaw.일몬추  - 200)  * (1 + kCum.일몬추) }, 전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
  { name: 'katalk_보몬추_-200',  diff: { 보몬추: (katalkRaw.보몬추  - 200)  * (1 + kCum.보몬추) }, 전투력: 4779089, 직접타격: 4663514, 소환타격: 4894664 },
  { name: 'katalk_일몬추_-1pp',  diff: { 일몬추:  katalkRaw.일몬추  * (1 + kCum.일몬추  - 0.01) }, 전투력: 4778029, 직접타격: 4662848, 소환타격: 4893211 },
  { name: 'katalk_보몬추_-1pp',  diff: { 보몬추:  katalkRaw.보몬추  * (1 + kCum.보몬추  - 0.01) }, 전투력: 4778027, 직접타격: 4662847, 소환타격: 4893207 },
  { name: 'katalk_깡최소_-10',   diff: { 최소뎀: (katalkRaw.최소뎀  - 10)   * (1 + kCum.최소뎀) }, 전투력: 4775193, 직접타격: 4659703, 소환타격: 4890683 },
  // katalk_깡크_-10: 직/소 13.5% 모순 (V26 워크플로 판별) → 이상치 제외
  { name: 'katalk_최종최소_-1pp', diff: { 최소뎀:  katalkRaw.최소뎀  * (1 + kCum.최소뎀  - 0.01) }, 전투력: 4762591, 직접타격: 4647407, 소환타격: 4877775 },
  { name: 'katalk_최종최대_-1pp', diff: { 최대뎀:  katalkRaw.최대뎀  * (1 + kCum.최대뎀  - 0.01) }, 전투력: 4761471, 직접타격: 4646314, 소환타격: 4876629 },
  { name: 'katalk_최종크_-1pp',   diff: { 크댐:    katalkRaw.크댐    * (1 + kCum.크댐    - 0.01) }, 전투력: 4744967, 직접타격: 4630270, 소환타격: 4859664 },
  { name: 'katalk_근마_-2pp',    diff: { 근마효율: 25 },                                            전투력: 4768241, 직접타격: 4641784, 소환타격: 4894698 },
];
const katalkData = katalkCases.map((c) => ({ type: 'P', ...katalkDisplay, ...c.diff, name: c.name, 전투력: c.전투력, 직접타격: c.직접타격, 소환타격: c.소환타격 }));

// ─── 박햇님 15건 (g=0 이라 cross 무관) ───
const haetDisplay = { 주스탯: 8888384, 공격력: 48427, 관통: 99, 크댐: 8529, 최소뎀: 7252, 최대뎀: 7748, 고댐: 1097014, 일몬추: 0, 보몬추: 0, 일몬지: 69.3, 보몬지: 71.8, 근마효율: 0, 기본_주스탯: 1440581 };
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

// ─── 자료20 물리 패널 6건 (raw 근력 1387294) ───
const j20physBase = { type: 'P', 주스탯: 8628968, 공격력: 33272, 관통: 97, 크댐: 9485, 최소뎀: 8392, 최대뎀: 8103, 고댐: 842996, 일몬추: 1101018, 보몬추: 1096327, 전투력: 0, 기본_주스탯: 1387294 };
const j20physData = [
  { name: 'j20p_근마35', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 35, 직접타격: 3127015, 소환타격: 4409537 },
  { name: 'j20p_근마33', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 33, 직접타격: 3105445, 소환타격: 4409537 },
  { name: 'j20p_근마31', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 31, 직접타격: 3083876, 소환타격: 4409537 },
  { name: 'j20p_근마25', 일몬지: 61.6, 보몬지: 68.9, 근마효율: 25, 직접타격: 3019168, 소환타격: 4409537 },
  { name: 'j20p_지배-1.0', 일몬지: 60.6, 보몬지: 67.9, 근마효율: 35, 직접타격: 3108092, 소환타격: 4382853 },
  { name: 'j20p_지배-2.5', 일몬지: 59.1, 보몬지: 66.4, 근마효율: 35, 직접타격: 3079707, 소환타격: 4342827 },
].map((s) => ({ ...j20physBase, ...s }));

// ─── 자료21 물리 패널 4건 (깡 근력 동시 차감 — 주스탯·기본_주스탯 샷별 상이) ───
const j21physBase = { type: 'P', 공격력: 33272, 관통: 98, 크댐: 9445, 최소뎀: 8349, 최대뎀: 8127, 고댐: 842996, 일몬추: 1101018, 보몬추: 1096327, 일몬지: 61.6, 보몬지: 68.9, 근마효율: 35, 전투력: 0 };
const j21physData = [
  { name: 'j21p_기준',    주스탯: 8633683, 기본_주스탯: 1388052, 직접타격: 3149768, 소환타격: 4440622 },
  { name: 'j21p_-1000',  주스탯: 8627463, 기본_주스탯: 1387052, 직접타격: 3148710, 소환타격: 4438091 },
  { name: 'j21p_-2000',  주스탯: 8621243, 기본_주스탯: 1386052, 직접타격: 3147653, 소환타격: 4435560 },
  { name: 'j21p_-10000', 주스탯: 8571483, 기본_주스탯: 1378052, 직접타격: 3139192, 소환타격: 4415312 },
].map((s) => ({ ...j21physBase, ...s }));

// ─── SAMPLE (자료20 마법 패널엔 raw 마법력 1399050 패치; 자료21 은 JSON 에 기본_주스탯 포함) ───
const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'))
  .map((d) => (d.name && d.name.startsWith('자료20') ? { ...d, 기본_주스탯: 1399050 } : d));
const sampleSplit = sample.filter((d) => d.직접타격 || d.소환타격);
const sampleBpOnly = sample.filter((d) => !(d.직접타격 || d.소환타격));
const seibo = sample.find((d) => d.name === '자료6_세이버');
const img24Pairs = sample
  .filter((d) => d.name && d.name.startsWith('img24'))
  .map((d) => ({ ...d, baseBP: seibo.전투력, deltaBP: d.전투력 - seibo.전투력 }));

const allData = [
  ...katalkData.map((d) => ({ ...d, _w: 5, _haet: false })),
  ...haetData.map((d) => ({ ...d, _w: 5, _haet: true })),
  ...j20physData.map((d) => ({ ...d, _w: 5, _haet: false })),
  ...j21physData.map((d) => ({ ...d, _w: 5, _haet: false })),
  ...sampleSplit.map((d) => ({ ...d, _w: d.name && (d.name.startsWith('자료20') || d.name.startsWith('자료21')) ? 5 : 1, _haet: false })),
  ...sampleBpOnly.map((d) => ({ ...d, _w: 1, _haet: false })),
];

// ── 모델 ──
//   p: [0]K0 [1]K1 [2]K2 [3]base [4]u_r [5]v_r [6]w_r [7]rf
//   파생: Kmon=K2/2, X=W/2 → d계수 = c계수/2 (직·소 공통), Kc = T/base
function modelBP(d, p) {
  const [K0, K1, K2, base, u_r, v_r, w_r, rf] = p;
  const K1e = d.type === 'M' ? K1 * MAGIC_K1_RATIO : K1;
  const Kc = (MODE === 'raw' ? T_RAW : T_DISP) / base;
  const maxDmg = Number(d.최대뎀 || 0);
  const minDmg = Math.min(Number(d.최소뎀 || 0), maxDmg);
  const m_crit = 1 + d.크댐 / 100;
  const m_dmg = minDmg + maxDmg;
  const m_dom = 1 + (d.일몬지 + d.보몬지) / 200;
  const m_pen = 1 + F(d.관통 * 4) / 100;
  const M = m_crit * m_dmg * m_dom * m_pen * base;

  const monVal = d.일몬추 + d.보몬추;
  const ab = (mode) => {
    const s = mode === 'direct' ? -1 : 1;
    const a = K0 * (1 + s * u_r);
    const b = K1e * (1 - s * v_r);
    const c = K2 * (1 + s * w_r);
    return F(a * d.주스탯) + F(b * d.공격력) + F(c * d.고댐) + F(c / 2 * monVal);
  };
  let ab_d = ab('direct');
  const g = d.근마효율 || 0;
  if (g > 0) {
    const S = MODE === 'raw' ? (d.기본_주스탯 || d.주스탯 * rf) : d.주스탯;
    ab_d += F(Kc * S * g / 100);
  }
  const ab_s = ab('summon');
  const dir = F(ab_d * M);
  const sum = F(ab_s * M);
  return { avg: F((dir + sum) / 2), direct: dir, summon: sum };
}

const EXP_IDX = new Set([0, 1, 2, 3, 7]);
function toP(y) {
  const p = y.slice(0, 8).map((v, i) => (EXP_IDX.has(i) ? Math.exp(v) : v));
  if (CLUSTER) {
    p[2] = 1.5;                 // K2 = 1.5
    p[0] = 3.0 / (1 + p[4]);    // a소 = K0(1+u_r) = 3.0
  }
  return p;
}

function loss(yvec) {
  const p = toP(yvec);
  const b_haet = Math.exp(yvec[8]);
  if (!p.every(Number.isFinite) || !Number.isFinite(b_haet)) return 1e12;
  const [, , , , u_r, v_r, w_r] = p;
  let penalty = 0;
  for (const r of [u_r, v_r, w_r]) { if (r < 0) penalty += r * r * 1e4; if (r > 0.98) penalty += (r - 0.98) ** 2 * 1e4; }
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
    const r = (dPred - pair.deltaBP) / Math.max(Math.abs(pair.deltaBP), 1000);
    err += 3 * r * r;
  }

  // ── 페어 미분(Δ) 손실 — V26.1 핵심 추가 ──
  //   레벨 상대오차(±0.2%)가 수백~수천 BP 짜리 페어 델타 정보를 삼키는 문제(울트라코드 워크플로 판별)를
  //   델타 항으로 직접 보정. 직접/소환 델타를 각각 실측 Δ와 비교 (b_haet 는 양변 공통이라 델타에도 곱).
  const deltaErr = (group, baseIdx, bf) => {
    const basePred = modelBP(group[baseIdx], p);
    let e = 0;
    for (let i = 0; i < group.length; i++) {
      if (i === baseIdx) continue;
      const pred = modelBP(group[i], p);
      for (const [pk, rk] of [['direct', '직접타격'], ['summon', '소환타격']]) {
        const dReal = group[i][rk] - group[baseIdx][rk];
        const dPred = (pred[pk] - basePred[pk]) * bf;
        const r = (dPred - dReal) / Math.max(Math.abs(dReal), 300);
        e += r * r;
      }
    }
    return e;
  };
  err += 3 * deltaErr(katalkData, 0, 1);
  err += 3 * deltaErr(haetData, 0, b_haet);
  err += 3 * deltaErr(j20physData, 0, 1);
  const j20mGroup = sampleSplit.filter((d) => d.name && d.name.startsWith('자료20'));
  err += 3 * deltaErr(j20mGroup, 0, 1);
  err += 3 * deltaErr(j21physData, 0, 1);
  const j21mGroup = sampleSplit.filter((d) => d.name && d.name.startsWith('자료21'));
  err += 3 * deltaErr(j21mGroup, 0, 1);

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

// 초기값: 워크플로 미분 제약 + 클린 클러스터 근방
const x0_p = [2.0, 201.0, 1.5, 1.078e-8, 0.4581, 0.5773, 0.3715, 0.165];
const y0 = x0_p.map((v, i) => (EXP_IDX.has(i) ? Math.log(v) : v)).concat([Math.log(1.069)]);

const rng = mulberry32(13);
let bestLoss = loss(y0);
let bestY = y0.slice();
const r0 = nelderMead(loss, y0, { maxIter: 80000, initStep: 0.05 });
if (r0.fun < bestLoss) { bestLoss = r0.fun; bestY = r0.x; }
const t0 = Date.now();
for (let s = 0; s < N_RESTART; s++) {
  const yi = y0.map((v, i) => v + (rng() * 2 - 1) * (i === 8 ? 0.05 : 0.2));
  const r = nelderMead(loss, yi, { maxIter: 30000, initStep: 0.05 });
  if (r.fun < bestLoss) { bestLoss = r.fun; bestY = r.x; }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const bestP = toP(bestY);
const b_haet = Math.exp(bestY[8]);

const sP = rmsePct(sample.filter(d => d.type === 'P').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const sM = rmsePct(sample.filter(d => d.type === 'M').map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_kat = rmsePct(katalkData.map(d => ({ ...d, _haet: false })), bestP, b_haet);
const r_haet = rmsePct(haetData.map(d => ({ ...d, _haet: true })), bestP, b_haet);
const r_j20p = rmsePct(j20physData.map(d => ({ ...d, _haet: false })), bestP, b_haet);

// 골든값 검증: C = ab×(M성분/(1+s/200))×base — 워크플로 산출 순수 실측 파생량
const j20m = sample.find((d) => d.name === '자료20_마법_통제_근마35_기준');
const pj = modelBP(j20m, bestP);
const goldC = { 마직: 2699643.73, 마소: 3215333.23, 물직: 1892293.60, 물소: 2668403.96 };
const f130 = 1 + 130.5 / 200;
const pp = modelBP(j20physData[0], bestP);
const cErr = {
  마직: (pj.direct / f130 - goldC.마직) / goldC.마직 * 100,
  마소: (pj.summon / f130 - goldC.마소) / goldC.마소 * 100,
  물직: (pp.direct / f130 - goldC.물직) / goldC.물직 * 100,
  물소: (pp.summon / f130 - goldC.물소) / goldC.물소 * 100,
};

const seiBase = modelBP({ ...seibo, type: 'P' }, bestP);
const sei32 = modelBP({ ...seibo, 근마효율: 32, type: 'P' }, bestP);
const katBase = modelBP(katalkData[0], bestP);
const katG = modelBP(katalkData[16], bestP);
const katStr = modelBP(katalkData[1], bestP); // 근력_-2pp — cross 형태 판별 페어
const j20m25 = modelBP({ ...j20m, 근마효율: 25 }, bestP);

const [K0, K1, K2, base, u_r, v_r, w_r, rf] = bestP;
const out = {
  mode: MODE, cluster: CLUSTER, restarts: N_RESTART, loss: bestLoss, elapsed: Number(elapsed), b_haet,
  params: { K0, K1, K2, base, u_r, v_r, w_r, rf, Kc: (MODE === 'raw' ? T_RAW : T_DISP) / base, Kmon: K2 / 2 },
  derived: { a직: K0 * (1 - u_r), a소: K0 * (1 + u_r), b직: K1 * (1 + v_r), b소: K1 * (1 - v_r), c직: K2 * (1 - w_r), c소: K2 * (1 + w_r) },
  sP, sM, r_kat종합: r_kat.종합.rmse, r_kat직접: r_kat.직접.rmse, r_haet종합: r_haet.종합.rmse, r_j20p직접: r_j20p.직접.rmse,
  goldenCErrPct: cErr,
  seiDeltaBP: sei32.avg - seiBase.avg, seiTarget: -6742,
  katGmDelta: katG.direct - katBase.direct, katGmTarget: -21746,
  katStrDelta: katStr.direct - katBase.direct, katStrTarget: -3611,
  j20CrossDelta: j20m25.direct - pj.direct, j20CrossTarget: -123365,
  // 고댐 페어 델타 — c 분리비(w_r) 판별자: 실측 직 -609 / 소 -1329 (비 2.182)
  katGoDelta직: modelBP(katalkData[6], bestP).direct - katBase.direct, katGoTarget직: -609,
  katGoDelta소: modelBP(katalkData[6], bestP).summon - katBase.summon, katGoTarget소: -1329,
  // 자료21 깡스탯 -10000 델타 — a축(K0·u_r) 판별자
  j21StatDelta직: modelBP(sample.find((d) => d.name === '자료21_마법_통제_깡-10000'), bestP).direct
    - modelBP(sample.find((d) => d.name === '자료21_마법_통제_깡스탯기준'), bestP).direct, j21StatTarget직: -11950,
  j21StatDelta소: modelBP(sample.find((d) => d.name === '자료21_마법_통제_깡-10000'), bestP).summon
    - modelBP(sample.find((d) => d.name === '자료21_마법_통제_깡스탯기준'), bestP).summon, j21StatTarget소: -28606,
  j21pStatDelta직: modelBP(j21physData[3], bestP).direct - modelBP(j21physData[0], bestP).direct, j21pStatTarget직: -10576,
};
console.log('@@RESULT@@' + JSON.stringify(out));
