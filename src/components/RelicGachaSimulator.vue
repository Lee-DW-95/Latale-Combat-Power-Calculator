<script setup>
import { computed, ref } from 'vue';
import {
  SHARED_OPTION_LABELS,
  SHARED_OPTIONS,
  sharedHasPercentUnit,
  EXCLUSIVE_STONE_NAMES,
  EXCLUSIVE_STONES,
  EXCLUSIVE_LEVEL_PROBS,
} from '../data/relicGachaData.js';
import {
  computeStatisticsShared,
  simulateUntilTargetShared,
  rollOnceShared,
  computeStatisticsExclusive,
  simulateUntilTargetExclusive,
  rollOnceExclusive,
  exclusiveOptionUnit,
  exclusiveMaxValue,
  COST_SHARED,
  COST_EXCLUSIVE,
} from '../utils/relicGachaSim.js';
import { fmtInf as fmt, pctSmart } from '../utils/format.js';

// ============================================================
// 서브 탭
// ============================================================
const subTab = ref('shared');
const SUB_TABS = [
  { id: 'shared', label: '🪨 신성의 돌 (공용석)' },
  { id: 'exclusive', label: '🔮 전용석' },
];

// ============================================================
// 공용석 (신성의 돌) 상태
// ============================================================
const MAX_TARGETS = 4;

const sharedTargets = ref([{ type: SHARED_OPTION_LABELS[0], value: '' }]);
const sharedResult = ref(null);
const sharedSampleCard = ref(null);
const sharedSampleRoll = ref(null);
const sharedRunning = ref(false);
const sharedRollCount = ref(0);
const sharedLastRollIndex = ref(0);

const sharedValidTargets = computed(() =>
  sharedTargets.value
    .filter((t) => t.type && Number(t.value) > 0)
    .map((t) => ({ type: t.type, value: Number(t.value) }))
);

// 옵션별 단일 카드 최대값 (5레벨 max 중 max)
function sharedMaxValue(type) {
  const opt = SHARED_OPTIONS.find((o) => o.type === type);
  if (!opt) return 0;
  return Math.max(...opt.tiers.map((t) => t.max));
}

const sharedFeasibilities = computed(() =>
  sharedTargets.value.map((t) => {
    if (!t.type || !t.value) return { feasible: null, max: null };
    const v = Number(t.value);
    if (!Number.isFinite(v) || v <= 0) return { feasible: null, max: null };
    const max = sharedMaxValue(t.type);
    return { feasible: v <= max, max };
  })
);

const sharedAllFeasible = computed(() =>
  sharedFeasibilities.value.every((f) => f.feasible !== false)
);

function sharedAddTarget() {
  if (sharedTargets.value.length >= MAX_TARGETS) return;
  const used = new Set(sharedTargets.value.map((t) => t.type));
  const next = SHARED_OPTION_LABELS.find((l) => !used.has(l)) ?? SHARED_OPTION_LABELS[0];
  sharedTargets.value.push({ type: next, value: '' });
}

function sharedRemoveTarget(idx) {
  if (sharedTargets.value.length <= 1) return;
  sharedTargets.value.splice(idx, 1);
}

function sharedDisabledOption(label, rowIdx) {
  for (let i = 0; i < sharedTargets.value.length; i++) {
    if (i === rowIdx) continue;
    if (sharedTargets.value[i].type === label) return true;
  }
  return false;
}

async function sharedRun() {
  const ts = sharedValidTargets.value;
  if (ts.length === 0 || !sharedAllFeasible.value) return;
  sharedRunning.value = true;
  await new Promise((r) => setTimeout(r, 30));
  try {
    sharedResult.value = { targets: ts, ...computeStatisticsShared(ts) };
    sharedSampleCard.value = simulateUntilTargetShared(ts);
  } finally {
    sharedRunning.value = false;
  }
}

function sharedRollSample() {
  sharedSampleRoll.value = rollOnceShared();
  sharedRollCount.value += 1;
  sharedLastRollIndex.value = sharedRollCount.value;
}

function sharedResetRollCount() {
  sharedRollCount.value = 0;
  sharedLastRollIndex.value = 0;
  sharedSampleRoll.value = null;
}

const sharedMeanCost = computed(() => {
  if (!sharedResult.value || !Number.isFinite(sharedResult.value.mean)) return null;
  return {
    shard: Math.round(sharedResult.value.mean * COST_SHARED.shard),
    ely: Math.round(sharedResult.value.mean * COST_SHARED.ely),
  };
});

