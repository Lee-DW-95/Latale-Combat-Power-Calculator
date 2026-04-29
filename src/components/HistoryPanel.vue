<script setup>
import { useHistory } from '../composables/useHistory.js';

const emit = defineEmits(['restore']);
const { history, deleteEntry, clearAll } = useHistory();

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const formatTime = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
};
</script>

<template>
  <section
    class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
  >
    <header class="flex items-center justify-between mb-3">
      <h2 class="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
        <img src="/assets/latale/char-56.png" alt="" class="w-7 h-7 rounded-full ring-1 ring-indigo-200 dark:ring-slate-600" draggable="false" />
        비교 히스토리
      </h2>
      <button
        v-if="history.length > 0"
        type="button"
        @click="clearAll"
        class="text-xs text-slate-500 hover:text-rose-500"
      >
        전체 삭제
      </button>
    </header>

    <ul v-if="history.length > 0" class="space-y-1">
      <li
        v-for="h in history"
        :key="h.id"
        class="flex items-center justify-between rounded-md bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer"
        @click="emit('restore', h)"
      >
        <span class="truncate">
          <span class="text-xs text-slate-400 mr-2">{{ formatTime(h.timestamp) }}</span>
          <span class="font-medium text-slate-700 dark:text-slate-200">
            {{ h.characterName }} · {{ h.slot }}
          </span>
        </span>
        <span class="flex items-center gap-2">
          <span
            :class="[
              'font-semibold tabular-nums text-xs',
              h.result.direction === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : h.result.direction === 'down'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500',
            ]"
          >
            {{ h.result.change >= 0 ? '+' : '' }}{{ fmt(h.result.change) }}
          </span>
          <button
            type="button"
            @click.stop="deleteEntry(h.id)"
            class="text-xs text-slate-400 hover:text-rose-500"
            title="삭제"
          >
            🗑
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">
      비교 결과가 자동으로 여기 누적됩니다 (최근 10개).
    </p>
  </section>
</template>
