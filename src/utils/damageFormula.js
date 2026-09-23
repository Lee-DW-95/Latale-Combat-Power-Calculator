// @ts-check
/**
 * 라테일 대미지 계산식 — 공개 분석 문서(alfm201/damage-test README) 구조를 그대로 구현.
 *
 * ⚠ 검증 상태: 우리 쪽 인게임 실측으로 아직 대조하지 않았다.
 *   docs/DAMAGE_FORMULA.md 의 "검증 절차" 를 따라 목각인형(모든 방어 항 0)부터 맞춰야 한다.
 *
 * 계산 뼈대 (직타 기준, 소환은 기본 공격값·크댐·조건부만 다름)
 *
 *   B_0 = 주스탯_eff + floor(무기난수 × (C + 100) / 50)        // C = 스킬 계수
 *   m   = f32(1 − DEF / (DEF + a) × (100 − PEN) / 100)         // a = 물리 30L+200 / 마법 20L+200
 *   B_1 = f32(f32(B_0) × m)
 *   B_2 = f32(B_1 + FD + ADD)                                   // 고정대미지 + 몬스터 추가대미지
 *   U   = f32(B_2 − F)                                          // 피해 감소(고정값)
 *   K   = 100 + (크리면 floor(CD × (1000 − ELASTICITY) / 1000)) + 조건부(백어택·근거리·상태이상)
 *   T   = floor(f32(U × f32(K/100)) × Q / 100)                  // Q = 최소~최대 대미지 난수
 *   damage = floor(T × (100 − Guard) / 100 × f32(1 + f32(Dom/100)))
 *
 * 중간 단계마다 f32(IEEE 754 단정도) 변환과 floor 가 들어간다 — 이걸 빼면 몇 % 어긋난다.
 * 난수가 둘(무기 W, 대미지 Q)이라 결과는 단일 값이 아니라 범위다. 그래서 min/max/mid 를 같이 낸다.
 */

const f32 = Math.fround;
const floor = Math.floor;

/** 방어 초과(T_raw ≤ 0) 시 게임이 내보내는 내부값 {1, 2} 중 하한 */
const R_MIN = 1;

/** 소환은 표시 관통력과 무관하게 실효 99% (문서 기준, 검증 범위 내) */
export const SUMMON_EFFECTIVE_PEN = 99;

/** 소환 백어택은 캐릭터 백어택 대미지 대신 고정 +20 */
export const SUMMON_BACKATTACK = 20;

/** 소환 공격력 계수 기본값 — 대부분의 소환 공격이 2000 을 쓴다 */
export const DEFAULT_SUMMON_SC = 2000;

/**
 * @typedef {object} AttackerInput
 * @property {'P'|'M'} type            물리 / 마법
 * @property {number} mainStat         근력 또는 마법력 (표시값)
 * @property {number} eff              근력/마법력 효율 % — 직타에만 적용
 * @property {number} weaponMin        무기공격력 최소 (마법은 속성력 단일값을 min=max 로)
 * @property {number} weaponMax        무기공격력 최대
 * @property {number} rawMin           최소 대미지 고정값(+)
 * @property {number} fMin             최종 최소 대미지 %
 * @property {number} rawMax           최대 대미지 고정값(+)
 * @property {number} fMax             최종 최대 대미지 %
 * @property {number} rawCd            크리티컬 대미지 고정값(+)
 * @property {number} fCd              최종 크리티컬 대미지 %
 * @property {number} fixedDamage      고정 대미지 증가 (FD)
 * @property {number} addDamage        몬스터 추가 대미지 (ADD) — 대상 분류에 맞는 값
 * @property {number} pen              관통력 %
 * @property {number} dominance        지배력 % (Dom) — 대상 분류에 맞는 값
 * @property {number} level            캐릭터 레벨
 * @property {number} [backAttack]     백어택 대미지 (BD)
 * @property {number} [meleeDamage]    근거리 대미지 (MD)
 * @property {number} [statusDamage]   상태이상 대미지 (SD)
 */

/**
 * @typedef {object} TargetInput
 * @property {number} armor
 * @property {number} res
 * @property {number} fP           물리 피해 감소
 * @property {number} fM           마법 피해 감소
 * @property {number} guard        대미지 감소 %
 * @property {number} elasticity   크리티컬 저항
 */

/**
 * @typedef {object} SkillInput
 * @property {'direct'|'summon'} mode
 * @property {number} coef         직타 스킬 계수 C
 * @property {number} [summonS]    소환 능력치 적용 배율 % (S)
 * @property {number} [summonSc]   소환 공격력 계수 (SC)
 */

/**
 * @typedef {object} Conditions
 * @property {boolean} [crit]
 * @property {boolean} [backAttack]
 * @property {boolean} [melee]
 * @property {boolean} [status]
 */

/** 레벨 방어 상수 — 물리 30L+200, 마법 20L+200 */
export function defenseConstant(type, level) {
  const L = Math.max(1, Number(level) || 1);
  return type === 'M' ? 20 * L + 200 : 30 * L + 200;
}

/** 방어/저항 계수 m = f32(1 − DEF/(DEF+a) × (100−PEN)/100) */
export function defenseCoef(defense, constantA, pen) {
  const d = Math.max(0, Number(defense) || 0);
  const denom = d + constantA;
  if (denom <= 0) return 1;
  return f32(1 - (d / denom) * ((100 - pen) / 100));
}

/** 난수 범위 — 하한이 상한보다 크면 하한도 상한으로 눌린다 (문서 규칙) */
function clampRange(lo, hi) {
  const min = Math.min(lo, hi);
  return { min, max: hi };
}

