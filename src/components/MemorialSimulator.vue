<script setup>
import { computed, ref } from 'vue';
import {
  ALL_MEMORIALS,
  uniqueBaseLabels,
  lineContributesTo,
} from '../data/memorialProbabilities.js';
import {
  computeStatistics,
  formatResult,
  rollOnce,
  simulateUntilSingleCardReaches,
  maxPossibleSingleCard,
} from '../utils/memorialSim.js';
import { fmtInf as fmt, pctSmart } from '../utils/format.js';

const MAX_TARGETS = 4;

const memorialKeys = Object.keys(ALL_MEMORIALS);
const selectedMemorialKey = ref('CHOENPAM_SET');
const targets = ref([{ base: '', value: '' }]);

const isRunning = ref(false);
const result = ref(null);

const sampleRoll = ref(null);
const sampleWinningCard = ref(null); // 시뮬에서 성공한 카드 정보

const selectedMemorial = computed(() => ALL_MEMORIALS[selectedMemorialKey.value]);

const availableLabels = computed(() =>
  selectedMemorial.value ? uniqueBaseLabels(selectedMemorial.value) : []
);

function onMemorialChange() {
  const labels = availableLabels.value;
  for (const t of targets.value) {
    if (!labels.includes(t.base)) t.base = labels[0] || '';
  }
  result.value = null;
  sampleRoll.value = null;
  sampleWinningCard.value = null;
}

if (availableLabels.value.length > 0 && !targets.value[0].base) {
  targets.value[0].base = availableLabels.value[0];
}

function addTarget() {
  if (targets.value.length >= MAX_TARGETS) return;
  targets.value.push({
    base: availableLabels.value[0] || '',
    value: '',
  });
}

function removeTarget(idx) {
  if (targets.value.length <= 1) return;
  targets.value.splice(idx, 1);
}

// 유효 목표만 추출 (옵션 선택 + 양수 값)
const validTargets = computed(() =>
  targets.value
    .filter((t) => t.base && Number(t.value) > 0)
    .map((t) => ({ base: t.base, value: Number(t.value) }))
);

// 각 목표 행별 단독 가능성 (maxSingleCard 초과 여부)
const targetFeasibilities = computed(() => {
  const m = selectedMemorial.value;
  if (!m) return [];
  return targets.value.map((t) => {
    if (!t.base || !t.value) return { feasible: null, max: null };
    const v = Number(t.value);
    if (!Number.isFinite(v) || v <= 0) return { feasible: null, max: null };
    const max = maxPossibleSingleCard(m, t.base);
    return { feasible: v <= max, max };
  });
});

const allTargetsFeasible = computed(() =>
  targetFeasibilities.value.every((f) => f.feasible !== false)
);

// 목표 옵션 베이스 집합 (활성 줄 하이라이트용)
const activeTargetBases = computed(() =>
  validTargets.value.map((t) => t.base)
);

function lineHighlights(lineLabel) {
  return activeTargetBases.value.some((base) => lineContributesTo(lineLabel, base));
}

async function runSimulation() {
  const ts = validTargets.value;
  if (ts.length === 0) return;
  if (!selectedMemorial.value) return;
  if (!allTargetsFeasible.value) return;

  isRunning.value = true;
  await new Promise((r) => setTimeout(r, 30));

  try {
    // 해석적 통계 계산 (기하분포 기반) — 빠른 p 추정 + 닫힌 수식
    const stats = computeStatistics(selectedMemorial.value, ts);
    result.value = formatResult(selectedMemorial.value, ts, stats);

    // 1번 시도의 성공 카드 캡처 (예시 표시용)
    const sample = simulateUntilSingleCardReaches(selectedMemorial.value, ts);
    sampleWinningCard.value = sample;
  } finally {
    isRunning.value = false;
  }
}

function rollSample() {
  if (!selectedMemorial.value) return;
  sampleRoll.value = rollOnce(selectedMemorial.value);
}

