/**
 * 라테일 전투력 계산 모듈
 *
 * 56개의 실제 T창 데이터로 회귀분석하여 도출한 V_BIG3 모델
 * (관통 + 일몬추/보몬추 포함, K_mon 항 페어 제약 학습)
 * 검증 정확도: 물리 RMSE 0.28%, 마법 RMSE 0.13%, 모든 케이스 오차 1% 이내
 *
 * @see FORMULA_RESEARCH.md - 공식 도출 과정과 한계
 * @see SAMPLE_DATA.json - 검증용 데이터셋
 */

// ============================================================
// V_BIG2 모델 - 9 파라미터 (사용자 도메인 지식 기반)
//
// 게임 메커니즘:
//   - 근력/공격력/고댐 → attackBase (가산형 베이스 스탯)
//   - 크댐, 최소+최대뎀, 지배력, 근마, 관통 → 곱셈 항
//
// 검증된 페어 데이터 분석:
//   - 표시 (최소뎀+최대뎀) 변화율 ≈ 전투력 변화율 → 곱셈 항 확정
//   - 표시 크댐 변화율 ≈ 전투력 변화율 → 곱셈 항 확정
//   - 관통 98→99: 전투력 +0.81% (case2 페어로 측정)
//
// 입력 규칙:
//   - 무기공격력/속성력은 T창 표시값의 max값 사용
// ============================================================

// V_BIG3 학습 결과 (52건, 페어 비율 제약, RMSE 0.28%)
// 누적 정정 이력:
//   - case3/case4 공격력 OCR 정정(76025/76695 → 69242)으로 RMSE 0.94% → 0.32%
//   - 기존1 공격력 avg(73044.5) → max(73740) 정정으로 RMSE 0.32% → 0.29%
//   - 일몬추/보몬추 항 추가 (V_BIG3) — case2 페어 -100당 -12 BP, 고댐 -150당 -57 BP
//   - K_mon/K2 비율을 0.316(페어 비율)로 제약하여 학습 (페어 충실도 우선)
//   - 검호 데이터 1건 추가 (img27, BP 4,142,389) → 52건
//
// D_pen은 case2/case3/case4 세 독립 페어에서 일관되게 ≈25로 도출됨 (게임 메커니즘:
// 관통은 모든 곱셈 항 이후 마지막에 적용되는 방어력 관통 옵션 → 곱셈 항으로 모델링).
// 옵티마이저는 1차원 자유도로 degenerate(D_pen → 0)에 빠지므로 고정 상수 사용.
//
// K_mon: 일몬추+보몬추 가중치, K2 × 0.316 = 고댐의 약 1/3 효과
//   (case2 페어 측정: 일몬추 -100=-12 BP, 고댐 -150=-57 BP → 비율 0.316)
export const PHYSICAL_PARAMS = Object.freeze({
  K0: 1.48838356e+0,       // 주스탯 가중치
  K1: 1.46221296e+2,       // 공격력 가중치
  K2: 1.28057007e+0,       // 고댐 가중치
  K_mon: 4.04390549e-1,    // 일몬추+보몬추 가중치 (= K2 × 0.316, 페어 제약)
  D_crit: 2.26209973e+2,   // 크댐 분모
  D_dmg: 1.94551489e-34,   // (최소뎀+최대뎀) 분모
  D_dom: 1.88920615e+2,    // 지배력 분모
  K_geunma: 1.01531112e-3, // 근마효율 계수
  D_pen: 25.0,             // 관통 분모 (고정)
  base: 6.18437351e-42,    // 전체 보정 상수
});

