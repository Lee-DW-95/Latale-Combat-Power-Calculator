// 무기공격력 min~max 갭의 진짜 원인 분해
//
// 게임 메커니즘 가정:
//   표시 무공 = (기본 무공 + 장비 무공) × (1 + 누적 무공%/100)
//   무기 자체는 min ~ max 범위 (예: "공격력 100 ~ 200")
//   장비 옵션 (% 무공) 은 가산형 → 누적 무공%
//
// 따라서:
//   표시 max - 표시 min = (무기 max - 무기 min) × (1 + 누적%)
//   무기 자체 gap = 표시 gap / (1 + 누적%)
//
// 만약 같은 무기 (같은 자체 gap) 사용한 캐릭이 다른 BP 잔차 보이면 → 무기가 잔차 원인 아님

const cases = [
  {
    name: '자료6_세이버',
    표시_max: 79835, 표시_min: 78388,
    기본_무공: 14116,
    실측_BP: 6150950, 잔차_max가정: +0.17,
  },
  {
    name: '자료9_고스펙_근10M',
    표시_max: 59080, 표시_min: 57819,
    기본_무공: 11967,
    실측_BP: 6122119, 잔차_max가정: +0.62,
  },
  {
    name: '자료12_고스펙_물리_고일몬추',
    표시_max: 78757, 표시_min: 76683,
    기본_무공: 13974,
    실측_BP: 6517360, 잔차_max가정: -0.14,
  },
];

console.log('━ 무기공격력 분해 분석 ━\n');
console.log('case                  표시max  표시min  표시gap   기본무공   누적%   무기자체gap   표시avg   max/avg비율');
console.log('-'.repeat(115));

for (const c of cases) {
  const gap = c.표시_max - c.표시_min;
  const 누적 = (c.표시_max / c.기본_무공 - 1) * 100;
  const 무기gap = gap / (1 + 누적 / 100);
  const avg = (c.표시_max + c.표시_min) / 2;
  const maxAvgRatio = ((c.표시_max - avg) / avg) * 100;

  console.log(
    `${c.name.padEnd(22)} ${c.표시_max.toString().padStart(7)}  ${c.표시_min.toString().padStart(7)}  ${gap.toString().padStart(5)}    ${c.기본_무공.toString().padStart(6)}   ${누적.toFixed(2).padStart(6)}%   ${무기gap.toFixed(2).padStart(8)}    ${avg.toFixed(1).padStart(8)}  ${maxAvgRatio.toFixed(3).padStart(5)}%`
  );
}

console.log('\n━ 발견 ━');
const w6 = (79835 - 78388) / (1 + (79835/14116 - 1));
const w9 = (59080 - 57819) / (1 + (59080/11967 - 1));
const w12 = (78757 - 76683) / (1 + (78757/13974 - 1));
console.log(`자료6 무기 자체 gap: ${w6.toFixed(2)}`);
console.log(`자료9 무기 자체 gap: ${w9.toFixed(2)}  ← 자료6 과 거의 동일! 같은 등급 무기`);
console.log(`자료12 무기 자체 gap: ${w12.toFixed(2)}  ← 다른 무기 (gap 더 큼)`);

console.log('\n━ 결정적 검증 ━');
console.log('자료6 (잔차 +0.17%) 와 자료9 (잔차 +0.62%) 는 같은 무기인데 다른 잔차 → 무기 자체 원인 아님');
console.log('자료12 (다른 무기, 잔차 -0.14%) 도 자료6 과 max 가정 best 동일 → 무기 종류 무관');
console.log();
console.log('따라서: 게임은 무기공격력 max 사용 (가설 검증)');
console.log('       자료9 +0.62% 잔차는 무기와 무관, 다른 원인 (근력 10M OOD)');

console.log('\n━ avg 가설로 가정해보면 (자료9 만 잘 fit) ━');
const k1_elasticity = 0.43; // 공격력 1% 변화 → BP 0.43%
console.log('만약 게임이 avg 사용한다면 우리 model 이 max 사용으로 over-predict 해야 함:');
for (const c of cases) {
  const avg = (c.표시_max + c.표시_min) / 2;
  const maxAvgPct = ((c.표시_max - avg) / avg) * 100;
  const expected_over = maxAvgPct * k1_elasticity;
  const observed = c.잔차_max가정;
  const match = Math.abs(expected_over - observed) < 0.2 ? '✓' : '✗';
  console.log(`  ${c.name.padEnd(22)} 예상 over-predict: +${expected_over.toFixed(2)}%   실제 잔차: ${observed >= 0 ? '+' : ''}${observed}%   매칭: ${match}`);
}
console.log('\n자료12 가 명확히 매칭 안 됨 (예상 +0.57% over, 실제 -0.14% under) → avg 가설 기각');
console.log('자료9 만 우연히 비슷 (예상 +0.46%, 실제 +0.62%)');
