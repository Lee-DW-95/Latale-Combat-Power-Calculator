/**
 * 대미지 공식 구조 테스트.
 *
 * ⚠ 인게임 실측 대조는 아직이다 (docs/DAMAGE_FORMULA.md 참고).
 *   여기서는 "공식 구조가 문서대로 구현됐는지" 만 검사한다 —
 *   실측이 들어오면 그 케이스를 EXPECTED 에 넣어 회귀 테스트로 굳힌다.
 */
import {
  damageRange,
  defenseConstant,
  defenseCoef,
  expectedDamage,
  SUMMON_EFFECTIVE_PEN,
} from '../src/utils/damageFormula.js';
import { MONSTER_PRESETS, scaledMonsterStats, hasDifficulty } from '../src/data/monsterPresets.js';
import { attackerFromStats, targetFromPreset } from '../src/utils/damageInputs.js';

let pass = 0;
let fail = 0;
function check(name, cond, note = '') {
  if (cond) {
    pass += 1;
    console.log(`✓ PASS  ${name}${note ? `  (${note})` : ''}`);
  } else {
    fail += 1;
    console.log(`✗ FAIL  ${name}${note ? `  (${note})` : ''}`);
  }
}

// ── 기준 입력: 예시 캐릭터 수준, 목각인형(모든 방어 항 0) ──
const ATT = {
  type: 'P',
  mainStat: 9_315_101,
  eff: 0,
  weaponMin: 86_931,
  weaponMax: 89_042,
  rawMin: 9_156,
  fMin: 0,
  rawMax: 9_833,
  fMax: 0,
  rawCd: 11_838,
  fCd: 0,
  fixedDamage: 1_038_824,
  addDamage: 1_193_460,
  pen: 99,
  dominance: 0,
  level: 235,
  backAttack: 0,
  meleeDamage: 0,
  statusDamage: 0,
};
const DUMMY = { armor: 0, res: 0, fP: 0, fM: 0, guard: 0, elasticity: 0 };
const SKILL = { mode: 'direct', coef: 1000 };

// ── 상수·계수 ──
check('물리 방어 상수 = 30L + 200', defenseConstant('P', 235) === 30 * 235 + 200);
check('마법 저항 상수 = 20L + 200', defenseConstant('M', 235) === 20 * 235 + 200);
check('방어력 0 이면 계수 1', defenseCoef(0, 7250, 0) === 1);
check('관통 100% 면 방어 무시', defenseCoef(5_000_000, 7250, 100) === 1);
check(
  '관통 0% · 방어력↑ 이면 계수↓',
  defenseCoef(5_000_000, 7250, 0) < defenseCoef(1_000_000, 7250, 0),
);

// ── 단조성: 스탯이 오르면 대미지도 오른다 ──
const base = damageRange(ATT, DUMMY, SKILL, {}).mid;
check('기준 대미지 > 0', base > 0, `${base.toLocaleString('ko-KR')}`);
for (const [label, patch] of [
  ['주스탯', { mainStat: ATT.mainStat * 1.1 }],
  ['무기공격력', { weaponMin: ATT.weaponMin * 1.1, weaponMax: ATT.weaponMax * 1.1 }],
  ['최대 대미지', { rawMax: ATT.rawMax + 500 }],
  ['고정 대미지', { fixedDamage: ATT.fixedDamage * 1.1 }],
  ['추가 대미지', { addDamage: ATT.addDamage * 1.1 }],
  ['지배력', { dominance: 5 }],
]) {
  const up = damageRange({ ...ATT, ...patch }, DUMMY, SKILL, {}).mid;
  check(`${label} ↑ → 대미지 ↑`, up > base, `${base.toLocaleString('ko-KR')} → ${up.toLocaleString('ko-KR')}`);
}

// ── 크리티컬 ──
const crit = damageRange(ATT, DUMMY, SKILL, { crit: true }).mid;
check('크리 > 비크리', crit > base, `${base.toLocaleString('ko-KR')} → ${crit.toLocaleString('ko-KR')}`);
const critRatio = crit / base;
check(
  '크리 배율 ≈ 1 + 크댐/100 (저항 0)',
  Math.abs(critRatio - (1 + ATT.rawCd / 100)) / critRatio < 0.02,
  `측정 ${critRatio.toFixed(1)} vs 기대 ${(1 + ATT.rawCd / 100).toFixed(1)}`,
);
// 크리티컬 저항이 크댐을 깎는다 (600 → 40% 만 남음)
const critResisted = damageRange(ATT, { ...DUMMY, elasticity: 600 }, SKILL, { crit: true }).mid;
check('크리 저항 600 이면 크리 대미지 감소', critResisted < crit);

// ── 난수 범위 ──
const r = damageRange(ATT, DUMMY, SKILL, {});
check('min ≤ mid ≤ max', r.min <= r.mid && r.mid <= r.max, `${r.min} / ${r.mid} / ${r.max}`);
check('무기 난수 폭 반영', r.range.weapon.min === ATT.weaponMin && r.range.weapon.max === ATT.weaponMax);

