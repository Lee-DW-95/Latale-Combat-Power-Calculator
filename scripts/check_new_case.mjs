/**
 * 신규 고스펙 케이스 (전투력 6,122,119) 현재 모델 대비 예측 오차 점검.
 * 직접/소환타격 분리 BP 도 함께 비교.
 */
import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
} from '../src/utils/battlePower.js';

const newCase = {
  name: '자료9_고스펙_근10M',
  type: 'P',
  전투력: 6122119,
  직접타격: 5557524,
  소환타격: 6686715,
  주스탯: 10029984,
  공격력: 59080,
  관통: 99,
  크댐: 10153,
  최소뎀: 8682,
  최대뎀: 8690,
  고댐: 1096834,
  일몬추: 1119535,
  보몬추: 1113885,
  일몬지: 75.1,
  보몬지: 82.9,
  근마효율: 32,
  기본_주스탯: 1453621,
  기본_공격력: 11967,
  기본_크댐: 6769,
  기본_최소뎀: 6072,
  기본_최대뎀: 6390,
  기본_고댐: 496305,
  기본_일몬추: 990739,
  기본_보몬추: 985739,
};

function pct(pred, real) {
  return ((pred - real) / real) * 100;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

const predTotal = calculateBattlePower(newCase, 'base');
const predDirect = calculateDirectBP(newCase, 'base');
const predSummon = calculateSummonBP(newCase);

console.log('━'.repeat(70));
console.log(`Case: ${newCase.name}`);
console.log('━'.repeat(70));
console.log(`종합 BP   실측 ${fmt(newCase.전투력)}  예측 ${fmt(predTotal)}  오차 ${pct(predTotal, newCase.전투력).toFixed(3)}%`);
console.log(`직접타격  실측 ${fmt(newCase.직접타격)}  예측 ${fmt(predDirect)}  오차 ${pct(predDirect, newCase.직접타격).toFixed(3)}%`);
console.log(`소환타격  실측 ${fmt(newCase.소환타격)}  예측 ${fmt(predSummon)}  오차 ${pct(predSummon, newCase.소환타격).toFixed(3)}%`);

// 누적% 분석 (참고용)
console.log();
console.log('━ 누적% 분석 (표시값 / 기본값 - 1) ━');
const pools = ['주스탯', '공격력', '크댐', '최소뎀', '최대뎀', '고댐', '일몬추', '보몬추'];
for (const k of pools) {
  const display = Number(newCase[k] || 0);
  const base = Number(newCase[`기본_${k}`] || 0);
  if (base > 0) {
    const pool = (display - base) / base;
    console.log(`  ${k.padEnd(7)}  ${fmt(display).padStart(12)} / ${fmt(base).padStart(10)} = ${(pool * 100).toFixed(1)}%`);
  }
}

// 직접/소환 비율 (보통 1 근처, 이 케이스는 0.83 → 소환 위주)
console.log();
console.log(`직접/소환 비율: ${(newCase.직접타격 / newCase.소환타격).toFixed(3)} (예측 ${(predDirect / predSummon).toFixed(3)})`);
