/**
 * 성물 발동 ×50 증폭 모델 검증 테스트
 *
 * 실행: node tests/relicActive.test.js (순수 Node, 러너 의존성 없음)
 *
 * 검증 항목:
 *   1) 기본옵션 레벨 곡선 (A패턴 1,1,1,2,2,3,3,4,4,5 / 글레 10단위 / 여우 0.2단위)
 *   2) ×50 번들 매핑 — 사용자 확정 예시 재현:
 *      공용석 (근력1000 + 올스탯1000) → 주스탯 계열 flat 합 ×50 = 100,000
 *      마아트 Lv10 기본 5% → 주스탯_퍼 +250
 *      글레이프니르 Lv10 기본 최소뎀 50% → 최소뎀_퍼 +2500 / 인챈트 최대뎀 50 → 최대뎀_퍼 +2500
 *   3) T창 메커니즘 결합 — (기본+flat×50) × (1+누적%+%×50) 정확 적용
 *   4) 발동 시 BP 증가 (compareRelicActivation)
 *   5) BP 무관 옵션은 ignored 로 분리
 */

import {
  createEmptyRelicLoadout,
  relicBundle,
  compareRelicActivation,
  RELIC_ACTIVE_MULT,
} from '../src/utils/relicActive.js';
import { relicBaseOptionValue } from '../src/data/relics.js';
import { createEmptyStats } from '../src/utils/battlePower.js';

let failures = 0;
function check(name, actual, expected, tol = 1e-9) {
  const ok = Math.abs(actual - expected) < tol;
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}  (actual=${actual}, expected=${expected})`);
  if (!ok) failures++;
}
function checkTrue(name, cond, note = '') {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}${note ? `  (${note})` : ''}`);
  if (!cond) failures++;
}

console.log('═══════════════════════════════════════════════════');
console.log('  성물 발동 ×50 모델 검증');
console.log('═══════════════════════════════════════════════════');

// ── 1) 기본옵션 레벨 곡선 ──
check('마아트 Lv1 = 1', relicBaseOptionValue('maat', 1), 1);
check('마아트 Lv3 = 1', relicBaseOptionValue('maat', 3), 1);
check('마아트 Lv4 = 2', relicBaseOptionValue('maat', 4), 2);
check('마아트 Lv9 = 4', relicBaseOptionValue('maat', 9), 4);
check('마아트 Lv10 = 5', relicBaseOptionValue('maat', 10), 5);
check('글레이프니르 Lv10 = 50', relicBaseOptionValue('gleipnir', 10), 50);
check('글레이프니르 Lv7 = 30', relicBaseOptionValue('gleipnir', 7), 30);
check('여우구슬 Lv10 = 1.0', relicBaseOptionValue('fox', 10), 1.0);
check('여우구슬 Lv5 = 0.4', relicBaseOptionValue('fox', 5), 0.4);

// ── 2) ×50 번들 매핑 (사용자 확정 예시) ──
//   activeKeys 미지정 = 전 성물 포함 (유틸 하위호환) — 매핑 자체 검증용
const loadout = createEmptyRelicLoadout();
// 글레이프니르 Lv10 + 인챈트 최대뎀 50
loadout.gleipnir.level = 10;
loadout.gleipnir.enchantValue = 50;
// 공용석 1: 근력 1000 + 올스탯 1000 / 공용석 2: 무기공 15 + 올스탯 1000
loadout.gleipnir.stones[0].lines[0] = { option: '근력/마법력', value: 1000 };
loadout.gleipnir.stones[0].lines[1] = { option: '올스탯', value: 1000 };
loadout.gleipnir.stones[1].lines[0] = { option: '무기 공격력/속성력', value: 15 };
loadout.gleipnir.stones[1].lines[1] = { option: '올스탯', value: 1000 };
// 마아트 Lv10 (기본 5% → +250%)
loadout.maat.level = 10;

const { equip, backAtk, ignored } = relicBundle(loadout);
check('공용석 근력 flat ×50 = 50,000', equip.주스탯, 1000 * RELIC_ACTIVE_MULT);
check('공용석 올스탯 flat ×50 = 100,000 (2줄 합)', equip.올스탯, 2000 * RELIC_ACTIVE_MULT);
check('주스탯 계열 flat 총합 = 150,000', equip.주스탯 + equip.올스탯, 150000);
check('공용석 무기공 ×50 = 750', equip.공격력, 15 * RELIC_ACTIVE_MULT);
check('마아트 Lv10 기본 → 주스탯_퍼 +250', equip.주스탯_퍼, 5 * RELIC_ACTIVE_MULT);
check('글레 Lv10 기본 최소뎀% → 최소뎀_퍼 +2500', equip.최소뎀_퍼, 50 * RELIC_ACTIVE_MULT);
check('글레 인챈트 최대뎀 50 → 최대뎀_퍼 +2500', equip.최대뎀_퍼, 50 * RELIC_ACTIVE_MULT);
// 기본 레벨 1인 나머지 성물: 타오르는바람 Lv1 무공% 1 → 공격력_퍼 50, 여우 Lv1 일몬지 0.2 → +10
check('타오르는바람 Lv1 기본 → 공격력_퍼 +50', equip.공격력_퍼, 1 * RELIC_ACTIVE_MULT);
check('여우구슬 Lv1 기본 → 일몬지 +10', equip.일몬지, 0.2 * RELIC_ACTIVE_MULT);
check('백어택 미장착 = 0', backAtk, 0);

// BP 무관 기본옵션 (프리링 HP%, 구름 크리확률%)은 ignored 에
checkTrue(
  'BP 무관 기본옵션 ignored 분리 (프리링·구름)',
  ignored.some((i) => i.relic === '프리링 좌상') && ignored.some((i) => i.relic === '구름 방망이'),
  ignored.map((i) => `${i.relic}·${i.label}`).join(', '),
);

