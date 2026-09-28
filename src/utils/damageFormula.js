// @ts-check
/**
 * 라테일 대미지 계산식.
 *
 * 근거: 공개 계산기 alfm201/damage-test 의 실제 계산 코드(v9.17, 2026-09-24) 를 읽고 연산 순서를 맞췄다.
 *   같은 저장소의 README 공식과는 f32 변환 위치·덧셈 순서가 몇 군데 다르며, 여기서는 **코드 쪽**을 따른다.
 *   차이 목록은 docs/DAMAGE_FORMULA.md "README 와 실제 코드의 차이" 참고.
 *
 * ⚠ 검증 상태: 우리 인게임 실측으로는 아직 대조하지 않았다.
 *
 * 계산 뼈대 (직타)
 *   B_0 = 주스탯_eff + floor(W × (C + 100) / 50)
 *   m   = f32(1 − DEF/(DEF + a) × f32((100 − PEN)/100))     a = 물리 30L+200 / 마법 20L+200
 *   B_1 = f32(f32(B_0) × m)
 *   B_2 = f32(B_1 + FD)        ← 고정 대미지
 *   B_3 = f32(B_2 − F)         ← 피해 감소
 *   U   = f32(B_3 + ADD)       ← 몬스터 추가 대미지 (피해 감소 **뒤**)
 *   T   = floor(f32(f32(U × f32(K/100)) × Q) / 100)
 *   D   = T > 0 ? T : 1~2      ← 방어 초과 시 게임 내부값
 *   damage = floor(D × (100 − Guard) / 100 × g),   g = f32(f32(100 + Dom) / 100)
 *
 * 소환은 소환체 프로필(배율)과 소환 몹의 기본값을 쓴다. 대부분(몹 523종 중 515종, 소환체 336종 중 332종)은
 * 기본값이 같아서 README 의 "+1, 95/105, 50, 20" 고정 상수식과 결과가 같지만, 예외가 있어 인자로 받는다.
 */

const f32 = Math.fround;
const floor = Math.floor;

/** 소환은 표시 관통력과 무관하게 실효 99% */
export const SUMMON_EFFECTIVE_PEN = 99;

/** 소환 공격력 계수 기본값 — 대부분의 소환 공격이 2000 을 쓴다 */
export const DEFAULT_SUMMON_SC = 2000;

/**
 * 소환 몹 기본값 — 몹 523종 중 515종이 이 값이다.
 *   README 의 고정 상수(+1, 95/105, 크댐 50, 백어택 20)가 여기서 나온다.
 */
export const DEFAULT_SUMMON_MOB = Object.freeze({
  statBase: 1, // Base_Atk / Base_Ele
  attackBase: 1, // BASE_NORMAL / Base_Water
  minDamage: 95, // Base_Atk_Min_Dam
  maxDamage: 105, // Base_Atk_Max_Dam
  critDamage: 50, // BASE_CRITICAL_DAMAGE
  backAttack: 20, // BASE_BACK_DAM
  fixedDamage: 0, // BASE_DAMAGE_ABSOLUTE
});

/** 평균 대미지 적분 표본 수 — 원본 계산기와 같은 값 */
const AVG_GRID_AXIS = 256; // 무기·대미지 난수가 둘 다 있을 때 256 × 256 격자
const AVG_1D_SAMPLES = 16384; // 난수가 하나일 때

/**
 * @typedef {object} AttackerInput
 * @property {'P'|'M'} type
 * @property {number} mainStat         근력 또는 마법력
 * @property {number} eff              근력/마법력 효율 % — 직타에만 적용
 * @property {number} weaponMin        무기공격력 최소 (마법은 속성력을 min=max 로)
 * @property {number} weaponMax
 * @property {number} rawMin           최소 대미지(+)
 * @property {number} fMin             최종 최소 대미지 %
 * @property {number} rawMax           최대 대미지(+)
 * @property {number} fMax             최종 최대 대미지 %
 * @property {number} rawCd            크리티컬 대미지(+)
 * @property {number} fCd              최종 크리티컬 대미지 %
 * @property {number} fixedDamage      고정 대미지 (FD)
 * @property {number} addDamage        몬스터 추가 대미지 (ADD)
 * @property {number} pen              관통력 %
 * @property {number} dominance        지배력 %
 * @property {number} level            캐릭터 레벨
 * @property {number} [backAttack]     백어택 대미지 (BD)
 * @property {number} [meleeDamage]    근거리 대미지 (MD)
 * @property {number} [statusDamage]   상태이상 대미지 (SD)
 */

