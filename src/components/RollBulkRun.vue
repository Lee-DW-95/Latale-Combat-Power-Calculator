<script setup>
/**
 * 대량 굴림 — 각성석 / 아이템 각성 / 메모리얼 시뮬 공용.
 *
 * "1회 굴려보기" 를 계속 누르는 게 번거로워서, N 회를 한 번에 돌리고
 * 기록 조건을 넘은 굴림이 몇 번 · 몇 회차에 나왔는지 요약해 보여준다.
 * 실제 굴림 루프는 부모의 useRollLog().bulkRun() 이 돌린다.
 */
import { computed } from 'vue';
import { fmt } from '../utils/format.js';

const props = defineProps({
  running: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  // useRollLog().bulkSummary — 직전 대량 굴림 결과 (없으면 null)
  summary: { type: Object, default: null },
  // 기록 조건 (표시용) — { type, option, threshold }
  criterion: { type: Object, required: true },
  // criterion.option 의 표시 이름
  optionLabel: { type: String, default: '' },
  // T창 정보가 있어 크댐 환산이 가능한지
  hasStats: { type: Boolean, default: false },
  // 굴림 1회당 소모 재화 — [{ label, per }] · 있으면 총 소모량을 같이 보여준다
  costs: { type: Array, default: () => [] },
});

const times = defineModel('times', { type: [Number, String], required: true });

const emit = defineEmits(['run', 'cancel']);

const PRESETS = [100, 1000, 10000, 100000];

const timesNum = computed(() => {
  const v = Math.floor(Number(times.value));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 1000000) : 0;
});

const isOption = computed(() => props.criterion.type === 'option');

// equiv 조건인데 T창 정보가 없으면 아무것도 안 걸린다 — 돌려봐야 의미가 없다.
const blocked = computed(() => !isOption.value && !props.hasStats);

const conditionText = computed(() => {
  const th = props.criterion.threshold;
  if (isOption.value) return `${props.optionLabel || '선택한 옵션'} 합 ≥ ${th}`;
  return `크댐환산 합 ≥ ${th}`;
});

const totalCosts = computed(() =>
  timesNum.value > 0
    ? props.costs.filter((c) => c.per > 0).map((c) => `${c.label} ${fmt(c.per * timesNum.value)}개`)
    : [],
);

const progressPct = computed(() =>
  timesNum.value > 0 ? Math.min(100, (props.progress / timesNum.value) * 100) : 0,
);

function num(v, digits = 1) {
  if (!Number.isFinite(Number(v))) return '-';
  const n = Number(v);
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(digits);
}

/** 적중률 — 아주 낮으면 소수 자리를 늘려 0.00% 로 뭉개지지 않게 한다. */
function ratePct(rate) {
  const p = rate * 100;
  if (p === 0) return '0%';
  if (p >= 1) return `${p.toFixed(2)}%`;
  if (p >= 0.01) return `${p.toFixed(3)}%`;
  return `${p.toExponential(1)}%`;
}

// 요약의 "최고 기록" 표기 — 조건 종류에 따라 단위가 다르다
const bestText = computed(() => {
  const s = props.summary;
  if (!s || s.best == null) return '';
  return s.criterionType === 'option' ? `합 ${num(s.best)}` : `크댐환산 ${num(s.best)}`;
});

function run() {
  if (props.running || blocked.value || timesNum.value <= 0) return;
  emit('run', timesNum.value);
}
</script>

