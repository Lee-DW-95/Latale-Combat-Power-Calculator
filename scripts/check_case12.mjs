import {
  calculateBattlePower, calculateDirectBP, calculateSummonBP,
} from '../src/utils/battlePower.js';

const c = {
  name: '자료12_고스펙_물리_고일몬추',
  type: 'P',
  전투력: 6517360,
  직접타격: 6508949,
  소환타격: 6525771,
  주스탯: 8098321,
  공격력: 78757,
  관통: 99,
  크댐: 10689,
  최소뎀: 8385,
  최대뎀: 8422,
  고댐: 918520,
  일몬추: 2371321,
  보몬추: 1113021,
  일몬지: 90.6,
  보몬지: 80.2,
  근마효율: 21,
  기본_주스탯: 1281380,
  기본_공격력: 13974,
  기본_크댐: 7272,
  기본_최소뎀: 5947,
  기본_최대뎀: 6103,
  기본_고댐: 493828,
  기본_일몬추: 1370706,
  기본_보몬추: 984975,
};

console.log('━ 누적% 검산 ━');
const baseKeys = [['주스탯','근력'], ['공격력','공격력'], ['크댐','크댐'], ['최소뎀','최소뎀'], ['최대뎀','최대뎀'], ['고댐','고댐'], ['일몬추','일몬추'], ['보몬추','보몬추']];
for (const [k, label] of baseKeys) {
  const cum = (c[k] - c[`기본_${k}`]) / c[`기본_${k}`] * 100;
  console.log(`  ${label.padEnd(6)}  ${c[k].toLocaleString().padStart(10)} / ${c[`기본_${k}`].toLocaleString().padStart(10)} = 누적 ${cum.toFixed(2)}%`);
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const totP = calculateBattlePower(c, 'base');
const dirP = calculateDirectBP(c, 'base');
const sumP = calculateSummonBP(c);

console.log('\n━ 현재 V_BIG8 (자료10/11 학습 후) 예측 ━');
console.log(`종합 BP   실측 ${fmt(c.전투력)}  예측 ${fmt(totP)}  오차 ${((totP-c.전투력)/c.전투력*100).toFixed(3)}%`);
console.log(`직접타격  실측 ${fmt(c.직접타격)}  예측 ${fmt(dirP)}  오차 ${((dirP-c.직접타격)/c.직접타격*100).toFixed(3)}%`);
console.log(`소환타격  실측 ${fmt(c.소환타격)}  예측 ${fmt(sumP)}  오차 ${((sumP-c.소환타격)/c.소환타격*100).toFixed(3)}%`);
console.log(`  직/소 비율: ${(c.직접타격/c.소환타격).toFixed(3)}  예측: ${(dirP/sumP).toFixed(3)}`);

console.log('\n━ 자료10 vs 자료12 비교 (같은 영역 데이터) ━');
console.log(`  자료10: 일몬추 2.37M, 보몬추 1.24M, 일몬지 87.6, 보몬지 80.4, 근마 21, M타입`);
console.log(`  자료12: 일몬추 2.37M, 보몬추 1.11M, 일몬지 90.6, 보몬지 80.2, 근마 21, P타입`);
console.log(`  → 일몬추 OPT 누적 73% 영역이 처음으로 2건 → 학습 가능`);