/**
 * @typedef {object} TargetInput
 * @property {number} armor
 * @property {number} res
 * @property {number} fP
 * @property {number} fM
 * @property {number} guard
 * @property {number} elasticity
 */

/**
 * 소환체 프로필 — 원본 데이터 summons[] 의 배율(%). 생략하면 전부 S 로 본다.
 * @typedef {object} SummonProfile
 * @property {number} [statRatio]      Atk / Ele — 능력치 계승 배율 (= S)
 * @property {number} [attackRatio]    Weapon_Dam / Element — 무기공격력 계승 배율 (보통 100)
 * @property {number} [damageRatio]    All_Mix_Dam — 최소·최대 대미지 계승 배율 (보통 S)
 * @property {number} [critRatio]      Cri_Dam — 크리티컬 대미지 계승 배율 (보통 S)
 * @property {number} [fixedRatio]     Damage_Absolute — 고정 대미지 계승 배율 (보통 100)
 * @property {number} [addRatio]       Boss_Dam / Mob_Dam — 추가 대미지 계승 배율 (보통 100)
 */

/**
 * @typedef {object} SkillInput
 * @property {'direct'|'summon'} mode
 * @property {number} coef             직타 스킬 계수 C
 * @property {number} [summonS]        소환 능력치 배율 % (S)
 * @property {number} [summonSc]       소환 공격력 계수 (SC)
 * @property {SummonProfile} [profile] 소환체 프로필 — 없으면 S 하나로 통일
 * @property {Partial<typeof DEFAULT_SUMMON_MOB>} [mob] 소환 몹 기본값 — 없으면 DEFAULT_SUMMON_MOB
 */

/**
 * @typedef {object} Conditions
 * @property {boolean} [crit]
 * @property {boolean} [backAttack]
 * @property {boolean} [melee]
 * @property {boolean} [status]
 */

/** 스킬 계수 C = base + step × 스킬레벨 (+ 특화석 보너스) — 원본 스킬 데이터 규칙 */
export function skillCoefficient(base, step, level, bonus = 0, bonusPerLevel = 0) {
  const lv = Math.max(0, Number(level) || 0);
  return (Number(base) || 0) + (Number(step) || 0) * lv + (Number(bonus) || 0) + (Number(bonusPerLevel) || 0) * lv;
}

/** 레벨 방어 상수 — 물리 30L+200, 마법 20L+200 */
export function defenseConstant(type, level) {
  const L = Math.max(1, Number(level) || 1);
  return type === 'M' ? 20 * L + 200 : 30 * L + 200;
}

/** 방어/저항 계수 m = f32(1 − DEF/(DEF+a) × f32((100−PEN)/100)) */
export function defenseCoef(defense, constantA, pen) {
  const d = Math.max(0, Number(defense) || 0);
  const denom = d + constantA;
  if (denom <= 0) return 1;
  const penRemainder = f32((100 - pen) / 100);
  return f32(1 - (d / denom) * penRemainder);
}

/** 지배력 계수 g = f32(f32(100 + Dom) / 100) */
export function dominanceCoef(dom) {
  return f32(f32(100 + (Number(dom) || 0)) / 100);
}

/** 최종 적용 — floor(D × (100 − Guard) / 100 × g) */
function applyFinal(D, guard, g) {
  return floor(((D * (100 - (Number(guard) || 0))) / 100) * g);
}

