/**
 * 성물 뽑기 시뮬 raw 데이터 
 *
 * 두 종류:
 *   1) 공용석 (신성의 돌)  — 옵션 15종 × 5레벨, 1~4줄 카드, 옵션·레벨 모두 균등
 *   2) 전용석 (6종 명품 성물석) — 옵션 1종 + Lv 1~10 가중 + 등급별 추가 옵션
 */

// ============================================================
// 1) 공용석 (신성의 돌)
// ============================================================

// 라인 수 분포
export const SHARED_PICK_COUNT_DIST = [
  { k: 1, p: 0.35 },
  { k: 2, p: 0.30 },
  { k: 3, p: 0.20 },
  { k: 4, p: 0.15 },
];

// 1회 비용
export const SHARED_COST = Object.freeze({ shard: 50, ely: 30_000_000 });

// 옵션 15종 × 5레벨
//   각 레벨은 [min, max] 정수 균등 (백어택대미지/명중률만 % 표시 강제)
export const SHARED_OPTIONS = [
  { type: '근력/마법력', tiers: [{ min: 1, max: 600 }, { min: 300, max: 1200 }, { min: 450, max: 1800 }, { min: 600, max: 2400 }, { min: 750, max: 3000 }] },
  { type: '마법 대미지감소', tiers: [{ min: 1, max: 80 }, { min: 40, max: 160 }, { min: 60, max: 240 }, { min: 80, max: 320 }, { min: 100, max: 400 }] },
  { type: '마법 저항력', tiers: [{ min: 1, max: 600 }, { min: 300, max: 1200 }, { min: 450, max: 1800 }, { min: 600, max: 2400 }, { min: 750, max: 3000 }] },
  { type: '무기 공격력/속성력', tiers: [{ min: 1, max: 4 }, { min: 2, max: 8 }, { min: 3, max: 12 }, { min: 4, max: 16 }, { min: 5, max: 20 }] },
  { type: '물리 대미지 감소', tiers: [{ min: 1, max: 80 }, { min: 40, max: 160 }, { min: 60, max: 240 }, { min: 80, max: 320 }, { min: 100, max: 400 }] },
  { type: '물리/마법 고정 대미지', tiers: [{ min: 1, max: 1000 }, { min: 500, max: 2000 }, { min: 750, max: 3000 }, { min: 1000, max: 4000 }, { min: 1250, max: 5000 }] },
  { type: '물리/마법 백어택 대미지', tiers: [{ min: 1, max: 4 }, { min: 2, max: 8 }, { min: 3, max: 12 }, { min: 4, max: 16 }, { min: 5, max: 20 }] },
  { type: '물리/마법 명중률', tiers: [{ min: 1, max: 1 }, { min: 1, max: 2 }, { min: 1, max: 3 }, { min: 1, max: 4 }, { min: 1, max: 5 }] },
  { type: '방어력', tiers: [{ min: 1, max: 600 }, { min: 300, max: 1200 }, { min: 450, max: 1800 }, { min: 600, max: 2400 }, { min: 750, max: 3000 }] },
  { type: '보스 몬스터 추가 대미지', tiers: [{ min: 1, max: 2000 }, { min: 1000, max: 4000 }, { min: 1500, max: 6000 }, { min: 2000, max: 8000 }, { min: 2500, max: 10000 }] },
  { type: '올스탯', tiers: [{ min: 1, max: 480 }, { min: 240, max: 960 }, { min: 360, max: 1440 }, { min: 480, max: 1920 }, { min: 600, max: 2400 }] },
  { type: '일반 몬스터 추가 대미지', tiers: [{ min: 1, max: 2000 }, { min: 1000, max: 4000 }, { min: 1500, max: 6000 }, { min: 2000, max: 8000 }, { min: 2500, max: 10000 }] },
  { type: '체력', tiers: [{ min: 1, max: 600 }, { min: 300, max: 1200 }, { min: 450, max: 1800 }, { min: 600, max: 2400 }, { min: 750, max: 3000 }] },
  { type: '최대 HP', tiers: [{ min: 1, max: 2000 }, { min: 1000, max: 4000 }, { min: 1500, max: 6000 }, { min: 2000, max: 8000 }, { min: 2500, max: 10000 }] },
  { type: '행운', tiers: [{ min: 1, max: 600 }, { min: 300, max: 1200 }, { min: 450, max: 1800 }, { min: 600, max: 2400 }, { min: 750, max: 3000 }] },
];

// % 표시 강제 옵션 (값 표시용)
const SHARED_PCT_BASES = new Set([
  '물리/마법 명중률',
  '물리/마법 백어택 대미지',
]);