/** 표시 스탯 → 계산용 파생값 */
function derive(att, skill) {
  const isMagic = att.type === 'M';
  const S = Number(skill.summonS) || 0;
  const mainEff = floor(att.mainStat * (1 + (Number(att.eff) || 0) / 100));

  const MIN = floor((att.rawMin * (100 + att.fMin)) / 100);
  const MAX = floor((att.rawMax * (100 + att.fMax)) / 100);
  const CD = floor((att.rawCd * (100 + att.fCd)) / 100);

  // 소환 크댐은 능력치 배율 S 를 거쳐 줄어든 뒤 최종% 가 붙는다
  const R_s = floor(((att.rawCd - 50) * S) / 100) + 50;
  const CD_s = floor((R_s * (100 + att.fCd)) / 100);

  const weapon = clampRange(att.weaponMin, att.weaponMax);
  const qDirect = clampRange(MIN, MAX);
  const qSummon = clampRange(floor((MIN * S) / 100) + 95, floor((MAX * S) / 100) + 105);

  return { isMagic, mainEff, MIN, MAX, CD, CD_s, weapon, qDirect, qSummon };
}

/**
 * 대미지 1회 계산 — 무기·대미지 난수를 인자로 받는 결정론적 함수.
 * @param {AttackerInput} att
 * @param {TargetInput} tgt
 * @param {SkillInput} skill
 * @param {Conditions} cond
 * @param {number} weaponRoll  무기공격력 난수 W (마법 직타는 속성력, 소환은 W_s)
 * @param {number} qRoll       대미지 난수 Q
 * @returns {number} 최종 대미지
 */
export function damageOnce(att, tgt, skill, cond, weaponRoll, qRoll) {
  const d = derive(att, skill);
  const isSummon = skill.mode === 'summon';
  const a = defenseConstant(att.type, att.level);
  const defense = d.isMagic ? tgt.res : tgt.armor;
  const reduce = d.isMagic ? tgt.fM : tgt.fP;
  const pen = isSummon ? SUMMON_EFFECTIVE_PEN : Number(att.pen) || 0;

  // 1) 기본 공격값
  let B0;
  if (isSummon) {
    const SC = Number(skill.summonSc ?? DEFAULT_SUMMON_SC) || 0;
    const S = Number(skill.summonS) || 0;
    B0 = floor((att.mainStat * S) / 100) + ((weaponRoll + 1) * (SC + 100)) / 50 + 1;
  } else {
    B0 = d.mainEff + floor((weaponRoll * (skill.coef + 100)) / 50);
  }

  // 2) 방어/저항 + 관통
  const B1 = f32(f32(B0) * defenseCoef(defense, a, pen));
  // 3) 고정 대미지 + 추가 대미지 → 4) 피해 감소
  const B2 = f32(B1 + (Number(att.fixedDamage) || 0) + (Number(att.addDamage) || 0));
  const U = f32(B2 - (Number(reduce) || 0));

  // 5) 크리티컬·조건부 계수
  let K = 100;
  if (cond.crit) {
    const cdBase = isSummon ? d.CD_s : d.CD;
    K += floor((cdBase * (1000 - (Number(tgt.elasticity) || 0))) / 1000);
  }
  if (isSummon) {
    if (cond.backAttack) K += SUMMON_BACKATTACK; // 캐릭터 BD 대신 고정 20, 크리저항 미적용
  } else {
    if (cond.backAttack) K += Number(att.backAttack) || 0;
    if (cond.melee) K += Number(att.meleeDamage) || 0;
    if (cond.status) K += Number(att.statusDamage) || 0;
  }
  const Ucond = f32(U * f32(K / 100));

  // 6) 난수 적용 → 7) 방어 초과 판정
  const Traw = floor(f32(Ucond * qRoll) / 100);
  const D = Traw > 0 ? Traw : R_MIN;

  // 8) 대미지 감소 % → 지배력
  const g = f32(1 + f32((Number(att.dominance) || 0) / 100));
  return floor(((D * (100 - (Number(tgt.guard) || 0))) / 100) * g);
}

/**
 * 난수 범위를 훑어 최소/중앙/최대 대미지를 낸다.
 *   물리 직타만 난수가 둘(W, Q)이고, 나머지는 Q 하나다.
 * @returns {{ min:number, mid:number, max:number, range:{ weapon:{min:number,max:number}, q:{min:number,max:number} } }}
 */
export function damageRange(att, tgt, skill, cond) {
  const d = derive(att, skill);
  const isSummon = skill.mode === 'summon';
  const q = isSummon ? d.qSummon : d.qDirect;
  // 마법은 속성력 단일값 — weaponMin/Max 를 같게 넣어 두면 자동으로 폭이 0 이 된다.
  const w = d.weapon;
  const at = (wv, qv) => damageOnce(att, tgt, skill, cond, wv, qv);
  const min = at(w.min, q.min);
  const max = at(w.max, q.max);
  const mid = at((w.min + w.max) / 2, (q.min + q.max) / 2);
  return { min, mid, max, range: { weapon: w, q } };
}

/**
 * 크리티컬 확률을 섞은 기대 대미지 — 스펙 비교용 단일 지표.
 * @param {number} critRate 0~1
 */
export function expectedDamage(att, tgt, skill, cond, critRate = 0) {
  const nonCrit = damageRange(att, tgt, skill, { ...cond, crit: false }).mid;
  const crit = damageRange(att, tgt, skill, { ...cond, crit: true }).mid;
  const p = Math.min(1, Math.max(0, Number(critRate) || 0));
  return nonCrit * (1 - p) + crit * p;
}
