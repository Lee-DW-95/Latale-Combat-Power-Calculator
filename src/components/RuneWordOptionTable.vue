<script setup>
// 룬워드 옵션표 — 단일 룬 / 복합 룬 분리, 왕룬 기준 토글 (RuneWordSimulator 에서 분리)
import { computed, ref } from 'vue';
import { RUNES, GRADES, displayDesc } from '../data/runeWordData.js';
import { FIRST_COMBO_ID, GRADE_CHIP, GRADE_TEXT, runeTier, TIER_CHIP, TIER_LABEL, scoreAsKing } from '../utils/runeWordUi.js';

const optionKingView = ref(false);

function toOptionRow(r) {
  const tier = runeTier(r);
  return {
    ...r,
    tier,
    tierLabel: TIER_LABEL[tier],
    shownDesc: optionKingView.value ? displayDesc(r, true) : r.desc,
    shownScore: optionKingView.value ? scoreAsKing(r) : r.score,
  };
}

const optionGroups = computed(() => [
  { key: 'single', label: '단일 룬', rows: RUNES.filter((r) => r.id < FIRST_COMBO_ID).map(toOptionRow) },
  { key: 'combo', label: '복합 룬', rows: RUNES.filter((r) => r.id >= FIRST_COMBO_ID).map(toOptionRow) },
]);

// 등급 컷 범위 문자열 ("241 ~ 380점")
function gradeRange(g) {
  const i = GRADES.indexOf(g);
  const lo = i === 0 ? 0 : GRADES[i - 1].max + 1;
  return g.max === Infinity ? `${lo}점 이상` : `${lo} ~ ${g.max}점`;
}
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 class="text-base font-semibold text-stone-800 dark:text-stone-100">📖 룬워드 옵션표</h2>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            단일 룬 20종 · 복합 룬 10종
          </p>
        </div>
        <div class="inline-flex rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden">
          <button
            type="button"
            @click="optionKingView = false"
            :class="[
              'px-3 py-1.5 text-xs font-medium transition',
              !optionKingView
                ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 shadow-sm'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
            ]"
          >
            일반 기준
          </button>
          <button
            type="button"
            @click="optionKingView = true"
            :class="[
              'px-3 py-1.5 text-xs font-medium transition border-l border-stone-200 dark:border-stone-700',
              optionKingView
                ? 'bg-violet-600 text-white'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
            ]"
          >
            왕룬 기준
          </button>
        </div>
      </div>

      <div class="overflow-x-auto -mx-5 px-5">
        <table class="w-full min-w-[520px] text-sm">
          <thead>
            <tr class="text-left text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500 border-b border-stone-200 dark:border-stone-700">
              <th class="py-2 pr-3 w-[7.5rem]">룬</th>
              <th class="py-2 pr-3">옵션</th>
              <th class="py-2 pl-3 text-right w-20">점수</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in optionGroups" :key="group.key">
              <tr>
                <td
                  colspan="3"
                  class="pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500"
                >
                  {{ group.label }} <span class="font-normal">({{ group.rows.length }}종)</span>
                </td>
              </tr>
              <tr
                v-for="r in group.rows"
                :key="r.id"
                class="border-b border-stone-100 dark:border-stone-700/60 align-top"
              >
                <td class="py-2 pr-3">
                  <div class="relative pl-2.5">
                    <span
                      :class="[
                        'absolute left-0 top-0.5 bottom-0.5 w-1 rounded-sm',
                        r.tier === 'major' ? 'bg-rose-500' : r.tier === 'mid' ? 'bg-amber-500' : 'bg-stone-200 dark:bg-stone-700',
                      ]"
                    ></span>
                    <span class="font-bold text-stone-800 dark:text-stone-100 whitespace-nowrap">{{ r.name }}</span>
                    <span
                      v-if="r.tierLabel"
                      :class="['block mt-0.5 w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold', TIER_CHIP[r.tier]]"
                    >{{ r.tierLabel }}</span>
                  </div>
                </td>
                <td
                  :class="[
                    'py-2 pr-3 leading-snug',
                    optionKingView ? 'text-violet-700 dark:text-violet-300' : 'text-stone-600 dark:text-stone-300',
                  ]"
                >
                  {{ r.shownDesc }}
                </td>
                <td
                  :class="[
                    'py-2 pl-3 text-right tabular-nums font-bold whitespace-nowrap',
                    optionKingView ? 'text-violet-600 dark:text-violet-400' : 'text-stone-700 dark:text-stone-200',
                  ]"
                >
                  {{ r.shownScore }}점
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 등급 기준 -->
    <section class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 p-5">
      <h2 class="text-sm font-bold text-stone-700 dark:text-stone-200 mb-3">총점 등급 기준</h2>
      <div class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden">
        <div
          v-for="g in GRADES"
          :key="g.key"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 border-b last:border-b-0 border-stone-100 dark:border-stone-700/60"
        >
          <span :class="['w-20 shrink-0 text-sm font-bold tabular-nums', GRADE_TEXT[g.key]]">
            {{ gradeRange(g) }}
          </span>
          <span :class="['rounded px-2 py-0.5 text-xs font-bold', GRADE_CHIP[g.key]]">{{ g.label }}</span>
          <span class="text-xs text-stone-500 dark:text-stone-400">{{ g.text }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
