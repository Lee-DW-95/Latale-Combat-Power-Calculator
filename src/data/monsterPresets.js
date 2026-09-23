// @ts-check
/**
 * 대상(몬스터) 프리셋 — 대미지 계산기 입력용.
 *
 * ⚠ 출처·검증 상태
 *   수치는 공개 계산기(alfm201/damage-test)가 정리해 둔 값을 옮긴 것이고,
 *   우리 쪽 인게임 실측으로는 아직 확인하지 않았다 (verified: false).
 *   실측으로 확인한 항목부터 verified 를 true 로 바꾸고, 어긋나면 값을 우리 실측으로 교체한다.
 *
 * 필드
 *   ARMOR / RES        물리 방어력 / 마법 저항력
 *   F_P   / F_M        물리 / 마법 피해 감소 (대미지에서 빼는 고정값)
 *   Guard              대미지 감소 %
 *   ELASTICITY         크리티컬 저항 (1000 분모 — 600 이면 크댐이 40% 로 깎인다)
 *   target             'normal' | 'boss' — 어느 쪽 추가대미지·지배력을 쓰는지 결정
 *
 * 던전 그룹은 난이도 1~5 보정이 따로 있다 (DUNGEON_DIFFICULTIES).
 *   ratios 는 기본값 대비 %, adds 는 가감산.
 */

/** 수련의 방 목각인형은 모든 방어 항이 0 이라 공식 검증의 기준점이다. */
export const CALIBRATION_PRESET_ID = '810003192';

export const MONSTER_PRESETS = Object.freeze([
  {
    id: '810003192', group: '수련의 방', label: '목각인형 프리링', target: 'normal',
    stats: { ARMOR: 0, RES: 0, F_P: 0, F_M: 0, Guard: 0, ELASTICITY: 0 },
    basis: '수련의 방 · 대미지 테스트', verified: false,
  },
  {
    id: '810003193', group: '수련의 방', label: '청동인형 프리팅', target: 'normal',
    stats: { ARMOR: 50000, RES: 50000, F_P: 0, F_M: 0, Guard: 0, ELASTICITY: 0 },
    basis: '수련의 방 · 대미지 테스트', verified: false,
  },
  {
    id: '810007332', group: '수련의 방', label: '일반형 강철인형 머슬링', target: 'normal',
    stats: { ARMOR: 2187171, RES: 2187171, F_P: 2187171, F_M: 2187171, Guard: 53, ELASTICITY: 600 },
    basis: '수련의 방 · 대미지 테스트', verified: false,
  },
  {
    id: '810007331', group: '수련의 방', label: '보스형 강철인형 머슬링', target: 'boss',
    stats: { ARMOR: 4374342, RES: 4374342, F_P: 4374342, F_M: 4374342, Guard: 90, ELASTICITY: 700 },
    basis: '수련의 방 · 대미지 테스트', verified: false,
  },
  {
    id: '810011277', group: '에메랄디아', label: '[일반] 에메랄디아', target: 'normal',
    stats: { ARMOR: 1504233, RES: 1504233, F_P: 1504233, F_M: 1504233, Guard: 53, ELASTICITY: 600 },
    basis: '기본 능력치', verified: false,
  },
  {
    id: '810011281', group: '에메랄디아', label: '[보스] 에메랄디아', target: 'boss',
    stats: { ARMOR: 3309312, RES: 3309312, F_P: 3309312, F_M: 3309312, Guard: 80, ELASTICITY: 700 },
    basis: '기본 능력치', verified: false,
  },
  {
    id: '810011922', group: '이카로스의 날개', label: '[일반] 이카로스의 날개', target: 'normal',
    stats: { ARMOR: 2187171, RES: 2187171, F_P: 2187171, F_M: 2187171, Guard: 53, ELASTICITY: 600 },
    basis: '기본 능력치', verified: false,
  },
  {
    id: '810011940', group: '이카로스의 날개', label: '[보스] 이카로스의 날개', target: 'boss',
    stats: { ARMOR: 4374342, RES: 4374342, F_P: 4374342, F_M: 4374342, Guard: 80, ELASTICITY: 700 },
    basis: '기본 능력치', verified: false,
  },
  {
    id: '810012187', group: '리키모 펠케', label: '[일반] 리키모 펠케', target: 'normal',
    stats: { ARMOR: 2296529, RES: 2296529, F_P: 2296529, F_M: 2296529, Guard: 53, ELASTICITY: 600 },
    basis: '기본 능력치', verified: false,
  },
  {
    id: '810012204', group: '리키모 펠케', label: '[보스] 리키모 펠케', target: 'boss',
    stats: { ARMOR: 4593058, RES: 4593058, F_P: 4593058, F_M: 4593058, Guard: 80, ELASTICITY: 700 },
    basis: '기본 능력치', verified: false,
  },
  {
    id: '810012589', group: '아마란스 노바', label: '[일반] 아마란스 노바', target: 'normal',
    stats: { ARMOR: 2526181, RES: 2526181, F_P: 2526181, F_M: 2526181, Guard: 53, ELASTICITY: 600 },
    basis: '기본 능력치', verified: false,
  },
  {
    id: '810012603', group: '아마란스 노바', label: '[보스] 아마란스 노바', target: 'boss',
    stats: { ARMOR: 5052362, RES: 5052362, F_P: 5052362, F_M: 5052362, Guard: 80, ELASTICITY: 700 },
    basis: '기본 능력치', verified: false,
  },
]);

