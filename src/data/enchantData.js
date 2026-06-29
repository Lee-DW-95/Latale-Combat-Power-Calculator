/**
 * 라테일 인챈트 데이터
 *
 * 옵션 객체:
 *   { key, label, unit, lo, hi, fullLo, fullHi, [step] }
 *   - lo, hi   = 노강(Lv2) 1슬롯 추첨 범위
 *   - fullLo, fullHi = 풀강(Lv4 또는 Lv5) 1슬롯 추첨 범위
 *   - step 생략 시 정수 균등, 0.1 등 소수면 step 단위 균등
 *
 * 부위 객체:
 *   { name, level, fullLevel, slotCount, options }
 *   - level     = 노강 인챈트 레벨 (모든 부위 Lv2)
 *   - fullLevel = 풀강 도달 인챈트 레벨 (Lv4 또는 Lv5, 사이트 데이터 기준)
 *
 * 카테고리별 풀강 레벨:
 *   노르니르의 눈물 / 플레로마 / 에메랄디아  → Lv4
 *   이카로스의 날개 / 리키모 펠케 / 아마란스 노바 → Lv5
 */

// ============================================================
// 인챈트 종류
// ============================================================
export const NORMAL_ENCHANT_TYPES = {
  normal:  { key: 'normal',  name: '일반 인챈트',   successRate: 0.50, hammerCost: 1,  elyCost:  50_000_000 },
  super:   { key: 'super',   name: '슈퍼 인챈트',   successRate: 0.60, hammerCost: 2,  elyCost: 100_000_000 },
  special: { key: 'special', name: '특별 인챈트',   successRate: 1.00, hammerCost: 30, elyCost:           0 },
};

export function availableEnchantTypes(catKey) {
  if (catKey === '리키모 펠케') return ['normal', 'super', 'special'];
  return ['normal', 'super'];
}

// ============================================================
// 인챈트 단계
// ============================================================
export const ENCHANT_STAGES = {
  base: { key: 'base', name: '노강 (Lv2)', loField: 'lo',     hiField: 'hi'     },
  full: { key: 'full', name: '풀강',       loField: 'fullLo', hiField: 'fullHi' },
};

// 옵션의 stage 별 [lo, hi] 추출 헬퍼
export function rangeFor(opt, stage = 'base') {
  if (stage === 'full') return { lo: opt.fullLo, hi: opt.fullHi, step: opt.step };
  return { lo: opt.lo, hi: opt.hi, step: opt.step };
}

