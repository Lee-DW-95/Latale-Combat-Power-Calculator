/**
 * 라테일 성물 데이터
 *
 * 출처: 라테일 스펙 분석기 3.4.1 배포본 (유저 제작)
 * 마지막 동기화: 2026-04-30
 *
 * 성물 시스템 개요:
 *   - 성물 6종 (대미지 영향 5종 + 프리링 좌상 1종은 영향 없음)
 *   - 각 성물은 레벨 (1 ~ 90+) 보유 → 성물 배율로 환산 (Lv90 ≈ 50.0)
 *   - 전용석 옵션 (성물별 1~2종) + 공용석 옵션 (모든 성물 공통 7종) × 슬롯 2개
 *
 * 증폭 효과 (단순화 모델, 시뮬레이터에서는 합산 보너스로 처리):
 *   - 전용석 옵션 효과 = 옵션값 × (성물배율 / 100)
 *   - 공용석 옵션 효과 = 옵션값 × (성물배율 / 100) × 2 슬롯
 *   ※ 정확한 인게임 공식은 시트 'B(2)' 등 helper 참조 필요. 본 모델은 근사치.
 */

// ============================================================
// 성물 정의
// ============================================================
export const RELICS = Object.freeze({
  '마아트의 눈': {
    key: 'maat',
    name: '마아트의 눈',
    exclusiveOptions: ['근력/마법력%'],
    affectsDamage: true,
  },
  '글레이프니르': {
    key: 'gleipnir',
    name: '글레이프니르',
    exclusiveOptions: ['최대대미지', '최소대미지'],
    affectsDamage: true,
  },
  '타오르는 바람의 숨결': {
    key: 'wind',
    name: '타오르는 바람의 숨결',
    exclusiveOptions: ['무기공/속성력%'],
    affectsDamage: true,
  },
  '여우구슬': {
    key: 'fox',
    name: '여우구슬',
    exclusiveOptions: ['일반 지배력', '보스 지배력'],
    affectsDamage: true,
  },
  '구름방망이': {
    key: 'cloud',
    name: '구름방망이',
    exclusiveOptions: ['크리대미지'],
    affectsDamage: true,
  },
  '프리링 좌상': {
    key: 'freering',
    name: '프리링 좌상',
    exclusiveOptions: [],
    affectsDamage: false,  // 대미지 영향 없음 (시트에서도 제외처리됨)
  },
});

export const RELIC_KEYS = Object.freeze(Object.keys(RELICS));

// ============================================================
// 전용석 기본옵션 (성물 고유 · 레벨 1~10 고정 %값)
//   출처: 인게임 확인 (2026-07-02)
//   레벨 곡선 = A패턴 [1,1,1,2,2,3,3,4,4,5] (상승 지점 Lv4·6·8·10)
//     · 글레이프니르만 10단위 [10,10,10,20,20,30,30,40,40,50]
//     · 여우구슬만 0.2단위 [0.2,0.2,0.2,0.4,0.4,0.6,0.6,0.8,0.8,1.0]
//   ※ 성물은 액티브 스킬 — 발동 시 이 값이 ×50 증폭되어 적용됨.
//   byLevel[i] = Lv(i+1) 값.
// ============================================================
export const RELIC_BASE_OPTIONS = Object.freeze({
  maat:     { option: '근력/마법력%',           isPercent: true, byLevel: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5] },
  freering: { option: '최대HP%',                 isPercent: true, byLevel: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5] },
  wind:     { option: '무기공격력/속성력%',      isPercent: true, byLevel: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5] },
  cloud:    { option: '물리/마법 크리티컬 확률%', isPercent: true, byLevel: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5] },
  gleipnir: { option: '최소대미지%',             isPercent: true, byLevel: [10, 10, 10, 20, 20, 30, 30, 40, 40, 50] },
  fox:      { option: '일반 몬스터 지배력%',      isPercent: true, byLevel: [0.2, 0.2, 0.2, 0.4, 0.4, 0.6, 0.6, 0.8, 0.8, 1.0] },
});

// 성물 key + 레벨(1~10) → 기본옵션 값 (증폭 전). 범위를 벗어나면 clamp.
export function relicBaseOptionValue(key, level) {
  const def = RELIC_BASE_OPTIONS[key];
  if (!def) return 0;
  const idx = Math.max(1, Math.min(10, Number(level) || 1)) - 1;
  return def.byLevel[idx];
}

// ============================================================
// 공용석 옵션 (모든 성물 공통)
// ============================================================
export const COMMON_STONE_OPTIONS = Object.freeze([
  '백어택 대미지',
  '무기공격력/속성력 +',
  '근/마 올스탯 +',
  '올스탯 +',
  '고정대미지 +',
  '일반 추가대미지 +',
  '보스 추가대미지 +',
]);

// 성물 1개당 공용석 슬롯 수
export const COMMON_STONE_SLOTS = 2;

// ============================================================
// 성물 레벨 → 배율 환산 (시트의 '성물 배율' 컬럼 참조)
//   샘플: Lv90 ≈ 50.0
//   대략 선형: 배율 = 레벨 × (50/90) ≈ 레벨 × 0.5556
//   ⚠️ 정확한 곡선은 시트 helper 분석 필요. 일단 선형 근사.
// ============================================================
export function relicMultiplier(level) {
  const lv = Math.max(1, Math.min(99, Number(level) || 1));
  return +(lv * (50 / 90)).toFixed(2);
}

// ============================================================
// 헬퍼 — 빈 성물 슬롯 생성
// ============================================================
export function createEmptyRelic(key) {
  const def = RELICS[key];
  if (!def) return null;
  return {
    key,
    name: def.name,
    level: 1,
    exclusiveOptionType: def.exclusiveOptions[0] ?? '',
    exclusiveOptionValue: 0,
    commonStones: Array.from({ length: COMMON_STONE_SLOTS }, () => ({
      option: '',
      value: 0,
    })),
  };
}

export function createDefaultRelicSet() {
  return RELIC_KEYS
    .filter((k) => RELICS[k].affectsDamage)
    .map(createEmptyRelic);
}
