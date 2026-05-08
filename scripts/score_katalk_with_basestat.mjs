// 사용자 제공 기본스탯 기반 정확한 표시값 추론 후 V_BIG4 채점.
//
// 기본스탯(베이스 능력치) — 사용자 제공:
//   근력 1350799, 공격력 13434, 크댐 6468, 최소 5913, 최대 6283,
//   고댐 446155, 일몬추 999064, 보몬추 1001383
//
// 메커니즘 검증 (텍스트에 명시된 새 표시값과 비교):
//   "X -N%"  = 누적% -Npp        (예: 근력 -2% → 새 표시 = baseRaw × (1+누적-0.02))
//   "깡X -A" = 기본 -A           (예: 깡근력 -1000 → 새 기본 = baseRaw - 1000)
//   "깡X -N%" = 기본 × (1-N/100) (예: 깡크댐 -10% → 새 기본 = baseRaw × 0.9)

import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
} from '../src/utils/battlePower.js';

const baseStats = {
  type: 'P',
  주스탯: 8112370, 공격력: 66821, 관통: 98, 크댐: 9014,
  최소뎀: 8396, 최대뎀: 8670, 고댐: 789694, 일몬추: 1128458, 보몬추: 1141576,
  일몬지: 69.5, 보몬지: 81.3, 근마효율: 27,
};

const baseRaw = {
  주스탯: 1350799, 공격력: 13434, 크댐: 6468, 최소뎀: 5913, 최대뎀: 6283,
  고댐: 446155, 일몬추: 999064, 보몬추: 1001383,
};

const cumPct = {};
for (const k of Object.keys(baseRaw)) {
  cumPct[k] = baseStats[k] / baseRaw[k] - 1;
}

console.log('═'.repeat(80));
console.log('누적% 도출 (표시값/기본 - 1)');
console.log('═'.repeat(80));
for (const [k, v] of Object.entries(cumPct)) {
  console.log(`  ${k.padEnd(8)} 기본 ${baseRaw[k].toString().padStart(8)}  표시 ${baseStats[k].toString().padStart(8)}  → 누적 ${(v * 100).toFixed(2)}%`);
}

// 메커니즘 가정으로 정확한 새 표시값 추론
const fmt = (n) => Math.round(n).toLocaleString();
const sign = (n) => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString();

