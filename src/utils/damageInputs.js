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

/** 표시값·기본값 → 누적 % (기본값을 모르면 0 — 특화석 % 옵션이 과소 반영될 수 있다) */
function cumulativePct(display, base) {
  const d = Number(display) || 0;
  const b = Number(base) || 0;
  return b > 0 && d > 0 ? (d / b - 1) * 100 : 0;
}

/**
 * T창 스탯 → 스킬 엔진 입력(skillEngine.calculate 의 input).
 * 캐릭터는 한 채널(물리/마법) 스탯만 있으므로 반대 채널 값은 0 이다 —
 * 그 채널 타격은 엔진 호출 시 channels 로 걸러 "계산 불가" 로 표시한다.
 *
 * 특화석의 가산·% 옵션은 "기본값 × (1 + 누적%)" 규칙으로 들어가므로 누적%가 필요하다.
 * 기본_* 가 입력돼 있으면 그 값을 기본값으로 바로 쓰고(ceil 역산 오차 없음), 없으면 누적 0% 로 본다.
 *
 * @param {any} stats
 * @param {object} opt
 * @param {any} opt.targetStats            프리셋 스탯 (ARMOR/RES/F_P/F_M/Guard/ELASTICITY)
 * @param {'normal'|'boss'} opt.targetType
 * @param {number} opt.level
 * @param {number} [opt.finalCritPct]
 * @param {number} [opt.finalMinPct]
 * @param {number} [opt.finalMaxPct]
 * @param {{backAttack?:boolean, melee?:boolean, status?:boolean}} [opt.conditions]
 */
export function engineInputFromStats(stats, opt) {
  const magic = stats?.type === 'M';
  const x = magic ? 'M' : 'P';
  const y = magic ? 'P' : 'M';
  const w = weaponRangeOf(stats);
  const main = Number(stats?.주스탯) || 0;
  const mainBase = Number(stats?.기본_주스탯) || 0;
  const weaponPct = cumulativePct(stats?.공격력, stats?.기본_공격력);
  const n = (v) => Number(v) || 0;
  const t = opt.targetStats || {};
  const cond = opt.conditions || {};
  const s = {
    L: n(opt.level) || 1,
    STR: magic ? 0 : main,
    MAG: magic ? main : 0,
    [`${magic ? 'MAG' : 'STR'}_PCT`]: cumulativePct(main, mainBase),
    [`${magic ? 'MAG' : 'STR'}_BASE`]: mainBase,
    WPN_MIN: magic ? 0 : w.min,
    WPN_MAX: magic ? 0 : w.max,
    ELE: magic ? w.min : 0,
    WPN_MIN_PCT: magic ? 0 : weaponPct,
    WPN_MAX_PCT: magic ? 0 : weaponPct,
    ELE_PCT: magic ? weaponPct : 0,
    [`EFF_${x}`]: n(stats?.근마효율),
    [`FD_${x}`]: n(stats?.고댐),
    [`BD_${x}`]: n(stats?.백어택),
    [`rawMIN_${x}`]: n(stats?.최소뎀),
    [`rawMAX_${x}`]: n(stats?.최대뎀),
    [`rawCD_${x}`]: n(stats?.크댐),
    [`FMIN_${x}`]: n(opt.finalMinPct),
    [`FMAX_${x}`]: n(opt.finalMaxPct),
    [`FCD_${x}`]: n(opt.finalCritPct),
    [`PEN_${x}`]: n(stats?.관통),
    [`EFF_${y}`]: 0,
    [`FD_${y}`]: 0,
    [`BD_${y}`]: 0,
    [`rawMIN_${y}`]: 0,
    [`rawMAX_${y}`]: 0,
    [`rawCD_${y}`]: 0,
    [`FMIN_${y}`]: 0,
    [`FMAX_${y}`]: 0,
    [`FCD_${y}`]: 0,
    [`PEN_${y}`]: 0,
    ADD_normal: n(stats?.일몬추),
    ADD_boss: n(stats?.보몬추),
    ADD_normal_PCT: cumulativePct(stats?.일몬추, stats?.기본_일몬추),
    ADD_boss_PCT: cumulativePct(stats?.보몬추, stats?.기본_보몬추),
    ADD_normal_BASE: n(stats?.기본_일몬추),
    ADD_boss_BASE: n(stats?.기본_보몬추),
    Dom_normal: n(stats?.일몬지),
    Dom_boss: n(stats?.보몬지),
    MD: n(stats?.근거리),
    SD: n(stats?.상태대미지),
    isBack: !!cond.backAttack,
    isMelee: !!cond.melee,
    isStatus: !!cond.status,
    targetType: opt.targetType,
    ARMOR: n(t.ARMOR),
    RES: n(t.RES),
    F_P: n(t.F_P),
    F_M: n(t.F_M),
    Guard: n(t.Guard),
    ELASTICITY: n(t.ELASTICITY),
  };
  s.ADD = s[`ADD_${opt.targetType}`];
  s.Dom = s[`Dom_${opt.targetType}`];
  return s;
}