// 마법 직업 파라미터 (V_BIG3 페어 제약, 5건 학습, RMSE 0.13%)
//
// PHYSICAL_PARAMS 대비 K1만 0.91% 상향 (146.221 → 147.549).
// 가설: 게임은 무기공격력에 avg(min+max 평균)를 쓰는데 우리는 max를 입력
//   → 물리 K1은 학습 과정에서 (avg/max ≈ 0.991) 비율을 흡수
//   → 마법 속성력은 단일값(=avg-effective)이라 K1을 max-input 비율만큼 역보정해야 정합
// 검증: 실측 캡처 avg/max 평균 0.987과 회귀 0.991이 0.4% 이내 일치.
//       데이터 추가에 따라 보정 비율은 안정적으로 1.009~1.012 범위에서 수렴.
export const MAGIC_PARAMS = Object.freeze({
  ...PHYSICAL_PARAMS,
  K1: 1.47548700e+2,       // 마법 속성력 전용 (K1_phys × 1.0091)
});

/**
 * @typedef {Object} CharacterStats
 * @property {'P'|'M'} type
 * @property {number} 주스탯
 * @property {number} 공격력
 * @property {number} 관통
 * @property {number} 크댐
 * @property {number} 최소뎀
 * @property {number} 최대뎀
 * @property {number} 고댐
 * @property {number} 일몬추
 * @property {number} 보몬추
 * @property {number} 일몬지
 * @property {number} 보몬지
 * @property {number} 근마효율
 */

/**
 * 게임 메커니즘: 수련의방 등의 버프로 최소뎀이 최대뎀을 넘는 경우,
 * 초과분은 실제 전투력에 반영되지 않으므로 cap 처리한다.
 *
 * @param {number} minDmg
 * @param {number} maxDmg
 * @returns {number} effective 최소뎀 (= min(minDmg, maxDmg))
 */
export function effectiveMinDmg(minDmg, maxDmg) {
  const mn = Number(minDmg || 0);
  const mx = Number(maxDmg || 0);
  return Math.min(mn, mx);
}

export function calculateBattlePower(stats) {
  const params = stats.type === 'M' ? MAGIC_PARAMS : PHYSICAL_PARAMS;

  // 수련의방 cap: 최소뎀이 최대뎀 초과 시 최대뎀으로 잘림
  const maxDmg = Number(stats.최대뎀 || 0);
  const minDmg = effectiveMinDmg(stats.최소뎀, stats.최대뎀);

  // V_BIG3: K0×주스탯 + K1×공격력 + K2×고댐 + K_mon×(일몬추+보몬추) (가산형 베이스)
  const attackBase =
    Number(stats.주스탯 || 0) * params.K0 +
    Number(stats.공격력 || 0) * params.K1 +
    Number(stats.고댐 || 0) * params.K2 +
    (Number(stats.일몬추 || 0) + Number(stats.보몬추 || 0)) * params.K_mon;

  if (attackBase <= 0) return 0;

  // 곱셈 항들 (크댐, 최소+최대뎀, 지배력, 근마, 관통)
  const critMultiplier = 1 + Number(stats.크댐 || 0) / params.D_crit;
  const dmgMultiplier = 1 + (minDmg + maxDmg) / params.D_dmg;
  const dominanceMultiplier =
    1 + (Number(stats.일몬지 || 0) + Number(stats.보몬지 || 0)) / params.D_dom;
  const geunmaMultiplier = 1 + Number(stats.근마효율 || 0) * params.K_geunma;
  const penetrationMultiplier = 1 + Number(stats.관통 || 0) / params.D_pen;

  const battlePower =
    attackBase *
    critMultiplier *
    dmgMultiplier *
    dominanceMultiplier *
    geunmaMultiplier *
    penetrationMultiplier *
    params.base;

  return Math.round(battlePower);
}

export const STAT_KEYS = Object.freeze([
  '주스탯', '공격력', '관통', '크댐', '최소뎀', '최대뎀',
  '고댐', '일몬추', '보몬추', '일몬지', '보몬지', '근마효율',
]);

/**
 * 장비 옵션 키 (총 18개)
 * - 가산형 12개: 표시값 그대로 합산
 * - % 옵션 6개: 캐릭터의 기본값(기본_*)에 비율을 곱해서 절대값으로 변환
 *
 * 게임 메커니즘 (사용자 도메인 지식):
 *   최종 스탯 = 기본값 × (1 + 모든_%옵션_합 / 100)
 *   부적 % 옵션 1개의 효과 = 기본값 × (해당% / 100)  ← 가산형 (multiplicative pool 아님)
 *   올스탯 = 모든 스탯에 더해짐 → 전투력 계산상 주스탯에 합산
 */
