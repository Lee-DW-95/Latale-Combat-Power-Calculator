<script setup>
import { computed, ref } from 'vue';
import { ALL_MEMORIALS } from '../data/memorialProbabilities.js';
import { runMonteCarlo, formatResult, expectedValuePerTry } from '../utils/memorialSim.js';

// ============================================================
// 상태
// ============================================================
const memorialKeys = Object.keys(ALL_MEMORIALS);
const selectedMemorialKey = ref('CHOENPAM_SET');
const selectedOption = ref('');
const targetValue = ref('');
const runs = ref(10000);

const isRunning = ref(false);
const result = ref(null);

// ============================================================
// 파생 상태
// ============================================================
const selectedMemorial = computed(() => ALL_MEMORIALS[selectedMemorialKey.value]);

const availableOptions = computed(() =>
  selectedMemorial.value ? Object.keys(selectedMemorial.value.options) : []
);

// 메모리얼이 바뀌면 옵션도 첫 번째로 리셋
function onMemorialChange() {
  const opts = availableOptions.value;
  selectedOption.value = opts[0] || '';
  result.value = null;
}

// 초기 옵션 셋팅
if (availableOptions.value.length > 0 && !selectedOption.value) {
  selectedOption.value = availableOptions.value[0];
}

const selectedDist = computed(() => {
  if (!selectedMemorial.value || !selectedOption.value) return null;
  return selectedMemorial.value.options[selectedOption.value];
});

// 옵션의 등장 확률 표 (UI 표시용)
const distTable = computed(() => {
  if (!selectedDist.value) return [];
  return selectedDist.value
    .filter((d) => d.value > 0) // 0 (안뜸) 제외
    .map((d) => ({
      value: d.value,
      probPct: (d.prob * 100).toFixed(3),
    }));
});

const expectedPerTry = computed(() => {
  if (!selectedDist.value) return 0;
  return expectedValuePerTry(selectedDist.value);
});

const probNotAppear = computed(() => {
  if (!selectedDist.value) return 0;
  const zero = selectedDist.value.find((d) => d.value === 0);
  return zero ? zero.prob * 100 : 0;
});

// ============================================================
// 액션
// ============================================================
async function runSimulation() {
  const target = Number(targetValue.value);
  if (!Number.isFinite(target) || target <= 0) return;
  if (!selectedDist.value) return;

  isRunning.value = true;
  // UI 갱신 보장 (loading state 표시)
  await new Promise((r) => setTimeout(r, 30));

  try {
    const mc = runMonteCarlo(selectedDist.value, target, Number(runs.value) || 10000);
    result.value = formatResult(target, mc, selectedDist.value);
  } finally {
    isRunning.value = false;
  }
}