// ============================================================
// 전용석 상태
//   목표 = "추가 옵션 수치 ≥ N" (메인 Lv 가 아닌 실제 옵션 값 기반)
//   stone 마다 옵션 키와 단위가 다르고 최대값도 다름.
// ============================================================
const exStone = ref(EXCLUSIVE_STONE_NAMES[0]);
const exTargetValue = ref('');
const exResult = ref(null);
const exSampleCard = ref(null);
const exSampleRoll = ref(null);
const exRunning = ref(false);
const exRollCount = ref(0);
const exLastRollIndex = ref(0);

const exStoneSpec = computed(() => EXCLUSIVE_STONES[exStone.value]);
const exUnit = computed(() => exclusiveOptionUnit(exStone.value));
const exMaxVal = computed(() => exclusiveMaxValue(exStone.value));

const exTargetValueNum = computed(() => Number(exTargetValue.value));
const exFeasible = computed(() => {
  const v = exTargetValueNum.value;
  if (!Number.isFinite(v) || v <= 0) return null;
  return v <= exMaxVal.value;
});

// stone 변경 시 결과 초기화 (이전 stone 결과가 잘못 보이지 않게)
function onExStoneChange() {
  exResult.value = null;
  exSampleCard.value = null;
  exSampleRoll.value = null;
  exRollCount.value = 0;
  exLastRollIndex.value = 0;
}

async function exRun() {
  const v = exTargetValueNum.value;
  if (!Number.isFinite(v) || v <= 0) return;
  if (v > exMaxVal.value) return;
  exRunning.value = true;
  await new Promise((r) => setTimeout(r, 30));
  try {
    exResult.value = {
      stone: exStone.value,
      key: exStoneSpec.value.key,
      unit: exUnit.value,
      targetValue: v,
      ...computeStatisticsExclusive(exStone.value, v),
    };
    exSampleCard.value = simulateUntilTargetExclusive(exStone.value, v);
  } finally {
    exRunning.value = false;
  }
}

function exRollSample() {
  exSampleRoll.value = rollOnceExclusive(exStone.value);
  exRollCount.value += 1;
  exLastRollIndex.value = exRollCount.value;
}

function exResetRollCount() {
  exRollCount.value = 0;
  exLastRollIndex.value = 0;
  exSampleRoll.value = null;
}

// ============================================================
// 공통 — 라인 등급% (line.value / line.hi × 100, Math.floor)
//   ≥90 빨강, ≥70 노랑, 외 회색 (인챈트 시뮬 규칙)
// ============================================================
function linePct(line) {
  if (!line || line.value == null || !line.hi) return null;
  const p = (Number(line.value) / Number(line.hi)) * 100;
  if (!Number.isFinite(p)) return null;
  return Math.floor(p);
}

function pctBadgeClass(p) {
  if (p == null) return 'text-stone-400 dark:text-stone-500';
  if (p >= 90) return 'text-rose-400 font-bold';
  if (p >= 70) return 'text-amber-300 font-bold';
  return 'text-stone-400 dark:text-stone-500';
}

const exMeanCost = computed(() => {
  if (!exResult.value || !Number.isFinite(exResult.value.mean)) return null;
  return {
    shard: Math.round(exResult.value.mean * COST_EXCLUSIVE.shard),
    ely: Math.round(exResult.value.mean * COST_EXCLUSIVE.ely),
  };
});

// ============================================================
// 표시 헬퍼
// ============================================================
function fmtVal(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return v.toLocaleString('ko-KR');
  return v.toFixed(1).replace(/\.0$/, '');
}

