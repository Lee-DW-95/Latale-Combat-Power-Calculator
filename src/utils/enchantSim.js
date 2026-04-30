/**
 * 라테일 인챈트 시뮬레이션 유틸
 *
 * 모델 가정:
 * 1) 일반 장비 인챈트
 *    - 1회 시도 = 1슬롯 부여 또는 장비 파괴
 *    - 일반 인챈트 50% / 슈퍼 인챈트 60% 성공률
 *    - 성공: 선택 옵션의 [lo, hi] (또는 step 단위) 균등 분포로 값 결정 → 슬롯 1개 추가
 *    - 실패: 장비 전체 파괴, 모든 슬롯 사라짐, 새 장비로 재시작
 *    - 매 시도마다 플래티넘 망치 1개 소모
 *
 * 2) 특수장비 인챈트
 *    - 옵션 슬롯별로 Lv.0 → Lv.5 단계 강화
 *    - 강화 시 해당 Lv 의 [lo, hi] 정수 균등으로 값 결정
 *    - 레벨별 재료/Ely 비용 차감 (확률 정보 미공개 → 100% 성공 가정)
 */

import {
  NORMAL_ENCHANT_TYPES,
  SPECIAL_ENCHANT_OPTIONS,
  SPECIAL_ENCHANT_COSTS,
  SPECIAL_ENCHANT_MAX_LEVEL,
  rangeFor,
} from '../data/enchantData.js';

// ============================================================
// 헬퍼
// ============================================================
function rollInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// step 정수면 정수 균등, 소수(0.1 등)면 step 단위 균등 분포
function rollValue(lo, hi, step) {
  if (!step || step >= 1) return rollInt(lo, hi);
  const n = Math.round((hi - lo) / step) + 1;
  const i = Math.floor(Math.random() * n);
  const v = lo + i * step;
  // 부동소수점 오차 보정 (소수 첫째자리)
  return Math.round(v * 10) / 10;
}

// ============================================================
// 일반 장비 인챈트 — 1회 시도
// stage: 'base' | 'full' — 노강 / 풀강 옵션 풀 선택
// returns:
//   { success: true,  hammerUsed, elyUsed, optionKey, label, unit, value }
//   { success: false, hammerUsed, elyUsed }
// ============================================================
export function tryNormalEnchant(part, optionKey, enchantTypeKey, stage = 'base') {
  const type = NORMAL_ENCHANT_TYPES[enchantTypeKey];
  if (!type) throw new Error(`unknown enchant type: ${enchantTypeKey}`);

  const success = Math.random() < type.successRate;
  if (!success) {
    return { success: false, hammerUsed: type.hammerCost, elyUsed: type.elyCost };
  }

  const opt = part.options.find((o) => o.key === optionKey);
  if (!opt) throw new Error(`unknown option: ${optionKey}`);
  const r = rangeFor(opt, stage);

  return {
    success: true,
    hammerUsed: type.hammerCost,
    elyUsed: type.elyCost,
    optionKey,
    label: opt.label,
    unit: opt.unit,
    value: rollValue(r.lo, r.hi, r.step),
    stage,
  };
}