// 평균 시도 × 1회 비용 = 평균 누적 재화
const meanCost = computed(() => {
  if (!result.value || !selectedMemorial.value?.cost) return null;
  if (!Number.isFinite(result.value.mean)) return null;
  const c = selectedMemorial.value.cost;
  const round = (n) => Math.round(n * 10) / 10;
  return {
    frag: round(result.value.mean * c.frag),
    crystal: round(result.value.mean * c.crystal),
  };
});

</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
      <strong>🎲 메모리얼 시뮬레이터</strong> · <strong>한 카드 안에서</strong> 설정한 모든 목표를
      <strong>동시에</strong> 만족하는 카드를 만나기까지 <strong>몇 회 굴려야 하는지</strong>를 분석합니다.
      <br />
      예: 목표 "최종 크리 대미지 3" + "최종 최대 대미지 2" → 한 카드에서 두 조건이 모두 충족돼야 성공.
      같은 옵션의 모든 티어가 합산되며, <strong>올스탯 라인은 다른 스탯 목표에도 기여</strong>하고
      한 줄이 여러 목표에 동시에 기여할 수 있습니다 (예: 올스탯 +2 → 근력·방어력 두 목표 동시 +2).
      <br />
      <strong class="text-xs">메커니즘</strong>: 한 카드 = 1~4줄 (세트 평균 2.2줄), 각 줄마다 옵션 풀에서 weight 비율로 선택 → [lo, hi] 정수 균등 분포.
    </div>

    <!-- 입력 -->
    <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">⚙️ 시뮬 조건</h2>

      <label class="block mb-4">
        <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          메모리얼 종류
        </span>
        <select
          v-model="selectedMemorialKey"
          @change="onMemorialChange"
          class="w-full md:w-1/2 rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option v-for="key in memorialKeys" :key="key" :value="key">
            {{ ALL_MEMORIALS[key].name }}
          </option>
        </select>
      </label>

      <div class="mb-2 flex items-center justify-between">
        <span class="block text-sm font-medium text-slate-700 dark:text-slate-300">
          목표 옵션 (최대 4개 — 한 카드 안에서 모두 동시 만족)
        </span>
        <button
          type="button"
          @click="addTarget"
          :disabled="targets.length >= 4"
          class="text-xs rounded-md ring-1 ring-indigo-300 dark:ring-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 transition"
        >
          + 옵션 추가
        </button>
      </div>

      <div class="space-y-2 mb-4">
        <div
          v-for="(t, i) in targets"
          :key="i"
          class="grid grid-cols-[1fr_140px_auto] gap-2 items-start"
        >
          <select
            v-model="t.base"
            class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option v-for="lbl in availableLabels" :key="lbl" :value="lbl">
              {{ lbl }}
            </option>
          </select>
          <div>
            <input
              v-model="t.value"
              type="number"
              step="any"
              placeholder="목표 합 (≥)"
              class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span
              v-if="targetFeasibilities[i]?.feasible === false"
              class="block mt-1 text-xs text-rose-600 dark:text-rose-400"
            >
              ⚠ 단일 카드 최대 {{ targetFeasibilities[i].max }} 초과
            </span>
            <span
              v-else-if="targetFeasibilities[i]?.max != null"
              class="block mt-1 text-xs text-slate-400"
            >
              최대 가능: {{ targetFeasibilities[i].max }}
            </span>
          </div>
          <button
            type="button"
            @click="removeTarget(i)"
            :disabled="targets.length <= 1"
            class="rounded-md ring-1 ring-slate-300 dark:ring-slate-600 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 text-xs transition"
            title="이 옵션 제거"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          @click="runSimulation"
          :disabled="isRunning || validTargets.length === 0 || !allTargetsFeasible"
          class="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
        >
          {{ isRunning ? '⏳ 시뮬 중...' : '🎲 목표 도달 시뮬' }}
        </button>
        <button
          type="button"
          @click="rollSample"
          class="rounded-lg ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition"
        >
          🎰 1회 굴려보기
        </button>
      </div>
    </section>

    <!-- 1회 굴림 -->
    <section
      v-if="sampleRoll"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        🎰 1회 굴림 결과 ({{ sampleRoll.length }}줄)
      </h2>
      <ul class="space-y-1.5">
        <li
          v-for="(line, i) in sampleRoll"
          :key="i"
          :class="[
            'rounded-md px-3 py-2 text-sm tabular-nums',
            lineHighlights(line.label)
              ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300 dark:ring-amber-700 font-semibold text-amber-800 dark:text-amber-200'
              : 'bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300',
          ]"
        >
          ▶ {{ line.label }} +{{ line.value }}
        </li>
      </ul>
    </section>


    <!-- 시뮬 결과 (목표 요약 한 줄) -->
    <section
      v-if="result"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
        🎯 시뮬 조건 요약
      </h2>
      <ul class="space-y-0.5 mb-2">
        <li
          v-for="(t, i) in result.targets"
          :key="i"
          class="text-sm text-indigo-600 dark:text-indigo-400 font-medium"
        >
          ▸ {{ t.base }} 합 ≥ {{ t.value }}
        </li>
      </ul>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        평균 <strong class="text-slate-700 dark:text-slate-200">{{ fmt(result.mean) }}회</strong> 시도 예상
        <span v-if="meanCost">
          (평균 조각 <strong class="text-amber-700 dark:text-amber-300">{{ fmt(meanCost.frag) }}</strong>개,
          결정 <strong class="text-rose-700 dark:text-rose-300">{{ fmt(meanCost.crystal) }}</strong>개)
        </span>
        · 단일 카드 성공률 {{ pctSmart(result.successRate) }}
      </p>
    </section>

    <!-- 1번 실행의 성공 카드 -->
    <section
      v-if="sampleWinningCard"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <div v-if="sampleWinningCard.success" class="space-y-3">
        <!-- 핵심 헤드라인 — N회차 + 실제 소비 -->
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-200 dark:border-slate-700 pb-3">
          <span class="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
            🎉 {{ fmt(sampleWinningCard.tries) }}회차에 성공
          </span>
          <span
            v-if="selectedMemorial?.cost"
            class="text-sm text-slate-600 dark:text-slate-300 tabular-nums"
          >
            <span class="text-amber-700 dark:text-amber-300 font-semibold">
              조각 {{ fmt(Math.round(sampleWinningCard.tries * selectedMemorial.cost.frag * 10) / 10) }}개
            </span>
            ·
            <span class="text-rose-700 dark:text-rose-300 font-semibold">
              결정 {{ fmt(Math.round(sampleWinningCard.tries * selectedMemorial.cost.crystal * 10) / 10) }}개
            </span>
          </span>
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400">
          이번 시뮬 1회 실행 결과 — 같은 조건이라도 매번 회차가 다릅니다 (위 버튼 다시 누르면 재실행).
        </p>

        <!-- 카드 -->
        <div class="rounded-lg bg-slate-50 dark:bg-slate-900/60 ring-1 ring-emerald-400 dark:ring-emerald-600 p-3">
          <div class="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
            성공한 카드 ({{ sampleWinningCard.winningLines.length }}줄)
          </div>
          <ul class="space-y-1 font-mono text-sm mb-3">
            <li
              v-for="(line, i) in sampleWinningCard.winningLines"
              :key="i"
              :class="[
                'tabular-nums',
                lineHighlights(line.label)
                  ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'text-slate-700 dark:text-slate-200',
              ]"
            >
              ▶ {{ line.label }} +{{ line.value }}
              <span v-if="lineHighlights(line.label)" class="text-[10px]">★</span>
            </li>
          </ul>
          <div class="text-xs space-y-0.5 border-t border-emerald-200 dark:border-emerald-800 pt-2">
            <div
              v-for="(s, i) in sampleWinningCard.sums"
              :key="i"
              class="text-emerald-700 dark:text-emerald-300 font-medium"
            >
              ✓ <strong>{{ s.base }}</strong> 합 +{{ s.sum }} (목표 ≥ {{ s.value }})
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-rose-600 dark:text-rose-400">
        ⚠ {{ fmt(sampleWinningCard.tries) }}회 굴렸지만 도달 실패 (maxTries 한도 초과).
      </div>
    </section>
  </div>
</template>