/** 채널 공통 파생값 */
function derive(att, tgt, skill) {
  const isMagic = att.type === 'M';
  const isSummon = skill.mode === 'summon';
  const S = Number(skill.summonS) || 0;
  const prof = skill.profile || {};
  const mob = { ...DEFAULT_SUMMON_MOB, ...(skill.mob || {}) };
  const ratio = {
    stat: prof.statRatio ?? S,
    attack: prof.attackRatio ?? 100,
    damage: prof.damageRatio ?? S,
    crit: prof.critRatio ?? S,
    fixed: prof.fixedRatio ?? 100,
    add: prof.addRatio ?? 100,
  };

  const MIN = floor((att.rawMin * (100 + att.fMin)) / 100);
  const MAX = floor((att.rawMax * (100 + att.fMax)) / 100);
  const CD = floor((att.rawCd * (100 + att.fCd)) / 100);

  const wLo = Math.min(att.weaponMin, att.weaponMax);
  const wHi = att.weaponMax;

  const a = defenseConstant(att.type, att.level);
  const defense = isMagic ? tgt.res : tgt.armor;
  const F = Number(isMagic ? tgt.fM : tgt.fP) || 0;
  const pen = isSummon ? SUMMON_EFFECTIVE_PEN : Number(att.pen) || 0;
  const m = defenseCoef(defense, a, pen);
  const g = dominanceCoef(att.dominance);

  let q;
  let critK;
  if (isSummon) {
    const qHi = floor(MAX * (ratio.damage / 100)) + mob.maxDamage;
    const qLo = Math.min(floor(MIN * (ratio.damage / 100)) + mob.minDamage, qHi);
    q = { min: qLo, max: qHi };
    const cd = floor(((att.rawCd - 50) * ratio.crit) / 100) + mob.critDamage;
    critK = floor((floor((cd * (100 + att.fCd)) / 100) * (1000 - (Number(tgt.elasticity) || 0))) / 1000);
  } else {
    q = { min: Math.min(MIN, MAX), max: MAX };
    critK = floor((CD * (1000 - (Number(tgt.elasticity) || 0))) / 1000);
  }

  return { isMagic, isSummon, S, ratio, mob, MIN, MAX, CD, weapon: { min: wLo, max: wHi }, m, g, F, q, critK };
}

/** 공격항 파이프라인 — B0 → 방어 → +FD → −F → +ADD (단계마다 f32) */
function pipelineU(att, skill, d, weaponRoll) {
  let B0;
  let FD = Number(att.fixedDamage) || 0;
  let ADD = Number(att.addDamage) || 0;
  if (d.isSummon) {
    const SC = Number(skill.summonSc ?? DEFAULT_SUMMON_SC) || 0;
    const statTerm = floor((att.mainStat * d.ratio.stat) / 100) + d.mob.statBase;
    // 무기공격력은 연속 난수 그대로 쓴다 (원본 평균 적분과 같은 처리). 원본 스킬 엔진은 끝점에서
    // floor(W × Weapon_Dam/100) 을 하지만, 소환체 336종 모두 Weapon_Dam = 100 이라 정수 끝점에선 같다.
    const attack = weaponRoll * (d.ratio.attack / 100) + d.mob.attackBase;
    B0 = statTerm + attack * ((SC + 100) / 50);
    FD = floor((FD * d.ratio.fixed) / 100) + d.mob.fixedDamage;
    ADD = floor((ADD * d.ratio.add) / 100);
  } else {
    const mainEff = floor(att.mainStat * (1 + (Number(att.eff) || 0) / 100));
    B0 = mainEff + floor((weaponRoll * (skill.coef + 100)) / 50);
  }
  const B1 = f32(f32(B0) * d.m);
  const B2 = f32(B1 + FD);
  const B3 = f32(B2 - d.F);
  return f32(B3 + ADD);
}

/** 크리·조건부 계수 K */
function kOf(att, d, cond) {
  let K = 100;
  if (cond.crit) K += d.critK;
  if (d.isSummon) {
    if (cond.backAttack) K += d.mob.backAttack; // 소환은 캐릭터 백어택 대신 몹 기본값(보통 20)
  } else {
    if (cond.backAttack) K += Number(att.backAttack) || 0;
    if (cond.melee) K += Number(att.meleeDamage) || 0;
    if (cond.status) K += Number(att.statusDamage) || 0;
  }
  return K;
}

/** 지배력·Guard 적용 전 원시값 T */
function rawT(U, K, qRoll) {
  const Ucond = f32(U * f32(K / 100));
  return floor(f32(Ucond * qRoll) / 100);
}

/**
 * 대미지 1회 — 무기·대미지 난수를 인자로 받는 결정론적 함수.
 * 방어 초과(T ≤ 0)면 게임 내부값 {1, 2} 중 1 을 쓴다.
 */
