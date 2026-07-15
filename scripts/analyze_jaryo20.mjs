// 자료20 통제 실험 분석 — 동일 마법캐릭, 근마효율(35/33/31/25)·지배력(-1.0/-2.5) 조절 6캡처
//   목표: 정확 관계식 역산 (D_dom, cross 선형성/기울기, 양 패널 교차 검증)
//   관통 97 (기존 데이터 99와 다름 주의)
import { calculateBattlePower, calculateDirectBP, calculateSummonBP } from '../src/utils/battlePower.js';

const F = Math.floor;

// 공통 스탯 (OCR 확대 교차검증 완료)
const C = {
  근력: 8628968, 마법력: 8702091,
  무기공최대: 33272, // 33,272 ~ 33,265 (min>max 역전 상태) → max 규칙
  속성력: 51450,
  물크댐: 9485, 마크댐: 10197,
  물최소: 8392, 물최대: 8103, // 물리도 min>max 역전 → cap 8103
  마최소: 8471, 마최대: 8640,
  물고댐: 842996, 마고댐: 970783,
  일몬추: 1101018, 보몬추: 1096327,
  관통: 97,
  명중물: 781, 명중마: 795,
};

// shot: [g, 일몬지, 보몬지, BP, P직, P소, M직, M소]
const SHOTS = [
  { n: 's1', g: 35, d1: 61.6, d2: 68.9, bp: 4887249, pd: 3127015, ps: 4409537, md: 4461161, ms: 5313338 },
  { n: 's2', g: 33, d1: 61.6, d2: 68.9, bp: 4874913, pd: 3105445, ps: 4409537, md: 4436488, ms: 5313338 },
  { n: 's3', g: 31, d1: 61.6, d2: 68.9, bp: 4862576, pd: 3083876, ps: 4409537, md: 4411815, ms: 5313338 },
  { n: 's4', g: 25, d1: 61.6, d2: 68.9, bp: 4825567, pd: 3019168, ps: 4409537, md: 4337796, ms: 5313338 },
  { n: 's5', g: 35, d1: 60.6, d2: 67.9, bp: 4857674, pd: 3108092, ps: 4382853, md: 4434164, ms: 5281184 },
  { n: 's6', g: 35, d1: 59.1, d2: 66.4, bp: 4813312, pd: 3079707, ps: 4342827, md: 4393670, ms: 5232954 },
];

console.log('═══ 1. BP = floor((마직+마소)/2) 검증 ═══');
for (const s of SHOTS) {
  const calc = F((s.md + s.ms) / 2);
  console.log(`  ${s.n}: 표시 ${s.bp} vs floor(avg) ${calc}  ${calc === s.bp ? '✓' : '✗ Δ' + (s.bp - calc)}`);
}

console.log('\n═══ 2. 근마효율 cross — 소환 불변 + 직접 선형성 (s1~s4, 지배력 고정) ═══');
const gShots = SHOTS.slice(0, 4);
for (const key of ['md', 'pd']) {
  const pts = gShots.map((s) => [s.g, s[key]]);
  // 페어별 기울기
  const slopes = [];
  for (let i = 1; i < pts.length; i++) {
    const sl = (pts[0][1] - pts[i][1]) / (pts[0][0] - pts[i][0]);
    slopes.push(sl);
    console.log(`  ${key} g${pts[0][0]}→g${pts[i][0]}: Δ${pts[0][1] - pts[i][1]} → 기울기 ${sl.toFixed(4)}/1%p`);
  }
  const avg = slopes.reduce((a, b) => a + b) / slopes.length;
  console.log(`  ${key} 평균 기울기 = ${avg.toFixed(4)},  g=0 절편 = ${(pts[0][1] - avg * pts[0][0]).toFixed(1)}`);
}

console.log('\n═══ 3. 지배력 — value = C×(1+s/D) 역산 (s1/s5/s6, g=35 고정) ═══');
const dShots = [SHOTS[0], SHOTS[4], SHOTS[5]];
for (const key of ['md', 'ms', 'pd', 'ps']) {
  const pts = dShots.map((s) => [s.d1 + s.d2, s[key]]);
  // 페어 (i,j) 에서 D 정확해: (D+s_i)/(D+s_j) = v_i/v_j
  const Ds = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const r = pts[i][1] / pts[j][1];
      const D = (r * pts[j][0] - pts[i][0]) / (1 - r);
      Ds.push(D);
      console.log(`  ${key} s=${pts[i][0].toFixed(1)}/${pts[j][0].toFixed(1)}: D = ${D.toFixed(3)}`);
    }
  }
  const Dm = Ds.reduce((a, b) => a + b) / Ds.length;
  console.log(`  ${key} → D_dom ≈ ${Dm.toFixed(3)}  (C = ${(pts[0][1] / (1 + pts[0][0] / 200)).toFixed(1)} @D=200)`);
}

