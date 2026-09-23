// @ts-check
/**
 * T창 스탯 → 대미지 공식 입력 변환.
 *
 * 공식은 "고정값(raw) + 최종 %(F…)" 로 나눠 받는데, T창은 이미 둘을 합친 표시값을 보여준다.
 *   표시값 = floor(raw × (100 + F) / 100)
 * 그래서 표시값을 raw 로 넣고 F=0 으로 두면 같은 결과가 나온다. (기본_* 를 아는 항목도
 * raw/F 로 굳이 쪼개지 않는다 — 쪼개면 floor 가 한 번 더 끼어 값이 미세하게 달라진다.)
 *
 * ⚠ 예외: "최종 크리티컬/최소/최대 대미지" 처럼 T창 표시값 밖에서 곱해지는 옵션이 있다면
 *   그건 F_CD / F_MIN / F_MAX 로 따로 넣어야 한다 (지금은 UI 에서 직접 입력받는다).
 */

/**
 * 물리 무기공격력 표시범위 — 입력돼 있으면 그대로, 없으면 중간값 단일
 * @param {any} stats
 */
export function weaponRangeOf(stats) {
  const lo = Number(stats?.무기공표시min) || 0;
  const hi = Number(stats?.무기공표시max) || 0;
  if (lo > 0 && hi > 0) return { min: lo, max: hi };
  const mid = Number(stats?.공격력) || 0;
  return { min: mid, max: mid };
}

/**
 * @param {any} stats        캐릭터 T창 스탯
 * @param {object} opt
 * @param {'normal'|'boss'} opt.target   대상 분류 — 추가대미지·지배력 선택
 * @param {number} opt.level             캐릭터 레벨
 * @param {number} [opt.finalCritPct]    최종 크리티컬 대미지 % (T창 밖 옵션)
 * @param {number} [opt.finalMinPct]     최종 최소 대미지 %
 * @param {number} [opt.finalMaxPct]     최종 최대 대미지 %
 * @returns {import('./damageFormula.js').AttackerInput}
 */
export function attackerFromStats(stats, opt) {
  const isBoss = opt.target === 'boss';
  const w = weaponRangeOf(stats);
  return {
    type: stats?.type === 'M' ? 'M' : 'P',
    mainStat: Number(stats?.주스탯) || 0,
    eff: Number(stats?.근마효율) || 0,
    weaponMin: w.min,
    weaponMax: w.max,
    rawMin: Number(stats?.최소뎀) || 0,
    fMin: Number(opt.finalMinPct) || 0,
    rawMax: Number(stats?.최대뎀) || 0,
    fMax: Number(opt.finalMaxPct) || 0,
    rawCd: Number(stats?.크댐) || 0,
    fCd: Number(opt.finalCritPct) || 0,
    fixedDamage: Number(stats?.고댐) || 0,
    addDamage: Number(isBoss ? stats?.보몬추 : stats?.일몬추) || 0,
    pen: Number(stats?.관통) || 0,
    dominance: Number(isBoss ? stats?.보몬지 : stats?.일몬지) || 0,
    level: Number(opt.level) || 1,
    backAttack: Number(stats?.백어택) || 0,
    meleeDamage: Number(stats?.근거리) || 0,
    statusDamage: Number(stats?.상태대미지) || 0,
  };
}

/**
 * 프리셋 스탯(ARMOR/RES/F_P/F_M/Guard/ELASTICITY) → 공식 TargetInput
 * @param {any} presetStats
 */
export function targetFromPreset(presetStats) {
  return {
    armor: Number(presetStats?.ARMOR) || 0,
    res: Number(presetStats?.RES) || 0,
    fP: Number(presetStats?.F_P) || 0,
    fM: Number(presetStats?.F_M) || 0,
    guard: Number(presetStats?.Guard) || 0,
    elasticity: Number(presetStats?.ELASTICITY) || 0,
  };
}
