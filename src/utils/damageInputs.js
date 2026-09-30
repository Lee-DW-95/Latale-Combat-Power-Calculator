// @ts-check
/**
 * T창 스탯 → 대미지 공식 입력 변환.
 *
 * 공식은 크리티컬·최소·최대 대미지를 "추가 세부정보의 +값(raw) + 최종 %(F)" 로 나눠 받는다.
 *   T창 표시값 = floor(raw × (100 + F) / 100)
 * 전투력 탭의 기본_크댐·기본_최소뎀·기본_최대뎀(= 추가 세부정보 +값)과 표시값으로 F 를 역산한다 (splitFinal).
 * 기본값이 없으면 표시값을 raw 로, F=0 으로 둔다 — 한 방 대미지는 같지만,
 * 특화석·노블레스처럼 최종 %를 더하는 효과는 표시값 기준으로 들어가 조금 크게 잡힌다.
 */

/**
 * 표시값·기본값 → { raw, f } — floor(raw × (100 + f) / 100) === 표시값 이 되는 최종 % 를 찾는다.
 * 맞는 f 를 못 찾으면(기본값 미입력·오타) 표시값을 raw 로 쓰고 f=0.
 * @param {any} display
 * @param {any} base
 */
export function splitFinal(display, base) {
  const d = Number(display) || 0;
  const b = Number(base) || 0;
  if (b > 0 && d >= b) {
    const exact = ((d / b) - 1) * 100;
    // 표시값을 만족하는 % 는 여러 개일 수 있다 — 게임 옵션처럼 가장 단순한 값(정수 → 소수 1·2자리)을 고른다
    const round = (k) => Math.round(exact * k) / k;
    for (const f of [round(1), round(10), round(100), exact, exact + 1e-9]) {
      if (Math.floor((b * (100 + f)) / 100) === d) return { raw: b, f, derived: true };
    }
  }
  return { raw: d, f: 0, derived: false };
}

/**
 * 대미지 탭 "스탯 조정" 항목. 가감 기준은 applyStatDeltas 의 mode 로 고른다.
 * 추가대미지·지배력은 일반·보스 양쪽에 같이 더한다.
 */
export const DELTA_FIELDS = [
  { key: '주스탯', label: '근력/마법력', base: '기본_주스탯' },
  { key: '공격력', label: '무기공격력/속성력', base: '기본_공격력' },
  { key: '최소뎀', label: '최소 대미지', base: '기본_최소뎀' },
  { key: '최대뎀', label: '최대 대미지', base: '기본_최대뎀' },
  { key: '크댐', label: '크리티컬 대미지', base: '기본_크댐' },
  { key: '고댐', label: '고정 대미지', base: '기본_고댐' },
  { key: '추가', label: '몬스터 추가 대미지', base: '기본_보몬추' },
  { key: '지배력', label: '지배력 %', step: 0.1 },
  { key: '관통', label: '관통 %' },
  { key: '근마효율', label: '근력/마법력 효율 %' },
  { key: '백어택', label: '백어택 대미지' },
  { key: '근거리', label: '근거리 대미지' },
  { key: '상태대미지', label: '상태이상 대미지' },
];

/**
 * T창 스탯에 가감을 적용한 사본을 만든다. 어느 쪽이든 누적 %(최종 %)는 유지한다.
 *   mode 'base'    — 기본값(추가 세부정보 +값) ± δ 후 누적 % 를 다시 곱해 표시값을 만든다.
 *                    인게임에서 +값 옵션이 늘고 준 것과 같다. 예) 크댐 −300 → 기본 크댐 −300
 *   mode 'display' — 종합 T창 표시값 ± δ, 기본값은 누적 % 가 유지되도록 역산해 옮긴다.
 *                    최소·최대·크리는 floor(raw × (100+F)/100) 가 되는 값으로 맞춰 ±1 오차가 날 수 있다.
 *   기본값이 없는 항목은 누적 % 를 알 수 없어 두 모드 모두 표시값에 그대로 더한다 (deltaMissingBase).
 * @param {any} stats
 * @param {Record<string, number>} deltas
 * @param {'base'|'display'} [mode]
 */