// ── 2.5) 단일 발동 (성물별 개별 액티브 — 중첩 불가) ──
//   글레이프니르만 발동: 글레의 (기본 + 인챈트 + 그 칸 공용석)만 포함되고
//   마아트 기본옵션 등 다른 성물 옵션은 전부 제외되어야 한다.
{
  const g = relicBundle(loadout, ['gleipnir']);
  check('[글레만 발동] 마아트 주스탯_퍼 제외 = 0', g.equip.주스탯_퍼, 0);
  check('[글레만 발동] 바람 공격력_퍼 제외 = 0', g.equip.공격력_퍼, 0);
  check('[글레만 발동] 여우 일몬지 제외 = 0', g.equip.일몬지, 0);
  check('[글레만 발동] 글레 최소뎀_퍼 포함 = 2500', g.equip.최소뎀_퍼, 2500);
  check('[글레만 발동] 글레 인챈트 최대뎀_퍼 포함 = 2500', g.equip.최대뎀_퍼, 2500);
  check('[글레만 발동] 글레 칸 공용석 근력 포함 = 50,000', g.equip.주스탯, 50000);
  check('[글레만 발동] 글레 칸 공용석 무기공 포함 = 750', g.equip.공격력, 750);

  const m = relicBundle(loadout, ['maat']);
  check('[마아트만 발동] 주스탯_퍼 포함 = 250', m.equip.주스탯_퍼, 250);
  check('[마아트만 발동] 글레 최소뎀_퍼 제외 = 0', m.equip.최소뎀_퍼, 0);
  check('[마아트만 발동] 글레 칸 공용석 제외 = 0', m.equip.주스탯, 0);

  const none = relicBundle(loadout, []);
  check('[발동 없음] 전부 0', Object.values(none.equip).reduce((a, b) => a + b, 0), 0);
}

// ── 3) T창 메커니즘 결합 검증 ──
// 기본근력 1,300,000 · 표시 8,281,000 (누적 537%) 캐릭에
// 공용석 근력+올스탯 flat 150,000 ×  마아트 +250% 발동:
//   새 표시 = (1,300,000 + 150,000) × (1 + 5.37 + 2.5) = 1,450,000 × 8.87 = 12,861,500
//   Δ = 12,861,500 - 8,281,000 = 4,580,500
{
  const stats = createEmptyStats('P');
  stats.주스탯 = 8281000;
  stats.기본_주스탯 = 1300000;
  const lo = createEmptyRelicLoadout();
  lo.maat.level = 10;
  lo.maat.stones[0].lines[0] = { option: '근력/마법력', value: 1000 };
  lo.maat.stones[0].lines[1] = { option: '올스탯', value: 1000 };
  lo.maat.stones[1].lines[0] = { option: '올스탯', value: 1000 };
  const r = compareRelicActivation(stats, lo, ['maat']); // 마아트 단일 발동
  const 주스탯Delta = r.newStats.주스탯 - stats.주스탯;
  check('T창 결합: (130만+15만)×(1+537%+250%) 주스탯 Δ', 주스탯Delta, 4580500, 0.01); // 부동소수점 허용
}

// ── 4) 발동 시 BP 증가 ──
{
  const stats = createEmptyStats('P');
  stats.주스탯 = 8000000;
  stats.공격력 = 70000;
  stats.크댐 = 9000;
  stats.최소뎀 = 300000;
  stats.최대뎀 = 400000;
  stats.고댐 = 50000;
  stats.관통 = 90;
  stats.기본_주스탯 = 1300000;
  stats.기본_공격력 = 12000;
  stats.기본_최소뎀 = 50000;
  stats.기본_최대뎀 = 60000;
  stats.기본_크댐 = 1500;

  const r = compareRelicActivation(stats, loadout, ['gleipnir']); // 글레이프니르 단일 발동
  checkTrue('발동 후 BP > 발동 전 BP', r.onBP > r.offBP, `off=${r.offBP.toLocaleString()} on=${r.onBP.toLocaleString()} (+${r.changePercent.toFixed(1)}%)`);
  checkTrue('기여 스탯에 주스탯 포함 (글레 칸 공용석 근력/올스탯)', r.contributions.some((c) => c.stat === '주스탯'));
  checkTrue('기여 스탯에 최대뎀 포함 (글레 인챈트)', r.contributions.some((c) => c.stat === '최대뎀'));

  // 발동 성물 교체 = 기존 버프 소멸 → 마아트 발동 결과엔 글레 항목이 없어야
  const rm = compareRelicActivation(stats, loadout, ['maat']);
  checkTrue('마아트 발동 시 최대뎀 기여 없음 (글레 버프 소멸)', !rm.contributions.some((c) => c.stat === '최대뎀'));
}

// ── 5) 빈 로드아웃 무해성 ──
// 주의: 기본옵션은 Lv1 부터 자동 적용되므로 "빈" 로드아웃도 %옵션 4종이 붙는다.
//   (마아트 +50%, 글레 최소뎀 +500%, 바람 +50%, 여우 일몬지 +10)
//   → BP 는 반드시 offBP 이상.
{
  const stats = createEmptyStats('P');
  stats.주스탯 = 1000000;
  stats.공격력 = 10000;
  const r = compareRelicActivation(stats, createEmptyRelicLoadout());
  checkTrue('빈 로드아웃(전 성물 Lv1)도 onBP ≥ offBP', r.onBP >= r.offBP, `off=${r.offBP} on=${r.onBP}`);
}

console.log('───────────────────────────────────────────────────');
if (failures > 0) {
  console.error(`✗ ${failures}개 항목 실패`);
  process.exit(1);
}
console.log('✓ 성물 발동 모델 전체 통과');
