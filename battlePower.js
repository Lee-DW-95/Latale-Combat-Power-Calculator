/**
 * 라테일 전투력 계산 모듈
 *
 * 12개의 실제 T창 데이터로 회귀분석하여 도출한 V_RICH 모델
 * 검증 정확도: RMSE 1.18%, 모든 케이스 오차 2.5% 이내
 *
 * @see FORMULA_RESEARCH.md - 공식 도출 과정과 한계
 * @see SAMPLE_DATA.json - 검증용 데이터셋
 */

// ============================================================
// 학습된 파라미터 (12개 물리 데이터로 학습)
// 데이터 추가 시 scripts/refit_formula.py로 재학습 가능
// ============================================================

export const PHYSICAL_PARAMS = Object.freeze({
  K1: 142.545920,        // 공격력 가중치
  K2: 2.502034,          // 고댐 가중치
  K3: 0.530557,          // (최소뎀+최대뎀) 가중치
  D_crit: 0.000014,      // 크댐 분모 (수렴값, 매우 작음)
  D_dom: 51.282136,      // 지배력 분모
  K_geunma: 0.00454880,  // 근마효율 계수
  base: 8.6e-11,         // 전체 보정 상수
});

// 마법 직업은 데이터 부족으로 임시로 물리 파라미터 사용
// 마법 데이터 10개 이상 추가 시 별도 학습 권장
export const MAGIC_PARAMS = Object.freeze({
  ...PHYSICAL_PARAMS,
});

// ============================================================
// 캐릭터 스탯 객체 표준 형식
// ============================================================

/**
 * @typedef {Object} CharacterStats
 * @property {'P'|'M'} type - 'P': 물리 직업, 'M': 마법 직업
 * @property {number} 주스탯 - 근력(물리) 또는 마법력(마법)
 * @property {number} 공격력 - 무기공격력(물리, min~max 평균) 또는 속성력(마법)
 * @property {number} 관통 - 관통력
 * @property {number} 크댐 - 크리티컬 데미지 (본인 직업 영역값)
 * @property {number} 최소뎀 - 최소 데미지 (본인 직업 영역값)
 * @property {number} 최대뎀 - 최대 데미지 (본인 직업 영역값)
 * @property {number} 고댐 - 고정 데미지 증가 (본인 직업 영역값)
 * @property {number} 일몬추 - 일반 몬스터 추가 데미지
 * @property {number} 보몬추 - 보스 몬스터 추가 데미지
 * @property {number} 일몬지 - 일반 몬스터 지배력 (%)
 * @property {number} 보몬지 - 보스 몬스터 지배력 (%)
 * @property {number} 근마효율 - 근력/마법력 효율 (%)
 */

// ============================================================
// 핵심 함수: 전투력 계산
// ============================================================

/**
 * 캐릭터 스탯으로부터 전투력을 계산합니다.
 *
 * @param {CharacterStats} stats - 캐릭터 스탯 객체
 * @returns {number} 계산된 전투력 (정수 반올림)
 */
export function calculateBattlePower(stats) {
  const params = stats.type === 'M' ? MAGIC_PARAMS : PHYSICAL_PARAMS;

  // 공격력 베이스: 가산형
  const attackBase =
    stats.주스탯 +
    stats.공격력 * params.K1 +
    stats.고댐 * params.K2 +
    (stats.최소뎀 + stats.최대뎀) * params.K3;

  if (attackBase <= 0) return 0;

  // 곱셈 보정 항들
  const critMultiplier = 1 + stats.크댐 / params.D_crit;
  const dominanceMultiplier = 1 + (stats.일몬지 + stats.보몬지) / params.D_dom;
  const geunmaMultiplier = 1 + stats.근마효율 * params.K_geunma;

  const battlePower =
    attackBase *
    critMultiplier *
    dominanceMultiplier *
    geunmaMultiplier *
    params.base;

  return Math.round(battlePower);
}

// ============================================================
// 장비 비교 시뮬레이션
// ============================================================

/**
 * @typedef {Object} EquipmentOptions
 * @property {number} [주스탯]
 * @property {number} [공격력]
 * @property {number} [관통]
 * @property {number} [크댐]
 * @property {number} [최소뎀]
 * @property {number} [최대뎀]
 * @property {number} [고댐]
 * @property {number} [일몬추]
 * @property {number} [보몬추]
 * @property {number} [일몬지]
 * @property {number} [보몬지]
 * @property {number} [근마효율]
 */

/**
 * 장비 교체 시 전투력 변화를 계산합니다.
 *
 * @param {CharacterStats} currentStats - 현재 캐릭터 전체 스탯
 * @param {EquipmentOptions} oldEquip - 빼는 장비의 옵션 (모든 키는 선택사항, 빈 값은 0으로 처리)
 * @param {EquipmentOptions} newEquip - 끼는 장비의 옵션
 * @returns {Object} 비교 결과
 */
