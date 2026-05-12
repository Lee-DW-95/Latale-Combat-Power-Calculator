// 자료10 마법 직업 케이스 — 현재 V_BIG8 모델 예측 vs 실측
import {
  calculateBattlePower, calculateDirectBP, calculateSummonBP,
} from '../src/utils/battlePower.js';

const c = {
  name: '자료10_마법',
  type: 'M',
  전투력: 5820039,
  직접타격: 5712929,
  소환타격: 5927149,
  주스탯: 8052668,
  공격력: 72590,
  관통: 99,
  크댐: 10361,
  최소뎀: 7947,
  최대뎀: 8087,
  고댐: 947961,
  일몬추: 2370279,
  보몬추: 1241950,
  일몬지: 87.6,
  보몬지: 80.4,
  근마효율: 21,
  기본_주스탯: 1344352,
  기본_공격력: 13543,
  기본_크댐: 7297,
  기본_최소뎀: 5844,
  기본_최대뎀: 6081,
  기본_고댐: 496315,
  기본_일몬추: 1370104,
  기본_보몬추: 985675,
};

console.log('━ 누적% 검산 ━');
const cumKeys = [['주스탯','마법력'], ['공격력','속성력'], ['크댐','크댐'], ['최소뎀','최소뎀'], ['최대뎀','최대뎀'], ['고댐','고댐'], ['일몬추','일몬추'], ['보몬추','보몬추']];
for (const [k, label] of cumKeys) {
  const cum = (c[k] - c[`기본_${k}`]) / c[`기본_${k}`] * 100;
  console.log(`  ${label.padEnd(6)}  ${c[k].toLocaleString().padStart(12)} / ${c[`기본_${k}`].toLocaleString().padStart(10)} = 누적 ${cum.toFixed(1)}%`);
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const totP = calculateBattlePower(c, 'base');
const dirP = calculateDirectBP(c, 'base');
const sumP = calculateSummonBP(c);

console.log('\n━ V_BIG8 예측 ━');
console.log(`종합 BP   실측 ${fmt(c.전투력)}  예측 ${fmt(totP)}  오차 ${((totP-c.전투력)/c.전투력*100).toFixed(3)}%`);
console.log(`직접타격  실측 ${fmt(c.직접타격)}  예측 ${fmt(dirP)}  오차 ${((dirP-c.직접타격)/c.직접타격*100).toFixed(3)}%`);
console.log(`소환타격  실측 ${fmt(c.소환타격)}  예측 ${fmt(sumP)}  오차 ${((sumP-c.소환타격)/c.소환타격*100).toFixed(3)}%`);

console.log('\n━ 분포 특이점 ━');
console.log(`  직/소 비율: ${(c.직접타격/c.소환타격).toFixed(3)}`);
console.log(`  일몬추 누적: 73% (이전 케이스 mean 13%)  ← 매우 이례적`);
console.log(`  마법력 누적: 499% (자료9 마법 9.15M / 9.15M의 ~85% 수준)`);
console.log(`  지배력 합: ${(c.일몬지+c.보몬지).toFixed(1)}  (자료9 158.0, 자료6 143.7)`);