const cases = [
  { label: 'BASE',                        stat: null, mechanism: '-',
    실측_종합: 4779114, 실측_직접: 4663530, 실측_소환: 4894698 },
  { label: '근력 -2%',                    stat: '주스탯',
    mechanism: '누적-2pp',
    new: baseRaw.주스탯 * (1 + cumPct.주스탯 - 0.02),
    expected: 8085284,
    실측_종합: 4770945, 실측_직접: 4659919, 실측_소환: 4882971 },
  { label: '무공 -1%',                    stat: '공격력',
    mechanism: '누적-1pp',
    new: baseRaw.공격력 * (1 + cumPct.공격력 - 0.01),
    expected: 66688,
    실측_종합: 4775306, 실측_직접: 4657525, 실측_소환: 4893088 },
  { label: '보몬지 -2%',                  stat: '보몬지',
    mechanism: '직접-2',
    new: 79.3,
    expected: 79.3,
    실측_종합: 4751867, 실측_직접: 4636942, 실측_소환: 4866792 },
  { label: '깡근력 -1000',                stat: '주스탯',
    mechanism: '기본-1000',
    new: (baseRaw.주스탯 - 1000) * (1 + cumPct.주스탯),
    expected: 8106380,
    실측_종합: 4777307, 실측_직접: 4662510, 실측_소환: 4892104 },
  { label: '무공 -10',                    stat: '공격력',
    mechanism: '기본-10',
    new: (baseRaw.공격력 - 10) * (1 + cumPct.공격력),
    expected: 66771,
    실측_종합: 4777660, 실측_직접: 4661238, 실측_소환: 4894083 },
  { label: '고댐 -1%',                    stat: '고댐',
    mechanism: '누적-1pp',
    new: baseRaw.고댐 * (1 + cumPct.고댐 - 0.01),
    expected: null,
    실측_종합: 4778145, 실측_직접: 4662921, 실측_소환: 4893369 },
  { label: '고댐 -1500 (가설a 표시-1500)',  stat: '고댐',
    mechanism: '표시-1500',
    new: 788194,
    expected: null,
    실측_종합: 4778537, 실측_직접: 4663167, 실측_소환: 4893907 },
  { label: '고댐 -1500 (가설b 기본-1500)',  stat: '고댐',
    mechanism: '기본-1500',
    new: (baseRaw.고댐 - 1500) * (1 + cumPct.고댐),
    expected: null,
    실측_종합: 4778537, 실측_직접: 4663167, 실측_소환: 4893907 },
  { label: '일몬추 -200 (기본-200)',       stat: '일몬추',
    mechanism: '기본-200',
    new: (baseRaw.일몬추 - 200) * (1 + cumPct.일몬추),
    expected: null,
    실측_종합: 4779089, 실측_직접: 4663514, 실측_소환: 4894664 },
  { label: '보몬추 -200 (기본-200)',       stat: '보몬추',
    mechanism: '기본-200',
    new: (baseRaw.보몬추 - 200) * (1 + cumPct.보몬추),
    expected: null,
    실측_종합: 4779089, 실측_직접: 4663514, 실측_소환: 4894664 },
  { label: '일몬추 -1%',                  stat: '일몬추',
    mechanism: '누적-1pp',
    new: baseRaw.일몬추 * (1 + cumPct.일몬추 - 0.01),
    expected: null,
    실측_종합: 4778029, 실측_직접: 4662848, 실측_소환: 4893211 },
  { label: '보몬추 -1%',                  stat: '보몬추',
    mechanism: '누적-1pp',
    new: baseRaw.보몬추 * (1 + cumPct.보몬추 - 0.01),
    expected: null,
    실측_종합: 4778027, 실측_직접: 4662847, 실측_소환: 4893207 },
  { label: '깡최소뎀 -10 (기본-10)',       stat: '최소뎀',
    mechanism: '기본-10',
    new: (baseRaw.최소뎀 - 10) * (1 + cumPct.최소뎀),
    expected: null,
    실측_종합: 4775193, 실측_직접: 4659703, 실측_소환: 4890683 },
  { label: '깡크댐 -10 (기본-10)',         stat: '크댐',
    mechanism: '기본-10',
    new: (baseRaw.크댐 - 10) * (1 + cumPct.크댐),
    expected: null,
    실측_종합: 4771759, 실측_직접: 4655366, 실측_소환: 4887152 },
  { label: '최종최소 -1%',                stat: '최소뎀',
    mechanism: '누적-1pp',
    new: baseRaw.최소뎀 * (1 + cumPct.최소뎀 - 0.01),
    expected: null,
    실측_종합: 4762591, 실측_직접: 4647407, 실측_소환: 4877775 },
  { label: '최종최대 -1%',                stat: '최대뎀',
    mechanism: '누적-1pp',
    new: baseRaw.최대뎀 * (1 + cumPct.최대뎀 - 0.01),
    expected: null,
    실측_종합: 4761471, 실측_직접: 4646314, 실측_소환: 4876629 },
  { label: '최종크 -1%',                  stat: '크댐',
    mechanism: '누적-1pp',
    new: baseRaw.크댐 * (1 + cumPct.크댐 - 0.01),
    expected: null,
    실측_종합: 4744967, 실측_직접: 4630270, 실측_소환: 4859664 },
  { label: '근마효율 -1%',                stat: '근마효율',
    mechanism: '직접-1',
    new: 26,
    expected: 26,
    실측_종합: 4768241, 실측_직접: 4641784, 실측_소환: 4894698 },
];

