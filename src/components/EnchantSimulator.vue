<script setup>
import { computed, ref, watch } from 'vue';
import {
  NORMAL_ENCHANT_CATEGORIES,
  NORMAL_ENCHANT_TYPES,
  ENCHANT_STAGES,
  SPECIAL_ENCHANT_OPTIONS,
  SPECIAL_ENCHANT_COSTS,
  SPECIAL_ENCHANT_MAX_SLOTS,
  SPECIAL_ENCHANT_MAX_LEVEL,
  ENCHANT_BINDINGS,
  MYTHIC_MIN_PCT,
  categoryKeys,
  partKeys,
  getPart,
  availableEnchantTypes,
  supportsMythic,
  enchantMinPct,
  effectiveSuccessRate,
  rangeFor,
} from '../data/enchantData.js';
import {
  tryNormalEnchant,
  computeNormalStats,
  computeTargetStats,
  simulateUntilTargetMet,
  levelUpSpecial,
} from '../utils/enchantSim.js';
import { fmt, fmt1, pct, pctSmart } from '../utils/format.js';
import { ENCHANT_SIM } from '../utils/simConstants.js';

// ============================================================
// 모드
// ============================================================
const mode = ref('normal'); // 'normal' | 'special' | 'lookup'

// ============================================================
// 일반 장비 인챈트 상태 (카테고리 → 부위 → 옵션)
// ============================================================
const catKeysList = categoryKeys();
const normalCatKey = ref(catKeysList[0]);
const normalPartKey = ref(partKeys(catKeysList[0])[0]);
const normalEnchantType = ref('normal');
const normalSelectedOption = ref('');
// 귀속 장비 여부 — 인챈 수치 하한이 달라진다 (귀속 1% / 거래가능 20%).
//   대부분의 최종 장비가 귀속이라 기본 ON.
const normalIsBound = ref(true);
// 신화장비 여부 — 그렌델/벨리알/아마란스 노바 계열에만 존재.
//   ① 하한 80% (귀속/거래보다 우선)  ② 성공률 100% 고정 = 파괴 없음
const normalIsMythic = ref(false);
const normalMythicAvailable = computed(() => supportsMythic(normalCatKey.value));
const normalMythicOn = computed(() => normalMythicAvailable.value && normalIsMythic.value);
const normalMinPct = computed(() =>
  enchantMinPct({ bound: normalIsBound.value, mythic: normalMythicOn.value }),
);
// 시뮬 공통 옵션 — 하한 + 신화 여부
const normalSimOpts = computed(() => ({
  minPct: normalMinPct.value,
  mythic: normalMythicOn.value,
}));
// 화면 표기용 실제 성공률 (신화면 종류 무관 100%, 부위 고유 성공률 우선)
const normalSuccessRate = computed(() =>
  effectiveSuccessRate(normalEnchantType.value, normalMythicOn.value, normalPart.value),
);
// 노강/풀강 구분이 없는 부위 (캔서 배찌) — 풀강 환산 UI 를 전부 감춘다.
const normalSingleStage = computed(() => !!normalPart.value?.singleStage);
// 신화 + 슈퍼/특별 조합은 성공률이 이미 100% 라 망치만 더 쓰는 낭비
const normalMythicWastefulType = computed(
  () => normalMythicOn.value && normalEnchantType.value !== 'normal',
);
// 5슬롯 채운 뒤 Lv2 → Lv풀강 환산값을 슬롯에 표시할지 토글
const showFullConversion = ref(false);
const normalSlots = ref([]);
const normalLog = ref([]);
const normalCounters = ref({ tries: 0, hammerUsed: 0, elyUsed: 0, destroyed: 0 });
const normalStats = ref(null);
const normalIsAnalyzing = ref(false);

const normalPartList = computed(() => partKeys(normalCatKey.value));
const normalPart = computed(() => getPart(normalCatKey.value, normalPartKey.value));
const normalSlotMax = computed(() => normalPart.value?.slotCount ?? 5);
const normalIsFull = computed(() => normalSlots.value.length >= normalSlotMax.value);
const normalCurType = computed(() => NORMAL_ENCHANT_TYPES[normalEnchantType.value]);

// 이미 슬롯에 들어간 옵션 키 (중복 부여 불가)
const usedOptionKeys = computed(() => new Set(normalSlots.value.map((s) => s.optionKey)));
// 사용 가능한 다음 옵션 (Lv2 부위 옵션 정의 순서로)
const nextAvailableOption = computed(() => {
  const used = usedOptionKeys.value;
  return (normalPart.value?.options || []).find((o) => !used.has(o.key)) ?? null;
});

// 현재 카테고리에서 사용 가능한 인챈트 종류 키 목록
const availableTypes = computed(() => availableEnchantTypes(normalCatKey.value));

// ============================================================
// 목표 시뮬 상태
//   targetSettings = { [optionKey]: { enabled, minValue } }
// ============================================================
const targetSettings = ref({});
const targetStats = ref(null);
const targetSampleRun = ref(null);
const isTargetSimRunning = ref(false);

function initTargetSettings(part) {
  const obj = {};
  if (part?.options) {
    for (const opt of part.options) {
      obj[opt.key] = { enabled: false, minValue: '' };
    }
  }
  targetSettings.value = obj;
}

initTargetSettings(normalPart.value);

const validTargets = computed(() => {
  if (!normalPart.value) return [];
  const result = [];
  for (const opt of normalPart.value.options) {
    const t = targetSettings.value[opt.key];
    if (!t || !t.enabled) continue;
    const v = Number(t.minValue);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (v > opt.hi) continue; // Lv2 hi 기준
    result.push({ optionKey: opt.key, minValue: v, label: opt.label, unit: opt.unit, lo: opt.lo, hi: opt.hi });
  }
  return result;
});

const enabledCount = computed(() =>
  Object.values(targetSettings.value).filter((t) => t?.enabled).length
);

const targetTooMany = computed(() => enabledCount.value > normalSlotMax.value);

const canRunTargetSim = computed(() =>
  validTargets.value.length > 0 && !targetTooMany.value && !isTargetSimRunning.value
);

// ============================================================
// 권장선 프리셋 — 옵션 데이터의 rec(실전 권장 저격선)을 목표값으로 채운다.
//   캔서 배찌처럼 rec 가 정의된 부위에서만 버튼이 노출된다.
// ============================================================
const recommendedOptions = computed(() =>
  (normalPart.value?.options ?? []).filter((o) => Number.isFinite(o.rec)),
);
const hasRecommended = computed(() => recommendedOptions.value.length > 0);

function applyRecommendedTargets() {
  for (const opt of normalPart.value?.options ?? []) {
    const t = targetSettings.value[opt.key];
    if (!t) continue;
    if (Number.isFinite(opt.rec)) {
      t.enabled = true;
      t.minValue = String(opt.rec);
    } else {
      t.enabled = false;
      t.minValue = '';
    }
  }
}

// 카테고리/부위 변경 시 공통 초기화 — 슬롯·로그·통계·선택·목표 리셋
function resetForPartChange() {
  resetNormal();
  normalSelectedOption.value = '';
  initTargetSettings(normalPart.value);
  targetStats.value = null;
  targetSampleRun.value = null;
}

// 카테고리 변경 시: 첫 부위로 + 인챈트 종류 호환 체크 + 공통 초기화
watch(normalCatKey, (newCat) => {
  const list = partKeys(newCat);
  normalPartKey.value = list[0] ?? '';
  // 새 카테고리에서 현재 인챈트 종류가 없으면 normal로 fallback
  const types = availableEnchantTypes(newCat);
  if (!types.includes(normalEnchantType.value)) {
    normalEnchantType.value = 'normal';
  }
  resetForPartChange();
});

// 부위 변경 시: 공통 초기화
watch(normalPartKey, resetForPartChange);

// 귀속/신화 변경 시: 추첨 하한이 바뀌므로 진행 중인 슬롯·통계만 초기화
//   (목표 옵션 입력값은 유지 — 같은 목표를 귀속/거래/신화 조건으로 비교하는 용도)
watch([normalIsBound, normalIsMythic], () => {
  resetNormal();
  targetStats.value = null;
  targetSampleRun.value = null;
});