/** 던전 난이도 보정 — 그룹명 → 난이도 1~5 */
export const DUNGEON_DIFFICULTIES = Object.freeze({
  '에메랄디아': [
    { level: 1, ratios: { ARMOR: 100, RES: 100, F_P: 10, F_M: 10 }, adds: { Guard: -40, ELASTICITY: 0 } },
    { level: 2, ratios: { ARMOR: 100, RES: 100, F_P: 30, F_M: 30 }, adds: { Guard: -20, ELASTICITY: 0 } },
    { level: 3, ratios: { ARMOR: 100, RES: 100, F_P: 60, F_M: 60 }, adds: { Guard: -15, ELASTICITY: 0 } },
    { level: 4, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
    { level: 5, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
  ],
  '이카로스의 날개': [
    { level: 1, ratios: { ARMOR: 100, RES: 100, F_P: 10, F_M: 10 }, adds: { Guard: -40, ELASTICITY: 0 } },
    { level: 2, ratios: { ARMOR: 100, RES: 100, F_P: 30, F_M: 30 }, adds: { Guard: -20, ELASTICITY: 0 } },
    { level: 3, ratios: { ARMOR: 100, RES: 100, F_P: 60, F_M: 60 }, adds: { Guard: -15, ELASTICITY: 0 } },
    { level: 4, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
    { level: 5, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
  ],
  '리키모 펠케': [
    { level: 1, ratios: { ARMOR: 100, RES: 100, F_P: 10, F_M: 10 }, adds: { Guard: -40, ELASTICITY: 0 } },
    { level: 2, ratios: { ARMOR: 100, RES: 100, F_P: 30, F_M: 30 }, adds: { Guard: -20, ELASTICITY: 0 } },
    { level: 3, ratios: { ARMOR: 100, RES: 100, F_P: 60, F_M: 60 }, adds: { Guard: -15, ELASTICITY: 0 } },
    { level: 4, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
    { level: 5, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
  ],
  '아마란스 노바': [
    { level: 1, ratios: { ARMOR: 100, RES: 100, F_P: 10, F_M: 10 }, adds: { Guard: -40, ELASTICITY: 0 } },
    { level: 2, ratios: { ARMOR: 100, RES: 100, F_P: 30, F_M: 30 }, adds: { Guard: -20, ELASTICITY: 0 } },
    { level: 3, ratios: { ARMOR: 100, RES: 100, F_P: 60, F_M: 60 }, adds: { Guard: -15, ELASTICITY: 0 } },
    { level: 4, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
    { level: 5, ratios: { ARMOR: 100, RES: 100, F_P: 100, F_M: 100 }, adds: { Guard: 0, ELASTICITY: 0 } },
  ],
});

/** 프리셋 + 난이도 → 실제 적용 스탯. 난이도가 없는 그룹이면 원본 그대로. */
export function scaledMonsterStats(preset, difficultyLevel) {
  const rows = DUNGEON_DIFFICULTIES[preset?.group];
  if (!rows) return { ...preset.stats };
  const row = rows.find((r) => r.level === Number(difficultyLevel)) || rows[rows.length - 1];
  return {
    ARMOR: Math.floor((preset.stats.ARMOR * row.ratios.ARMOR) / 100),
    RES: Math.floor((preset.stats.RES * row.ratios.RES) / 100),
    F_P: Math.floor((preset.stats.F_P * row.ratios.F_P) / 100),
    F_M: Math.floor((preset.stats.F_M * row.ratios.F_M) / 100),
    Guard: preset.stats.Guard + row.adds.Guard,
    ELASTICITY: preset.stats.ELASTICITY + row.adds.ELASTICITY,
  };
}

/** 난이도 선택이 필요한 프리셋인지 */
export function hasDifficulty(preset) {
  return !!DUNGEON_DIFFICULTIES[preset?.group];
}
