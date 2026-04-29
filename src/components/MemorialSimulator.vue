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
  simulateUntilTargetWithLog,
} from '../utils/memorialSim.js';

// ============================================================
// 상태
// ============================================================
const memorialKeys = Object.keys(ALL_MEMORIALS);
const selectedMemorialKey = ref('CHOENPAM_SET');
const selectedLabel = ref('');
const targetValue = ref('');
const runs = ref(10000);

const isRunning = ref(false);
const result = ref(null);

// 1회 굴림 결과 (참고용)
const sampleRoll = ref(null);

// 1번 실행 상세 로그 (목표 도달 시뮬 결과에 함께 표시)
const sampleRunLog = ref(null);
const showFullLog = ref(false);

// ============================================================
// 파생
// ============================================================
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
}

if (availableLabels.value.length > 0 && !selectedLabel.value) {
  selectedLabel.value = availableLabels.value[0];
}

// ============================================================
// 라벨 통계 (UI용)
// ============================================================
const labelStats = computed(() => {
  const m = selectedMemorial.value;
  if (!m || !selectedLabel.value) return null;
  const probPerLine = perLineLabelProb(m, selectedLabel.value);
  const expectedPerLine = perLineLabelExpected(m, selectedLabel.value);
  const expectedPerCard = perCardLabelExpected(m, selectedLabel.value);
  // 평균 줄 수
  const avgLines = Object.entries(m.qdist)
    .reduce((s, [k, p]) => s + Number(k) * p, 0);
  return {
    probPerLine,
    expectedPerLine,
    expectedPerCard,
    avgLines,
    qdistEntries: Object.entries(m.qdist).map(([k, p]) => ({ k: Number(k), p })),
  };
});

// 같은 라벨의 모든 tier (UI 표시)
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

// ============================================================
// 액션
// ============================================================
async function runSimulation() {
  const target = Number(targetValue.value);
  if (!Number.isFinite(target) || target <= 0) return;
  if (!selectedMemorial.value || !selectedLabel.value) return;

  isRunning.value = true;
  showFullLog.value = false;
  await new Promise((r) => setTimeout(r, 30));

  try {
    const mc = runMonteCarlo(
      selectedMemorial.value,
      selectedLabel.value,
      target,
      Number(runs.value) || 10000
    );
    result.value = formatResult(
      selectedMemorial.value,
      selectedLabel.value,
      target,
      mc
    );

    // 1번의 실행 상세 로그 별도 캡처 (UI 표시용)
    sampleRunLog.value = simulateUntilTargetWithLog(
      selectedMemorial.value,
      selectedLabel.value,
      target
    );
  } finally {
    isRunning.value = false;
  }
}

// 샘플 로그에서 목표 옵션 등장 줄만 추출
const targetHits = computed(() => {
  if (!sampleRunLog.value) return [];
  const hits = [];
  for (const card of sampleRunLog.value.log) {
    for (const line of card.lines) {
      if (line.label === selectedLabel.value) {
        hits.push({ cardNo: card.cardNo, value: line.value });
      }
    }
  }
  return hits;
});

function rollSample() {
  if (!selectedMemorial.value) return;
  sampleRoll.value = rollOnce(selectedMemorial.value);
}