async function analyzeTargetSim() {
  if (!canRunTargetSim.value) return;
  isTargetSimRunning.value = true;
  await new Promise((r) => setTimeout(r, 30));
  try {
    targetStats.value = computeTargetStats(
      normalPart.value,
      validTargets.value,
      normalEnchantType.value,
      'base',
      undefined,
      normalSimOpts.value,
    );
    targetSampleRun.value = simulateUntilTargetMet(
      normalPart.value,
      validTargets.value,
      normalEnchantType.value,
      'base',
      undefined,
      normalSimOpts.value,
    );
  } finally {
    isTargetSimRunning.value = false;
  }
}

function resetTargetSim() {
  initTargetSettings(normalPart.value);
  targetStats.value = null;
  targetSampleRun.value = null;
}

function pushLog(arr, entry, max = 30) {
  arr.unshift(entry);
  if (arr.length > max) arr.length = max;
}

function runNormalOnce() {
  if (normalIsFull.value) return;
  // 선택 옵션이 이미 사용됐다면 다음 unused 옵션으로 자동 교체
  if (!normalSelectedOption.value || usedOptionKeys.value.has(normalSelectedOption.value)) {
    if (nextAvailableOption.value) {
      normalSelectedOption.value = nextAvailableOption.value.key;
    } else {
      return;
    }
  }

  const r = tryNormalEnchant(
    normalPart.value,
    normalSelectedOption.value,
    normalEnchantType.value,
    'base',
    normalSimOpts.value,
  );
  normalCounters.value.tries++;
  normalCounters.value.hammerUsed += r.hammerUsed;
  normalCounters.value.elyUsed += r.elyUsed;

  if (r.success) {
    normalSlots.value.push({
      optionKey: r.optionKey,
      label: r.label,
      unit: r.unit,
      value: r.value,
    });
    pushLog(normalLog.value, {
      type: 'success',
      try: normalCounters.value.tries,
      optionKey: r.optionKey,
      label: r.label,
      unit: r.unit,
      value: r.value,
      slotsAfter: normalSlots.value.length,
      slotMax: normalSlotMax.value,
    });
    // 성공한 옵션은 더 사용 불가 → 다음 unused 옵션 자동 선택
    if (nextAvailableOption.value) {
      normalSelectedOption.value = nextAvailableOption.value.key;
    } else {
      normalSelectedOption.value = '';
    }
  } else {
    normalCounters.value.destroyed++;
    normalSlots.value = [];
    pushLog(normalLog.value, {
      type: 'fail',
      try: normalCounters.value.tries,
    });
    // 장비 파괴 → 모든 슬롯 사라짐, 다시 첫 옵션부터
    if (normalPart.value?.options?.[0]) {
      normalSelectedOption.value = normalPart.value.options[0].key;
    }
  }
}

function runNormalUntilFull() {
  let safety = 0;
  while (!normalIsFull.value && safety < ENCHANT_SIM.AUTO_RUN_SAFETY_CAP) {
    runNormalOnce();
    safety++;
  }
}

function resetNormal() {
  normalSlots.value = [];
  normalLog.value = [];
  normalCounters.value = { tries: 0, hammerUsed: 0, elyUsed: 0, destroyed: 0 };
  normalStats.value = null;
  showFullConversion.value = false;
}

async function analyzeNormal() {
  // 풀강 통계는 옵션 선택과 무관 (옵션은 풀에서 자동 순회)
  normalIsAnalyzing.value = true;
  await new Promise((r) => setTimeout(r, 30));
  try {
    normalStats.value = computeNormalStats(
      normalPart.value,
      normalEnchantType.value,
      'base',
      2000,
      normalSimOpts.value,
    );
  } finally {
    normalIsAnalyzing.value = false;
  }
}

// ============================================================
// 특수장비 인챈트 상태
// ============================================================
const specialOptionKeys = Object.keys(SPECIAL_ENCHANT_OPTIONS);
const specialSlots = ref([]);
const specialLog = ref([]);
const specialCounters = ref({ tries: 0, totalMaterial: 0, totalEly: 0 });

const specialIsFull = computed(() => specialSlots.value.length >= SPECIAL_ENCHANT_MAX_SLOTS);

function addSpecialSlot() {
  if (specialIsFull.value) return;
  const used = new Set(specialSlots.value.map((s) => s.optionKey));
  const firstAvail = specialOptionKeys.find((k) => !used.has(k)) ?? specialOptionKeys[0];
  specialSlots.value.push({
    optionKey: firstAvail,
    level: 0,
    value: null,
    label: SPECIAL_ENCHANT_OPTIONS[firstAvail].label,
    unit: SPECIAL_ENCHANT_OPTIONS[firstAvail].unit,
  });
}

function removeSpecialSlot(idx) {
  specialSlots.value.splice(idx, 1);
}

function changeSpecialSlotOption(idx, newKey) {
  const slot = specialSlots.value[idx];
  if (!slot) return;
  if (slot.level > 0) return;
  slot.optionKey = newKey;
  slot.label = SPECIAL_ENCHANT_OPTIONS[newKey].label;
  slot.unit = SPECIAL_ENCHANT_OPTIONS[newKey].unit;
}

function levelUpSpecialSlot(idx) {
  const slot = specialSlots.value[idx];
  if (!slot) return;
  if (slot.level >= SPECIAL_ENCHANT_MAX_LEVEL) return;
  const r = levelUpSpecial(slot.optionKey, slot.level);
  if (!r.success) return;
  slot.level = r.level;
  slot.value = r.value;
  specialCounters.value.tries++;
  specialCounters.value.totalMaterial += r.cost.material;
  specialCounters.value.totalEly += r.cost.ely;
  pushLog(specialLog.value, {
    slotIdx: idx,
    label: r.label,
    unit: r.unit,
    level: r.level,
    value: r.value,
    cost: r.cost,
  });
}

function levelUpAllSpecialToMax() {
  for (let i = 0; i < specialSlots.value.length; i++) {
    while (specialSlots.value[i].level < SPECIAL_ENCHANT_MAX_LEVEL) {
      levelUpSpecialSlot(i);
    }
  }
}

function resetSpecial() {
  specialSlots.value = [];
  specialLog.value = [];
  specialCounters.value = { tries: 0, totalMaterial: 0, totalEly: 0 };
}

// ============================================================
// 🔍 인챈트 수치 조회 (시뮬 아닌 단순 환산기)
//   - 입력 stage 'base' (Lv2) / 'full' (Lv풀강) 선택
//   - 행 5개에 옵션·값 입력 → Lv2/Lv풀강 양쪽 환산값과 등급%, 평균 급
// ============================================================
const lookupCatKey = ref(catKeysList[0]);
const lookupPartKey = ref(partKeys(catKeysList[0])[0]);
const lookupStage = ref('base');
const lookupRows = ref(Array.from({ length: 5 }, () => ({ optionKey: '', value: '' })));
const lookupResult = ref(null);

const lookupPart = computed(() => getPart(lookupCatKey.value, lookupPartKey.value));
const lookupPartList = computed(() => partKeys(lookupCatKey.value));
const lookupFullLevel = computed(() => lookupPart.value?.fullLevel ?? '?');
// 단일 단계 부위(캔서 배찌)는 노강/풀강 환산 자체가 없다 — 입력 단계 토글·풀강 패널을 숨긴다.
const lookupSingleStage = computed(() => !!lookupPart.value?.singleStage);

watch(lookupCatKey, (newCat) => {
  lookupPartKey.value = partKeys(newCat)[0] ?? '';
  resetLookup();
});
watch(lookupPartKey, () => {
  if (lookupSingleStage.value) lookupStage.value = 'base';
  resetLookup();
});
watch(lookupStage, () => { lookupResult.value = null; });

function resetLookup() {
  lookupRows.value = Array.from({ length: 5 }, () => ({ optionKey: '', value: '' }));
  lookupResult.value = null;
}

