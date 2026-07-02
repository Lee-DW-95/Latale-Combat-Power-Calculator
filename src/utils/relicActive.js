/**
 * 성물 발동(액티브 스킬) BP 시뮬 — ×50 증폭 모델
 *
 * 게임 메커니즘 (사용자 도메인 지식, 2026-07-02 확정):
 *   - 성물은 성물별 개별 액티브 스킬. 6종이 동시 발동되는 게 아니라 각 전용석의
 *     액티브를 따로 사용하며 (예: 마아트 발동 30초), 발동한 성물의
 *     (기본옵션 + 인챈트옵션 + 그 칸의 공용석) 만 ×50 증폭 적용된다.
 *   - 중첩 불가 — 다른 성물의 액티브를 쓰면 기존 버프는 사라진다. 동시 발동은 항상 1종.
 *     → 모든 함수는 activeKeys (발동 중인 성물 key 집합) 를 받아 해당 성물만 합산.
 *       (UI 는 단일 선택만 넘기지만, 유틸은 집합을 받아 일반화 — 테스트/전건 비교용)
 *   - ×50 은 성물 레벨과 무관한 고정 배율.
 *   - 옵션은 3층: ① 기본옵션 (성물 고유, 전용석 Lv1~10 곡선 — relics.js RELIC_BASE_OPTIONS)
 *                ② 인챈트옵션 (제작 시 부여, 성물별 1종 — 공식 Relic_P.htm 과 대조 검증됨)
 *                ③ 공용석 (신성의 돌) 2슬롯 × 최대 4줄
 *   - 적용 방식은 장비 옵션과 동일한 T창 구조:
 *       표시 스탯 = (기본값 + flat 가산) × (1 + 누적% + %옵션)
 *     → flat 옵션(공용석 근력 등 ×50)은 기본값에 가산되어 %빨을 같이 받고,
 *       % 옵션(마아트 근/마% ×50 등)은 누적% 풀에 가산된다.
 *     예: 기본근력 130만·누적 537% 캐릭이 공용석 근력×50=+10만, 마아트 250% 발동 시
 *         새 표시근력 = (130만+10만) × (1 + 537% + 250%)
 *   - 이 구조가 기존 equipDelta/applyEquipDelta 와 정확히 같으므로 재사용한다.
 *
 * BP 무관 옵션(HP/피해감소/이동속도/쿨감/방어/명중/체력/행운/크리확률)은 합산에서 제외하되
 * UI 에 "미반영" 으로 표시할 수 있게 ignored 목록으로 반환.
 */

import {
  calculateBattlePower,
  equipDelta,
  createEmptyEquipment,
  STAT_KEYS,
} from './battlePower.js';
import { RELIC_BASE_OPTIONS, relicBaseOptionValue } from '../data/relics.js';

// 발동 증폭 배율 (레벨 무관 고정)
export const RELIC_ACTIVE_MULT = 50;

// ============================================================
// 성물 6종 정의 — 기본옵션/인챈트옵션의 BP 매핑
//   base:    RELIC_BASE_OPTIONS[key] 의 값이 흘러갈 곳
//   enchant: 인챈트옵션(성물별 고정 1종) 값이 흘러갈 곳
//   매핑 종류:
//     { pct: '주스탯_퍼' }  → equip % 풀 가산 (누적%에 ×50 더함)
//     { flat: '보몬지' }    → 스탯 직접 가산 (지배력은 풀 없이 %p 그대로)
//     null                  → BP 무관 (미반영 표시)
// ============================================================
export const ACTIVE_RELICS = Object.freeze([
  {
    key: 'maat', name: '마아트의 눈', icon: '👁️',
    base: { pct: '주스탯_퍼' },                       // 근력/마법력 %
    enchant: { label: '스킬 쿨타임 감소', unit: '%', step: 0.1, map: null },
  },
  {
    key: 'freering', name: '프리링 좌상', icon: '🛡️',
    base: null,                                        // 최대 HP % — BP 무관
    enchant: { label: '물리/마법 피해 감소', unit: '', step: 1, map: null },
  },
  {
    key: 'gleipnir', name: '글레이프니르', icon: '💥',
    base: { pct: '최소뎀_퍼' },                        // 최소 대미지 %
    enchant: { label: '물리/마법 최대대미지', unit: '%', step: 1, map: { pct: '최대뎀_퍼' } },
  },
  {
    key: 'wind', name: '타오르는 바람의 숨결', icon: '⚔️',
    base: { pct: '공격력_퍼' },                        // 무기 공격력/속성력 %
    enchant: { label: '이동속도', unit: '%', step: 1, map: null },
  },
  {
    key: 'fox', name: '여우구슬', icon: '🦊',
    base: { flat: '일몬지' },                          // 일반 몬스터 지배력 % (직접 %p)
    enchant: { label: '보스 몬스터 지배력', unit: '%', step: 0.1, map: { flat: '보몬지' } },
  },
  {
    key: 'cloud', name: '구름 방망이', icon: '⚡',
    base: null,                                        // 크리티컬 확률 % — BP 모델에 없음
    enchant: { label: '물리/마법 크리티컬 대미지', unit: '%', step: 1, map: { pct: '크댐_퍼' } },
  },
]);

