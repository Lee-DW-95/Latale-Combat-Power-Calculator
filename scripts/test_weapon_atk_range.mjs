// 가설: 게임이 무기공격력 max 가 아닌 min/avg 사용
// 자료6/9/12 의 min~max 범위가 알려졌으니 각 가정으로 model BP 예측해서 잔차 비교
//
// 게임 가능성:
//   A) max 사용 (현재 우리 모델)
//   B) min 사용
//   C) avg 사용 ((min+max)/2)
//   D) min/max 별 다른 BP 계산

import {
  calculateBattlePower, calculateDirectBP, calculateSummonBP,
} from '../src/utils/battlePower.js';

const cases = [
  {
    name: '자료6_세이버',
    type: 'P', 전투력: 6150950, 직접타격: 6154329, 소환타격: 6147571,
    공격력_min: 78388, 공격력_max: 79835,
    주스탯: 9037319, 관통: 99, 크댐: 10219, 최소뎀: 8086, 최대뎀: 8890,
    고댐: 1044057, 일몬추: 1138796, 보몬추: 1078681, 일몬지: 65.5, 보몬지: 78.2, 근마효율: 33,
  },
  {
    name: '자료9_고스펙_근10M',
    type: 'P', 전투력: 6122119, 직접타격: 5557524, 소환타격: 6686715,
    공격력_min: 57819, 공격력_max: 59080,
    주스탯: 10029984, 관통: 99, 크댐: 10153, 최소뎀: 8682, 최대뎀: 8690,
    고댐: 1096834, 일몬추: 1119535, 보몬추: 1113885, 일몬지: 75.1, 보몬지: 82.9, 근마효율: 32,
  },
  {
    name: '자료12_고스펙_물리_고일몬추',
    type: 'P', 전투력: 6517360, 직접타격: 6508949, 소환타격: 6525771,
    공격력_min: 76683, 공격력_max: 78757,
    주스탯: 8098321, 관통: 99, 크댐: 10689, 최소뎀: 8385, 최대뎀: 8422,
    고댐: 918520, 일몬추: 2371321, 보몬추: 1113021, 일몬지: 90.6, 보몬지: 80.2, 근마효율: 21,
  },
];

console.log('━ 각 케이스 무기공격력 가정별 잔차 비교 ━\n');
console.log('case                 가정    공격력    종합잔차    직접잔차    소환잔차');
console.log('-'.repeat(85));

for (const c of cases) {
  const variants = [
    { label: 'max (현재)', atk: c.공격력_max },
    { label: 'avg',       atk: (c.공격력_min + c.공격력_max) / 2 },
    { label: 'min',       atk: c.공격력_min },
  ];
  for (const { label, atk } of variants) {
    const cc = { ...c, 공격력: atk };
    const tot = calculateBattlePower(cc, 'base');
    const dir = calculateDirectBP(cc, 'base');
    const sum = calculateSummonBP(cc);
    const e_tot = (tot - c.전투력) / c.전투력 * 100;
    const e_dir = (dir - c.직접타격) / c.직접타격 * 100;
    const e_sum = (sum - c.소환타격) / c.소환타격 * 100;
    const sign = (v) => (v >= 0 ? '+' : '') + v.toFixed(3) + '%';
    console.log(`${c.name.padEnd(22)} ${label.padEnd(8)} ${atk.toFixed(1).padStart(8)}    ${sign(e_tot).padStart(8)}    ${sign(e_dir).padStart(8)}    ${sign(e_sum).padStart(8)}`);
  }
  console.log();
}

console.log('━ 해석 ━');
console.log('각 케이스에서 어느 가정이 BP 잔차를 0% 가깝게 만드는가?');
console.log('  - 모든 케이스가 동일한 가정 (예: avg) 에서 best → 게임이 그 값 사용');
console.log('  - 케이스마다 다른 가정 → 게임이 max 사용 (현재 가정 맞음), 잔차는 다른 원인');