function computeLookup() {
  const part = lookupPart.value;
  if (!part) return;
  const baseRows = [];
  const fullRows = [];
  for (const row of lookupRows.value) {
    if (!row.optionKey) continue;
    const v = Number(row.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    const opt = part.options.find((o) => o.key === row.optionKey);
    if (!opt) continue;

    const D = opt.fullHi - opt.hi;
    let baseVal, fullVal;
    if (lookupStage.value === 'base') {
      baseVal = v;
      fullVal = v + D;
    } else {
      fullVal = v;
      baseVal = v - D;
    }
    if (opt.step && opt.step < 1) {
      baseVal = Math.round(baseVal * 10) / 10;
      fullVal = Math.round(fullVal * 10) / 10;
    }
    // 게임사 기준 Math.floor 사용
    const baseGrade = Math.floor((baseVal / opt.hi) * 100);
    const fullGrade = Math.floor((fullVal / opt.fullHi) * 100);

    baseRows.push({
      label: opt.label, value: baseVal, unit: opt.unit, grade: baseGrade,
      hi: opt.hi, step: opt.step,
    });
    fullRows.push({
      label: opt.label, value: fullVal, unit: opt.unit, grade: fullGrade,
      hi: opt.fullHi, step: opt.step,
    });
  }
  if (baseRows.length === 0) {
    lookupResult.value = null;
    return;
  }
  const avg = (arr) => Math.floor(arr.reduce((s, r) => s + r.grade, 0) / arr.length);
  lookupResult.value = {
    base: { rows: baseRows, avg: avg(baseRows), level: part.level },
    full: { rows: fullRows, avg: avg(fullRows), level: part.fullLevel },
    partName: part.name,
  };
}

// 등급% → 진행바 색상
function gradeBarColor(p) {
  if (p == null) return 'bg-stone-300 dark:bg-stone-600';
  if (p >= 90) return 'bg-rose-500';
  if (p >= 70) return 'bg-amber-500';
  if (p >= 30) return 'bg-cyan-500';
  return 'bg-stone-400 dark:bg-stone-500';
}

// 옵션 범위 텍스트 — Lv2 기본 + 풀강 환산 범위 부가.
//   하한은 귀속 여부(normalMinPct)에 따라 달라진다.
// 옵션 단위(step)에 맞춘 값 표기 — step 0.1 옵션(지배력 등)은 소수 1자리.
function fmtOptVal(opt, v) {
  return (opt?.step && opt.step < 1) ? fmt1(v) : fmt(v);
}
function rangeText(opt) {
  const r = rangeFor(opt, 'base', normalMinPct.value);
  return `+${fmtOptVal(opt, r.lo)} ~ +${fmtOptVal(opt, r.hi)}${opt.unit}`;
}
function fullRangeText(opt) {
  const r = rangeFor(opt, 'full', normalMinPct.value);
  return `+${fmtOptVal(opt, r.lo)} ~ +${fmtOptVal(opt, r.hi)}${opt.unit}`;
}
// 권장 저격선 표기 — rec 없는 옵션은 빈 문자열.
function recText(opt) {
  if (!Number.isFinite(opt?.rec)) return '';
  return `권장 +${fmtOptVal(opt, opt.rec)}${opt.unit} 이상`;
}

// 추첨된 값이 Lv2 hi 대비 몇 % 인지. 게임사 기준 Math.floor 적용.
function rollPct(optionKey, value) {
  if (!normalPart.value || optionKey == null || value == null) return null;
  const opt = normalPart.value.options.find((o) => o.key === optionKey);
  if (!opt || !opt.hi) return null;
  const p = (Number(value) / Number(opt.hi)) * 100;
  if (!Number.isFinite(p)) return null;
  return Math.floor(p);
}

// Lv2 추첨값 → Lv풀강 환산값. D = fullHi - hi.
function fullConverted(optionKey, value) {
  if (!normalPart.value || optionKey == null || value == null) return null;
  const opt = normalPart.value.options.find((o) => o.key === optionKey);
  if (!opt) return null;
  const D = opt.fullHi - opt.hi;
  const v = Number(value) + D;
  if (opt.step && opt.step < 1) return Math.round(v * 10) / 10;
  return Math.round(v);
}

const fullStageLabel = computed(() => `Lv${normalPart.value?.fullLevel ?? '?'}`);

// 현재 채워진 슬롯들의 평균 등급 (Math.floor 기준, 풀강 환산 패널 푸터용)
const avgSlotsGrade = computed(() => {
  if (normalSlots.value.length === 0) return 0;
  const grades = normalSlots.value
    .map((s) => rollPct(s.optionKey, s.value))
    .filter((g) => g != null);
  if (grades.length === 0) return 0;
  return Math.floor(grades.reduce((a, b) => a + b, 0) / grades.length);
});

// 등급 색상 클래스 (≥90% 빨강, ≥70% 노랑, 그 외 기본 슬레이트)
function rollPctClass(p) {
  if (p == null) return 'text-stone-400 dark:text-stone-500';
  if (p >= 90) return 'text-rose-600 dark:text-rose-400 font-bold';
  if (p >= 70) return 'text-amber-600 dark:text-amber-400 font-bold';
  return 'text-stone-400 dark:text-stone-500';
}
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div class="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 py-3 text-sm text-cyan-800 dark:text-cyan-200">
      <strong>🔨 인챈트 시뮬레이터</strong> · 장비 인챈트(실패 시 파괴) / 특수장비 인챈트(레벨 강화) 두 가지 모드.
      <br />
      <strong>장비 인챈트</strong>: 일반(50%) / 슈퍼(60%) 시도 → 성공 시 옵션 1슬롯 부여, 실패 시 장비 파괴.
      한 장비 5슬롯 채우면 풀강.
      <br />
      <strong>캔서 배찌</strong>: 같은 파괴형이지만 성공률이 낮다 — 일반(40%) / 슈퍼(50%).
      노강/풀강 구분 없이 5슬롯이 곧 완성.
      <br />
      <strong>특수장비 인챈트</strong>: 옵션 슬롯 5개, 각 옵션을 Lv.1 → Lv.5 단계 강화. 레벨별 재료/Ely 비용.
      <br />
      <strong class="text-xs">⚠️</strong> 비공식 시뮬레이터 — 실제 게임 확률·메커니즘과 다를 수 있음.
    </div>

    <!-- 모드 선택 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <button
        type="button"
        @click="mode = 'normal'"
        :class="[
          'rounded-lg px-4 py-2.5 text-sm font-semibold transition',
          mode === 'normal'
            ? 'bg-cyan-600 text-white'
            : 'bg-white dark:bg-stone-800 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
        ]"
      >
        🛠️ 장비 인챈트 (시뮬)
      </button>
      <button
        type="button"
        @click="mode = 'special'"
        :class="[
          'rounded-lg px-4 py-2.5 text-sm font-semibold transition',
          mode === 'special'
            ? 'bg-cyan-600 text-white'
            : 'bg-white dark:bg-stone-800 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
        ]"
      >
        ✨ 특수장비 인챈트
      </button>
      <button
        type="button"
        @click="mode = 'lookup'"
        :class="[
          'rounded-lg px-4 py-2.5 text-sm font-semibold transition',
          mode === 'lookup'
            ? 'bg-cyan-600 text-white'
            : 'bg-white dark:bg-stone-800 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
        ]"
      >
        🔍 인챈트 수치 조회
      </button>
    </div>

    <!-- ============================================================ -->
    <!-- 모드 1: 장비 인챈트                                          -->
    <!-- ============================================================ -->
    <template v-if="mode === 'normal'">
      <!-- ① 공통 조건: 카테고리 / 부위 / 인챈트 종류 -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-4">⚙️ 공통 조건</h2>

        <div class="mb-3">
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">카테고리</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="cat in catKeysList"
              :key="cat"
              type="button"
              @click="normalCatKey = cat"
              :class="[
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                normalCatKey === cat
                  ? 'bg-cyan-600 text-white'
                  : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              {{ cat }}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">부위</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in normalPartList"
              :key="p"
              type="button"
              @click="normalPartKey = p"
              :class="[
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                normalPartKey === p
                  ? 'bg-emerald-600 text-white'
                  : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              {{ p }}
            </button>
          </div>
        </div>

        <div>
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">인챈트 종류</span>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="key in availableTypes"
              :key="key"
              type="button"
              @click="normalEnchantType = key"
              :class="[
                'flex-1 min-w-[180px] rounded-md px-3 py-2 text-sm font-medium transition',
                normalEnchantType === key
                  ? 'bg-cyan-600 text-white'
                  : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              <div>
                {{ NORMAL_ENCHANT_TYPES[key].name }}
                ({{ pct(effectiveSuccessRate(key, normalMythicOn, normalPart)) }})
                <span v-if="normalMythicOn" class="text-[10px] align-middle opacity-80">✨신화</span>
              </div>
              <div class="text-[11px] mt-0.5 opacity-80 tabular-nums">
                망치 {{ NORMAL_ENCHANT_TYPES[key].hammerCost }} · Ely {{ fmt(NORMAL_ENCHANT_TYPES[key].elyCost) }}
              </div>
            </button>
          </div>
          <p v-if="normalMythicWastefulType" class="mt-1.5 text-xs text-orange-600 dark:text-orange-400">
            ⚠ 신화장비는 이미 100% 성공이라 종류를 올려도 이득이 없습니다 —
            망치 1개짜리 <strong>일반 인챈트</strong>가 가장 저렴합니다.
          </p>
        </div>

        <!-- 인챈 수치 하한 — 귀속 1% / 거래가능 20% / 신화 80% -->
        <div class="mt-4">
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            장비 속성
            <span class="ml-1 text-xs font-normal tabular-nums text-cyan-700 dark:text-cyan-300">
              → 인챈 수치 {{ normalMinPct }} ~ 100%
            </span>
          </span>
          <div class="flex gap-2 flex-wrap">
            <label
              class="flex flex-1 min-w-[180px] items-center gap-2.5 rounded-md px-3 py-2 ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 cursor-pointer transition"
            >
              <input
                v-model="normalIsBound"
                type="checkbox"
                class="h-4 w-4 shrink-0 accent-cyan-600 cursor-pointer"
              />
              <span class="text-sm text-stone-700 dark:text-stone-200">귀속 장비</span>
              <span class="text-xs tabular-nums text-stone-500 dark:text-stone-400">1~100%</span>
            </label>

            <label
              v-if="normalMythicAvailable"
              class="flex flex-1 min-w-[180px] items-center gap-2.5 rounded-md px-3 py-2 ring-1 cursor-pointer transition"
              :class="normalIsMythic
                ? 'ring-orange-400 dark:ring-orange-500 bg-orange-50 dark:bg-orange-950/30'
                : 'ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700'"
            >
              <input
                v-model="normalIsMythic"
                type="checkbox"
                class="h-4 w-4 shrink-0 accent-orange-500 cursor-pointer"
              />
              <span class="text-sm text-stone-700 dark:text-stone-200">✨ 신화 장비</span>
              <span class="text-xs tabular-nums text-orange-600 dark:text-orange-400">
                {{ MYTHIC_MIN_PCT }}~100% · 파괴 없음
              </span>
            </label>
          </div>
          <p class="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            거래가능 장비는 최소 보정치가 올라가 <strong>20~100%</strong> 로 추첨됩니다
            (귀속은 <strong>1~100%</strong>) — 체크 해제 시 거래가능 기준.
            <template v-if="normalMythicAvailable">
              신화 장비는 모든 슬롯이 <strong>{{ MYTHIC_MIN_PCT }}~100%</strong> 로 보정되고
              인챈트 종류와 무관하게 <strong>성공률 100%</strong> 라 장비가 파괴되지 않습니다
              (귀속 여부보다 우선 적용).
            </template>
            <template v-else>
              신화 장비는 그렌델(이카로스의 날개) · 벨리알(리키모 펠케) · 아마란스 노바 계열에만 있습니다.
            </template>
          </p>
        </div>
      </section>

      <!-- ② 1회 시뮬 / 풀강 시뮬 — 모든 결과(슬롯·로그·통계) 한 섹션에 -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-cyan-300 dark:ring-cyan-700 p-5">
        <h2 class="text-lg font-bold text-cyan-700 dark:text-cyan-300 mb-1">
          🔨 옵션 굴려보기 / {{ normalSingleStage ? '완성' : '풀강' }} 비용 분석
        </h2>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
          1개 옵션을 골라 굴려본 뒤 슬롯·로그를 확인하거나,
          {{ normalSingleStage ? `${normalSlotMax}슬롯` : '풀강' }} 1회 자동 시뮬(체험),
          {{ normalSingleStage ? '완성' : '풀강' }} 평균 분석(통계)을 실행합니다.
        </p>

        <!-- 옵션 선택 -->
        <div class="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">
          옵션 선택 —
          <template v-if="!normalSingleStage">Lv{{ normalPart?.level ?? '?' }} </template>{{ normalPartKey }}
          <span class="text-xs ml-1 text-stone-500 dark:text-stone-400">
            <template v-if="normalSingleStage">
              (노강/풀강 구분 없음 — {{ normalSlotMax }}슬롯을 채우면 완성)
            </template>
            <template v-else>
              (인챈트는 Lv2에서 진행, 5슬롯 채우면 풀강 = Lv{{ normalPart?.fullLevel ?? '?' }} 환산)
            </template>
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <label
            v-for="opt in normalPart?.options ?? []"
            :key="opt.key + '_' + opt.label"
            :class="[
              'flex items-center justify-between gap-3 rounded-md ring-1 px-3 py-2 text-sm transition',
              usedOptionKeys.has(opt.key)
                ? 'bg-stone-100 dark:bg-stone-900/60 ring-stone-200 dark:ring-stone-700 text-stone-400 dark:text-stone-500 line-through cursor-not-allowed'
                : (normalSelectedOption === opt.key
                    ? 'bg-cyan-50 dark:bg-cyan-950/40 ring-cyan-400 dark:ring-cyan-500 text-cyan-800 dark:text-cyan-200 font-semibold cursor-pointer'
                    : 'ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 cursor-pointer'),
            ]"
          >
            <input
              type="radio"
              :value="opt.key"
              v-model="normalSelectedOption"
              :disabled="usedOptionKeys.has(opt.key)"
              class="accent-cyan-600"
            />
            <span class="flex-1 truncate">{{ opt.label }}<span v-if="usedOptionKeys.has(opt.key)" class="text-[10px] ml-1">(부여됨)</span></span>
            <div class="text-right whitespace-nowrap leading-tight">
              <div class="text-xs tabular-nums text-stone-500 dark:text-stone-400">{{ rangeText(opt) }}</div>
              <div
                v-if="!normalSingleStage"
                class="text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400 opacity-80"
              >풀강 {{ fullRangeText(opt) }}</div>
              <div
                v-else-if="recText(opt)"
                class="text-[10px] tabular-nums text-orange-600 dark:text-orange-400 opacity-90"
                :title="opt.recNote"
              >{{ recText(opt) }}</div>
            </div>
          </label>
        </div>

        <!-- 액션 버튼 + 차이 안내 -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <button
            type="button"
            @click="runNormalOnce"
            :disabled="normalIsFull || !nextAvailableOption"
            class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition text-left"
          >
            <div>🔨 1회 시도</div>
            <div class="text-[11px] mt-0.5 opacity-90 font-normal">선택 옵션(또는 다음 unused)을 1번 굴림</div>
          </button>
          <button
            type="button"
            @click="runNormalUntilFull"
            :disabled="normalIsFull || !nextAvailableOption"
            class="rounded-lg ring-1 ring-cyan-400 dark:ring-cyan-600 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold transition text-left"
          >
            <div>⚡ {{ normalSingleStage ? `${normalSlotMax}슬롯` : '풀강' }} 1회 자동 (체험)</div>
            <div class="text-[11px] mt-0.5 opacity-90 font-normal">{{ normalSlotMax }}슬롯 채울 때까지 다른 옵션 자동 순회</div>
          </button>
          <button
            type="button"
            @click="analyzeNormal"
            :disabled="normalIsAnalyzing"
            class="rounded-lg ring-1 ring-emerald-400 dark:ring-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold transition text-left"
          >
            <div>{{ normalIsAnalyzing ? '⏳ 분석 중...' : `📊 ${normalSingleStage ? '완성' : '풀강'} 평균 분석 (2,000회)` }}</div>
            <div class="text-[11px] mt-0.5 opacity-90 font-normal">2,000회 시뮬 평균 — 옵션 선택 무관, {{ normalSlotMax }}슬롯 채우는 비용</div>
          </button>
        </div>
        <div class="flex flex-wrap gap-2 mb-5">
          <button
            type="button"
            @click="resetNormal"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 transition"
          >
            초기화
          </button>
        </div>

        <!-- 슬롯 그리드 + 카운터 -->
        <div class="rounded-lg bg-stone-50 dark:bg-stone-900/40 ring-1 ring-stone-200 dark:ring-stone-700 p-4 mb-4">
          <div class="mb-3">
            <h3 class="text-sm font-bold text-stone-700 dark:text-stone-200">
              🛡️ 현재 {{ normalSingleStage ? normalPartKey : '장비' }} — {{ normalSlots.length }}/{{ normalSlotMax }} 슬롯
            </h3>
          </div>

          <!-- 풀강 환산 토글: 1슬롯이라도 채워졌으면 노출 (5/5 아니어도 OK) -->
          <!--   단일 단계 부위(캔서 배찌)는 환산 대상이 없어 숨김 -->
          <div v-if="normalSlots.length > 0 && !normalSingleStage" class="mb-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              @click="showFullConversion = !showFullConversion"
              :class="[
                'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                showFullConversion
                  ? 'bg-emerald-600 text-white'
                  : 'ring-1 ring-emerald-400 dark:ring-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
              ]"
            >
              {{ showFullConversion ? `🔄 풀강 (${fullStageLabel}) 환산 중` : `🔄 풀강 (${fullStageLabel}) 환산 보기` }}
            </button>
            <span class="text-[11px] text-stone-500 dark:text-stone-400">
              {{ normalSlots.length }}/{{ normalSlotMax }} 슬롯 — {{ fullStageLabel }} 환산값으로 전환 가능
            </span>
          </div>

          <!-- (A) 슬롯 0개: 빈 5-카드 그리드 (placeholder) -->
          <div
            v-if="normalSlots.length === 0"
            class="grid grid-cols-1 sm:grid-cols-5 gap-2"
          >
            <div
              v-for="i in normalSlotMax"
              :key="i"
              class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800 px-3 py-3 text-sm tabular-nums min-h-[60px] flex flex-col justify-center"
            >
              <div class="text-xs text-stone-400 dark:text-stone-500">슬롯 {{ i }} 비어있음</div>
            </div>
          </div>

          <!-- (B) 슬롯 ≥1: Lv2 패널은 항상 노출, 풀강 환산 ON 시 Lv풀강 패널 추가 -->
          <div
            v-else
            :class="showFullConversion ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : ''"
          >
            <!-- Lv2 패널 (항상) -->
            <div class="rounded-lg bg-white dark:bg-stone-800 ring-1 ring-amber-300 dark:ring-amber-700 p-4">
              <h4 class="text-sm font-bold text-amber-700 dark:text-amber-300 mb-3">
                <template v-if="!normalSingleStage">Lv{{ normalPart?.level }} </template>{{ normalPartKey }}
                <span v-if="!normalIsFull" class="text-[11px] font-normal text-stone-500 dark:text-stone-400 ml-1">
                  ({{ normalSlots.length }}/{{ normalSlotMax }} 슬롯)
                </span>
              </h4>
              <div class="space-y-3">
                <div v-for="(s, i) in normalSlots" :key="i">
                  <div class="flex items-center justify-between text-sm tabular-nums mb-1">
                    <span class="text-stone-700 dark:text-stone-200 truncate">
                      <template v-if="!normalSingleStage">Lv{{ normalPart?.level }} </template>{{ s.label }} +{{ fmt(s.value) }}{{ s.unit }}
                    </span>
                    <span :class="['text-xs font-bold whitespace-nowrap', rollPctClass(rollPct(s.optionKey, s.value))]">
                      {{ rollPct(s.optionKey, s.value) }}%
                    </span>
                  </div>
                  <div class="h-1.5 rounded bg-stone-200 dark:bg-stone-700 overflow-hidden">
                    <div
                      :class="['h-full', gradeBarColor(rollPct(s.optionKey, s.value))]"
                      :style="{ width: Math.min(rollPct(s.optionKey, s.value) ?? 0, 100) + '%' }"
                    ></div>
                  </div>
                </div>
              </div>
              <div class="mt-4 pt-3 border-t border-amber-200 dark:border-amber-800 text-center text-sm font-bold text-amber-700 dark:text-amber-300">
                《 {{ avgSlotsGrade }}% 급 》 장비
              </div>
            </div>

            <!-- Lv풀강 패널 (토글 ON 시) -->
            <div
              v-if="showFullConversion"
              class="rounded-lg bg-white dark:bg-stone-800 ring-1 ring-emerald-300 dark:ring-emerald-700 p-4"
            >
              <h4 class="text-sm font-bold text-emerald-700 dark:text-emerald-300 mb-3">
                <span v-if="normalIsFull">[풀강] ★★★ </span>{{ fullStageLabel }} {{ normalPartKey }}
                <span v-if="!normalIsFull" class="text-[11px] font-normal text-stone-500 dark:text-stone-400">
                  ({{ normalSlots.length }}/{{ normalSlotMax }} 슬롯, 풀강 환산값 미리보기)
                </span>
              </h4>
              <div class="space-y-3">
                <div v-for="(s, i) in normalSlots" :key="i">
                  <div class="flex items-center justify-between text-sm tabular-nums mb-1">
                    <span class="text-stone-700 dark:text-stone-200 truncate">
                      {{ fullStageLabel }} {{ s.label }} +{{ fmt(fullConverted(s.optionKey, s.value)) }}{{ s.unit }}
                    </span>
                    <span :class="['text-xs font-bold whitespace-nowrap', rollPctClass(rollPct(s.optionKey, s.value))]">
                      {{ rollPct(s.optionKey, s.value) }}%
                    </span>
                  </div>
                  <div class="h-1.5 rounded bg-stone-200 dark:bg-stone-700 overflow-hidden">
                    <div
                      :class="['h-full', gradeBarColor(rollPct(s.optionKey, s.value))]"
                      :style="{ width: Math.min(rollPct(s.optionKey, s.value) ?? 0, 100) + '%' }"
                    ></div>
                  </div>
                </div>
              </div>
              <div class="mt-4 pt-3 border-t border-emerald-200 dark:border-emerald-800 text-center text-sm font-bold text-emerald-700 dark:text-emerald-300">
                《 {{ avgSlotsGrade }}% 급 》 장비
              </div>
            </div>
          </div>
        </div>

        <!-- 시도 로그 (슬롯 바로 아래에 inline 표시) -->
        <div
          v-if="normalLog.length > 0"
          class="rounded-lg bg-stone-50 dark:bg-stone-900/40 ring-1 ring-stone-200 dark:ring-stone-700 p-4 mb-4"
        >
          <h3 class="text-sm font-bold text-stone-700 dark:text-stone-200 mb-2">📜 시도 로그 (최근 30회)</h3>
          <ul class="space-y-1 font-mono text-xs max-h-64 overflow-y-auto">
            <li
              v-for="(e, i) in normalLog"
              :key="i"
              :class="[
                'tabular-nums rounded px-2 py-1',
                e.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
              ]"
            >
              <template v-if="e.type === 'success'">
                ✓ #{{ e.try }} 성공 — {{ e.label }} +{{ fmt(e.value) }}{{ e.unit }}
                <span
                  v-if="rollPct(e.optionKey, e.value) != null"
                  :class="rollPctClass(rollPct(e.optionKey, e.value))"
                >
                  [{{ rollPct(e.optionKey, e.value) }}%]
                </span>
                <span class="text-stone-500 dark:text-stone-400">(슬롯 {{ e.slotsAfter }}/{{ e.slotMax }})</span>
              </template>
              <template v-else>
                ✗ #{{ e.try }} 실패 — 장비 파괴
              </template>
            </li>
          </ul>
        </div>

        <!-- 풀강 도달 통계 (통계 분석 클릭 시) -->
        <div
          v-if="normalStats"
          class="rounded-lg bg-emerald-50/40 dark:bg-emerald-950/15 ring-1 ring-emerald-300 dark:ring-emerald-700 p-4"
        >
          <h3 class="text-sm font-bold text-emerald-700 dark:text-emerald-300 mb-1">
            📊 {{ normalSingleStage ? '완성' : '풀강' }} 도달 통계 — {{ normalCurType.name }} ({{ pct(normalSuccessRate) }}<template v-if="normalMythicOn">, 신화</template>)
          </h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
            {{ normalPartKey }} 1개를 {{ normalSlotMax }}슬롯{{ normalSingleStage ? '' : ' 풀강' }}까지 채우는 데 걸리는 시도/망치/Ely/파괴 분포 ({{ fmt(normalStats.runs) }}회 시뮬).
          </p>

          <div class="overflow-x-auto">
            <table class="min-w-full text-sm tabular-nums">
              <thead class="text-xs uppercase text-stone-500 dark:text-stone-400 bg-white/60 dark:bg-stone-900/40">
                <tr>
                  <th class="px-3 py-2 text-left">지표</th>
                  <th class="px-3 py-2 text-right">평균</th>
                  <th class="px-3 py-2 text-right">중앙값 (50%)</th>
                  <th class="px-3 py-2 text-right">상위 10% (P90)</th>
                  <th class="px-3 py-2 text-right">상위 1% (P99)</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-t border-emerald-200 dark:border-emerald-800">
                  <td class="px-3 py-2 font-medium">시도 횟수</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(normalStats.mean.tries)) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p50.tries) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p90.tries) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p99.tries) }}</td>
                </tr>
                <tr class="border-t border-emerald-200 dark:border-emerald-800">
                  <td class="px-3 py-2 font-medium">플래티넘 망치</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(normalStats.mean.hammer)) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p50.hammer) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p90.hammer) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p99.hammer) }}개</td>
                </tr>
                <tr class="border-t border-emerald-200 dark:border-emerald-800">
                  <td class="px-3 py-2 font-medium">Ely 소모</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(normalStats.mean.ely)) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p50.ely) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p90.ely) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p99.ely) }}</td>
                </tr>
                <tr class="border-t border-emerald-200 dark:border-emerald-800">
                  <td class="px-3 py-2 font-medium">파괴된 장비</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(normalStats.mean.destroyed)) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p50.destroyed) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p90.destroyed) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(normalStats.p99.destroyed) }}개</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ③ 🎯 목표 옵션 시뮬 (완전 분리된 섹션) -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-emerald-300 dark:ring-emerald-700 p-5">
        <h2 class="text-lg font-bold text-emerald-700 dark:text-emerald-300 mb-2">🎯 목표 옵션 시뮬</h2>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
          관심있는 옵션만 체크 + 최소값 설정 → "한 장비"에서 그 모든 조건을 동시 만족할 때까지의 평균 시도/망치/파괴 장비 수.
          순서대로 시도하다 추첨 값이 목표 미달이면 그 장비는 폐기 (망치는 소모됨).
          최대 {{ normalSlotMax }}개 (슬롯 한도).
        </p>

        <div class="space-y-1.5 mb-3">
          <div
            v-for="opt in normalPart?.options ?? []"
            :key="'tgt_' + opt.key + opt.label"
            class="flex items-center gap-3 rounded-md ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40 px-3 py-2"
          >
            <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
              <input
                type="checkbox"
                v-model="targetSettings[opt.key].enabled"
                class="accent-cyan-600"
              />
              <span class="text-sm text-stone-700 dark:text-stone-200 truncate">{{ opt.label }}</span>
              <span class="text-xs tabular-nums text-stone-500 dark:text-stone-400 whitespace-nowrap">{{ rangeText(opt) }}</span>
              <span
                v-if="recText(opt)"
                :title="opt.recNote"
                class="text-[10px] tabular-nums whitespace-nowrap rounded px-1.5 py-0.5 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-800"
              >{{ recText(opt) }}</span>
            </label>
            <div class="flex items-center gap-1 whitespace-nowrap">
              <span class="text-xs text-stone-500 dark:text-stone-400">최소</span>
              <input
                type="number"
                step="any"
                v-model="targetSettings[opt.key].minValue"
                :disabled="!targetSettings[opt.key].enabled"
                placeholder="값"
                class="w-24 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-50"
              />
              <span class="text-xs text-stone-400 w-4">{{ opt.unit }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="targetTooMany"
          class="mb-3 text-xs text-rose-600 dark:text-rose-400"
        >
          ⚠ 슬롯 한도({{ normalSlotMax }}개)를 초과했습니다. 체크된 옵션을 줄여주세요.
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="analyzeTargetSim"
            :disabled="!canRunTargetSim"
            class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            {{ isTargetSimRunning ? '⏳ 시뮬 중...' : '🎯 목표 시뮬' }}
          </button>
          <button
            v-if="hasRecommended"
            type="button"
            @click="applyRecommendedTargets"
            class="rounded-lg ring-1 ring-orange-300 dark:ring-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 px-5 py-2.5 text-sm font-semibold transition"
          >
            ⭐ 권장 저격선으로 채우기
          </button>
          <button
            type="button"
            @click="resetTargetSim"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-200 transition"
          >
            초기화
          </button>
        </div>
        <p v-if="hasRecommended" class="mt-2 text-xs text-stone-500 dark:text-stone-400">
          ⭐ 권장 저격선 —
          <template v-for="(opt, i) in recommendedOptions" :key="opt.key">
            <template v-if="i > 0"> · </template>
            <span class="text-orange-600 dark:text-orange-400">{{ opt.label }} {{ opt.recNote }}</span>
          </template>
        </p>

        <!-- 결과 -->
        <div v-if="targetStats" class="mt-5 space-y-4">
          <div class="text-sm text-stone-700 dark:text-stone-200">
            <strong>{{ normalCurType.name }}</strong> ({{ pct(normalSuccessRate) }}<template v-if="normalMythicOn">, 신화</template>) 으로
            <strong>{{ normalPartKey }}</strong> 1개를 만들 때 — 목표 만족까지:
            <ul class="mt-1.5 ml-4 list-disc text-xs text-cyan-600 dark:text-cyan-400 space-y-0.5">
              <li v-for="t in validTargets" :key="t.optionKey">
                {{ t.label }} ≥ +{{ fmt(t.minValue) }}{{ t.unit }} (최대 +{{ fmt(t.hi) }}{{ t.unit }})
              </li>
            </ul>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full text-sm tabular-nums">
              <thead class="text-xs uppercase text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-900/40">
                <tr>
                  <th class="px-3 py-2 text-left">지표</th>
                  <th class="px-3 py-2 text-right">평균</th>
                  <th class="px-3 py-2 text-right">중앙값 (50%)</th>
                  <th class="px-3 py-2 text-right">상위 10% 운나쁨 (P90)</th>
                  <th class="px-3 py-2 text-right">상위 1% (P99)</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-t border-stone-200 dark:border-stone-700">
                  <td class="px-3 py-2 font-medium">시도 횟수</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(targetStats.mean.tries)) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p50.tries) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p90.tries) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p99.tries) }}</td>
                </tr>
                <tr class="border-t border-stone-200 dark:border-stone-700">
                  <td class="px-3 py-2 font-medium">플래티넘 망치</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(targetStats.mean.hammer)) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p50.hammer) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p90.hammer) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p99.hammer) }}개</td>
                </tr>
                <tr class="border-t border-stone-200 dark:border-stone-700">
                  <td class="px-3 py-2 font-medium">Ely 소모</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(targetStats.mean.ely)) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p50.ely) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p90.ely) }}</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p99.ely) }}</td>
                </tr>
                <tr class="border-t border-stone-200 dark:border-stone-700">
                  <td class="px-3 py-2 font-medium">파괴된 장비</td>
                  <td class="px-3 py-2 text-right">{{ fmt(Math.round(targetStats.mean.destroyed)) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p50.destroyed) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p90.destroyed) }}개</td>
                  <td class="px-3 py-2 text-right">{{ fmt(targetStats.p99.destroyed) }}개</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="text-xs text-stone-500 dark:text-stone-400">
            장비 1개가 모든 목표를 통과할 확률 {{ pctSmart(targetStats.cycleSuccessRate) }}
            → 평균 <strong>{{ fmt(Math.round(targetStats.meanCycles)) }}개</strong>째 장비에서 성공.
            평균값은 해석적 정확값이고, P50/P90/P99 는 {{ fmt(targetStats.runs) }}회 표본 기준입니다.
          </p>
        </div>

        <!-- 1번 실행 샘플 -->
        <div
          v-if="targetSampleRun?.completed"
          class="mt-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 ring-1 ring-emerald-300 dark:ring-emerald-700 p-3"
        >
          <div class="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
            🎉 1번 실행 샘플 — {{ fmt(targetSampleRun.tries) }}회차 ({{ fmt(targetSampleRun.hammerUsed) }}망치 / Ely {{ fmt(targetSampleRun.elyUsed) }} / {{ fmt(targetSampleRun.destroyed) }}장비 파괴)
          </div>
          <ul class="space-y-1 font-mono text-sm">
            <li
              v-for="(s, i) in targetSampleRun.finalSlots"
              :key="i"
              class="tabular-nums text-emerald-700 dark:text-emerald-300"
            >
              ▶ 슬롯 {{ i + 1 }}: {{ s.label }}
              <template v-if="normalSingleStage">
                <span class="font-bold">+{{ fmt(s.value) }}{{ s.unit }}</span>
              </template>
              <template v-else>
                Lv2 +{{ fmt(s.value) }}{{ s.unit }}
                <span class="text-stone-400">→</span>
                <span class="font-bold">{{ fullStageLabel }} +{{ fmt(fullConverted(s.optionKey, s.value)) }}{{ s.unit }}</span>
              </template>
              <span
                v-if="rollPct(s.optionKey, s.value) != null"
                :class="rollPctClass(rollPct(s.optionKey, s.value))"
              >
                [{{ rollPct(s.optionKey, s.value) }}%]
              </span>
            </li>
          </ul>
        </div>
      </section>
    </template>

    <!-- ============================================================ -->
    <!-- 모드 2: 특수장비 인챈트                                       -->
    <!-- ============================================================ -->
    <template v-else-if="mode === 'special'">
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">
            ✨ 특수장비 옵션 — {{ specialSlots.length }}/{{ SPECIAL_ENCHANT_MAX_SLOTS }}
          </h2>
          <div class="flex gap-2">
            <button
              type="button"
              @click="addSpecialSlot"
              :disabled="specialIsFull"
              class="text-xs rounded-md ring-1 ring-cyan-300 dark:ring-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 transition"
            >
              + 옵션 추가
            </button>
            <button
              type="button"
              @click="levelUpAllSpecialToMax"
              :disabled="specialSlots.length === 0"
              class="text-xs rounded-md ring-1 ring-amber-400 dark:ring-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 transition"
            >
              ⚡ 모두 Lv.5 강화
            </button>
            <button
              type="button"
              @click="resetSpecial"
              class="text-xs rounded-md ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-3 py-1.5 text-stone-700 dark:text-stone-200 transition"
            >
              초기화
            </button>
          </div>
        </div>

        <p
          v-if="specialSlots.length === 0"
          class="text-sm text-stone-500 dark:text-stone-400 text-center py-6"
        >
          상단 "+ 옵션 추가" 로 인챈트할 옵션을 골라주세요. (최대 {{ SPECIAL_ENCHANT_MAX_SLOTS }}개)
        </p>

        <div class="space-y-2">
          <div
            v-for="(slot, i) in specialSlots"
            :key="i"
            class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40 p-3"
          >
            <div class="flex items-start gap-3">
              <select
                :value="slot.optionKey"
                @change="(e) => changeSpecialSlotOption(i, e.target.value)"
                :disabled="slot.level > 0"
                class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 px-2.5 py-1.5 text-sm disabled:opacity-60"
              >
                <option v-for="k in specialOptionKeys" :key="k" :value="k">
                  {{ SPECIAL_ENCHANT_OPTIONS[k].label }}
                </option>
              </select>

              <div class="flex-1 grid grid-cols-5 gap-1">
                <div
                  v-for="lv in SPECIAL_ENCHANT_MAX_LEVEL"
                  :key="lv"
                  :class="[
                    'rounded text-center text-[11px] font-mono py-1',
                    lv <= slot.level
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-300 dark:ring-emerald-700 font-bold'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 ring-1 ring-stone-200 dark:ring-stone-700',
                  ]"
                >
                  Lv.{{ lv }}
                </div>
              </div>

              <button
                type="button"
                @click="levelUpSpecialSlot(i)"
                :disabled="slot.level >= SPECIAL_ENCHANT_MAX_LEVEL"
                class="rounded-md bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-semibold text-white transition whitespace-nowrap"
              >
                {{ slot.level >= SPECIAL_ENCHANT_MAX_LEVEL ? 'Max' : `Lv.${slot.level + 1} ↑` }}
              </button>

              <button
                type="button"
                @click="removeSpecialSlot(i)"
                class="rounded-md ring-1 ring-rose-300 dark:ring-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2.5 py-1.5 text-xs transition"
                title="슬롯 제거"
              >
                ✕
              </button>
            </div>

            <div class="mt-2 text-sm tabular-nums">
              <template v-if="slot.level > 0">
                <span class="text-stone-500 dark:text-stone-400">현재 Lv.{{ slot.level }}: </span>
                <span class="font-bold text-emerald-700 dark:text-emerald-300">+{{ fmt(slot.value) }}{{ slot.unit }}</span>
                <span v-if="slot.level < SPECIAL_ENCHANT_MAX_LEVEL" class="ml-3 text-xs text-stone-500 dark:text-stone-400">
                  다음 Lv.{{ slot.level + 1 }}: +{{ fmt(SPECIAL_ENCHANT_OPTIONS[slot.optionKey].levels[slot.level].lo) }} ~
                  +{{ fmt(SPECIAL_ENCHANT_OPTIONS[slot.optionKey].levels[slot.level].hi) }}{{ slot.unit }}
                  (재료 {{ fmt(SPECIAL_ENCHANT_COSTS[slot.level].material) }} · Ely {{ fmt(SPECIAL_ENCHANT_COSTS[slot.level].ely) }})
                </span>
              </template>
              <template v-else>
                <span class="text-xs text-stone-500 dark:text-stone-400">
                  Lv.1 강화 시: +{{ fmt(SPECIAL_ENCHANT_OPTIONS[slot.optionKey].levels[0].lo) }} ~
                  +{{ fmt(SPECIAL_ENCHANT_OPTIONS[slot.optionKey].levels[0].hi) }}{{ SPECIAL_ENCHANT_OPTIONS[slot.optionKey].unit }}
                  (재료 {{ fmt(SPECIAL_ENCHANT_COSTS[0].material) }} · Ely {{ fmt(SPECIAL_ENCHANT_COSTS[0].ely) }})
                </span>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- 누적 비용 -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-3">💰 누적 비용</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-lg bg-cyan-50 dark:bg-cyan-950/40 ring-1 ring-cyan-200 dark:ring-cyan-800 p-3">
            <div class="text-xs text-cyan-600 dark:text-cyan-300">총 인챈트 시도</div>
            <div class="text-2xl font-extrabold text-cyan-700 dark:text-cyan-200 tabular-nums">
              {{ fmt(specialCounters.tries) }}회
            </div>
          </div>
          <div class="rounded-lg bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-200 dark:ring-amber-800 p-3">
            <div class="text-xs text-amber-600 dark:text-amber-300">총 재료 소모</div>
            <div class="text-2xl font-extrabold text-amber-700 dark:text-amber-200 tabular-nums">
              {{ fmt(specialCounters.totalMaterial) }}개
            </div>
          </div>
          <div class="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-800 p-3">
            <div class="text-xs text-emerald-600 dark:text-emerald-300">총 Ely 소모</div>
            <div class="text-2xl font-extrabold text-emerald-700 dark:text-emerald-200 tabular-nums">
              {{ fmt(specialCounters.totalEly) }}
            </div>
          </div>
        </div>
      </section>

      <!-- 시도 로그 -->
      <section
        v-if="specialLog.length > 0"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-3">📜 최근 강화 로그</h2>
        <ul class="space-y-1 font-mono text-xs max-h-64 overflow-y-auto">
          <li
            v-for="(e, i) in specialLog"
            :key="i"
            class="tabular-nums rounded px-2 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200"
          >
            ✓ [슬롯 {{ e.slotIdx + 1 }}] {{ e.label }} → Lv.{{ e.level }} (+{{ fmt(e.value) }}{{ e.unit }}) — 재료 {{ fmt(e.cost.material) }} · Ely {{ fmt(e.cost.ely) }}
          </li>
        </ul>
      </section>
    </template>

    <!-- ============================================================ -->
    <!-- 모드 3: 인챈트 수치 조회 (시뮬 아닌 환산기)                 -->
    <!-- ============================================================ -->
    <template v-else-if="mode === 'lookup'">
      <!-- 입력 -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-1">🔍 인챈트 수치 조회</h2>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
          <template v-if="lookupSingleStage">
            게임에서 얻은 옵션 값을 입력하면 최대치 대비 등급%를 보여줍니다.
            ({{ lookupPartKey }}는 노강/풀강 구분이 없어 환산이 필요 없습니다.)
          </template>
          <template v-else>
            게임에서 얻은 옵션 값을 입력하면 노강(Lv2) ↔ 풀강(Lv{{ lookupFullLevel }}) 양쪽 환산값과 등급%를 보여줍니다.
            입력 단계를 노강/풀강 중 골라서 역환산 가능.
          </template>
        </p>

        <!-- 카테고리 -->
        <div class="mb-3">
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">카테고리</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="cat in catKeysList"
              :key="cat"
              type="button"
              @click="lookupCatKey = cat"
              :class="[
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                lookupCatKey === cat
                  ? 'bg-cyan-600 text-white'
                  : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              {{ cat }}
            </button>
          </div>
        </div>

        <!-- 부위 -->
        <div class="mb-3">
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">부위</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in lookupPartList"
              :key="p"
              type="button"
              @click="lookupPartKey = p"
              :class="[
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                lookupPartKey === p
                  ? 'bg-emerald-600 text-white'
                  : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              {{ p }}
            </button>
          </div>
        </div>

        <!-- 입력 단계 토글 — 단일 단계 부위(캔서 배찌)는 숨김 -->
        <div v-if="!lookupSingleStage" class="mb-4">
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">입력 단계 (어느 단계의 값인지)</span>
          <div class="flex gap-2">
            <button
              type="button"
              @click="lookupStage = 'base'"
              :class="[
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
                lookupStage === 'base'
                  ? 'bg-amber-500 text-white'
                  : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              노강 (Lv2)
            </button>
            <button
              type="button"
              @click="lookupStage = 'full'"
              :class="[
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
                lookupStage === 'full'
                  ? 'bg-emerald-600 text-white'
                  : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              풀강 (Lv{{ lookupFullLevel }})
            </button>
          </div>
        </div>

        <!-- 5행 입력 -->
        <div class="space-y-2 mb-4">
          <div
            v-for="(row, i) in lookupRows"
            :key="i"
            class="grid grid-cols-[1fr_140px] gap-2 items-center"
          >
            <select
              v-model="row.optionKey"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option value="">옵션 선택</option>
              <option v-for="opt in lookupPart?.options ?? []" :key="opt.key" :value="opt.key">
                {{ opt.label }}
              </option>
            </select>
            <input
              v-model="row.value"
              type="number"
              step="any"
              placeholder="수치"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="computeLookup"
            class="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            🔍 수치조회
          </button>
          <button
            type="button"
            @click="resetLookup"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-200 transition"
          >
            초기화
          </button>
        </div>
      </section>

      <!-- 결과: 두 패널 -->
      <div v-if="lookupResult" :class="lookupSingleStage ? '' : 'grid grid-cols-1 md:grid-cols-2 gap-4'">
        <!-- Lv2 패널 (단일 단계 부위는 이 패널 하나만) -->
        <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-amber-300 dark:ring-amber-700 p-5">
          <h3 class="text-base font-bold text-amber-700 dark:text-amber-300 mb-3">
            <template v-if="!lookupSingleStage">Lv{{ lookupResult.base.level }} </template>{{ lookupResult.partName }}
          </h3>
          <div class="space-y-3">
            <div v-for="(r, i) in lookupResult.base.rows" :key="i">
              <div class="flex items-center justify-between text-sm tabular-nums mb-1">
                <span class="text-stone-700 dark:text-stone-200 truncate">
                  <template v-if="!lookupSingleStage">Lv{{ lookupResult.base.level }} </template>{{ r.label }} +{{ fmt(r.value) }}{{ r.unit }}
                </span>
                <span :class="['text-xs font-bold whitespace-nowrap', rollPctClass(r.grade)]">
                  {{ r.grade }}%
                </span>
              </div>
              <div class="h-1.5 rounded bg-stone-200 dark:bg-stone-700 overflow-hidden">
                <div :class="['h-full', gradeBarColor(r.grade)]" :style="{ width: Math.min(r.grade, 100) + '%' }"></div>
              </div>
            </div>
          </div>
          <div class="mt-4 pt-3 border-t border-amber-200 dark:border-amber-800 text-center text-sm font-bold text-amber-700 dark:text-amber-300">
            《 {{ lookupResult.base.avg }}% 급 》 장비
          </div>
        </section>

        <!-- Lv풀강 패널 — 단일 단계 부위(캔서 배찌)는 환산 대상이 없어 숨김 -->
        <section
          v-if="!lookupSingleStage"
          class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-emerald-300 dark:ring-emerald-700 p-5"
        >
          <h3 class="text-base font-bold text-emerald-700 dark:text-emerald-300 mb-3">
            [풀강] ★★★ Lv{{ lookupResult.full.level }} {{ lookupResult.partName }}
          </h3>
          <div class="space-y-3">
            <div v-for="(r, i) in lookupResult.full.rows" :key="i">
              <div class="flex items-center justify-between text-sm tabular-nums mb-1">
                <span class="text-stone-700 dark:text-stone-200 truncate">
                  Lv{{ lookupResult.full.level }} {{ r.label }} +{{ fmt(r.value) }}{{ r.unit }}
                </span>
                <span :class="['text-xs font-bold whitespace-nowrap', rollPctClass(r.grade)]">
                  {{ r.grade }}%
                </span>
              </div>
              <div class="h-1.5 rounded bg-stone-200 dark:bg-stone-700 overflow-hidden">
                <div :class="['h-full', gradeBarColor(r.grade)]" :style="{ width: Math.min(r.grade, 100) + '%' }"></div>
              </div>
            </div>
          </div>
          <div class="mt-4 pt-3 border-t border-emerald-200 dark:border-emerald-800 text-center text-sm font-bold text-emerald-700 dark:text-emerald-300">
            《 {{ lookupResult.full.avg }}% 급 》 장비
          </div>
        </section>
      </div>
    </template>

    <p class="text-center text-[11px] text-stone-400 dark:text-stone-500 pt-2">
      자료 출처 ·
      <a
        href="https://lataleinfo.tistory.com"
        target="_blank"
        rel="noopener noreferrer"
        class="underline decoration-dotted hover:text-cyan-500 dark:hover:text-cyan-400"
      >라테일인포 (lataleinfo.tistory.com)</a>
    </p>
  </div>
</template>
