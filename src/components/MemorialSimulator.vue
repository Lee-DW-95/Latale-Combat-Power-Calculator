<script setup>
import { computed, ref } from 'vue';
import { ALL_MEMORIALS, uniqueLabels } from '../data/memorialProbabilities.js';
import {
  runMonteCarlo,
  formatResult,
  perLineLabelProb,
  perLineLabelExpected,
  perCardLabelExpected,
  rollOnce,
  simulateUntilSingleCardReaches,
  estimateSingleCardSuccessRate,
  maxPossibleSingleCard,
} from '../utils/memorialSim.js';

const memorialKeys = Object.keys(ALL_MEMORIALS);
const selectedMemorialKey = ref('CHOENPAM_SET');
const selectedLabel = ref('');
const targetValue = ref('');
const runs = ref(10000);

const isRunning = ref(false);
const result = ref(null);

const sampleRoll = ref(null);
const sampleWinningCard = ref(null); // 시뮬에서 성공한 카드 정보

const selectedMemorial = computed(() => ALL_MEMORIALS[selectedMemorialKey.value]);

const availableLabels = computed(() =>
  selectedMemorial.value ? uniqueLabels(selectedMemorial.value) : []
);

function onMemorialChange() {
  const labels = availableLabels.value;
  selectedLabel.value = labels.includes(selectedLabel.value)
    ? selectedLabel.value
    : labels[0] || '';
  result.value = null;
  sampleRoll.value = null;
  sampleWinningCard.value = null;
}

if (availableLabels.value.length > 0 && !selectedLabel.value) {
  selectedLabel.value = availableLabels.value[0];
}

const labelStats = computed(() => {
  const m = selectedMemorial.value;
  if (!m || !selectedLabel.value) return null;
  const probPerLine = perLineLabelProb(m, selectedLabel.value);
  const expectedPerLine = perLineLabelExpected(m, selectedLabel.value);
  const expectedPerCard = perCardLabelExpected(m, selectedLabel.value);
  const avgLines = Object.entries(m.qdist)
    .reduce((s, [k, p]) => s + Number(k) * p, 0);
  const maxSingleCard = maxPossibleSingleCard(m, selectedLabel.value);
  return {
    probPerLine,
    expectedPerLine,
    expectedPerCard,
    avgLines,
    maxSingleCard,
  };
});

const labelTiers = computed(() => {
  const m = selectedMemorial.value;
  if (!m || !selectedLabel.value) return [];
  const sumW = m.tiers.reduce((s, t) => s + t[2], 0);
  return m.tiers
    .filter((t) => t[3] === selectedLabel.value)
    .map(([lo, hi, w]) => ({
      lo,
      hi,
      weight: w,
      relProb: sumW > 0 ? w / sumW : 0,
      meanVal: (lo + hi) / 2,
    }));
});

// 목표값이 가능한지 체크 (불가능하면 사용자에게 안내)
const targetFeasible = computed(() => {
  if (!labelStats.value || !targetValue.value) return null;
  const t = Number(targetValue.value);
  if (!Number.isFinite(t) || t <= 0) return null;
  return t <= labelStats.value.maxSingleCard;
});

async function runSimulation() {
  const target = Number(targetValue.value);
  if (!Number.isFinite(target) || target <= 0) return;
  if (!selectedMemorial.value || !selectedLabel.value) return;
  if (targetFeasible.value === false) return;

  isRunning.value = true;
  await new Promise((r) => setTimeout(r, 30));

  try {
    const mc = runMonteCarlo(
      selectedMemorial.value,
      selectedLabel.value,
      target,
      Number(runs.value) || 10000
    );
    // 단일 카드 성공률 추정 (이론치 산출)
    const successRate = estimateSingleCardSuccessRate(
      selectedMemorial.value,
      selectedLabel.value,
      target,
      100_000
    );
    result.value = formatResult(
      selectedMemorial.value,
      selectedLabel.value,
      target,
      mc,
      successRate
    );

    // 1번 시도의 성공한 카드 캡처
    const sample = simulateUntilSingleCardReaches(
      selectedMemorial.value,
      selectedLabel.value,
      target
    );
    sampleWinningCard.value = sample;
  } finally {
    isRunning.value = false;
  }
}