export const ACTIVE_RELIC_KEYS = Object.freeze(ACTIVE_RELICS.map((r) => r.key));

// ============================================================
// 공용석(신성의 돌) 옵션 15종 — BP 매핑
//   equip: equipDelta flat 키 (기본값 가산 → %빨 적용) / special: 스탯 직접 가산
//   null: BP 무관
// ============================================================
export const STONE_OPTION_DEFS = Object.freeze([
  { label: '근력/마법력',             equip: '주스탯' },
  { label: '올스탯',                   equip: '올스탯' },
  { label: '무기 공격력/속성력',       equip: '공격력' },
  { label: '물리/마법 고정 대미지',    equip: '고댐' },
  { label: '일반 몬스터 추가 대미지',  equip: '일몬추' },
  { label: '보스 몬스터 추가 대미지',  equip: '보몬추' },
  { label: '물리/마법 백어택 대미지',  special: '백어택' }, // 조건부 환산 (백어택활성+가동률 필요)
  { label: '물리/마법 명중률',         equip: null },
  { label: '물리 대미지 감소',         equip: null },
  { label: '마법 대미지감소',          equip: null },
  { label: '마법 저항력',              equip: null },
  { label: '방어력',                   equip: null },
  { label: '체력',                     equip: null },
  { label: '최대 HP',                  equip: null },
  { label: '행운',                     equip: null },
]);

const STONE_OPTION_INDEX = new Map(STONE_OPTION_DEFS.map((d) => [d.label, d]));

// 공용석 슬롯/줄 수
export const STONE_SLOTS = 2;
export const STONE_MAX_LINES = 4;

// ============================================================
// 로드아웃 (사용자 입력 상태)
// ============================================================
export function createEmptyRelicLoadout() {
  const relics = {};
  for (const def of ACTIVE_RELICS) {
    relics[def.key] = {
      level: 1,            // 전용석 Lv 1~10 → 기본옵션 자동
      enchantValue: 0,     // 인챈트옵션 값 (성물별 고정 1종)
      stones: Array.from({ length: STONE_SLOTS }, () => ({
        lines: Array.from({ length: STONE_MAX_LINES }, () => ({ option: '', value: 0 })),
      })),
    };
  }
  return relics;
}

// activeKeys 정규화 — Set/배열/undefined 허용. undefined 면 "전부 발동" (하위호환).
function toActiveSet(activeKeys) {
  if (activeKeys == null) return null; // null = 전체
  return activeKeys instanceof Set ? activeKeys : new Set(activeKeys);
}

// ============================================================
// 로드아웃 → 발동 번들 (equipDelta 입력 + 백어택 직접 가산 + 미반영 목록)
//   activeKeys: 발동 중인 성물 key 집합 (예: ['maat']) — 그 성물의 옵션만 포함.
// ============================================================
export function relicBundle(loadout, activeKeys) {
  const equip = createEmptyEquipment();
  let backAtk = 0;
  const ignored = []; // { relic, source, label, value } — BP 미반영 옵션
  const active = toActiveSet(activeKeys);

  for (const def of ACTIVE_RELICS) {
    if (active && !active.has(def.key)) continue; // 발동 안 한 성물은 통째로 제외
    const r = loadout?.[def.key];
    if (!r) continue;

    // ① 기본옵션 (레벨 곡선 자동)
    const baseVal = relicBaseOptionValue(def.key, r.level);
    if (baseVal > 0) {
      const label = RELIC_BASE_OPTIONS[def.key]?.option ?? '기본옵션';
      if (def.base?.pct) equip[def.base.pct] += baseVal * RELIC_ACTIVE_MULT;
      else if (def.base?.flat) equip[def.base.flat] += baseVal * RELIC_ACTIVE_MULT;
      else ignored.push({ relic: def.name, source: '기본', label, value: baseVal });
    }

    // ② 인챈트옵션
    const ev = Number(r.enchantValue || 0);
    if (ev > 0) {
      if (def.enchant.map?.pct) equip[def.enchant.map.pct] += ev * RELIC_ACTIVE_MULT;
      else if (def.enchant.map?.flat) equip[def.enchant.map.flat] += ev * RELIC_ACTIVE_MULT;
      else ignored.push({ relic: def.name, source: '인챈트', label: def.enchant.label, value: ev });
    }

    // ③ 공용석 2슬롯 × 최대 4줄
    for (const stone of r.stones ?? []) {
      for (const line of stone?.lines ?? []) {
        const v = Number(line?.value || 0);
        if (!line?.option || v <= 0) continue;
        const opt = STONE_OPTION_INDEX.get(line.option);
        if (!opt) continue;
        if (opt.equip) equip[opt.equip] += v * RELIC_ACTIVE_MULT;
        else if (opt.special === '백어택') backAtk += v * RELIC_ACTIVE_MULT;
        else ignored.push({ relic: def.name, source: '공용석', label: line.option, value: v });
      }
    }
  }

  return { equip, backAtk, ignored };
}