export function damageOnce(att, tgt, skill, cond, weaponRoll, qRoll) {
  const d = derive(att, tgt, skill);
  const T = rawT(pipelineU(att, skill, d, weaponRoll), kOf(att, d, cond), qRoll);
  return applyFinal(T > 0 ? T : 1, tgt.guard, d.g);
}

/**
 * 최소·최대·평균 대미지.
 *   min/max 는 난수 양 끝점. 방어 초과 영역이면 D 를 {1 … max(2, T)} 로 본다 (원본 규칙).
 *   avg 는 난수 구간을 격자로 적분한 평균 (물리 직타 256×256, 그 외 16,384점) — 원본과 같은 방식.
 *   mid 는 난수 중앙값에서 한 번 계산한 값 (빠른 근사).
 * @returns {{ min:number, max:number, mid:number, avg:number|null, floorActive:boolean,
 *             range:{ weapon:{min:number,max:number}, q:{min:number,max:number} } }}
 */
export function damageRange(att, tgt, skill, cond) {
  const d = derive(att, tgt, skill);
  const K = kOf(att, d, cond);
  const w = d.weapon;
  const q = d.q;

  const corners = [];
  for (const wv of w.min === w.max ? [w.min] : [w.min, w.max]) {
    const U = pipelineU(att, skill, d, wv);
    for (const qv of q.min === q.max ? [q.min] : [q.min, q.max]) corners.push(rawT(U, K, qv));
  }
  const rawMin = Math.min(...corners);
  const rawMax = Math.max(...corners);
  const floorActive = rawMin <= 0;
  const Dmin = floorActive ? 1 : rawMin;
  const Dmax = floorActive ? Math.max(2, rawMax) : rawMax;

  const Umid = pipelineU(att, skill, d, (w.min + w.max) / 2);
  const Tmid = rawT(Umid, K, (q.min + q.max) / 2);

  return {
    min: applyFinal(Dmin, tgt.guard, d.g),
    max: applyFinal(Dmax, tgt.guard, d.g),
    mid: applyFinal(Tmid > 0 ? Tmid : 1, tgt.guard, d.g),
    avg: floorActive ? null : averageDamage(att, tgt, skill, d, K),
    floorActive,
    range: { weapon: w, q },
  };
}

/** 난수 구간 중점 적분 평균 (Kahan 합) — 원본 averageDamageEstimate 와 같은 표본 배치 */
function averageDamage(att, tgt, skill, d, K) {
  const w = d.weapon;
  const q = d.q;
  const wVar = !d.isMagic && w.min !== w.max;
  const qVar = q.min !== q.max;
  if (!wVar && !qVar) return null;
  const wN = wVar && qVar ? AVG_GRID_AXIS : wVar ? AVG_1D_SAMPLES : 1;
  const qN = wVar && qVar ? AVG_GRID_AXIS : qVar ? AVG_1D_SAMPLES : 1;
  let sum = 0;
  let c = 0;
  let count = 0;
  const k32 = f32(K / 100);
  for (let wi = 0; wi < wN; wi += 1) {
    const wv = wN === 1 ? w.min : w.min + ((wi + 0.5) * (w.max - w.min)) / wN;
    const Ucond = f32(pipelineU(att, skill, d, wv) * k32);
    for (let qi = 0; qi < qN; qi += 1) {
      const qv = qN === 1 ? q.min : q.min + ((qi + 0.5) * (q.max - q.min)) / qN;
      const T = floor(f32(Ucond * qv) / 100);
      if (T <= 0) return null;
      const y = applyFinal(T, tgt.guard, d.g) - c;
      const t = sum + y;
      c = t - sum - y;
      sum = t;
      count += 1;
    }
  }
  return sum / count;
}

/**
 * 크리 확률을 섞은 기대 대미지 — 스펙 비교용 단일 지표.
 * 적분 평균이 있으면 그걸, 없으면(방어 초과·난수 없음) 중앙값을 쓴다.
 * @param {number} critRate 0~1
 */
export function expectedDamage(att, tgt, skill, cond, critRate = 0) {
  const pick = (r) => r.avg ?? r.mid;
  const nonCrit = pick(damageRange(att, tgt, skill, { ...cond, crit: false }));
  const crit = pick(damageRange(att, tgt, skill, { ...cond, crit: true }));
  const p = Math.min(1, Math.max(0, Number(critRate) || 0));
  return nonCrit * (1 - p) + crit * p;
}