function rollSample() {
  if (!selectedMemorial.value) return;
  sampleRoll.value = rollOnce(selectedMemorial.value);
}

const fmt = (n) => {
  if (!Number.isFinite(Number(n))) return '∞';
  return Number(n).toLocaleString('ko-KR');
};
const pct = (p) => (p * 100).toFixed(3) + '%';
const pctSmart = (p) => {
  if (p >= 0.01) return (p * 100).toFixed(2) + '%';
  if (p >= 0.0001) return (p * 100).toFixed(4) + '%';
  return (p * 100).toExponential(2) + '%';
};
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
      <strong>🎲 메모리얼 시뮬레이터</strong> · <strong>한 카드 안에서</strong> 목표 옵션의 줄 값 합이 목표값 이상인 카드를 만나기까지
      <strong>몇 회 굴려야 하는지</strong>를 분석합니다.
      <br />
      예: 목표 "최종 크리 6%" → 한 카드에서 [최종크 +3, 최종크 +3] 같이 합이 6 이상인 카드를 굴려서 만나야 함.
      카드 간 누적이 아닙니다.
      <br />
      <strong class="text-xs">메커니즘</strong>: 한 카드 = 1~4줄 (세트 평균 2.2줄), 각 줄마다 옵션 풀에서 weight 비율로 선택 → [lo, hi] 정수 균등 분포.
      확률 데이터: <a href="https://latale.info/80" target="_blank" rel="noopener" class="underline hover:no-underline">latale.info/80</a> JS 코드 정확 포팅.
    </div>

    <!-- 입력 -->
    <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">⚙️ 시뮬 조건</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <label class="block">
          <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            목표 옵션
          </span>
          <select
            v-model="selectedLabel"
            class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option v-for="lbl in availableLabels" :key="lbl" :value="lbl">
              {{ lbl }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            목표 합 (한 카드에서 ≥ 이 값)
            <span v-if="labelStats" class="text-xs font-normal text-slate-400">
              · 최대 가능: {{ labelStats.maxSingleCard }}
            </span>
          </span>
          <input
            v-model="targetValue"
            type="number"
            step="any"
            placeholder="예: 6 (= 6% 한 카드)"
            class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <span
            v-if="targetFeasible === false"
            class="block mt-1 text-xs text-rose-600 dark:text-rose-400"
          >
            ⚠ 이 옵션의 단일 카드 최대 합({{ labelStats?.maxSingleCard }})을 초과해서 도달 불가능
          </span>
        </label>

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
            <option :value="50000">50,000회 (정밀, 느림)</option>
          </select>
        </label>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          @click="runSimulation"
          :disabled="isRunning || !targetValue || Number(targetValue) <= 0 || targetFeasible === false"
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
            line.label === selectedLabel
              ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300 dark:ring-amber-700 font-semibold text-amber-800 dark:text-amber-200'
              : 'bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300',
          ]"
        >
          ▶ {{ line.label }} +{{ line.value }}
        </li>
      </ul>
    </section>

    <!-- 라벨 분포 / Tier 표 -->
    <section
      v-if="labelStats && labelTiers.length > 0"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        📊 {{ selectedLabel }} 분포 정보
      </h2>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 ring-1 ring-slate-200 dark:ring-slate-700">
          <div class="text-xs text-slate-500 dark:text-slate-400">한 줄당 등장 확률</div>
          <div class="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {{ pct(labelStats.probPerLine) }}
          </div>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 ring-1 ring-slate-200 dark:ring-slate-700">
          <div class="text-xs text-slate-500 dark:text-slate-400">한 줄당 기대값</div>
          <div class="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            +{{ labelStats.expectedPerLine.toFixed(3) }}
          </div>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 ring-1 ring-slate-200 dark:ring-slate-700">
          <div class="text-xs text-slate-500 dark:text-slate-400">한 카드당 기대값</div>
          <div class="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            +{{ labelStats.expectedPerCard.toFixed(3) }}
          </div>
        </div>
        <div class="rounded-lg bg-rose-50 dark:bg-rose-950/40 p-3 ring-1 ring-rose-200 dark:ring-rose-800">
          <div class="text-xs text-rose-600 dark:text-rose-300">단일 카드 최대 가능</div>
          <div class="text-xl font-bold text-rose-700 dark:text-rose-200 tabular-nums">
            +{{ labelStats.maxSingleCard }}
          </div>
        </div>
      </div>

      <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
        Tier 구성
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-slate-500 dark:text-slate-400 text-xs">
              <th class="py-1 pr-3 text-left font-medium">범위 [lo ~ hi]</th>
              <th class="py-1 pr-3 text-right font-medium">상대 weight</th>
              <th class="py-1 pr-3 text-right font-medium">한 줄 등장 확률</th>
              <th class="py-1 pr-3 text-right font-medium">균등 분포 평균값</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(t, i) in labelTiers"
              :key="i"
              class="border-t border-slate-100 dark:border-slate-700"
            >
              <td class="py-1.5 pr-3 tabular-nums text-slate-700 dark:text-slate-200">
                +{{ t.lo }} ~ +{{ t.hi }}
              </td>
              <td class="py-1.5 pr-3 tabular-nums text-right text-slate-700 dark:text-slate-200">
                {{ t.weight.toFixed(6) }}
              </td>
              <td class="py-1.5 pr-3 tabular-nums text-right text-slate-700 dark:text-slate-200">
                {{ pct(t.relProb) }}
              </td>
              <td class="py-1.5 pr-3 tabular-nums text-right text-slate-700 dark:text-slate-200">
                +{{ t.meanVal.toFixed(1) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 시뮬 결과 -->
    <section
      v-if="result"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        🎯 시뮬 결과 (단일 카드 합 도달)
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        한 카드 안에서 <strong class="text-indigo-600 dark:text-indigo-400">{{ selectedLabel }} 합 ≥ {{ result.target }}</strong>인 카드를 만나기까지 평균
        <strong>{{ fmt(result.mean) }}회</strong> 굴려야 합니다.
        (단일 카드 성공률: <strong>{{ pctSmart(result.successRate) }}</strong> · 이론치: {{ fmt(result.theoretical) }}회)
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
        💡 <strong>50% 안에</strong> = 절반의 사용자가 이 횟수 이내에 도달.
        <strong>90% 안에</strong> = 90% 사용자가 이 횟수 이내에 도달 (운 나쁜 케이스 대비).
        <br />최단 {{ fmt(result.min) }}회 / 최장 {{ fmt(result.max) }}회 (시뮬 {{ fmt(result.runs) }}회 중<span v-if="result.failureCount > 0">, 실패 {{ fmt(result.failureCount) }}건</span>).
      </p>
    </section>

    <!-- 1번 시도의 성공한 카드 -->
    <section
      v-if="sampleWinningCard"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        🎉 1번 실행의 성공 카드 — {{ fmt(sampleWinningCard.tries) }}회차
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        시뮬 통계와는 별도로, 한 번의 실제 진행을 그대로 재현한 결과입니다.
        같은 조건이라도 매번 다른 회차가 나옵니다 (위 버튼 다시 누르면 재실행).
      </p>

      <div v-if="sampleWinningCard.success" class="space-y-3">
        <div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300 dark:ring-amber-700 p-3">
          <div class="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
            성공한 카드 ({{ sampleWinningCard.winningLines.length }}줄, {{ selectedLabel }} 합 +{{ sampleWinningCard.cardSum }})
          </div>
          <ul class="space-y-1 font-mono text-xs">
            <li
              v-for="(line, i) in sampleWinningCard.winningLines"
              :key="i"
              :class="[
                'tabular-nums',
                line.label === selectedLabel
                  ? 'text-amber-700 dark:text-amber-300 font-bold'
                  : 'text-slate-600 dark:text-slate-400',
              ]"
            >
              ▶ {{ line.label }} +{{ line.value }}
              <span v-if="line.label === selectedLabel" class="text-[10px]">★</span>
            </li>
          </ul>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          앞선 {{ fmt(sampleWinningCard.tries - 1) }}장의 카드는 모두 목표 미달. {{ fmt(sampleWinningCard.tries) }}회차에 위 카드 등장.
        </p>
      </div>
      <div v-else class="text-sm text-rose-600 dark:text-rose-400">
        ⚠ {{ fmt(sampleWinningCard.tries) }}회 굴렸지만 도달 실패 (maxTries 한도 초과).
      </div>
    </section>
  </div>
</template>