// ============================================================
// 발동 후 스탯 — equipDelta 재사용 (기본값 가산 + % 풀 가산의 T창 메커니즘)
// ============================================================
export function applyRelicActivation(stats, loadout, activeKeys) {
  const { equip, backAtk } = relicBundle(loadout, activeKeys);
  const delta = equipDelta(stats, equip);
  const newStats = { ...stats };
  for (const k of STAT_KEYS) {
    newStats[k] = (Number(stats[k]) || 0) + (delta[k] || 0);
  }
  if (backAtk > 0) {
    newStats.백어택 = (Number(stats.백어택) || 0) + backAtk;
  }
  return newStats;
}

// ============================================================
// 발동 전/후 BP 비교
//   contributions: 스탯별 (변화량, 단독 BP 기여) — compareEquipment 과 동일 방식
// ============================================================
export function compareRelicActivation(stats, loadout, activeKeys) {
  const { equip, backAtk, ignored } = relicBundle(loadout, activeKeys);
  const delta = equipDelta(stats, equip);

  const newStats = { ...stats };
  for (const k of STAT_KEYS) {
    newStats[k] = (Number(stats[k]) || 0) + (delta[k] || 0);
  }
  if (backAtk > 0) newStats.백어택 = (Number(stats.백어택) || 0) + backAtk;

  const offBP = calculateBattlePower(stats);
  const onBP = calculateBattlePower(newStats);
  const change = onBP - offBP;

  const contributions = STAT_KEYS.map((key) => {
    const diff = delta[key] || 0;
    if (diff === 0 || !Number.isFinite(diff)) return { stat: key, diff: 0, impact: 0 };
    const partial = { ...stats, [key]: (Number(stats[key]) || 0) + diff };
    return { stat: key, diff, impact: calculateBattlePower(partial) - offBP };
  }).filter((c) => c.diff !== 0);

  if (backAtk > 0) {
    const partial = { ...stats, 백어택: (Number(stats.백어택) || 0) + backAtk };
    contributions.push({
      stat: '백어택',
      diff: backAtk,
      impact: calculateBattlePower(partial) - offBP,
    });
  }

  return {
    offBP,
    onBP,
    change,
    changePercent: offBP > 0 ? (change / offBP) * 100 : 0,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
    contributions,
    ignored,
    newStats,
  };
}

// ============================================================
// % 옵션 정확도 경고 — 기본_* 미입력 시 % 옵션이 표시값 기준으로 과대 적용됨
//   (applyEquipDelta 폴백: 누적% 0 가정 → 발동 % ×50 이 커서 오차가 극심해질 수 있음)
//   반환: 경고가 필요한 스탯 라벨 목록
// ============================================================
const PCT_BASE_REQUIREMENTS = [
  { pctKey: '주스탯_퍼', baseKey: '기본_주스탯', label: '기본 근력/마법력' },
  { pctKey: '공격력_퍼', baseKey: '기본_공격력', label: '기본 무기공격력/속성력' },
  { pctKey: '크댐_퍼',   baseKey: '기본_크댐',   label: '기본 크리티컬 대미지' },
  { pctKey: '최소뎀_퍼', baseKey: '기본_최소뎀', label: '기본 최소 대미지' },
  { pctKey: '최대뎀_퍼', baseKey: '기본_최대뎀', label: '기본 최대 대미지' },
];

export function missingBaseWarnings(stats, loadout, activeKeys) {
  const { equip } = relicBundle(loadout, activeKeys);
  return PCT_BASE_REQUIREMENTS
    .filter((r) => (equip[r.pctKey] || 0) > 0 && Number(stats?.[r.baseKey] || 0) <= 0)
    .map((r) => r.label);
}