// ============================================================
// 일반 장비 인챈트 — 풀강(slotCount슬롯) 도달까지 시뮬
//
// 한 장비에 같은 옵션은 한 번만 들어갈 수 있다 (게임 메커니즘).
// 매 시도마다 part.options 에서 아직 슬롯에 안 들어간 옵션을 순서대로 골라 시도한다.
// 시도 실패 → 장비 파괴 → 모든 슬롯 사라짐 → 첫 옵션부터 다시.
// ============================================================
export function simulateUntilFull(part, enchantTypeKey, stage = 'base', maxAttempts = 100_000) {
  let tries = 0;
  let hammerUsed = 0;
  let elyUsed = 0;
  let destroyed = 0;
  let slots = [];
  const slotMax = part.slotCount ?? 5;
  const allOpts = part.options || [];

  while (tries < maxAttempts && slots.length < slotMax) {
    const usedKeys = new Set(slots.map((s) => s.optionKey));
    const nextOpt = allOpts.find((o) => !usedKeys.has(o.key));
    if (!nextOpt) break; // 모든 옵션 사용됨 (이론상 slotMax > options.length 일 때만)

    const r = tryNormalEnchant(part, nextOpt.key, enchantTypeKey, stage);
    tries++;
    hammerUsed += r.hammerUsed;
    elyUsed += r.elyUsed;
    if (r.success) {
      slots.push({ optionKey: r.optionKey, label: r.label, unit: r.unit, value: r.value });
    } else {
      destroyed++;
      slots = []; // 장비 파괴 → 빈 장비로 재시작
    }
  }

  return {
    completed: slots.length >= slotMax,
    tries,
    hammerUsed,
    elyUsed,
    destroyed,
    finalSlots: slots,
  };
}

// ============================================================
// 일반 장비 인챈트 — 통계 (Monte Carlo)
//   풀강(slotMax)까지 도달하는 시도 횟수의 분포·평균
// ============================================================
export function computeNormalStats(part, enchantTypeKey, stage = 'base', runs = 2000) {
  const triesArr = [];
  const hammerArr = [];
  const elyArr = [];
  const destroyedArr = [];
  let completedCount = 0;

  for (let i = 0; i < runs; i++) {
    const r = simulateUntilFull(part, enchantTypeKey, stage, 50_000);
    if (r.completed) {
      completedCount++;
      triesArr.push(r.tries);
      hammerArr.push(r.hammerUsed);
      elyArr.push(r.elyUsed);
      destroyedArr.push(r.destroyed);
    }
  }

  if (completedCount === 0) {
    return null;
  }

  const sortNum = (a) => [...a].sort((x, y) => x - y);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

  const triesSorted = sortNum(triesArr);
  const hammerSorted = sortNum(hammerArr);
  const elySorted = sortNum(elyArr);
  const destroyedSorted = sortNum(destroyedArr);

  return {
    completedRate: completedCount / runs,
    mean: {
      tries: mean(triesArr),
      hammer: mean(hammerArr),
      ely: mean(elyArr),
      destroyed: mean(destroyedArr),
    },
    p50: {
      tries: q(triesSorted, 0.5),
      hammer: q(hammerSorted, 0.5),
      ely: q(elySorted, 0.5),
      destroyed: q(destroyedSorted, 0.5),
    },
    p90: {
      tries: q(triesSorted, 0.9),
      hammer: q(hammerSorted, 0.9),
      ely: q(elySorted, 0.9),
      destroyed: q(destroyedSorted, 0.9),
    },
    p99: {
      tries: q(triesSorted, 0.99),
      hammer: q(hammerSorted, 0.99),
      ely: q(elySorted, 0.99),
      destroyed: q(destroyedSorted, 0.99),
    },
    runs: completedCount,
  };
}