export function applyStatDeltas(stats, deltas, mode = 'base') {
  const byBase = mode !== 'display';
  const s = { ...stats };
  const n = (v) => Number(v) || 0;
  const d = (k) => n(deltas?.[k]);
  /** 기본값 가감 → 누적 % 를 유지한 표시값. 기본값이 없으면 표시값에 그대로 더한다. 반환: 표시값 배율 */
  const shiftBase = (key, baseKey, delta) => {
    const disp = n(s[key]);
    const base = n(s[baseKey]);
    if (!(base > 0 && disp > 0)) {
      s[key] = Math.max(0, disp + delta);
      return 1;
    }
    const ratio = disp / base;
    if (!byBase) {
      const after = Math.max(0, disp + delta);
      s[baseKey] = after / ratio;
      s[key] = after;
      return 1;
    }
    const nb = Math.max(0, base + delta);
    s[baseKey] = nb;
    s[key] = Math.floor(nb * ratio + 1e-9);
    return ratio;
  };
  const shiftFinal = (key, baseKey, delta) => {
    const sp = splitFinal(s[key], s[baseKey]);
    if (!sp.derived) {
      s[key] = Math.max(0, n(s[key]) + delta);
      s[baseKey] = 0; // 기본값으로 F 를 못 나눈 상태 그대로 (raw = 표시값, F = 0)
      return;
    }
    const nb = byBase
      ? Math.max(0, sp.raw + delta)
      : Math.round((Math.max(0, n(s[key]) + delta) * 100) / (100 + sp.f));
    s[baseKey] = nb;
    s[key] = Math.floor((nb * (100 + sp.f)) / 100);
  };

  if (d('주스탯')) shiftBase('주스탯', '기본_주스탯', d('주스탯'));
  if (d('공격력')) {
    const w = d('공격력');
    const ratio = shiftBase('공격력', '기본_공격력', w);
    // 무공 표시범위 두 값도 함께 — 기본 기준이면 δ × 누적 배율, 표시 기준이면 δ 그대로
    if (n(s.무기공표시min) > 0 && n(s.무기공표시max) > 0) {
      s.무기공표시min = Math.max(0, Math.floor(n(s.무기공표시min) + w * ratio));
      s.무기공표시max = Math.max(0, Math.floor(n(s.무기공표시max) + w * ratio));
    }
  }
  if (d('최소뎀')) shiftFinal('최소뎀', '기본_최소뎀', d('최소뎀'));
  if (d('최대뎀')) shiftFinal('최대뎀', '기본_최대뎀', d('최대뎀'));
  if (d('크댐')) shiftFinal('크댐', '기본_크댐', d('크댐'));
  if (d('고댐')) shiftBase('고댐', '기본_고댐', d('고댐'));
  if (d('추가')) {
    shiftBase('일몬추', '기본_일몬추', d('추가'));
    shiftBase('보몬추', '기본_보몬추', d('추가'));
  }
  for (const k of ['일몬지', '보몬지']) if (d('지배력')) s[k] = Math.max(0, n(s[k]) + d('지배력'));
  for (const k of ['관통', '근마효율', '백어택', '근거리', '상태대미지']) if (d(k)) s[k] = Math.max(0, n(s[k]) + d(k));
  return s;
}

/**
 * 조정값을 넣었지만 기본값이 없어 표시값에 그대로 더해진 항목 라벨
 * @param {any} stats
 * @param {Record<string, number>} deltas
 */
export function deltaMissingBase(stats, deltas) {
  return DELTA_FIELDS.filter((f) => f.base && Number(deltas?.[f.key]) && !(Number(stats?.[f.base]) > 0)).map((f) => f.label);
}

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
 * @returns {import('./damageFormula.js').AttackerInput}
 */
export function attackerFromStats(stats, opt) {
  const isBoss = opt.target === 'boss';
  const w = weaponRangeOf(stats);
  const mn = splitFinal(stats?.최소뎀, stats?.기본_최소뎀);
  const mx = splitFinal(stats?.최대뎀, stats?.기본_최대뎀);
  const cd = splitFinal(stats?.크댐, stats?.기본_크댐);
  return {
    type: stats?.type === 'M' ? 'M' : 'P',
    mainStat: Number(stats?.주스탯) || 0,
    eff: Number(stats?.근마효율) || 0,
    weaponMin: w.min,
    weaponMax: w.max,
    rawMin: mn.raw,
    fMin: mn.f,
    rawMax: mx.raw,
    fMax: mx.f,
    rawCd: cd.raw,
    fCd: cd.f,
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
  const mn = splitFinal(stats?.최소뎀, stats?.기본_최소뎀);
  const mx = splitFinal(stats?.최대뎀, stats?.기본_최대뎀);
  const cd = splitFinal(stats?.크댐, stats?.기본_크댐);
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
    [`rawMIN_${x}`]: mn.raw,
    [`rawMAX_${x}`]: mx.raw,
    [`rawCD_${x}`]: cd.raw,
    [`FMIN_${x}`]: mn.f,
    [`FMAX_${x}`]: mx.f,
    [`FCD_${x}`]: cd.f,
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
