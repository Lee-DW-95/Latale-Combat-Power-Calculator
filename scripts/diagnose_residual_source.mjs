// 잔차의 진짜 원인 정량 분석 — 어느 스탯이 가장 fit 어려운가?
//
// 핵심 가설:
//   1. 표시값 반올림 노이즈 — 정수/1자리소수 표시값이 실제값 cap
//      • 근마효율 21% 표시 → 실제 20.5~21.5 가능 → K_cross × 1% = ~0.2% BP
//      • 일몬지 75.1 표시 → 실제 75.05~75.14 → 0.045% BP
//      • 관통 99 표시 → 정수, 0.5 단위 노이즈 → 0.4% BP
//   2. 페어 sensitivity (카톡) 는 0.03% 정확 → 모델 구조는 정확
//   3. 다른 캐릭간 절대값 (cross-character) 만 빗나감 → 캐릭별 미세 차이

import { readFileSync } from 'node:fs';
import {
  calculateBattlePower, calculateDirectBP, calculateSummonBP,
  PHYSICAL_PARAMS, MAGIC_PARAMS,
} from '../src/utils/battlePower.js';

const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const cases = sample.filter((d) => d.직접타격 && d.소환타격 && d.최소뎀 <= d.최대뎀);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('A. 표시값 반올림 노이즈 (irreducible) 정량 분석');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('   각 스탯 표시값의 ±0.5 단위 노이즈가 BP 에 주는 영향');
console.log();

function bpSensitivity(c, key, delta) {
  const cc = { ...c };
  cc[key] = (Number(cc[key]) || 0) + delta;
  return calculateBattlePower(cc, 'base');
}

const noiseProfile = [
  { key: '관통',      delta: 0.5,  unit: '정수',     note: '99 표시 → 실제 98.5~99.5' },
  { key: '근마효율',  delta: 0.5,  unit: '정수',     note: '21% 표시 → 실제 20.5~21.5' },
  { key: '일몬지',    delta: 0.05, unit: '1자리소수', note: '75.1 표시 → 실제 75.05~75.14' },
  { key: '보몬지',    delta: 0.05, unit: '1자리소수', note: '82.9 표시 → 실제 82.85~82.94' },
  { key: '크댐',      delta: 0.5,  unit: '정수',     note: '10153 표시 → 실제 10152.5~10153.5' },
  { key: '최소뎀',    delta: 0.5,  unit: '정수',     note: '비슷' },
  { key: '최대뎀',    delta: 0.5,  unit: '정수',     note: '비슷' },
  { key: '주스탯',    delta: 0.5,  unit: '정수',     note: '큰 숫자, 노이즈 무의미' },
  { key: '공격력',    delta: 0.5,  unit: '정수',     note: '7만대, 노이즈 작음' },
  { key: '고댐',      delta: 0.5,  unit: '정수',     note: '90만대, 노이즈 작음' },
  { key: '일몬추',    delta: 0.5,  unit: '정수',     note: '비슷' },
  { key: '보몬추',    delta: 0.5,  unit: '정수',     note: '비슷' },
];

