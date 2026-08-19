/**
 * 스탯 환산 공용 엔진 — "이 옵션은 크댐 몇 %급인가" 계산의 단일 소스.
 *
 * 원래 EfficiencyPanel.vue 안에만 있던 로직을 그대로 끌어낸 것이다.
 *   - 각성석 종합 환산 (EfficiencyPanel)
 *   - 각성석 시뮬 1회 굴림 기록 (AwakeningSimulator)
 * 두 곳이 같은 수치를 내야 하므로 여기서만 정의하고 양쪽이 import 한다.
 *
 * 환산 원리:
 *   옵션을 본 스탯에 "단독으로" 적용했을 때의 ΔBP 를 구하고,
 *   같은 ΔBP 를 기준 스탯(기본 크댐) 옵션 하나로 재현하려면 몇이 필요한지 역산한다.
 */

import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
  calculateBPVsMonster,
  equipDelta,
  solveEquivalentAmount,
  STAT_KEYS,
} from './battlePower.js';

export const PEN_CAP = 99;

/**
 * 스탯별 자연 단위 메커니즘 — 사용자 인식 옵션 단위
 *   'pct': 누적 +Npp (% 옵션 칼럼)
 *   'raw': raw +N 가산 (가산값 칼럼)
 */
export const NATURAL_UNIT = {
  주스탯: 'pct', 공격력: 'pct', 고댐: 'pct', 일몬추: 'pct', 보몬추: 'pct',
  크댐: 'raw', 최소뎀: 'raw', 최대뎀: 'raw',
  일몬지: 'raw', 보몬지: 'raw', 근마효율: 'raw', 관통: 'raw',
};

/** 일몬지/보몬지는 BP 식 내부 floor() 때문에 plateau 에 갇힘 — 배수 측정 후 선형 환산한다. */
const DOMINANCE_SCALE = 10000;

export function isDominanceStat(statKey) {
  return statKey === '일몬지' || statKey === '보몬지';
}

/** BP 계산 — mode 별 ('avg' | 'direct' | 'summon' | 'normal' | 'boss') */
export function bpFor(stats, mode = 'avg') {
  if (mode === 'direct') return calculateDirectBP(stats);
  if (mode === 'summon') return calculateSummonBP(stats);
  if (mode === 'normal') return calculateBPVsMonster(stats, 'normal');
  if (mode === 'boss') return calculateBPVsMonster(stats, 'boss');
  return calculateBattlePower(stats);
}

/** equip 객체를 stats 에 적용해 새 stats 객체 반환 (equipDelta 활용) */
export function applyEquipToStats(baseStats, equip) {
  const delta = equipDelta(baseStats, equip);
  const out = { ...baseStats };
  for (const k of STAT_KEYS) {
    out[k] = (Number(baseStats[k]) || 0) + (delta[k] || 0);
  }
  return out;
}

/** 스탯 옵션 +amount 적용 시 BP 계산 (스탯별 자연 단위 메커니즘 적용) */
export function bpWithOption(baseStats, statKey, amount, mode = 'avg') {
  const newStats = { ...baseStats };
  const unit = NATURAL_UNIT[statKey];

  if (unit === 'pct') {
    // 누적 +Npp 옵션 (equipDelta 의 % 옵션 메커니즘)
    return bpFor(applyEquipToStats(baseStats, { [`${statKey}_퍼`]: amount }), mode);
  }

  // raw 가산 메커니즘
  if (statKey === '근마효율') {
    newStats.근마효율 = (Number(baseStats.근마효율) || 0) + amount;
    return bpFor(newStats, mode);
  }
  if (isDominanceStat(statKey)) {
    newStats[statKey] = (Number(baseStats[statKey]) || 0) + amount * DOMINANCE_SCALE;
    const scaledBP = bpFor(newStats, mode);
    const baseBPVal = bpFor(baseStats, mode);
    return baseBPVal + (scaledBP - baseBPVal) / DOMINANCE_SCALE;
  }
  if (statKey === '관통') {
    newStats.관통 = Math.max(0, Math.min(PEN_CAP, (Number(baseStats.관통) || 0) + amount));
    return bpFor(newStats, mode);
  }
  // 크댐/최소뎀/최대뎀: equipDelta 가산값 메커니즘 (기본값에 raw +N → 표시 +N×(1+누적))
  return bpFor(applyEquipToStats(baseStats, { [statKey]: amount }), mode);
}