function fmtEly(n) {
  return Math.round(n).toLocaleString('ko-KR');
}
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div
      class="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 py-3 text-sm text-cyan-800 dark:text-cyan-200"
    >
      <strong>🌟 성물 뽑기 시뮬레이터</strong> · 원하는 성물 옵션이 나올 때까지 평균 몇 회 뽑아야 하는지 분석합니다.
      <br />
    </div>

    <!-- 서브 탭 -->
    <div class="flex gap-1 border-b border-stone-200 dark:border-stone-700">
      <button
        v-for="tab in SUB_TABS"
        :key="tab.id"
        type="button"
        @click="subTab = tab.id"
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap',
          subTab === tab.id
            ? 'border-cyan-500 text-cyan-700 dark:text-cyan-300'
            : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200',
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ════════════════════ 신성의 돌 (공용석) ════════════════════ -->
    <template v-if="subTab === 'shared'">
      <!-- 입력 -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">⚙️ 시뮬 조건</h2>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
          1회당 신비한 파편 50개 + 엘리 30,000,000 소비 · 옵션 15종 (1~4줄, 35/30/20/15) · 5레벨 균등.
        </p>

        <div class="mb-2 flex items-center justify-between">
          <span class="block text-sm font-medium text-stone-700 dark:text-stone-300">
            목표 옵션 (최대 {{ MAX_TARGETS }}개 — 한 카드 동시 만족)
          </span>
          <button
            type="button"
            @click="sharedAddTarget"
            :disabled="sharedTargets.length >= MAX_TARGETS"
            class="text-xs rounded-md ring-1 ring-cyan-300 dark:ring-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 transition"
          >
            + 옵션 추가
          </button>
        </div>

        <div class="space-y-2 mb-4">
          <div
            v-for="(t, i) in sharedTargets"
            :key="i"
            class="grid grid-cols-[1fr_140px_auto] gap-2 items-start"
          >
            <select
              v-model="t.type"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option
                v-for="lbl in SHARED_OPTION_LABELS"
                :key="lbl"
                :value="lbl"
                :disabled="sharedDisabledOption(lbl, i)"
              >
                {{ lbl }}{{ sharedDisabledOption(lbl, i) ? ' (선택됨)' : '' }}
              </option>
            </select>
            <div>
              <input
                v-model="t.value"
                type="number"
                step="any"
                placeholder="목표 ≥"
                class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
              <span
                v-if="sharedFeasibilities[i]?.feasible === false"
                class="block mt-1 text-xs text-rose-600 dark:text-rose-400"
              >
                ⚠ 단일 카드 최대 {{ sharedFeasibilities[i].max }} 초과
              </span>
              <span
                v-else-if="sharedFeasibilities[i]?.max != null"
                class="block mt-1 text-xs text-stone-400"
              >
                최대 {{ sharedFeasibilities[i].max }}{{ sharedHasPercentUnit(t.type) ? '%' : '' }}
              </span>
            </div>
            <button
              type="button"
              @click="sharedRemoveTarget(i)"
              :disabled="sharedTargets.length <= 1"
              class="rounded-md ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 text-xs transition"
              title="이 옵션 제거"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="sharedRun"
            :disabled="sharedRunning || sharedValidTargets.length === 0 || !sharedAllFeasible"
            class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            {{ sharedRunning ? '⏳ 시뮬 중...' : '🎲 목표 도달 시뮬' }}
          </button>
          <button
            type="button"
            @click="sharedRollSample"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-200 transition"
          >
            🎰 1회 굴려보기<span v-if="sharedRollCount > 0" class="ml-1 text-xs text-stone-500 dark:text-stone-400">(누적 {{ fmt(sharedRollCount) }}회)</span>
          </button>
          <button
            v-if="sharedRollCount > 0"
            type="button"
            @click="sharedResetRollCount"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400 transition"
            title="누적 횟수 초기화"
          >
            ↺ 초기화
          </button>
        </div>
      </section>

      <!-- 1회 굴림 미리보기 -->
      <section
        v-if="sharedSampleRoll"
        class="rounded-2xl bg-stone-900 ring-1 ring-stone-700 p-5 shadow-lg"
      >
        <h2 class="text-base font-bold text-stone-200 mb-3 flex items-center justify-between gap-3">
          <span>
            🎰 1회 굴림 결과
            <span class="text-xs text-emerald-300 font-semibold ml-1">#{{ fmt(sharedLastRollIndex) }}회차</span>
          </span>
          <span class="text-xs text-stone-400 font-normal">{{ sharedSampleRoll.lineCount }}줄 · 누적 {{ fmt(sharedRollCount) }}회</span>
        </h2>
        <ul class="space-y-1.5 font-mono text-sm">
          <li
            v-for="(line, i) in sharedSampleRoll.lines"
            :key="i"
            class="tabular-nums font-bold text-amber-300 flex items-center justify-between gap-3"
          >
            <span>▶ Lv{{ line.level }} {{ line.type }} +{{ fmtVal(line.value) }}{{ line.unit }}</span>
            <span
              v-if="linePct(line) != null"
              :class="['text-xs whitespace-nowrap tabular-nums', pctBadgeClass(linePct(line))]"
              :title="`Lv${line.level} 최대 ${fmtVal(line.hi)}${line.unit} 대비`"
            >
              [{{ linePct(line) }}%]
            </span>
          </li>
        </ul>
      </section>

      <!-- 시뮬 조건 요약 -->
      <section
        v-if="sharedResult"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">
          🎯 시뮬 조건 요약
        </h2>
        <ul class="space-y-0.5 mb-2">
          <li
            v-for="(t, i) in sharedResult.targets"
            :key="i"
            class="text-sm text-cyan-600 dark:text-cyan-400 font-medium"
          >
            ▸ {{ t.type }} ≥ {{ t.value }}{{ sharedHasPercentUnit(t.type) ? '%' : '' }}
          </li>
        </ul>
        <p class="text-xs text-stone-500 dark:text-stone-400">
          평균 <strong class="text-stone-700 dark:text-stone-200">{{ fmt(sharedResult.mean) }}회</strong> 시도 예상
          <span v-if="sharedMeanCost">
            (평균 파편 <strong class="text-amber-700 dark:text-amber-300">{{ fmt(sharedMeanCost.shard) }}</strong>개,
            엘리 <strong class="text-rose-700 dark:text-rose-300">{{ fmtEly(sharedMeanCost.ely) }}</strong>)
          </span>
          · 단일 카드 성공률 {{ pctSmart(sharedResult.successRate) }}
        </p>
      </section>

      <!-- 1번 실행의 성공 카드 -->
      <section
        v-if="sharedSampleCard"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <div v-if="sharedSampleCard.success" class="space-y-3">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-stone-200 dark:border-stone-700 pb-3">
            <span class="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
              🎉 {{ fmt(sharedSampleCard.tries) }}회차에 성공
            </span>
            <span class="text-sm text-stone-600 dark:text-stone-300 tabular-nums">
              <span class="text-amber-700 dark:text-amber-300 font-semibold">
                파편 {{ fmt(sharedSampleCard.tries * COST_SHARED.shard) }}개
              </span>
              ·
              <span class="text-rose-700 dark:text-rose-300 font-semibold">
                엘리 {{ fmtEly(sharedSampleCard.tries * COST_SHARED.ely) }}
              </span>
            </span>
          </div>
          <p class="text-xs text-stone-500 dark:text-stone-400">
            이번 시뮬 1회 실행 결과 — 같은 조건이라도 매번 회차가 다릅니다 (위 버튼 다시 누르면 재실행).
          </p>
          <div class="rounded-lg bg-stone-900 ring-1 ring-emerald-500 p-3">
            <ul class="space-y-1 font-mono text-sm mb-3">
              <li
                v-for="(line, i) in sharedSampleCard.card.lines"
                :key="i"
                class="tabular-nums flex items-center justify-between gap-3"
              >
                <span
                  :class="line.isTarget ? 'text-emerald-300 font-bold' : 'text-amber-300'"
                >
                  ▶ Lv{{ line.level }} {{ line.type }} +{{ fmtVal(line.value) }}{{ line.unit }}
                  <span v-if="line.isTarget" class="text-[10px]">★</span>
                </span>
                <span
                  v-if="linePct(line) != null"
                  :class="['text-xs whitespace-nowrap tabular-nums', pctBadgeClass(linePct(line))]"
                  :title="`Lv${line.level} 최대 ${fmtVal(line.hi)}${line.unit} 대비`"
                >
                  [{{ linePct(line) }}%]
                </span>
              </li>
            </ul>
            <div class="text-xs space-y-0.5 border-t border-emerald-700/50 pt-2 text-emerald-300">
              <div
                v-for="(t, i) in sharedResult?.targets ?? []"
                :key="i"
                class="font-medium"
              >
                ✓ <strong>{{ t.type }}</strong> ≥ {{ t.value }}{{ sharedHasPercentUnit(t.type) ? '%' : '' }}
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-rose-600 dark:text-rose-400">
          ⚠ 도달 불가 (목표가 단일 카드 한도 초과).
        </div>
      </section>
    </template>

    <!-- ════════════════════ 전용석 ════════════════════ -->
    <template v-if="subTab === 'exclusive'">
      <!-- 입력 -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">⚙️ 시뮬 조건</h2>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
          1회당 신비한 파편 150개 + 엘리 50,000,000 소비 · 메인 Lv 1~10 가중 추첨 (Lv1 18% → Lv10 2.5%) · 등급에 따라 추가 옵션 Lv1~5 1개.
          <br />
          목표는 <strong>추가 옵션 수치</strong>로 입력합니다 (예: 구름 방망이 크리댐 ≥ 30%).
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label class="block">
            <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">전용석</span>
            <select
              v-model="exStone"
              @change="onExStoneChange"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option v-for="name in EXCLUSIVE_STONE_NAMES" :key="name" :value="name">
                {{ name }} — {{ EXCLUSIVE_STONES[name].key }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              목표 {{ exStoneSpec?.key }} (≥){{ exUnit ? ' ' + exUnit : '' }}
            </span>
            <input
              v-model="exTargetValue"
              type="number"
              step="any"
              :placeholder="`최대 ${exMaxVal}${exUnit}`"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
            <span
              v-if="exFeasible === false"
              class="block mt-1 text-xs text-rose-600 dark:text-rose-400"
            >
              ⚠ 단일 시도 최대 {{ exMaxVal }}{{ exUnit }} 초과
            </span>
            <span
              v-else-if="exMaxVal > 0"
              class="block mt-1 text-xs text-stone-400"
            >
              최대 가능: {{ exMaxVal }}{{ exUnit }}
            </span>
          </label>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="exRun"
            :disabled="exRunning || !exTargetValueNum || exFeasible === false"
            class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            {{ exRunning ? '⏳ 시뮬 중...' : '🎲 목표 도달 시뮬' }}
          </button>
          <button
            type="button"
            @click="exRollSample"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-200 transition"
          >
            🎰 1회 굴려보기<span v-if="exRollCount > 0" class="ml-1 text-xs text-stone-500 dark:text-stone-400">(누적 {{ fmt(exRollCount) }}회)</span>
          </button>
          <button
            v-if="exRollCount > 0"
            type="button"
            @click="exResetRollCount"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400 transition"
            title="누적 횟수 초기화"
          >
            ↺ 초기화
          </button>
        </div>
      </section>

      <!-- 레벨 분포 표시 (참고용) -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h3 class="text-sm font-bold text-stone-700 dark:text-stone-200 mb-2">📊 메인 Lv 등장 확률 (참고)</h3>
        <div class="grid grid-cols-5 sm:grid-cols-10 gap-1 text-center text-xs">
          <div
            v-for="lp in EXCLUSIVE_LEVEL_PROBS"
            :key="lp.level"
            class="rounded-md py-1.5 ring-1 tabular-nums ring-stone-200 dark:ring-stone-700 text-stone-500 dark:text-stone-400"
          >
            <div class="font-semibold">Lv{{ lp.level }}</div>
            <div>{{ (lp.p * 100).toFixed(1) }}%</div>
          </div>
        </div>
        <p class="text-xs text-stone-400 mt-2">
          메인 Lv가 높을수록 추가 옵션 풀이 넓어집니다 (Lv2~3: Lv1만, Lv4~5: Lv1~2, ..., Lv10: Lv1~5).
          높은 옵션 수치는 상위 추가 옵션 Lv 풀에서 나옵니다.
        </p>
      </section>

      <!-- 1회 굴림 미리보기 -->
      <section
        v-if="exSampleRoll"
        class="rounded-2xl bg-stone-900 ring-1 ring-stone-700 p-5 shadow-lg"
      >
        <h2 class="text-base font-bold text-stone-200 mb-3 flex items-center justify-between gap-3">
          <span>
            🎰 1회 굴림 결과 — {{ exSampleRoll.stone }}
            <span class="text-xs text-emerald-300 font-semibold ml-1">#{{ fmt(exLastRollIndex) }}회차</span>
          </span>
          <span class="text-xs text-stone-400 font-normal">누적 {{ fmt(exRollCount) }}회</span>
        </h2>
        <div class="space-y-1.5 font-mono text-sm">
          <div class="text-amber-300 font-bold tabular-nums">
            ▶ [Lv.{{ exSampleRoll.level }}] {{ exSampleRoll.stone }}
          </div>
          <div
            v-if="exSampleRoll.extra"
            class="text-sky-400 tabular-nums flex items-center justify-between gap-3"
          >
            <span>
              ▶ Lv{{ exSampleRoll.extra.level }} {{ exSampleRoll.extra.key }}
              +{{ fmtVal(exSampleRoll.extra.value) }}{{ exSampleRoll.extra.unit }}
            </span>
            <span
              v-if="linePct(exSampleRoll.extra) != null"
              :class="['text-xs whitespace-nowrap tabular-nums', pctBadgeClass(linePct(exSampleRoll.extra))]"
              :title="`Lv${exSampleRoll.extra.level} 최대 ${fmtVal(exSampleRoll.extra.hi)}${exSampleRoll.extra.unit} 대비`"
            >
              [{{ linePct(exSampleRoll.extra) }}%]
            </span>
          </div>
          <div v-else class="text-stone-500">▶ 추가 옵션 없음</div>
        </div>
      </section>

      <!-- 시뮬 조건 요약 -->
      <section
        v-if="exResult"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">
          🎯 시뮬 조건 요약
        </h2>
        <p class="text-sm text-cyan-600 dark:text-cyan-400 font-medium mb-2">
          ▸ {{ exResult.stone }} — {{ exResult.key }} ≥ {{ exResult.targetValue }}{{ exResult.unit }}
        </p>
        <p class="text-xs text-stone-500 dark:text-stone-400">
          평균 <strong class="text-stone-700 dark:text-stone-200">{{ fmt(exResult.mean) }}회</strong> 시도 예상
          <span v-if="exMeanCost">
            (평균 파편 <strong class="text-amber-700 dark:text-amber-300">{{ fmt(exMeanCost.shard) }}</strong>개,
            엘리 <strong class="text-rose-700 dark:text-rose-300">{{ fmtEly(exMeanCost.ely) }}</strong>)
          </span>
          · 단일 시도 성공률 {{ pctSmart(exResult.successRate) }}
        </p>
      </section>

      <!-- 1번 실행의 성공 카드 -->
      <section
        v-if="exSampleCard"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <div v-if="exSampleCard.success" class="space-y-3">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-stone-200 dark:border-stone-700 pb-3">
            <span class="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
              🎉 {{ fmt(exSampleCard.tries) }}회차에 성공
            </span>
            <span class="text-sm text-stone-600 dark:text-stone-300 tabular-nums">
              <span class="text-amber-700 dark:text-amber-300 font-semibold">
                파편 {{ fmt(exSampleCard.tries * COST_EXCLUSIVE.shard) }}개
              </span>
              ·
              <span class="text-rose-700 dark:text-rose-300 font-semibold">
                엘리 {{ fmtEly(exSampleCard.tries * COST_EXCLUSIVE.ely) }}
              </span>
            </span>
          </div>
          <p class="text-xs text-stone-500 dark:text-stone-400">
            이번 시뮬 1회 실행 결과 — 같은 조건이라도 매번 회차가 다릅니다.
          </p>
          <div class="rounded-lg bg-stone-900 ring-1 ring-emerald-500 p-3">
            <div class="font-mono text-sm space-y-1">
              <div class="text-amber-300 font-bold tabular-nums">
                ▶ [Lv.{{ exSampleCard.card.level }}] {{ exSampleCard.card.stone }}
              </div>
              <div
                v-if="exSampleCard.card.extra"
                class="text-emerald-300 font-bold tabular-nums flex items-center justify-between gap-3"
              >
                <span>
                  ▶ Lv{{ exSampleCard.card.extra.level }} {{ exSampleCard.card.extra.key }}
                  +{{ fmtVal(exSampleCard.card.extra.value) }}{{ exSampleCard.card.extra.unit }} ★
                </span>
                <span
                  v-if="linePct(exSampleCard.card.extra) != null"
                  :class="['text-xs whitespace-nowrap tabular-nums', pctBadgeClass(linePct(exSampleCard.card.extra))]"
                  :title="`Lv${exSampleCard.card.extra.level} 최대 ${fmtVal(exSampleCard.card.extra.hi)}${exSampleCard.card.extra.unit} 대비`"
                >
                  [{{ linePct(exSampleCard.card.extra) }}%]
                </span>
              </div>
            </div>
            <div class="text-xs border-t border-emerald-700/50 pt-2 mt-2 text-emerald-300 font-medium">
              ✓ <strong>{{ exResult?.key }}</strong> ≥ {{ exResult?.targetValue }}{{ exResult?.unit }}
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-rose-600 dark:text-rose-400">
          ⚠ 목표 수치가 단일 시도 한도를 초과합니다.
        </div>
      </section>
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