// ── 대상 측 감소 ──
check(
  'Guard 50% 면 대미지 절반 근처',
  Math.abs(damageRange(ATT, { ...DUMMY, guard: 50 }, SKILL, {}).mid / base - 0.5) < 0.01,
);
check('피해 감소(F) 적용 시 대미지 감소', damageRange(ATT, { ...DUMMY, fP: 1_000_000 }, SKILL, {}).mid < base);
check(
  '방어 초과 시 최소값으로 떨어진다',
  damageRange({ ...ATT, pen: 0 }, { ...DUMMY, armor: 0, fP: 10 ** 12 }, SKILL, {}).mid <= 2,
);

// ── 소환 ──
const SUMMON = { mode: 'summon', coef: 0, summonS: 100, summonSc: 2000 };
const summonBase = damageRange(ATT, DUMMY, SUMMON, {}).mid;
check('소환 대미지 > 0', summonBase > 0, `${summonBase.toLocaleString('ko-KR')}`);
check(
  '소환은 표시 관통과 무관 (실효 99%)',
  damageRange({ ...ATT, pen: 0 }, DUMMY, SUMMON, {}).mid === summonBase,
  `SUMMON_EFFECTIVE_PEN=${SUMMON_EFFECTIVE_PEN}`,
);
check(
  '소환 백어택은 고정 +20% (캐릭터 BD 무시)',
  Math.abs(
    damageRange({ ...ATT, backAttack: 999 }, DUMMY, SUMMON, { backAttack: true }).mid / summonBase - 1.2,
  ) < 0.01,
);
check('소환 크리 > 소환 비크리', damageRange(ATT, DUMMY, SUMMON, { crit: true }).mid > summonBase);

// ── 조건부 (직타) ──
check(
  '백어택 +100% 면 대미지 2배 근처',
  Math.abs(damageRange({ ...ATT, backAttack: 100 }, DUMMY, SKILL, { backAttack: true }).mid / base - 2) < 0.01,
);

// ── 기대 대미지 ──
const exp0 = expectedDamage(ATT, DUMMY, SKILL, {}, 0);
const exp1 = expectedDamage(ATT, DUMMY, SKILL, {}, 1);
check('크리율 0 = 비크리, 1 = 크리', Math.abs(exp0 - base) < 1 && Math.abs(exp1 - crit) < 1);

// ── 프리셋 데이터 ──
check('프리셋 12종 로드', MONSTER_PRESETS.length === 12);
const dummyPreset = MONSTER_PRESETS.find((p) => p.label === '목각인형 프리링');
check(
  '목각인형은 모든 방어 항이 0 (검증 기준점)',
  Object.values(dummyPreset.stats).every((v) => v === 0),
);
const eme = MONSTER_PRESETS.find((p) => p.group === '에메랄디아' && p.target === 'normal');
check('던전 프리셋은 난이도 보정이 있다', hasDifficulty(eme));
const lv1 = scaledMonsterStats(eme, 1);
const lv4 = scaledMonsterStats(eme, 4);
check('난이도 1 은 피해감소·Guard 가 낮다', lv1.F_P < lv4.F_P && lv1.Guard < lv4.Guard, `${lv1.Guard} vs ${lv4.Guard}`);

// ── 어댑터 ──
const statsLike = {
  type: 'P',
  주스탯: 9_315_101,
  공격력: 87_986,
  무기공표시min: 86_931,
  무기공표시max: 89_042,
  크댐: 11_838,
  최소뎀: 9_156,
  최대뎀: 9_833,
  고댐: 1_038_824,
  일몬추: 1_193_460,
  보몬추: 1_058_835,
  일몬지: 0,
  보몬지: 3,
  관통: 99,
  근마효율: 0,
};
const aNormal = attackerFromStats(statsLike, { target: 'normal', level: 235 });
const aBoss = attackerFromStats(statsLike, { target: 'boss', level: 235 });
check('대상 분류에 맞는 추가대미지 선택', aNormal.addDamage === 1_193_460 && aBoss.addDamage === 1_058_835);
check('대상 분류에 맞는 지배력 선택', aNormal.dominance === 0 && aBoss.dominance === 3);
check('무기 표시범위를 그대로 쓴다', aNormal.weaponMin === 86_931 && aNormal.weaponMax === 89_042);
const t = targetFromPreset(dummyPreset.stats);
check('프리셋 → TargetInput 변환', t.armor === 0 && t.guard === 0 && t.elasticity === 0);

console.log('───────────────────────────────────────────────────');
console.log(fail ? `✗ ${fail}개 항목 실패 (통과 ${pass})` : `✓ 대미지 공식 구조 전부 통과 (${pass})`);
if (fail) process.exit(1);