// ============================================================
// 일반 장비 인챈트 — 목표 옵션 모두 만족까지 1회 시뮬
//
// 모델 (가정):
//   - targets = [{ optionKey, minValue }, ...] 1~slotMax 개
//   - 한 장비에 사용자 입력 순서대로 옵션 1개씩 시도
//   - 시도 실패 → 장비 파괴 → 새 장비 처음부터 (망치 1개 소모, slot 모두 사라짐)
//   - 시도 성공 but 추첨 값 < minValue → 그 슬롯이 미달이라 장비 포기 (망치는 이미 소모됨)
//   - 모든 target 슬롯이 minValue 이상이면 성공 종료
//
// 추첨 값 미달 시 장비 포기는 "리롤 시스템 없음" 가정. 실제 게임 메커니즘이
// 다르면 (예: 같은 슬롯 재인챈트 가능) 추후 모델 변경 필요.
// ============================================================
export function simulateUntilTargetMet(part, targets, enchantTypeKey, stage = 'base', maxAttempts = 200_000) {
  let tries = 0;
  let hammerUsed = 0;
  let elyUsed = 0;
  let destroyed = 0;

  while (tries < maxAttempts) {
    let abandoned = false;
    const slots = [];

    for (const target of targets) {
      const r = tryNormalEnchant(part, target.optionKey, enchantTypeKey, stage);
      tries++;
      hammerUsed += r.hammerUsed;
      elyUsed += r.elyUsed;

      if (!r.success) {
        destroyed++;
        abandoned = true;
        break;
      }
      if (r.value < target.minValue) {
        // 값 미달 → 장비 포기 (망치/엘리는 소모, 다음 새 장비)
        abandoned = true;
        break;
      }
      slots.push({
        optionKey: r.optionKey,
        label: r.label,
        unit: r.unit,
        value: r.value,
      });
    }

    if (!abandoned) {
      return {
        completed: true,
        tries,
        hammerUsed,
        elyUsed,
        destroyed,
        finalSlots: slots,
      };
    }
  }
  return { completed: false, tries, hammerUsed, elyUsed, destroyed };
}

// ============================================================
// 일반 장비 인챈트 — 목표 도달 통계 (Monte Carlo)
// ============================================================
export function computeTargetStats(part, targets, enchantTypeKey, stage = 'base', runs = 1000) {
  const triesArr = [];
  const hammerArr = [];
  const elyArr = [];
  const destroyedArr = [];
  let completedCount = 0;

  for (let i = 0; i < runs; i++) {
    const r = simulateUntilTargetMet(part, targets, enchantTypeKey, stage, 100_000);
    if (r.completed) {
      completedCount++;
      triesArr.push(r.tries);
      hammerArr.push(r.hammerUsed);
      elyArr.push(r.elyUsed);
      destroyedArr.push(r.destroyed);
    }
  }

  if (completedCount === 0) return null;

  const sortNum = (a) => [...a].sort((x, y) => x - y);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

  const triesSorted = sortNum(triesArr);
  const hammerSorted = sortNum(hammerArr);
  const elySorted = sortNum(elyArr);
  const destroyedSorted = sortNum(destroyedArr);

  return {
    completedRate: completedCount / runs,
    runs: completedCount,
    mean: {
      tries: mean(triesArr),
      hammer: mean(hammerArr),
      ely: mean(elyArr),
      destroyed: mean(destroyedArr),
    },
    p50: {
      tries: q(triesSorted, 0.5),
      hammer: q(hammerSorted, 0.5),
      ely: q(elySorted, 0.5),
      destroyed: q(destroyedSorted, 0.5),
    },
    p90: {
      tries: q(triesSorted, 0.9),
      hammer: q(hammerSorted, 0.9),
      ely: q(elySorted, 0.9),
      destroyed: q(destroyedSorted, 0.9),
    },
    p99: {
      tries: q(triesSorted, 0.99),
      hammer: q(hammerSorted, 0.99),
      ely: q(elySorted, 0.99),
      destroyed: q(destroyedSorted, 0.99),
    },
  };
}

// ============================================================
// 특수장비 인챈트 — 옵션 1슬롯을 1단계 강화
// ============================================================
export function levelUpSpecial(optionKey, currentLevel) {
  if (currentLevel >= SPECIAL_ENCHANT_MAX_LEVEL) {
    return { success: false, reason: 'max level' };
  }
  const opt = SPECIAL_ENCHANT_OPTIONS[optionKey];
  if (!opt) throw new Error(`unknown special option: ${optionKey}`);

  const nextLv = currentLevel + 1;
  const range = opt.levels[nextLv - 1];
  const value = rollInt(range.lo, range.hi);
  const cost = SPECIAL_ENCHANT_COSTS[nextLv - 1];

  return {
    success: true,
    optionKey,
    label: opt.label,
    unit: opt.unit,
    level: nextLv,
    value,
    cost: { material: cost.material, ely: cost.ely },
  };
}