// 메커니즘 검증 (텍스트 명시된 새 표시값과 비교)
console.log(`\n${'═'.repeat(80)}`);
console.log('메커니즘 검증 — 추론 vs 텍스트 명시');
console.log('═'.repeat(80));
for (const c of cases) {
  if (c.expected != null && c.stat) {
    const inferred = c.new;
    const diff = c.expected - inferred;
    const okMark = Math.abs(diff) < 50 ? '✓' : '✗';
    console.log(`  ${okMark} ${c.label.padEnd(28)} 추론 ${fmt(inferred).padStart(10)}  vs 명시 ${fmt(c.expected).padStart(10)}  (차이 ${diff >= 0 ? '+' : ''}${Math.round(diff)})`);
  }
}

// 채점
console.log(`\n${'═'.repeat(110)}`);
console.log('정확한 메커니즘 기반 V_BIG4 채점 — Δ분석 (실측 vs 모델 예측)');
console.log('═'.repeat(110));
console.log(`${'케이스'.padEnd(34)} ${'메커니즘'.padEnd(11)} ${'Δ표시'.padStart(10)}   ${'Δ실측종합'.padStart(10)} ${'Δ예측종합'.padStart(10)} ${'Δ오차종합'.padStart(10)} ${'예측%'.padStart(8)}`);
console.log('─'.repeat(110));

const baseStatsAdj = { ...baseStats };
const baseBP = {
  종합: calculateBattlePower(baseStatsAdj),
  직접: calculateDirectBP(baseStatsAdj),
  소환: calculateSummonBP(baseStatsAdj),
};

const errorsByCase = [];
for (const c of cases) {
  const stats = c.stat ? { ...baseStats, [c.stat]: c.new } : { ...baseStats };
  const pred = {
    종합: calculateBattlePower(stats),
    직접: calculateDirectBP(stats),
    소환: calculateSummonBP(stats),
  };
  const display전 = c.stat ? baseStats[c.stat] : 0;
  const display후 = c.stat ? c.new : 0;
  const dDisplay = c.stat ? display후 - display전 : 0;
  const dActual = c.실측_종합 - cases[0].실측_종합;
  const dPred = pred.종합 - baseBP.종합;
  const errAbs = pred.종합 - c.실측_종합;
  const errPct = (errAbs / c.실측_종합) * 100;

  console.log(
    `${c.label.padEnd(34)} ${c.mechanism.padEnd(11)} ${(dDisplay !== 0 ? sign(dDisplay) : '-').padStart(10)}   ${sign(dActual).padStart(10)} ${sign(dPred).padStart(10)} ${sign(dPred - dActual).padStart(10)} ${(errPct >= 0 ? '+' : '') + errPct.toFixed(3) + '%'}`
  );

  if (c.label !== 'BASE') {
    errorsByCase.push({ label: c.label, e_종합: errPct, e_직접: ((pred.직접 - c.실측_직접) / c.실측_직접) * 100, e_소환: ((pred.소환 - c.실측_소환) / c.실측_소환) * 100 });
  }
}

const rmse = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
const maxAbs = (xs) => Math.max(...xs.map(Math.abs));

console.log(`\n${'─'.repeat(80)}`);
console.log('정확한 메커니즘 가정 — 종합 RMSE / max');
const e종합 = errorsByCase.map((x) => x.e_종합);
const e직접 = errorsByCase.map((x) => x.e_직접);
const e소환 = errorsByCase.map((x) => x.e_소환);
console.log(`종합  RMSE ${rmse(e종합).toFixed(3)}%  max ${maxAbs(e종합).toFixed(3)}%`);
console.log(`직접  RMSE ${rmse(e직접).toFixed(3)}%  max ${maxAbs(e직접).toFixed(3)}%`);
console.log(`소환  RMSE ${rmse(e소환).toFixed(3)}%  max ${maxAbs(e소환).toFixed(3)}%`);

console.log(`\n참고: V_BIG4 모델은 raw -14 가정으로 학습된 상태`);
console.log(`     이 채점은 정확한 메커니즘 가정으로 변경된 새 표시값 기반`);
console.log(`     → 두 가정의 fit 차이로 모델 학습 가정의 정확성 평가`);