// 대표 케이스 (자료9, 자료11, 기존1) 에서 측정
const examples = ['자료9_고스펙_근10M', '자료11_마법_관통97', '기존1', 'img14_로그마스터'];
for (const exName of examples) {
  const c = cases.find((d) => d.name === exName);
  if (!c) continue;
  const baseBP = calculateBattlePower(c, 'base');
  console.log(`[${c.name}]  실측 BP ${c.전투력.toLocaleString()}  예측 BP ${baseBP.toLocaleString()}`);
  console.log(`   스탯       표시값노이즈   BP 변화율(±절반)   누적노이즈 (RSS)`);
  let totalRSS = 0;
  for (const { key, delta } of noiseProfile) {
    const bpHigh = bpSensitivity(c, key, delta);
    const bpLow  = bpSensitivity(c, key, -delta);
    const halfPct = Math.abs((bpHigh - bpLow) / (2 * baseBP) * 100);
    totalRSS += halfPct * halfPct;
    if (halfPct > 0.001) {
      console.log(`   ${key.padEnd(8)}  ±${delta}            ±${halfPct.toFixed(3)}%`);
    }
  }
  console.log(`   ────────────────────────────────────────`);
  console.log(`   RSS (제곱합 √) = ±${Math.sqrt(totalRSS).toFixed(3)}%  ← 표시값 노이즈만으로 발생 가능한 잔차`);
  console.log();
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('B. 어느 스탯 변경이 BP elasticity 가장 큰가? (모델 sensitivity)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const c0 = cases.find((d) => d.name === '자료6_세이버'); // 대표 케이스
const baseBP = calculateBattlePower(c0, 'base');
console.log(`\n[기준: 자료6_세이버, BP ${baseBP.toLocaleString()}]`);
console.log(`각 스탯 1% 증가 시 BP 변화율 (elasticity):`);

const elasticityKeys = ['주스탯', '공격력', '크댐', '최소뎀', '최대뎀', '고댐', '일몬추', '보몬추', '일몬지', '보몬지', '근마효율', '관통'];
const elasticities = [];
for (const key of elasticityKeys) {
  const cc = { ...c0 };
  cc[key] = (Number(cc[key]) || 0) * 1.01;
  const newBP = calculateBattlePower(cc, 'base');
  const elasticity = (newBP - baseBP) / baseBP * 100;
  elasticities.push({ key, elasticity });
}
elasticities.sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));
for (const { key, elasticity } of elasticities) {
  const bar = '█'.repeat(Math.min(40, Math.round(Math.abs(elasticity) * 40)));
  console.log(`   ${key.padEnd(8)}  ${elasticity >= 0 ? '+' : ''}${elasticity.toFixed(3)}%   ${bar}`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('C. 잔차 vs 각 변수 상관관계 (어느 변수가 잔차 패턴 만드는가)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function correl(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const residuals = cases.map((d) => {
  const pred = calculateBattlePower(d, 'base');
  return { d, e: (pred - d.전투력) / d.전투력 * 100 };
});

console.log('\n각 변수 vs 종합 잔차:');
for (const v of elasticityKeys) {
  const r = correl(residuals.map((x) => Number(x.d[v] || 0)), residuals.map((x) => x.e));
  const mark = Math.abs(r) > 0.5 ? '⚠' : Math.abs(r) > 0.3 ? '~' : ' ';
  console.log(`   ${v.padEnd(8)}  r = ${r >= 0 ? '+' : ''}${r.toFixed(3)}  ${mark}`);
}

// 직/소 비율
const dsRatios = residuals.map((x) => x.d.직접타격 / x.d.소환타격);
const r_ds = correl(dsRatios, residuals.map((x) => x.e));
console.log(`   직/소비율  r = ${r_ds >= 0 ? '+' : ''}${r_ds.toFixed(3)}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('D. 가장 어려운 케이스 5개의 잔차 부호 패턴');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const top = [...residuals].sort((a, b) => Math.abs(b.e) - Math.abs(a.e)).slice(0, 6);
console.log('case               type 관통  근마  일몬지+보몬지  직/소  잔차');
for (const { d, e } of top) {
  const ds = (d.직접타격 / d.소환타격).toFixed(3);
  const dom = (d.일몬지 + d.보몬지).toFixed(1);
  const buf = d.최소뎀 > d.최대뎀 ? ' (수련의방, 학습외)' : '';
  console.log(`${d.name.padEnd(20)} ${d.type}    ${String(d.관통).padStart(2)}   ${String(d.근마효율).padStart(3)}   ${dom.padStart(6)}        ${ds}  ${e >= 0 ? '+' : ''}${e.toFixed(2)}%${buf}`);
}
