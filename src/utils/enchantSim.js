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
import { rollInt, rollValue } from './random.js';
import { sortNum, quantile, mean } from './stats.js';
import { ENCHANT_SIM } from './simConstants.js';

// ============================================================
// 시뮬 결과 분포 → 평균/P50/P90/P99 통계 객체 빌더
// (computeNormalStats / computeTargetStats 공통)
// ============================================================
function buildDistributionStats(samples) {
  const keys = Object.keys(samples);
  const sorted = {};
  const out = { mean: {}, p50: {}, p90: {}, p99: {} };
  for (const k of keys) {
    sorted[k] = sortNum(samples[k]);
    out.mean[k] = mean(samples[k]);
    out.p50[k] = quantile(sorted[k], 0.50);
    out.p90[k] = quantile(sorted[k], 0.90);
    out.p99[k] = quantile(sorted[k], 0.99);
  }
  return out;
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
export function simulateUntilFull(
  part,
  enchantTypeKey,
  stage = 'base',
  maxAttempts = ENCHANT_SIM.FULL_MAX_ATTEMPTS,
) {
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
export function computeNormalStats(
  part,
  enchantTypeKey,
  stage = 'base',
  runs = ENCHANT_SIM.FULL_MC_RUNS,
) {
  const samples = { tries: [], hammer: [], ely: [], destroyed: [] };
  let completedCount = 0;

  for (let i = 0; i < runs; i++) {
    const r = simulateUntilFull(part, enchantTypeKey, stage, ENCHANT_SIM.FULL_MC_INNER_CAP);
    if (r.completed) {
      completedCount++;
      samples.tries.push(r.tries);
      samples.hammer.push(r.hammerUsed);
      samples.ely.push(r.elyUsed);
      samples.destroyed.push(r.destroyed);
    }
  }

  if (completedCount === 0) return null;
  return {
    completedRate: completedCount / runs,
    runs: completedCount,
    ...buildDistributionStats(samples),
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
export function simulateUntilTargetMet(
  part,
  targets,
  enchantTypeKey,
  stage = 'base',
  maxAttempts = ENCHANT_SIM.TARGET_MAX_ATTEMPTS,
) {
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
export function computeTargetStats(
  part,
  targets,
  enchantTypeKey,
  stage = 'base',
  runs = ENCHANT_SIM.TARGET_MC_RUNS,
) {
  const samples = { tries: [], hammer: [], ely: [], destroyed: [] };
  let completedCount = 0;

  for (let i = 0; i < runs; i++) {
    const r = simulateUntilTargetMet(
      part,
      targets,
      enchantTypeKey,
      stage,
      ENCHANT_SIM.TARGET_MC_INNER_CAP,
    );
    if (r.completed) {
      completedCount++;
      samples.tries.push(r.tries);
      samples.hammer.push(r.hammerUsed);
      samples.ely.push(r.elyUsed);
      samples.destroyed.push(r.destroyed);
    }
  }

  if (completedCount === 0) return null;
  return {
    completedRate: completedCount / runs,
    runs: completedCount,
    ...buildDistributionStats(samples),
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
