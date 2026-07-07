<script setup>
import { computed } from 'vue';
import { getStatLabel } from '../utils/battlePower.js';
import { fmtRound as fmt } from '../utils/format.js';

const props = defineProps({
  result: { type: Object, default: null },
  type: { type: String, default: 'P' },
});

const signed = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));

const arrow = computed(() => {
  if (!props.result) return '';
  if (props.result.direction === 'up') return '🟢';
  if (props.result.direction === 'down') return '🔴';
  return '⚪';
});

const headline = computed(() => {
  if (!props.result) return '';
  const c = props.result.change;
  if (c > 0) return `전투력 +${fmt(c)} 상승`;
  if (c < 0) return `전투력 ${fmt(c)} 하락`;
  return '전투력 변화 없음';
});

const sortedContribs = computed(() => {
  if (!props.result?.contributions) return [];
  return [...props.result.contributions].sort(
    (a, b) => Math.abs(b.impact) - Math.abs(a.impact)
  );
});
</script>

<template>
  <section
    class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
  >
    <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-3">📊 결과</h2>

    <div v-if="!result" class="flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400 py-2">
      <img src="/assets/latale/char-82.png" alt="" class="w-12 h-12 rounded-full ring-1 ring-cyan-200 dark:ring-stone-600 shrink-0" draggable="false" />
      <span>현재/새 장비 옵션을 입력하면 결과가 여기 표시됩니다.</span>
    </div>

    <div v-else>
      <div class="flex items-baseline gap-3 mb-4">
        <span class="text-3xl">{{ arrow }}</span>
        <h3
          :class="[
            'text-2xl font-extrabold tabular-nums',
            result.direction === 'up'
              ? 'text-emerald-600 dark:text-emerald-400'
              : result.direction === 'down'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-stone-700 dark:text-stone-200',
          ]"
        >
          {{ headline }}
        </h3>
        <span class="text-sm text-stone-500 dark:text-stone-400">
          ({{ result.changePercent >= 0 ? '+' : '' }}{{ result.changePercent.toFixed(2) }}%)
        </span>
      </div>

      <dl class="grid grid-cols-2 gap-3 mb-5 text-sm">
        <div
          class="rounded-lg bg-stone-50 dark:bg-stone-900/50 p-3 ring-1 ring-stone-200 dark:ring-stone-700"
        >
          <dt class="text-stone-500 dark:text-stone-400">기존 전투력</dt>
          <dd class="text-lg font-bold text-stone-800 dark:text-stone-100 tabular-nums">
            {{ fmt(result.currentBP) }}
          </dd>
        </div>
        <div
          class="rounded-lg bg-cyan-50 dark:bg-cyan-950/40 p-3 ring-1 ring-cyan-200 dark:ring-cyan-800"
        >
          <dt class="text-cyan-600 dark:text-cyan-300">교체 후 예상</dt>
          <dd class="text-lg font-bold text-cyan-700 dark:text-cyan-200 tabular-nums">
            {{ fmt(result.newBP) }}
          </dd>
        </div>
      </dl>

      <div v-if="sortedContribs.length > 0">
        <h4 class="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">세부 변화</h4>
        <ul class="space-y-1">
          <li
            v-for="c in sortedContribs"
            :key="c.stat"
            class="flex items-center justify-between text-sm rounded-md px-3 py-2 bg-stone-50 dark:bg-stone-900/40"
          >
            <span class="text-stone-700 dark:text-stone-300">
              {{ getStatLabel(type, c.stat) }}
              <span class="text-stone-500 dark:text-stone-400 tabular-nums">
                {{ c.diff >= 0 ? '+' : '' }}{{ Math.round(c.diff).toLocaleString('ko-KR') }}
              </span>
            </span>
            <span
              :class="[
                'font-semibold tabular-nums',
                c.impact > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : c.impact < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-stone-500',
              ]"
            >
              전투력 {{ signed(c.impact) }}
            </span>
          </li>
        </ul>
      </div>
      <p v-else class="text-sm text-stone-500 dark:text-stone-400">
        변경된 옵션이 없습니다.
      </p>
    </div>
  </section>
</template>