export const EQUIP_KEYS = Object.freeze([
  // 가산형 (절대값)
  '주스탯', '올스탯', '공격력', '관통',
  '크댐', '최소뎀', '최대뎀', '고댐',
  '일몬추', '보몬추', '일몬지', '보몬지',
  // % 옵션 (기본값 필요)
  '주스탯_퍼', '올스탯_퍼', '공격력_퍼',
  '크댐_퍼', '최소뎀_퍼', '최대뎀_퍼',
  '고댐_퍼', '일몬추_퍼', '보몬추_퍼',
]);

/**
 * 캐릭터의 누적%를 기본값과 표시값으로부터 자동 계산.
 *
 * 게임 메커니즘:
 *   표시값 = 기본값 × (1 + 누적%)
 *   누적% = (표시값 - 기본값) / 기본값
 *
 * @returns {number} 비율(소수). 예: 506% → 5.06
 */
export function pctPool(stats, displayKey, baseKey) {
  const display = Number(stats?.[displayKey] || 0);
  const base = Number(stats?.[baseKey] || 0);
  if (base <= 0) return 0;
  return (display - base) / base;
}

/**
 * 한 스탯에 대한 변화량 계산 (A 메커니즘).
 *
 * 공식:
 *   새 표시값 = (기본값 + 부적_가산) × (1 + 누적% + 부적%)
 *   변화량   = 새 표시값 - 표시값
 *
 * 폴백: 기본값이 0이면 (사용자가 기본값 미입력) 단순 가산만 적용.
 */
function applyEquipDelta(stats, displayKey, baseKey, addedFromEquip, addedPctFromEquip) {
  const base = Number(stats?.[baseKey] || 0);
  const display = Number(stats?.[displayKey] || 0);

  if (base <= 0) {
    // 기본값 미입력 시 폴백: 단순 가산
    return addedFromEquip;
  }

  const currentPct = (display - base) / base;
  const newBase = base + addedFromEquip;
  const newPct = currentPct + addedPctFromEquip / 100;
  const newDisplay = newBase * (1 + newPct);
  return newDisplay - display;
}

/**
 * 장비 옵션을 STAT_KEYS 기준 절대 변화량으로 변환.
 *
 * 게임 메커니즘 (사용자 도메인 지식, 검증된 패턴):
 *   - 표시값 = 기본값 × (1 + 누적%)
 *   - 부적 가산은 기본값에 합쳐지고, 부적 %는 누적%에 합쳐진 후 곱셈 적용
 *   - 따라서 같은 +500 부적이라도 누적 120%인 사람은 +600, 누적 110%인 사람은 +550
 *
 * @param {Object} stats - 캐릭터 스탯 (표시값 + 기본_* 필드)
 * @param {Object} equip - 장비 옵션 (EQUIP_KEYS)
 * @returns {Object} STAT_KEYS 각 키별 절대 변화량
 */
export function equipDelta(stats, equip) {
  const v = (k) => Number(equip?.[k] || 0);

  // 주스탯: 가산 = 주스탯+올스탯, % = 주스탯_퍼+올스탯_퍼
  const 주스탯_가산 = v('주스탯') + v('올스탯');
  const 주스탯_퍼총 = v('주스탯_퍼') + v('올스탯_퍼');

  return {
    주스탯: applyEquipDelta(stats, '주스탯', '기본_주스탯', 주스탯_가산, 주스탯_퍼총),
    공격력: applyEquipDelta(stats, '공격력', '기본_공격력', v('공격력'), v('공격력_퍼')),
    크댐:   applyEquipDelta(stats, '크댐',   '기본_크댐',   v('크댐'),   v('크댐_퍼')),
    최소뎀: applyEquipDelta(stats, '최소뎀', '기본_최소뎀', v('최소뎀'), v('최소뎀_퍼')),
    최대뎀: applyEquipDelta(stats, '최대뎀', '기본_최대뎀', v('최대뎀'), v('최대뎀_퍼')),
    고댐:   applyEquipDelta(stats, '고댐',   '기본_고댐',   v('고댐'),   v('고댐_퍼')),
    일몬추: applyEquipDelta(stats, '일몬추', '기본_일몬추', v('일몬추'), v('일몬추_퍼')),
    보몬추: applyEquipDelta(stats, '보몬추', '기본_보몬추', v('보몬추'), v('보몬추_퍼')),
    관통:   v('관통'),
    일몬지: v('일몬지'),
    보몬지: v('보몬지'),
    근마효율: 0,
  };
}