// ============================================================
// 일반 장비 인챈트 — 카테고리 → 부위 → 옵션
// ============================================================
export const NORMAL_ENCHANT_CATEGORIES = {
  '아마란스 노바': {
    name: '아마란스 노바',
    parts: {
      '아마란스 노바 무기': {
        name: '아마란스 노바 무기', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'crit',    label: '크리티컬 대미지 %',   unit: '%', lo: 1, hi: 201,   fullLo: 61,   fullHi: 261 },
          { key: 'maxd',    label: '최대 대미지 %',       unit: '%', lo: 1, hi: 261,   fullLo: 79,   fullHi: 339 },
          { key: 'mind',    label: '최소 대미지 %',       unit: '%', lo: 1, hi: 261,   fullLo: 79,   fullHi: 339 },
          { key: 'back',    label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 301,   fullLo: 91,   fullHi: 391 },
          { key: 'wpn_pct', label: '무기공격력/속성력 %', unit: '%', lo: 1, hi: 21,    fullLo: 4,    fullHi: 24 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 351,   fullLo: 106,  fullHi: 456 },
          { key: 'all_pct', label: '올스탯 %',            unit: '%', lo: 1, hi: 21,    fullLo: 4,    fullHi: 24 },
          { key: 'all',     label: '올스탯 +',            unit: '',  lo: 1, hi: 24001, fullLo: 7201, fullHi: 31201 },
          { key: 'main',    label: '근력/마법력 +',       unit: '',  lo: 1, hi: 30001, fullLo: 9001, fullHi: 39001 },
        ],
      },
      '아마란스 노바 정령석': {
        name: '아마란스 노바 정령석', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'maxd',     label: '최대 대미지 %',       unit: '%', lo: 1, hi: 161,   fullLo: 49,   fullHi: 209 },
          { key: 'mind',     label: '최소 대미지 %',       unit: '%', lo: 1, hi: 161,   fullLo: 49,   fullHi: 209 },
          { key: 'back',     label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 201,   fullLo: 61,   fullHi: 261 },
          { key: 'wpn',      label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 201,   fullLo: 61,   fullHi: 261 },
          { key: 'all',      label: '올스탯 +',            unit: '',  lo: 1, hi: 14001, fullLo: 4201, fullHi: 18201 },
          { key: 'main_pct', label: '근력/마법력 %',       unit: '%', lo: 1, hi: 14,    fullLo: 4,    fullHi: 17 },
          { key: 'main',     label: '근력/마법력 +',       unit: '',  lo: 1, hi: 18001, fullLo: 5401, fullHi: 23401 },
        ],
      },
    },
  },

  '플레로마': {
    name: '플레로마',
    parts: {
      '플레로마 무기': {
        name: '플레로마 무기', level: 2, fullLevel: 4, slotCount: 5,
        options: [
          { key: 'crit',    label: '크리티컬 대미지 %', unit: '%', lo: 1, hi: 151,   fullLo: 37,   fullHi: 187 },
          { key: 'maxd',    label: '최대 대미지 %',     unit: '%', lo: 1, hi: 221,   fullLo: 53,   fullHi: 273 },
          { key: 'mind',    label: '최소 대미지 %',     unit: '%', lo: 1, hi: 251,   fullLo: 61,   fullHi: 311 },
          { key: 'wpn_pct', label: '무기공격력/속성력 %', unit: '%', lo: 1, hi: 15,    fullLo: 4,    fullHi: 18 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 251,   fullLo: 61,   fullHi: 311 },
          { key: 'all_pct', label: '올스탯 %',          unit: '%', lo: 1, hi: 15,    fullLo: 4,    fullHi: 18 },
          { key: 'all',     label: '올스탯 +',          unit: '',  lo: 1, hi: 18001, fullLo: 4401, fullHi: 22401 },
          { key: 'main',    label: '근력/마법력 +',     unit: '',  lo: 1, hi: 22001, fullLo: 5201, fullHi: 27201 },
        ],
      },
      '플레로마 정령석': {
        name: '플레로마 정령석', level: 2, fullLevel: 4, slotCount: 5,
        options: [
          { key: 'maxd',     label: '최대 대미지 %',     unit: '%', lo: 1, hi: 121,   fullLo: 29,   fullHi: 149 },
          { key: 'mind',     label: '최소 대미지 %',     unit: '%', lo: 1, hi: 151,   fullLo: 37,   fullHi: 187 },
          { key: 'main_pct', label: '근력/마법력 %',     unit: '%', lo: 1, hi: 10,    fullLo: 3,    fullHi: 12 },
          { key: 'wpn',      label: '무기공격력/속성력 +', unit: '', lo: 1, hi: 151,   fullLo: 37,   fullHi: 187 },
          { key: 'all',      label: '올스탯 +',          unit: '',  lo: 1, hi: 11001, fullLo: 2601, fullHi: 13601 },
          { key: 'main',     label: '근력/마법력 +',     unit: '',  lo: 1, hi: 14001, fullLo: 3401, fullHi: 17401 },
          { key: 'back',     label: '백어택 대미지 %',   unit: '%', lo: 1, hi: 151,   fullLo: 37,   fullHi: 187 },
          { key: 'hit',      label: '명중률 %',          unit: '%', lo: 1, hi: 51,    fullLo: 13,   fullHi: 63 },
        ],
      },
    },
  },

  '에메랄디아': {
    name: '에메랄디아',
    parts: {
      '에메랄디아의 안경': {
        name: '에메랄디아의 안경', level: 2, fullLevel: 4, slotCount: 5,
        options: [
          { key: 'hit',     label: '명중률 %',            unit: '%', lo: 1, hi: 86,    fullLo: 25,   fullHi: 110 },
          { key: 'wpn_pct', label: '무기공격력/속성력 %', unit: '%', lo: 1, hi: 11,    fullLo: 4,    fullHi: 14 },
          { key: 'maxd',    label: '최대 대미지 %',       unit: '%', lo: 1, hi: 81,    fullLo: 25,   fullHi: 105 },
          { key: 'mind',    label: '최소 대미지 %',       unit: '%', lo: 1, hi: 101,   fullLo: 31,   fullHi: 131 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 151,   fullLo: 45,   fullHi: 195 },
          { key: 'all',     label: '올스탯 +',            unit: '',  lo: 1, hi: 12001, fullLo: 3601, fullHi: 15601 },
          { key: 'main',    label: '근력/마법력 +',       unit: '',  lo: 1, hi: 16001, fullLo: 4801, fullHi: 20801 },
          { key: 'back',    label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 81,    fullLo: 25,   fullHi: 105 },
        ],
      },
      '에메랄디아의 스타킹': {
        name: '에메랄디아의 스타킹', level: 2, fullLevel: 4, slotCount: 5,
        options: [
          { key: 'mind_or_maxd', label: '최소/최대 대미지 %',  unit: '%', lo: 1,   hi: 71,    fullLo: 21,   fullHi: 91 },
          { key: 'dom_n',        label: '일반 몬스터 지배력 %', unit: '%', lo: 0.1, hi: 3.3,   fullLo: 0.9,  fullHi: 4.1, step: 0.1 },
          { key: 'mind',         label: '최소 대미지 %',        unit: '%', lo: 1,   hi: 101,   fullLo: 31,   fullHi: 131 },
          { key: 'speed',        label: '이동속도 %',           unit: '%', lo: 1,   hi: 71,    fullLo: 21,   fullHi: 91 },
          { key: 'wpn',          label: '무기공격력/속성력 +',  unit: '',  lo: 1,   hi: 151,   fullLo: 45,   fullHi: 195 },
          { key: 'all',          label: '올스탯 +',             unit: '',  lo: 1,   hi: 12001, fullLo: 3601, fullHi: 15601 },
          { key: 'main',         label: '근력/마법력 +',        unit: '',  lo: 1,   hi: 16001, fullLo: 4801, fullHi: 20801 },
          { key: 'back',         label: '백어택 대미지 %',      unit: '%', lo: 1,   hi: 81,    fullLo: 25,   fullHi: 105 },
        ],
      },
      '에메랄디아의 타투': {
        name: '에메랄디아의 타투', level: 2, fullLevel: 4, slotCount: 5,
        options: [
          { key: 'crit',    label: '크리티컬 대미지 %',     unit: '%', lo: 1,   hi: 81,    fullLo: 25,   fullHi: 105 },
          { key: 'all_pct', label: '올스탯 %',              unit: '%', lo: 1,   hi: 13,    fullLo: 4,    fullHi: 16 },
          { key: 'dom_b',   label: '보스 몬스터 지배력 %',  unit: '%', lo: 0.1, hi: 3.3,   fullLo: 0.9,  fullHi: 4.1, step: 0.1 },
          { key: 'mind',    label: '최소 대미지 %',         unit: '%', lo: 1,   hi: 101,   fullLo: 31,   fullHi: 131 },
          { key: 'wpn',     label: '무기공격력/속성력 +',   unit: '',  lo: 1,   hi: 151,   fullLo: 45,   fullHi: 195 },
          { key: 'all',     label: '올스탯 +',              unit: '',  lo: 1,   hi: 12001, fullLo: 3601, fullHi: 15601 },
          { key: 'main',    label: '근력/마법력 +',         unit: '',  lo: 1,   hi: 16001, fullLo: 4801, fullHi: 20801 },
          { key: 'back',    label: '백어택 대미지 %',       unit: '%', lo: 1,   hi: 81,    fullLo: 25,   fullHi: 105 },
        ],
      },
    },
  },

  '이카로스의 날개': {
    name: '이카로스의 날개',
    parts: {
      '그렌델의 헬멧': {
        name: '그렌델의 헬멧', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'crit',  label: '크리티컬 대미지 %',     unit: '%', lo: 1,   hi: 121,   fullLo: 46,   fullHi: 166 },
          { key: 'hit',   label: '명중률 %',              unit: '%', lo: 1,   hi: 171,   fullLo: 61,   fullHi: 231 },
          { key: 'wpn',   label: '무기공격력/속성력 +',   unit: '',  lo: 1,   hi: 241,   fullLo: 91,   fullHi: 331 },
          { key: 'all',   label: '올스탯 +',              unit: '',  lo: 1,   hi: 19001, fullLo: 6901, fullHi: 25901 },
          { key: 'main',  label: '근력/마법력 +',         unit: '',  lo: 1,   hi: 24001, fullLo: 9001, fullHi: 33001 },
          { key: 'dom_n', label: '일반 몬스터 지배력 %',  unit: '%', lo: 0.1, hi: 5.1,   fullLo: 1.0,  fullHi: 6.0, step: 0.1 },
          { key: 'mind',  label: '최소 대미지 %',         unit: '%', lo: 1,   hi: 151,   fullLo: 55,   fullHi: 205 },
          { key: 'back',  label: '백어택 대미지 %',       unit: '%', lo: 1,   hi: 121,   fullLo: 46,   fullHi: 166 },
        ],
      },
      '그렌델의 플레이트': {
        name: '그렌델의 플레이트', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'wpn_pct', label: '무기공격력/속성력 %', unit: '%', lo: 1, hi: 20,    fullLo: 4,    fullHi: 23 },
          { key: 'all_pct', label: '올스탯 %',            unit: '%', lo: 1, hi: 25,    fullLo: 4,    fullHi: 28 },
          { key: 'maxd',    label: '최대 대미지 %',       unit: '%', lo: 1, hi: 121,   fullLo: 46,   fullHi: 166 },
          { key: 'mind',    label: '최소 대미지 %',       unit: '%', lo: 1, hi: 151,   fullLo: 55,   fullHi: 205 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 241,   fullLo: 91,   fullHi: 331 },
          { key: 'all',     label: '올스탯 +',            unit: '',  lo: 1, hi: 19001, fullLo: 6901, fullHi: 25901 },
          { key: 'main',    label: '근력/마법력 +',       unit: '',  lo: 1, hi: 24001, fullLo: 9001, fullHi: 33001 },
          { key: 'back',    label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 121,   fullLo: 46,   fullHi: 166 },
        ],
      },
      '그렌델의 클립': {
        name: '그렌델의 클립', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'wpn_pct', label: '무기공격력/속성력 %', unit: '%', lo: 1, hi: 20,    fullLo: 4,    fullHi: 23 },
          { key: 'all_pct', label: '올스탯 %',            unit: '%', lo: 1, hi: 25,    fullLo: 4,    fullHi: 28 },
          { key: 'maxd',    label: '최대 대미지 %',       unit: '%', lo: 1, hi: 121,   fullLo: 46,   fullHi: 166 },
          { key: 'mind',    label: '최소 대미지 %',       unit: '%', lo: 1, hi: 151,   fullLo: 55,   fullHi: 205 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 241,   fullLo: 91,   fullHi: 331 },
          { key: 'all',     label: '올스탯 +',            unit: '',  lo: 1, hi: 19001, fullLo: 6901, fullHi: 25901 },
          { key: 'main',    label: '근력/마법력 +',       unit: '',  lo: 1, hi: 24001, fullLo: 9001, fullHi: 33001 },
          { key: 'back',    label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 121,   fullLo: 46,   fullHi: 166 },
        ],
      },
      '그렌델의 글러브': {
        name: '그렌델의 글러브', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'wpn_pct', label: '무기공격력/속성력 %',  unit: '%', lo: 1,   hi: 20,    fullLo: 4,    fullHi: 23 },
          { key: 'crit',    label: '크리티컬 대미지 %',    unit: '%', lo: 1,   hi: 121,   fullLo: 46,   fullHi: 166 },
          { key: 'dom_b',   label: '보스 몬스터 지배력 %', unit: '%', lo: 0.1, hi: 5.1,   fullLo: 1.0,  fullHi: 6.0, step: 0.1 },
          { key: 'mind',    label: '최소 대미지 %',        unit: '%', lo: 1,   hi: 151,   fullLo: 55,   fullHi: 205 },
          { key: 'wpn',     label: '무기공격력/속성력 +',  unit: '',  lo: 1,   hi: 241,   fullLo: 91,   fullHi: 331 },
          { key: 'all',     label: '올스탯 +',             unit: '',  lo: 1,   hi: 19001, fullLo: 6901, fullHi: 25901 },
          { key: 'main',    label: '근력/마법력 +',        unit: '',  lo: 1,   hi: 24001, fullLo: 9001, fullHi: 33001 },
          { key: 'back',    label: '백어택 대미지 %',      unit: '%', lo: 1,   hi: 121,   fullLo: 46,   fullHi: 166 },
        ],
      },
      '그렌델의 부츠': {
        name: '그렌델의 부츠', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'crit',    label: '크리티컬 대미지 %',   unit: '%', lo: 1, hi: 151,   fullLo: 55,   fullHi: 205 },
          { key: 'all_pct', label: '올스탯 %',            unit: '%', lo: 1, hi: 25,    fullLo: 4,    fullHi: 28 },
          { key: 'speed',   label: '이동속도 %',          unit: '%', lo: 1, hi: 171,   fullLo: 61,   fullHi: 231 },
          { key: 'mind',    label: '최소 대미지 %',       unit: '%', lo: 1, hi: 151,   fullLo: 55,   fullHi: 205 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 241,   fullLo: 91,   fullHi: 331 },
          { key: 'all',     label: '올스탯 +',            unit: '',  lo: 1, hi: 19001, fullLo: 6901, fullHi: 25901 },
          { key: 'main',    label: '근력/마법력 +',       unit: '',  lo: 1, hi: 24001, fullLo: 9001, fullHi: 33001 },
          { key: 'back',    label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 121,   fullLo: 46,   fullHi: 166 },
        ],
      },
    },
  },

  '리키모 펠케': {
    name: '리키모 펠케',
    parts: {
      '벨리알의 귀걸이': {
        name: '벨리알의 귀걸이', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'crit', label: '크리티컬 대미지 %',   unit: '%', lo: 1, hi: 101,   fullLo: 37,   fullHi: 137 },
          { key: 'maxd', label: '최대 대미지 %',       unit: '%', lo: 1, hi: 101,   fullLo: 37,   fullHi: 137 },
          { key: 'mind', label: '최소 대미지 %',       unit: '%', lo: 1, hi: 101,   fullLo: 25,   fullHi: 125 },
          { key: 'wpn',  label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 161,   fullLo: 61,   fullHi: 221 },
          { key: 'all',  label: '올스탯 +',            unit: '',  lo: 1, hi: 15001, fullLo: 5401, fullHi: 20401 },
          { key: 'main', label: '근력/마법력 +',       unit: '',  lo: 1, hi: 20001, fullLo: 7501, fullHi: 27501 },
          { key: 'back', label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 101,   fullLo: 25,   fullHi: 125 },
        ],
      },
      '벨리알의 망토': {
        name: '벨리알의 망토', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'crit',    label: '크리티컬 대미지 %',   unit: '%', lo: 1, hi: 101,   fullLo: 37,   fullHi: 137 },
          { key: 'mind',    label: '최소 대미지 %',       unit: '%', lo: 1, hi: 101,   fullLo: 25,   fullHi: 125 },
          { key: 'all_pct', label: '올스탯 %',            unit: '%', lo: 1, hi: 16,    fullLo: 4,    fullHi: 19 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1, hi: 241,   fullLo: 91,   fullHi: 331 },
          { key: 'all',     label: '올스탯 +',            unit: '',  lo: 1, hi: 15001, fullLo: 5401, fullHi: 20401 },
          { key: 'main',    label: '근력/마법력 +',       unit: '',  lo: 1, hi: 20001, fullLo: 7501, fullHi: 27501 },
          { key: 'back',    label: '백어택 대미지 %',     unit: '%', lo: 1, hi: 101,   fullLo: 25,   fullHi: 125 },
        ],
      },
      '벨리알의 반지': {
        name: '벨리알의 반지', level: 2, fullLevel: 5, slotCount: 5,
        options: [
          { key: 'maxd',    label: '최대 대미지 %',       unit: '%', lo: 1,   hi: 101,   fullLo: 37,   fullHi: 137 },
          { key: 'mind',    label: '최소 대미지 %',       unit: '%', lo: 1,   hi: 101,   fullLo: 25,   fullHi: 125 },
          { key: 'wpn_pct', label: '무기공격력/속성력 %', unit: '%', lo: 1,   hi: 14,    fullLo: 4,    fullHi: 17 },
          { key: 'wpn',     label: '무기공격력/속성력 +', unit: '',  lo: 1,   hi: 161,   fullLo: 61,   fullHi: 221 },
          { key: 'cd',      label: '쿨타임 감소 %',       unit: '%', lo: 0.1, hi: 5.6,   fullLo: 1.9,  fullHi: 7.4, step: 0.1 },
          { key: 'all',     label: '올스탯 +',            unit: '',  lo: 1,   hi: 15001, fullLo: 5401, fullHi: 20401 },
          { key: 'main',    label: '근력/마법력 +',       unit: '',  lo: 1,   hi: 20001, fullLo: 7501, fullHi: 27501 },
          { key: 'back',    label: '백어택 대미지 %',     unit: '%', lo: 1,   hi: 101,   fullLo: 25,   fullHi: 125 },
        ],
      },
    },
  },
};