// displayLabel = "Lv{N} {type}" 또는 "[Lv{N}] {type}" 형식이지만 사용자 select 에서는 type 만 보여주고
// 시뮬 결과에 Lv 정보를 함께 표시.
export function sharedDisplayLabel(type) {
  return type;
}

export function sharedHasPercentUnit(type) {
  return SHARED_PCT_BASES.has(type);
}

// UI select 노출 라벨 = type. 사용자 선호 옵션 우선 노출.
const SHARED_PRIORITY = [
  '물리/마법 백어택 대미지',
  '보스 몬스터 추가 대미지',
  '일반 몬스터 추가 대미지',
  '무기 공격력/속성력',
  '올스탯',
  '근력/마법력',
  '물리/마법 고정 대미지',
];

export const SHARED_OPTION_LABELS = (() => {
  const all = SHARED_OPTIONS.map((o) => o.type);
  const set = new Set(all);
  const head = SHARED_PRIORITY.filter((t) => set.has(t));
  const tail = all.filter((t) => !head.includes(t));
  return [...head, ...tail];
})();

// type → option 빠른 조회
const SHARED_OPTION_INDEX = new Map(SHARED_OPTIONS.map((o) => [o.type, o]));
export function getSharedOption(type) {
  return SHARED_OPTION_INDEX.get(type) || null;
}

// ============================================================
// 2) 전용석 (6종)
// ============================================================

// Lv 1~10 가중 분포 + 각 레벨이 속한 등급(grade)
//   grade 0 = 추가 옵션 없음
//   grade N (1~5) = 추가 옵션 인덱스 0..N-1 중 균등 1개 추첨
export const EXCLUSIVE_LEVEL_PROBS = [
  { level: 1,  grade: 0, p: 0.18 },
  { level: 2,  grade: 1, p: 0.16 },
  { level: 3,  grade: 1, p: 0.14 },
  { level: 4,  grade: 2, p: 0.12 },
  { level: 5,  grade: 2, p: 0.10 },
  { level: 6,  grade: 3, p: 0.085 },
  { level: 7,  grade: 3, p: 0.08 },
  { level: 8,  grade: 4, p: 0.06 },
  { level: 9,  grade: 4, p: 0.05 },
  { level: 10, grade: 5, p: 0.025 },
];

// 1회 비용
export const EXCLUSIVE_COST = Object.freeze({ shard: 150, ely: 50_000_000 });

// 6종 전용석 정의 — name → { key(옵션 이름), isPercent, lv[5]={min,max} }
export const EXCLUSIVE_STONES = {
  '마아트의 눈': {
    key: '스킬 쿨타임 감소',
    isPercent: true, // 값이 0.1 step 소수
    lv: [
      { min: 0.10, max: 1.00 }, { min: 0.50, max: 2.00 }, { min: 0.80, max: 3.00 }, { min: 1.00, max: 4.00 }, { min: 1.30, max: 5.00 },
    ],
  },
  '프리링 좌상': {
    key: '물리/마법 대미지 감소',
    isPercent: false,
    lv: [
      { min: 1, max: 800 }, { min: 400, max: 1600 }, { min: 600, max: 2400 }, { min: 800, max: 3200 }, { min: 1000, max: 4000 },
    ],
  },
  '글레이프니르': {
    key: '물리/마법 최대대미지',
    isPercent: false,
    forcePercent: true, // 표시상 % (값은 정수)
    lv: [
      { min: 1, max: 10 }, { min: 5, max: 20 }, { min: 8, max: 30 }, { min: 10, max: 40 }, { min: 13, max: 50 },
    ],
  },
  '타오르는 바람의 숨결': {
    key: '이동속도',
    isPercent: false,
    forcePercent: true,
    lv: [
      { min: 1, max: 6 }, { min: 3, max: 12 }, { min: 5, max: 18 }, { min: 6, max: 24 }, { min: 8, max: 30 },
    ],
  },
  '여우구슬': {
    key: '보스 몬스터 지배력',
    isPercent: true,
    lv: [
      { min: 0.10, max: 0.20 }, { min: 0.10, max: 0.40 }, { min: 0.20, max: 0.60 }, { min: 0.20, max: 0.80 }, { min: 0.30, max: 1.00 },
    ],
  },
  '구름 방망이': {
    key: '물리/마법 크리티컬 대미지',
    isPercent: false,
    forcePercent: true,
    lv: [
      { min: 1, max: 10 }, { min: 5, max: 20 }, { min: 8, max: 30 }, { min: 10, max: 40 }, { min: 13, max: 50 },
    ],
  },
};

export const EXCLUSIVE_STONE_NAMES = Object.keys(EXCLUSIVE_STONES);