const fmt = (n) => Number(n).toLocaleString('ko-KR');
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
      <strong>🎲 메모리얼 시뮬레이터</strong> · 원하는 옵션을 누적해서 목표값에 도달하기까지
      <strong>몇 회 굴려야 하는지</strong>를 Monte Carlo 시뮬레이션으로 분석합니다.
      확률 데이터: <a href="https://latale.info/80" target="_blank" rel="noopener" class="underline hover:no-underline">latale.info/80</a> 공개 자료 기반.
    </div>

    <!-- 입력 -->
    <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">⚙️ 시뮬 조건</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- 메모리얼 선택 -->
        <label class="block">
          <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            메모리얼 종류
          </span>
          <select
            v-model="selectedMemorialKey"
            @change="onMemorialChange"
            class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option v-for="key in memorialKeys" :key="key" :value="key">
              {{ ALL_MEMORIALS[key].name }}
            </option>
          </select>
        </label>

        <!-- 옵션 선택 -->
        <label class="block">
          <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            목표 옵션
          </span>
          <select
            v-model="selectedOption"
            class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option v-for="opt in availableOptions" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
        </label>

        <!-- 목표값 -->
        <label class="block">
          <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            목표 누적값 (이 값 이상 누적 시 종료)
          </span>
          <input
            v-model="targetValue"
            type="number"
            step="any"
            placeholder="예: 6 (= 6% 누적)"
            class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>

        <!-- 시뮬 횟수 -->
        <label class="block">
          <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            반복 횟수 (Monte Carlo)
          </span>
          <select
            v-model="runs"
            class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option :value="1000">1,000회 (빠름)</option>
            <option :value="10000">10,000회 (권장)</option>
            <option :value="50000">50,000회 (정밀)</option>
            <option :value="100000">100,000회 (매우 정밀)</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        @click="runSimulation"
        :disabled="isRunning || !targetValue || Number(targetValue) <= 0"
        class="mt-4 w-full sm:w-auto rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
      >
        {{ isRunning ? '⏳ 시뮬 중...' : '🎲 시뮬 시작' }}
      </button>
    </section>

    <!-- 확률 표 -->
    <section
      v-if="selectedDist"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        📊 {{ selectedOption }} 등장 분포
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        1회 굴림당 옵션 등장 확률.
        <strong>옵션 미등장</strong>: <span class="tabular-nums">{{ probNotAppear.toFixed(3) }}%</span>
        · 평균 누적: <span class="tabular-nums">{{ expectedPerTry.toFixed(3) }}/회</span>
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-slate-500 dark:text-slate-400 text-xs">
              <th class="py-1 pr-3 text-left font-medium">값</th>
              <th class="py-1 pr-3 text-right font-medium">등장 확률</th>
              <th class="py-1 pr-3 text-left font-medium">시각화</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in distTable"
              :key="row.value"
              class="border-t border-slate-100 dark:border-slate-700"
            >
              <td class="py-1.5 pr-3 tabular-nums font-medium text-slate-700 dark:text-slate-200">
                +{{ row.value }}
              </td>
              <td class="py-1.5 pr-3 tabular-nums text-right text-slate-700 dark:text-slate-200">
                {{ row.probPct }}%
              </td>
              <td class="py-1.5 pr-3 w-1/2">
                <div class="bg-slate-100 dark:bg-slate-900/50 rounded h-3 overflow-hidden">
                  <div
                    class="h-full bg-indigo-400 dark:bg-indigo-500"
                    :style="{ width: `${Math.min(100, Number(row.probPct) * 5)}%` }"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 결과 -->
    <section
      v-if="result"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        🎯 시뮬 결과
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        목표 <strong class="text-indigo-600 dark:text-indigo-400">+{{ result.target }}</strong> 누적까지 평균
        <strong>{{ fmt(result.mean) }}회</strong> 굴려야 합니다.
        (이론치: {{ fmt(result.theoretical) }}회 — 1회당 평균 +{{ result.expectedPerTry }} 누적)
      </p>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800 p-3">
          <div class="text-xs text-indigo-600 dark:text-indigo-300">평균 시도</div>
          <div class="text-2xl font-extrabold text-indigo-700 dark:text-indigo-200 tabular-nums">
            {{ fmt(result.mean) }}회
          </div>
        </div>
        <div class="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-800 p-3">
          <div class="text-xs text-emerald-600 dark:text-emerald-300">50% 안에</div>
          <div class="text-2xl font-extrabold text-emerald-700 dark:text-emerald-200 tabular-nums">
            {{ fmt(result.p50) }}회
          </div>
        </div>
        <div class="rounded-lg bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-200 dark:ring-amber-800 p-3">
          <div class="text-xs text-amber-600 dark:text-amber-300">90% 안에</div>
          <div class="text-2xl font-extrabold text-amber-700 dark:text-amber-200 tabular-nums">
            {{ fmt(result.p90) }}회
          </div>
        </div>
        <div class="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-800 p-3">
          <div class="text-xs text-rose-600 dark:text-rose-300">99% 안에</div>
          <div class="text-2xl font-extrabold text-rose-700 dark:text-rose-200 tabular-nums">
            {{ fmt(result.p99) }}회
          </div>
        </div>
      </div>

      <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">
        💡 <strong>50% 안에</strong> = 절반의 사용자는 이 횟수 이내에 목표 도달.
        <strong>90% 안에</strong> = 90% 사용자가 이 횟수 이내에 도달 (운 나쁜 케이스 대비).
        <br />최단 {{ fmt(result.min) }}회 / 최장 {{ fmt(result.max) }}회 (시뮬 {{ fmt(result.runs || 0) }}회 중).
      </p>
    </section>
  </div>
</template>