// ============================================================
// 특수장비 인챈트 — 옵션별 Lv.1~Lv.5 범위
// ============================================================
export const SPECIAL_ENCHANT_OPTIONS = {
  allstat: {
    key: 'allstat', label: '올스탯', unit: '',
    levels: [
      { lo: 100, hi: 500 }, { lo: 150, hi: 750 }, { lo: 200, hi: 1000 },
      { lo: 250, hi: 1250 }, { lo: 300, hi: 1500 },
    ],
  },
  weapon: {
    key: 'weapon', label: '무기공격력/속성력', unit: '',
    levels: [
      { lo: 2, hi: 12 }, { lo: 4, hi: 18 }, { lo: 5, hi: 24 },
      { lo: 6, hi: 30 }, { lo: 7, hi: 36 },
    ],
  },
  status: {
    key: 'status', label: '상태이상 대미지', unit: '%',
    levels: [
      { lo: 1, hi: 4 }, { lo: 1, hi: 6 }, { lo: 2, hi: 8 },
      { lo: 2, hi: 10 }, { lo: 2, hi: 12 },
    ],
  },
  melee: {
    key: 'melee', label: '근거리 대미지', unit: '%',
    levels: [
      { lo: 1, hi: 4 }, { lo: 1, hi: 6 }, { lo: 2, hi: 8 },
      { lo: 2, hi: 10 }, { lo: 2, hi: 12 },
    ],
  },
  // 고정 대미지 (물리/마법) — 사용자 4개 데이터 포인트에서 도출:
  //   Lv1 916=76%, Lv2 2518=83%, Lv3 5108=94%, Lv5 8271=68%
  //   grade = Math.floor(value / hi * 100) 일 때 hi(L) = 300 * L * (L+3) 공식 정확히 일치.
  //   Lv4 hi=8400 은 공식 외삽 (게임 검증 필요).
  //   lo 는 미관측 → 올스탯 패턴(1:5) 차용. 데이터 추가 시 보정 가능.
  fixedDmg: {
    key: 'fixedDmg', label: '고정 대미지', unit: '',
    levels: [
      { lo: 240,  hi: 1200  }, // 300×1×4
      { lo: 600,  hi: 3000  }, // 300×2×5
      { lo: 1080, hi: 5400  }, // 300×3×6
      { lo: 1680, hi: 8400  }, // 300×4×7  (외삽)
      { lo: 2400, hi: 12000 }, // 300×5×8
    ],
  },
};

export const SPECIAL_ENCHANT_COSTS = [
  { level: 1, material: 10,  ely: 10_000_000 },
  { level: 2, material: 20,  ely: 20_000_000 },
  { level: 3, material: 30,  ely: 30_000_000 },
  { level: 4, material: 50,  ely: 40_000_000 },
  { level: 5, material: 100, ely: 50_000_000 },
];

export const SPECIAL_ENCHANT_MAX_SLOTS = 5;
export const SPECIAL_ENCHANT_MAX_LEVEL = 5;

// ============================================================
// 헬퍼
// ============================================================
export function categoryKeys() {
  return Object.keys(NORMAL_ENCHANT_CATEGORIES);
}
export function partKeys(catKey) {
  const cat = NORMAL_ENCHANT_CATEGORIES[catKey];
  return cat ? Object.keys(cat.parts) : [];
}
export function getPart(catKey, partKey) {
  return NORMAL_ENCHANT_CATEGORIES[catKey]?.parts?.[partKey] ?? null;
}
