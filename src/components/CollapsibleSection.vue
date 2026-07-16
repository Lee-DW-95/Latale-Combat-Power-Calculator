<script setup>
// 섹션 접기/펼치기 래퍼 — calc 탭이 세로로 길어 섹션별 아코디언 제공.
// 내용 컴포넌트는 v-show 로 숨겨 내부 상태(입력값 등)를 유지하고,
// 열림 상태는 localStorage(latale.sections.v1)에 섹션별로 저장한다.
import { ref, watch } from 'vue';

const props = defineProps({
  id: { type: String, required: true }, // localStorage 키
  title: { type: String, required: true },
  defaultOpen: { type: Boolean, default: true },
});

const STORAGE_KEY = 'latale.sections.v1';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

const saved = loadState()[props.id];
const open = ref(typeof saved === 'boolean' ? saved : props.defaultOpen);

watch(open, (v) => {
  try {
    const state = loadState();
    state[props.id] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage 불가 환경(시크릿 모드 등) — 상태 저장만 생략 */
  }
});
</script>

<template>
  <section>
    <button
      type="button"
      @click="open = !open"
      :aria-expanded="open"
      class="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition
             text-stone-600 dark:text-stone-300 bg-stone-100/80 dark:bg-stone-800/60
             ring-1 ring-stone-200 dark:ring-stone-700 hover:bg-stone-200/70 dark:hover:bg-stone-700/60"
      :class="open ? 'mb-2' : ''"
    >
      <span class="flex items-center gap-2">
        <span
          class="inline-block transition-transform duration-200 text-stone-400"
          :class="open ? 'rotate-90' : ''"
        >▶</span>
        {{ title }}
      </span>
      <span class="text-[11px] font-normal text-stone-400 dark:text-stone-500">
        {{ open ? '접기' : '펼치기' }}
      </span>
    </button>
    <div v-show="open">
      <slot />
    </div>
  </section>
</template>