const fmt = (n) => Number(n).toLocaleString('ko-KR');
const pct = (p) => (p * 100).toFixed(3) + '%';
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
      <strong>🎲 메모리얼 시뮬레이터</strong> · 원하는 옵션을 누적해서 목표값에 도달하기까지
      <strong>몇 회 굴려야 하는지</strong>를 Monte Carlo 시뮬로 분석합니다.
      <br />
      <strong class="text-xs">메커니즘</strong>: 한 카드 = 1~4줄 (세트 평균 2.2줄), 각 줄마다 옵션 풀에서 weight 비율로 선택 → [lo, hi] 범위 정수 균등 분포.
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
          </select>
        </label>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          @click="runSimulation"
          :disabled="isRunning || !targetValue || Number(targetValue) <= 0"
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

    <!-- 1회 굴림 결과 -->
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
      <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        💡 <strong>{{ selectedLabel }}</strong> 옵션은 노란 강조로 표시. 한 카드 = 1~4줄 (세트 메모리얼 평균 2.2줄).
      </p>
    </section>

    <!-- 라벨 분포 / Tier 표 -->
    <section
      v-if="labelStats && labelTiers.length > 0"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        📊 {{ selectedLabel }} 분포 정보
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
        <div class="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-3 ring-1 ring-indigo-200 dark:ring-indigo-800">
          <div class="text-xs text-indigo-600 dark:text-indigo-300">
            한 카드당 기대값 (평균 {{ labelStats.avgLines.toFixed(1) }}줄)
          </div>
          <div class="text-xl font-bold text-indigo-700 dark:text-indigo-200 tabular-nums">
            +{{ labelStats.expectedPerCard.toFixed(3) }}
          </div>
        </div>
      </div>

      <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
        Tier 구성 (선택된 라벨)
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
        🎯 시뮬 결과
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        <strong class="text-indigo-600 dark:text-indigo-400">{{ selectedLabel }}</strong> 누적 +{{ result.target }} 도달까지 평균
        <strong>{{ fmt(result.mean) }}회</strong> 굴려야 합니다.
        (이론치: {{ fmt(result.theoretical) }}회 — 카드당 평균 +{{ result.expectedPerCard }} 누적)
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
        <br />최단 {{ fmt(result.min) }}회 / 최장 {{ fmt(result.max) }}회 (시뮬 {{ fmt(result.runs) }}회 중).
      </p>
    </section>

    <!-- 1번 실행 상세 로그 -->
    <section
      v-if="sampleRunLog"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
        📜 1번 실행 상세 — 총 {{ fmt(sampleRunLog.tries) }}회 굴려서 도달 (누적 {{ sampleRunLog.finalValue }})
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        시뮬 통계와는 별도로, <strong>한 번의 실제 진행을 그대로 재현</strong>한 결과입니다.
        같은 조건이라도 매번 다른 결과가 나옵니다 (위 버튼 다시 누르면 재실행).
      </p>

      <!-- 목표 옵션 등장 요약 -->
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          🎯 {{ selectedLabel }} 등장 ({{ targetHits.length }}회)
        </h3>
        <div v-if="targetHits.length > 0" class="flex flex-wrap gap-2">
          <span
            v-for="(hit, i) in targetHits"
            :key="i"
            class="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300 dark:ring-amber-700 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200 tabular-nums"
          >
            <span class="text-[11px] text-amber-600 dark:text-amber-400">
              {{ hit.cardNo }}회차
            </span>
            <span class="font-bold">+{{ hit.value }}</span>
          </span>
        </div>
        <p v-else class="text-sm text-slate-500 dark:text-slate-400">
          (이번 실행에서는 {{ selectedLabel }}이(가) 한 번도 등장하지 않았습니다.)
        </p>
      </div>

      <!-- 전체 굴림 로그 (펼치기) -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-3">
        <button
          type="button"
          @click="showFullLog = !showFullLog"
          class="flex items-center justify-between w-full text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          <span>📋 전체 굴림 로그 ({{ fmt(sampleRunLog.tries) }}장 × 평균 {{ (sampleRunLog.log.reduce((s, c) => s + c.lines.length, 0) / sampleRunLog.tries).toFixed(1) }}줄)</span>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {{ showFullLog ? '접기 ▲' : '펼치기 ▼' }}
          </span>
        </button>

        <div v-if="showFullLog" class="mt-3 max-h-96 overflow-y-auto rounded-lg bg-slate-50 dark:bg-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-700 p-3 font-mono text-xs space-y-2">
          <div
            v-for="card in sampleRunLog.log"
            :key="card.cardNo"
            :class="[
              'rounded p-2',
              card.addedThisCard > 0
                ? 'bg-amber-100 dark:bg-amber-950/40 ring-1 ring-amber-300 dark:ring-amber-700'
                : 'bg-white dark:bg-slate-800/50',
            ]"
          >
            <div class="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              [{{ card.cardNo }}회차] · {{ card.lines.length }}줄
              <span v-if="card.addedThisCard > 0" class="text-amber-600 dark:text-amber-400 font-semibold">
                · {{ selectedLabel }} +{{ card.addedThisCard }} (누적 {{ card.cumulative }})
              </span>
            </div>
            <ul class="space-y-0.5">
              <li
                v-for="(line, j) in card.lines"
                :key="j"
                :class="[
                  'tabular-nums',
                  line.label === selectedLabel
                    ? 'text-amber-700 dark:text-amber-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400',
                ]"
              >
                ▶ {{ line.label }} +{{ line.value }}
                <span v-if="line.label === selectedLabel" class="text-[10px]">★</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