export function compareEquipment(currentStats, oldEquip, newEquip) {
  const oldDelta = equipDelta(currentStats, oldEquip);
  const newDelta = equipDelta(currentStats, newEquip);

  const newStats = { ...currentStats };
  for (const key of STAT_KEYS) {
    newStats[key] =
      (Number(currentStats[key]) || 0) - (oldDelta[key] || 0) + (newDelta[key] || 0);
  }

  const currentBP = calculateBattlePower(currentStats);
  const newBP = calculateBattlePower(newStats);
  const change = newBP - currentBP;

  const contributions = STAT_KEYS.map((key) => {
    const diff = (newDelta[key] || 0) - (oldDelta[key] || 0);

    if (diff === 0 || !Number.isFinite(diff)) {
      return { stat: key, diff: 0, impact: 0 };
    }

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

export function statMarginalEffect(stats, statKey, delta = 1) {
  const baseBP = calculateBattlePower(stats);
  const modifiedStats = {
    ...stats,
    [statKey]: (Number(stats[statKey]) || 0) + delta,
  };
  const newBP = calculateBattlePower(modifiedStats);
  return newBP - baseBP;
}

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
    올스탯: '올스탯',
    일몬추: '일반 몬스터 추가 데미지',
    보몬추: '보스 몬스터 추가 데미지',
    일몬지: '일반 몬스터 지배력 (%)',
    보몬지: '보스 몬스터 지배력 (%)',
    근마효율: '근력/마법력 효율 (%)',
  },
};

/**
 * 스탯 키의 한국어 라벨을 반환.
 * "_퍼" 접미사가 붙은 % 옵션은 자동으로 "{기본 라벨} %" 형태로 반환.
 */
export function getStatLabel(type, statKey) {
  if (typeof statKey === 'string' && statKey.endsWith('_퍼')) {
    const baseKey = statKey.slice(0, -2);
    return `${getStatLabel(type, baseKey)} %`;
  }
  if (STAT_LABELS[type] && STAT_LABELS[type][statKey]) {
    return STAT_LABELS[type][statKey];
  }
  if (STAT_LABELS.공통[statKey]) {
    return STAT_LABELS.공통[statKey];
  }
  return statKey;
}

export function createEmptyStats(type = 'P') {
  return {
    type,
    // 표시값 (T창 능력치 세부정보)
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
    // 기본값 (T창 추가 세부정보의 +값) — 장비 % 옵션 환산에 사용
    기본_주스탯: 0,
    기본_공격력: 0,
    기본_크댐: 0,
    기본_최소뎀: 0,
    기본_최대뎀: 0,
    기본_고댐: 0,
    기본_일몬추: 0,
    기본_보몬추: 0,
  };
}

export function createEmptyEquipment() {
  return {
    // 가산형 12개
    주스탯: 0,
    올스탯: 0,
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
    // % 옵션 9개 (백어택 등 조건부 옵션은 전투력 계산에 미반영이라 제외)
    주스탯_퍼: 0,
    올스탯_퍼: 0,
    공격력_퍼: 0,
    크댐_퍼: 0,
    최소뎀_퍼: 0,
    최대뎀_퍼: 0,
    고댐_퍼: 0,
    일몬추_퍼: 0,
    보몬추_퍼: 0,
  };
}