<template>
  <div
    class="mt-3 rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/50 p-3"
  >
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-bold text-stone-600 dark:text-stone-300 whitespace-nowrap">
        ⚡ 대량 굴림
      </span>
      <input
        v-model="times"
        type="number"
        min="1"
        max="1000000"
        step="1"
        :disabled="running"
        class="w-28 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-50"
      />
      <span class="text-xs text-stone-500 dark:text-stone-400">회</span>

      <button
        v-if="!running"
        type="button"
        @click="run"
        :disabled="blocked || timesNum <= 0"
        class="rounded-lg px-4 py-1.5 text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        :title="blocked
          ? 'T창 정보가 없어 크댐환산 조건으로는 아무것도 기록되지 않습니다'
          : conditionText + ' 인 굴림만 기록합니다'"
      >
        {{ fmt(timesNum) }}회 돌리기
      </button>
      <button
        v-else
        type="button"
        @click="emit('cancel')"
        class="rounded-lg px-4 py-1.5 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition"
      >
        ■ 중단
      </button>

      <div class="flex gap-1 ml-auto">
        <button
          v-for="p in PRESETS"
          :key="p"
          type="button"
          @click="times = p"
          :disabled="running"
          :class="[
            'rounded-md px-2 py-1 text-[11px] font-semibold transition disabled:opacity-40',
            timesNum === p
              ? 'bg-stone-700 dark:bg-stone-200 text-white dark:text-stone-900'
              : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700',
          ]"
        >
          {{ p >= 10000 ? `${p / 10000}만` : fmt(p) }}
        </button>
      </div>
    </div>

    <p class="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
      조건 <strong class="text-stone-700 dark:text-stone-200">{{ conditionText }}</strong>
      을 넘은 굴림만 우측 기록에 회차와 함께 쌓입니다. 조건은 우측 패널에서 바꿉니다.
      <span v-if="totalCosts.length" class="text-orange-600 dark:text-orange-400">
        · 실제로 돌렸다면 {{ totalCosts.join(' · ') }}
      </span>
    </p>

    <p
      v-if="blocked"
      class="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200"
    >
      ⚠ T창 정보가 없어 크댐환산을 못 합니다 — 우측 패널에서 <strong>특정 옵션</strong> 조건을
      고르거나, 전투력 계산 탭에서 캐릭터 정보를 입력하세요.
    </p>

    <!-- 진행률 -->
    <div v-if="running" class="mt-2">
      <div class="h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
        <div
          class="h-full bg-cyan-500 transition-all duration-100"
          :style="{ width: progressPct + '%' }"
        />
      </div>
      <div class="mt-1 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
        {{ fmt(progress) }} / {{ fmt(timesNum) }}회
      </div>
    </div>

    <!-- 결과 요약 -->
    <div
      v-else-if="summary"
      class="mt-2 rounded-lg ring-1 ring-cyan-200 dark:ring-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 px-3 py-2"
    >
      <div class="text-sm text-stone-700 dark:text-stone-200">
        <span class="tabular-nums font-semibold">{{ fmt(summary.times) }}회</span> 중
        <span class="tabular-nums font-extrabold text-orange-600 dark:text-orange-300">
          {{ fmt(summary.hits) }}회
        </span>
        적중
        <span v-if="summary.hits > 0" class="text-xs text-stone-500 dark:text-stone-400 ml-1">
          ({{ ratePct(summary.rate) }} · 평균 {{ fmt(Math.round(summary.gap)) }}회당 1회)
        </span>
        <span v-if="summary.cancelled" class="text-xs text-rose-600 dark:text-rose-400 ml-1">
          — 중단됨
        </span>
      </div>

      <div
        v-if="summary.best != null"
        class="mt-0.5 text-xs text-stone-600 dark:text-stone-300 tabular-nums"
      >
        이번 구간 최고 <strong>{{ bestText }}</strong>
        <span class="text-stone-400"> (#{{ fmt(summary.bestIndex) }}회차)</span>
        · 구간 {{ fmt(summary.from) }}~{{ fmt(summary.to) }}회차
      </div>

      <div
        v-if="summary.hits > 0"
        class="mt-1 max-h-20 overflow-y-auto text-[11px] leading-relaxed text-stone-500 dark:text-stone-400 tabular-nums break-all"
      >
        적중 회차: {{ summary.indexes.map((i) => fmt(i)).join(', ') }}
        <span v-if="summary.indexesTruncated">
          … 외 {{ fmt(summary.hits - summary.indexes.length) }}건
        </span>
      </div>
      <p
        v-if="summary.recordsTruncated"
        class="mt-1 text-[11px] text-amber-600 dark:text-amber-400"
      >
        ※ 우측 기록은 최대 300건까지만 남습니다 — 조건을 더 올리면 알짜만 볼 수 있어요.
      </p>
      <p
        v-else-if="summary.hits === 0"
        class="mt-1 text-[11px] text-stone-500 dark:text-stone-400"
      >
        조건을 넘은 굴림이 없습니다. 기준치를 낮추거나 회수를 늘려보세요.
      </p>
    </div>
  </div>
</template>
