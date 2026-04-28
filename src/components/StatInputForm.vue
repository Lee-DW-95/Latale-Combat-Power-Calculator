<script setup>
import { computed } from 'vue';
import { getStatLabel } from '../utils/battlePower.js';
import { STAT_FIELD_DEFS } from '../data/statLabels.js';

const props = defineProps({
  modelValue: { type: Object, required: true },
  battlePower: { type: Number, default: 0 },
});
const emit = defineEmits(['update:modelValue']);

const stats = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

function setType(type) {
  emit('update:modelValue', { ...props.modelValue, type });
}

function setField(key, raw) {
  const num = raw === '' || raw === null ? 0 : Number(raw);
  emit('update:modelValue', { ...props.modelValue, [key]: Number.isFinite(num) ? num : 0 });
}

const formatBP = (n) => n.toLocaleString('ko-KR');
</script>

<template>
  <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
    <header class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">⚔️ 캐릭터 T창 정보</h2>
      <div class="text-right">
        <div class="text-xs text-slate-500 dark:text-slate-400">계산된 전투력</div>
        <div class="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums">
          {{ formatBP(battlePower) }}
        </div>
      </div>
    </header>

    <div class="mb-4">
      <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">직업 타입</span>
      <div class="inline-flex rounded-lg ring-1 ring-slate-300 dark:ring-slate-600 overflow-hidden">
        <button
          type="button"
          @click="setType('P')"
          :class="[
            'px-4 py-2 text-sm font-medium transition',
            stats.type === 'P'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
          ]"
        >
          물리
        </button>
        <button
          type="button"
          @click="setType('M')"
          :class="[
            'px-4 py-2 text-sm font-medium transition border-l border-slate-300 dark:border-slate-600',
            stats.type === 'M'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
          ]"
        >
          마법
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <label
        v-for="def in STAT_FIELD_DEFS"
        :key="def.key"
        class="block"
      >
        <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {{ getStatLabel(stats.type, def.key) }}
          <span v-if="def.unit" class="text-slate-400">({{ def.unit }})</span>
        </span>
        <input
          type="number"
          :step="def.step"
          :value="stats[def.key]"
          @input="setField(def.key, $event.target.value)"
          :title="def.tooltip"
          class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <span
          v-if="def.key === '최소뎀' && Number(stats.최소뎀) > Number(stats.최대뎀)"
          class="block mt-1 text-xs text-amber-600 dark:text-amber-400"
        >
          ⚠ 최소뎀이 최대뎀({{ Number(stats.최대뎀).toLocaleString('ko-KR') }})을 초과 — 게임 메커니즘에 따라 최대뎀으로 cap되어 계산됨 (수련의방)
        </span>
      </label>
    </div>
  </section>
</template>