/**
 * 주어진 ΔBP 를 기준 스탯(기본 크댐) 옵션 하나로 재현했을 때 필요한 amount.
 *   공용 솔버로 floor 양자화·캡을 일관 처리. 기준 스탯이 천장에 막혀 도달 불가하면
 *   합산이 깨지지 않도록 천장값 기준 선형 근사로 폴백한다 (refStat=크댐 은 사실상 항상 도달).
 */
export function solveRefAmountForDelta(baseStats, refKey, targetDelta, baseBPForMode, mode = 'avg') {
  const r = solveEquivalentAmount(
    (amt) => bpWithOption(baseStats, refKey, amt, mode) - baseBPForMode,
    targetDelta,
  );
  if (r.reachable) return r.amount;
  // 도달 불가(캡): 천장값에 비례한 선형 추정으로 폴백.
  if (Number.isFinite(r.reachableDelta) && r.reachableDelta !== 0) {
    const probe = bpWithOption(baseStats, refKey, 1, mode) - baseBPForMode;
    if (probe !== 0) return targetDelta / probe;
  }
  return 0;
}

/**
 * 옵션 1개를 equip 객체로 표현해 단독 ΔBP 와 기준 스탯 환산량을 구한다.
 *
 * equip 을 받는 이유: 게임 옵션 하나가 스탯 두 개를 동시에 올리는 경우가 있다
 *   (예: 메모리얼/아이템각성의 "최소/최대 대미지 +n%" → 최소뎀 + 최대뎀 동시).
 *   따로 환산해 더하는 것보다 한꺼번에 적용한 ΔBP 가 정확하다.
 *
 * @param {object} baseStats  본 캐릭터 스탯
 * @param {object} equip      { equipKey: amount } — equipDelta 가 아는 키 (예: 크댐, 공격력_퍼)
 * @param {string} refKey     환산 기준 스탯 (기본 크댐)
 * @param {string} mode       BP 모드
 * @param {number} baseBP     해당 모드의 본 BP (미리 계산해 넘기면 재계산 생략)
 */
export function convertEquip(baseStats, equip, refKey = '크댐', mode = 'avg', baseBP = null) {
  const base = baseBP ?? bpFor(baseStats, mode);
  const keys = Object.keys(equip || {});
  if (!keys.length || base <= 0) return { delta: 0, refAmount: 0 };

  // 일몬지/보몬지만으로 구성된 옵션은 floor plateau 회피를 위해 배수 측정 후 선형 환산.
  const scale = keys.every((k) => isDominanceStat(k)) ? DOMINANCE_SCALE : 1;
  const scaled = {};
  for (const k of keys) scaled[k] = Number(equip[k]) * scale;

  const delta = (bpFor(applyEquipToStats(baseStats, scaled), mode) - base) / scale;

  // 기준 스탯·자연 단위와 정확히 일치하는 단일 옵션이면 이분법을 건너뛰고 값을 그대로 쓴다.
  const refEquipKey = NATURAL_UNIT[refKey] === 'pct' ? `${refKey}_퍼` : refKey;
  if (keys.length === 1 && keys[0] === refEquipKey) {
    return { delta, refAmount: Number(equip[keys[0]]) };
  }
  return { delta, refAmount: solveRefAmountForDelta(baseStats, refKey, delta, base, mode) };
}

/**
 * 옵션 1개(스탯 + 단위 + 수치)의 단독 ΔBP 와 기준 스탯 환산량.
 * convertEquip 의 단일 스탯용 편의 래퍼.
 */
export function convertOption(baseStats, statKey, unit, value, refKey = '크댐', mode = 'avg', baseBP = null) {
  const v = Number(value);
  if (!Number.isFinite(v) || v === 0) return { delta: 0, refAmount: 0 };
  const equipKey = unit === 'pct' ? `${statKey}_퍼` : statKey;
  return convertEquip(baseStats, { [equipKey]: v }, refKey, mode, baseBP);
}
