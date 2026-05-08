// 카톡 페어 데이터 17건 채점 — 베이스 + 변화별 종합/직접/소환 BP 비교
//
// 사용자 제공 (전투력.txt) — 베이스 캐릭(물리)에서 한 스탯만 변경한 페어들.
// 모델은 표시값만 입력으로 받으므로 깡/누적%는 알 필요 없음 (표시값 변화 자체로 비교).

import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
} from '../src/utils/battlePower.js';

const base = {
  type: 'P',
  주스탯: 8112370,
  공격력: 66821,
  관통: 98,
  크댐: 9014,
  최소뎀: 8396,
  최대뎀: 8670,
  고댐: 789694,
  일몬추: 1128458,
  보몬추: 1141576,
  일몬지: 69.5,
  보몬지: 81.3,
  근마효율: 27,
};

// 각 케이스: stats 변경(absolute set), 실측 종합/직접/소환
// "최종X" 항목들은 표시값을 직접 -1% 한 것으로 가정 (게임 내 표기 추정).
const cases = [
  { label: 'BASE',                     diff: {},                                          종합: 4779114, 직접: 4663530, 소환: 4894698 },
  { label: '근력 -2% (표시 -27086)',   diff: { 주스탯: 8085284 },                         종합: 4770945, 직접: 4659919, 소환: 4882971 },
  { label: '무공 -1% (표시 -133)',     diff: { 공격력: 66688 },                           종합: 4775306, 직접: 4657525, 소환: 4893088 },
  { label: '보몬지 -2% (81.3→79.3)',   diff: { 보몬지: 79.3 },                            종합: 4751867, 직접: 4636942, 소환: 4866792 },
  { label: '깡근력 -1000 (표시 -5990)',diff: { 주스탯: 8106380 },                         종합: 4777307, 직접: 4662510, 소환: 4892104 },
  { label: '무공 -10 (표시 -50)',      diff: { 공격력: 66771 },                           종합: 4777660, 직접: 4661238, 소환: 4894083 },
  { label: '고댐 -1% (표시값)',        diff: { 고댐: Math.round(789694 * 0.99) },         종합: 4778145, 직접: 4662921, 소환: 4893369 },
  { label: '고댐 -1500',               diff: { 고댐: 788194 },                            종합: 4778537, 직접: 4663167, 소환: 4893907 },
  { label: '일몬추 -200',              diff: { 일몬추: 1128258 },                         종합: 4779089, 직접: 4663514, 소환: 4894664 },
  { label: '보몬추 -200',              diff: { 보몬추: 1141376 },                         종합: 4779089, 직접: 4663514, 소환: 4894664 },
  { label: '일몬추 -1% (표시값)',      diff: { 일몬추: Math.round(1128458 * 0.99) },      종합: 4778029, 직접: 4662848, 소환: 4893211 },
  { label: '보몬추 -1% (표시값)',      diff: { 보몬추: Math.round(1141576 * 0.99) },      종합: 4778027, 직접: 4662847, 소환: 4893207 },
  { label: '깡최소뎀 -10% (raw -14)',  diff: { 최소뎀: 8396 - 14 },                       종합: 4775193, 직접: 4659703, 소환: 4890683 },
  { label: '깡크댐 -10% (raw -14)',    diff: { 크댐: 9014 - 14 },                         종합: 4771759, 직접: 4655366, 소환: 4887152 }, // line 60 원문 4656... 추정 typo
  { label: '최종최소 -1% (표시값)',    diff: { 최소뎀: Math.round(8396 * 0.99) },         종합: 4762591, 직접: 4647407, 소환: 4877775 },
  { label: '최종최대 -1% (표시값)',    diff: { 최대뎀: Math.round(8670 * 0.99) },         종합: 4761471, 직접: 4646314, 소환: 4876629 },
  { label: '최종크 -1% (표시값)',      diff: { 크댐: Math.round(9014 * 0.99) },           종합: 4744967, 직접: 4630270, 소환: 4859664 },
  { label: '근마효율 -1% (27→26)',     diff: { 근마효율: 26 },                            종합: 4768241, 직접: 4641784, 소환: 4894698 },
];

const fmt = (n) => n.toLocaleString();
const pct = (p) => (p >= 0 ? '+' : '') + p.toFixed(3) + '%';

console.log('═'.repeat(112));
console.log('카톡 페어 17건 — V_BIG3 채점 (표시값 그대로 입력)');
console.log('═'.repeat(112));
console.log(
  ['케이스'.padEnd(34), '항목'.padEnd(6), '실측'.padStart(11), '예측'.padStart(11), '오차'.padStart(11), '오차%'.padStart(10)].join(' ')
);
console.log('─'.repeat(112));

const errors = { 종합: [], 직접: [], 소환: [] };

for (const c of cases) {
  const stats = { ...base, ...c.diff };
  const pred = {
    종합: calculateBattlePower(stats),
    직접: calculateDirectBP(stats),
    소환: calculateSummonBP(stats),
  };
  for (const which of ['종합', '직접', '소환']) {
    const e = pred[which] - c[which];
    const ePct = (e / c[which]) * 100;
    if (c.label !== 'BASE') errors[which].push(ePct);
    console.log(
      [
        c.label.padEnd(34),
        which.padEnd(6),
        fmt(c[which]).padStart(11),
        fmt(pred[which]).padStart(11),
        (e >= 0 ? '+' : '') + fmt(e).padStart(10),
        pct(ePct).padStart(10),
      ].join(' ')
    );
  }
  console.log('─'.repeat(112));
}

const rmse = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
const maxAbs = (xs) => Math.max(...xs.map((x) => Math.abs(x)));

console.log('\n========= 페어 (BASE 제외) RMSE / 최대 오차 =========');
for (const which of ['종합', '직접', '소환']) {
  const xs = errors[which];
  console.log(
    `${which} — RMSE=${rmse(xs).toFixed(3)}%   |오차|max=${maxAbs(xs).toFixed(3)}%   n=${xs.length}`
  );
}

// ───────────────────────────────────────────────────────────────
// Δ 분석 — 페어 단위 BP 변화량 비교 (모델 미세 정확도 평가에 더 유용)
// ───────────────────────────────────────────────────────────────
console.log('\n═'.repeat(112));
console.log('페어 Δ 분석 — BASE 대비 BP 변화량 (실측 Δ vs 예측 Δ)');
console.log('═'.repeat(112));
console.log(
  ['케이스'.padEnd(34), '항목'.padEnd(6), 'Δ실측'.padStart(10), 'Δ예측'.padStart(10), 'Δ오차'.padStart(10)].join(' ')
);
console.log('─'.repeat(112));

const baseStats = { ...base };
const basePred = {
  종합: calculateBattlePower(baseStats),
  직접: calculateDirectBP(baseStats),
  소환: calculateSummonBP(baseStats),
};

for (const c of cases) {
  if (c.label === 'BASE') continue;
  const stats = { ...base, ...c.diff };
  const pred = {
    종합: calculateBattlePower(stats),
    직접: calculateDirectBP(stats),
    소환: calculateSummonBP(stats),
  };
  for (const which of ['종합', '직접', '소환']) {
    const dActual = c[which] - cases[0][which];
    const dPred = pred[which] - basePred[which];
    const err = dPred - dActual;
    console.log(
      [
        c.label.padEnd(34),
        which.padEnd(6),
        ((dActual >= 0 ? '+' : '') + fmt(dActual)).padStart(10),
        ((dPred >= 0 ? '+' : '') + fmt(dPred)).padStart(10),
        ((err >= 0 ? '+' : '') + fmt(err)).padStart(10),
      ].join(' ')
    );
  }
}
