<script setup>
import { useDarkMode } from '../composables/useDarkMode.js';

const { mode, toggle } = useDarkMode();
</script>

<template>
  <button
    type="button"
    @click="toggle"
    class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
    :title="mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'"
  >
    <span v-if="mode === 'dark'">🌙 다크</span>
    <span v-else>☀️ 라이트</span>
  </button>
</template>