console.log('\n═══ 4. 양 패널 cross 기울기 비율 → M 구조 판별 ═══');
const slopeM = (SHOTS[0].md - SHOTS[3].md) / 10; // g35→25
const slopeP = (SHOTS[0].pd - SHOTS[3].pd) / 10;
const needSM = slopeM / slopeP;
console.log(`  마 직접 기울기 ${slopeM},  물 직접 기울기 ${slopeP},  비율 = ${needSM.toFixed(6)}`);
const statRatio = C.마법력 / C.근력;
console.log(`  주스탯 비율 (마법력/근력) = ${statRatio.toFixed(6)}`);
const needM = needSM / statRatio;
console.log(`  → cross∝주스탯×M 가정 시 필요한 M_마/M_물 = ${needM.toFixed(6)}`);
// M 성분별 비율 (지배력·관통 동일 → 약분)
const critRatio = (Dc) => (1 + C.마크댐 / Dc) / (1 + C.물크댐 / Dc);
const 물합 = Math.min(C.물최소, C.물최대) + C.물최대; // cap 적용 8103+8103
const 마합 = Math.min(C.마최소, C.마최대) + C.마최대;
const dmgRatioProp = 마합 / 물합; // D_dmg→0 (비례) 극한
console.log(`  (min cap 후) 물 min+max = ${물합}, 마 = ${마합}, 비례 dmg 비율 = ${dmgRatioProp.toFixed(6)}`);
console.log(`  크댐 비율 한계: D→0 에서 ${(C.마크댐 / C.물크댐).toFixed(6)}, D=133.73 에서 ${critRatio(133.73).toFixed(6)}`);
console.log(`  [가설A] dmg 비례 × 크댐: 필요 크댐비율 = ${(needM / dmgRatioProp).toFixed(6)}`);
// 필요 크댐 비율 → D_crit 해
const needCrit = needM / dmgRatioProp;
const Dc = (C.마크댐 - needCrit * C.물크댐) / (needCrit - 1);
console.log(`    → D_crit 해 = ${Dc.toFixed(2)}  (양수·현실적이면 가설A 성립)`);
// 참고: cap 미적용(8392+8103) 시
const 물합nc = C.물최소 + C.물최대;
const needCritNc = needM / (마합 / 물합nc);
const Dcnc = (C.마크댐 - needCritNc * C.물크댐) / (needCritNc - 1);
console.log(`  [참고] min cap 미적용 시 필요 크댐비율 ${needCritNc.toFixed(6)} → D_crit = ${Dcnc.toFixed(2)} (음수면 모순)`);
// 명중률 포함 가설
const hitRatio = C.명중마 / C.명중물;
console.log(`  [가설B] 명중률(${C.명중물}/${C.명중마}) 곱 포함: 비율 ${hitRatio.toFixed(6)} → 필요 크댐×dmg = ${(needM / hitRatio).toFixed(6)}`);

console.log('\n═══ 5. 직/소 dom 기울기 비율 = ab_d/ab_s (M 약분) ═══');
const domSlope = (key) => (SHOTS[0][key] - SHOTS[5][key]) / 5;
console.log(`  마: 직 ${domSlope('md').toFixed(1)} / 소 ${domSlope('ms').toFixed(1)} → ab_d/ab_s = ${(domSlope('md') / domSlope('ms')).toFixed(6)}  (직/소 실측비 ${(SHOTS[0].md / SHOTS[0].ms).toFixed(6)})`);
console.log(`  물: 직 ${domSlope('pd').toFixed(1)} / 소 ${domSlope('ps').toFixed(1)} → ab_d/ab_s = ${(domSlope('pd') / domSlope('ps')).toFixed(6)}  (직/소 실측비 ${(SHOTS[0].pd / SHOTS[0].ps).toFixed(6)})`);

console.log('\n═══ 6. 현행 V_BIG28 모델 예측 오차 (마법 패널 = 학습 대상 형식) ═══');
for (const s of SHOTS) {
  const stats = {
    type: 'M', 주스탯: C.마법력, 공격력: C.속성력, 관통: C.관통,
    크댐: C.마크댐, 최소뎀: C.마최소, 최대뎀: C.마최대, 고댐: C.마고댐,
    일몬추: C.일몬추, 보몬추: C.보몬추, 일몬지: s.d1, 보몬지: s.d2, 근마효율: s.g,
  };
  const bp = calculateBattlePower(stats, 'base');
  const dir = calculateDirectBP(stats, 'base');
  const sum = calculateSummonBP(stats);
  const e = (a, b) => (((a - b) / b) * 100).toFixed(3) + '%';
  console.log(`  ${s.n}: 종합 ${e(bp, s.bp)}  직 ${e(dir, s.md)}  소 ${e(sum, s.ms)}`);
}