export function compareEquipment(currentStats, oldEquip, newEquip) {
  // 교체 후 스탯 = 현재 스탯 - 빼는 장비 + 끼는 장비
  const newStats = { ...currentStats };

  const statKeys = [
    '주스탯', '공격력', '관통', '크댐', '최소뎀', '최대뎀',
    '고댐', '일몬추', '보몬추', '일몬지', '보몬지', '근마효율',
  ];

  for (const key of statKeys) {
    const oldVal = Number(oldEquip[key]) || 0;
    const newVal = Number(newEquip[key]) || 0;
    newStats[key] = (Number(currentStats[key]) || 0) - oldVal + newVal;
  }

  const currentBP = calculateBattlePower(currentStats);
  const newBP = calculateBattlePower(newStats);
  const change = newBP - currentBP;

  // 각 스탯의 기여도 분석 (한 번에 한 스탯씩만 변화시켜 효과 측정)
  const contributions = statKeys.map((key) => {
    const oldVal = Number(oldEquip[key]) || 0;
    const newVal = Number(newEquip[key]) || 0;
    const diff = newVal - oldVal;

    if (diff === 0) {
      return { stat: key, diff: 0, impact: 0 };
    }

    // 해당 스탯만 변화시킨 가상 캐릭터 생성
    const partialStats = {
      ...currentStats,
      [key]: (Number(currentStats[key]) || 0) + diff,
    };
    const partialBP = calculateBattlePower(partialStats);
    const impact = partialBP - currentBP;

    return { stat: key, diff, impact };
  }).filter((c) => c.diff !== 0);

  return {
    currentBP,
    newBP,
    change,
    changePercent: currentBP > 0 ? (change / currentBP) * 100 : 0,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
    contributions,
    newStats,
  };
}

// ============================================================
// 유틸리티: 단일 스탯의 한계 효율 (1만큼 올렸을 때 전투력 증가량)
// ============================================================

/**
 * 특정 스탯을 1만큼 올렸을 때의 전투력 증가량을 계산합니다.
 * 사용자에게 "이 스탯 1당 전투력 X 상승" 같은 인사이트 제공 시 사용.
 *
 * @param {CharacterStats} stats
 * @param {string} statKey - 변화시킬 스탯 키
 * @param {number} delta - 변화량 (기본 1)
 * @returns {number} 전투력 증가량
 */
export function statMarginalEffect(stats, statKey, delta = 1) {
  const baseBP = calculateBattlePower(stats);
  const modifiedStats = {
    ...stats,
    [statKey]: (Number(stats[statKey]) || 0) + delta,
  };
  const newBP = calculateBattlePower(modifiedStats);
  return newBP - baseBP;
}

// ============================================================
// 스탯 라벨 매핑 (UI용)
// ============================================================

export const STAT_LABELS = {
  P: {
    주스탯: '근력',
    공격력: '무기공격력',
    크댐: '크리티컬 데미지 (물리)',
    최소뎀: '최소 데미지 (물리)',
    최대뎀: '최대 데미지 (물리)',
    고댐: '고정 데미지 증가 (물리)',
  },
  M: {
    주스탯: '마법력',
    공격력: '속성력',
    크댐: '크리티컬 데미지 (마법)',
    최소뎀: '최소 데미지 (마법)',
    최대뎀: '최대 데미지 (마법)',
    고댐: '고정 데미지 증가 (마법)',
  },
  공통: {
    관통: '관통력',
    일몬추: '일반 몬스터 추가 데미지',
    보몬추: '보스 몬스터 추가 데미지',
    일몬지: '일반 몬스터 지배력 (%)',
    보몬지: '보스 몬스터 지배력 (%)',
    근마효율: '근력/마법력 효율 (%)',
  },
};

/**
 * 직업타입에 맞는 라벨을 반환합니다.
 * @param {'P'|'M'} type
 * @param {string} statKey
 * @returns {string}
 */
export function getStatLabel(type, statKey) {
  if (STAT_LABELS[type] && STAT_LABELS[type][statKey]) {
    return STAT_LABELS[type][statKey];
  }
  if (STAT_LABELS.공통[statKey]) {
    return STAT_LABELS.공통[statKey];
  }
  return statKey;
}

// ============================================================
// 빈 스탯 객체 생성 (입력 폼 초기화용)
// ============================================================

export function createEmptyStats(type = 'P') {
  return {
    type,
    주스탯: 0,
    공격력: 0,
    관통: 99,
    크댐: 0,
    최소뎀: 0,
    최대뎀: 0,
    고댐: 0,
    일몬추: 0,
    보몬추: 0,
    일몬지: 0,
    보몬지: 0,
    근마효율: 0,
  };
}

export function createEmptyEquipment() {
  return {
    주스탯: 0,
    공격력: 0,
    관통: 0,
    크댐: 0,
    최소뎀: 0,
    최대뎀: 0,
    고댐: 0,
    일몬추: 0,
    보몬추: 0,
    일몬지: 0,
    보몬지: 0,
    근마효율: 0,
  };
}
