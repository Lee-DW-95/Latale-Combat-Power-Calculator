// 자료11 — 관통 97 첫 케이스. D_pen 함수 형태 검증의 결정적 데이터
import {
  calculateBattlePower, calculateDirectBP, calculateSummonBP,
} from '../src/utils/battlePower.js';

const c = {
  name: '자료11_마법_관통97',
  type: 'M',
  전투력: 3571058,
  직접타격: 3509680,
  소환타격: 3632437,
  주스탯: 6412680,
  공격력: 58586,
  관통: 97,
  크댐: 9346,
  최소뎀: 7848,
  최대뎀: 8048,
  고댐: 931991,
  일몬추: 1169842,
  보몬추: 1062012,
  일몬지: 56.0,
  보몬지: 67.9,
  근마효율: 17,
  기본_주스탯: 1155438,
  기본_공격력: 11694,
  기본_크댐: 6536,
  기본_최소뎀: 5566,
  기본_최대뎀: 5832,
};

console.log('━ 누적% 검산 (확인된 base 만) ━');
const baseKeys = [['주스탯','마법력'], ['공격력','속성력'], ['크댐','크댐'], ['최소뎀','최소뎀'], ['최대뎀','최대뎀']];
for (const [k, label] of baseKeys) {
  const cum = (c[k] - c[`기본_${k}`]) / c[`기본_${k}`] * 100;
  console.log(`  ${label.padEnd(6)}  ${c[k].toLocaleString().padStart(10)} / ${c[`기본_${k}`].toLocaleString().padStart(10)} = 누적 ${cum.toFixed(1)}%`);
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const totP = calculateBattlePower(c, 'base');
const dirP = calculateDirectBP(c, 'base');
const sumP = calculateSummonBP(c);

console.log('\n━ 현재 V_BIG8 예측 (D_pen=25) ━');
console.log(`종합 BP   실측 ${fmt(c.전투력)}  예측 ${fmt(totP)}  오차 ${((totP-c.전투력)/c.전투력*100).toFixed(3)}%`);
console.log(`직접타격  실측 ${fmt(c.직접타격)}  예측 ${fmt(dirP)}  오차 ${((dirP-c.직접타격)/c.직접타격*100).toFixed(3)}%`);
console.log(`소환타격  실측 ${fmt(c.소환타격)}  예측 ${fmt(sumP)}  오차 ${((sumP-c.소환타격)/c.소환타격*100).toFixed(3)}%`);
console.log(`  직/소 비율: ${(c.직접타격/c.소환타격).toFixed(3)}  예측: ${(dirP/sumP).toFixed(3)}`);

// 다른 D_pen 값으로 예측해보기 (관통 함수 형태 검증)
console.log('\n━ 관통 함수 형태 검증 (대안 D_pen) ━');
const PARAMS_98 = JSON.parse(JSON.stringify({
  K0: 1.93191290e+0, K1: 1.88487723e+2, K2: 2.26414421e+0,
  K_mon: 4.90018327e-1, K_cross: 2.11519161e-1,
  D_crit: 2.79347706e+2, D_dmg: 2.98679004e-38, D_dom: 1.80494291e+2,
  base: 8.72880940e-46,
}));
const SPLIT = { U: 0.970076, V: 103.188195, W: 0.137772, X: 0.234268 };

function predictBP(c, p, S, D_pen) {
  const maxDmg = Math.max(c.최소뎀, c.최대뎀);
  const minDmg = Math.min(c.최소뎀, c.최대뎀);
  const M = (1 + c.크댐 / p.D_crit)
          * (1 + (minDmg + maxDmg) / p.D_dmg)
          * (1 + (c.일몬지 + c.보몬지) / p.D_dom)
          * (1 + c.관통 / D_pen)
          * p.base;
  const ab = (mode) => {
    let a = p.K0, b = p.K1, g = p.K2, d = p.K_mon;
    if (mode === 'direct') { a -= S.U; b += S.V; g -= S.W; d -= S.X; }
    else { a += S.U; b -= S.V; g += S.W; d += S.X; }
    return a * c.주스탯 + b * c.공격력 + g * c.고댐 + d * (c.일몬추 + c.보몬추);
  };
  const cross = 1 + p.K_cross * c.근마효율 / 100;
  const dir = ab('direct') * cross * M;
  const sum = ab('summon') * M;
  return { avg: (dir + sum) / 2, dir, sum };
}

// 관통 96, 97, 98, 99 비교
console.log('\n관통 N → N+1 예측 변화율 (현재 D_pen=25):');
for (let pen of [96, 97, 98, 99]) {
  const cc = { ...c, 관통: pen };
  const p = predictBP(cc, PARAMS_98, SPLIT, 25);
  const ccNext = { ...c, 관통: pen + 1 };
  const pNext = predictBP(ccNext, PARAMS_98, SPLIT, 25);
  console.log(`  관통 ${pen}→${pen+1}: ${((pNext.avg/p.avg - 1) * 100).toFixed(3)}%  (모델 pred BP@${pen}: ${fmt(p.avg)})`);
}
