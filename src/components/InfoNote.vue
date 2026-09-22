<script setup>
// 화면 상단 안내 — 한 줄만 보이고, 나머지 설명은 "자세히" 로 접어 둔다.
//   summary 슬롯: 항상 보이는 한 문장 / 기본 슬롯: 접힌 상세 (없으면 토글 자체가 안 보임)
import { ref, useSlots } from 'vue';

const open = ref(false);
const slots = useSlots();
</script>

<template>
  <div
    class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 border-l-4 border-cyan-500 px-4 py-2.5 text-xs leading-relaxed text-stone-600 dark:text-stone-300"
  >
    <div class="flex items-start gap-3">
      <p class="min-w-0 flex-1"><slot name="summary" /></p>
      <button
        v-if="slots.default"
        type="button"
        @click="open = !open"
        class="shrink-0 text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-100 transition whitespace-nowrap"
        :aria-expanded="open"
      >
        {{ open ? '접기' : '자세히' }}
      </button>
    </div>
    <div v-if="open && slots.default" class="mt-2 pt-2 border-t border-stone-100 dark:border-stone-700/70 space-y-1">
      <slot />
    </div>
  </div>
</template>
