<script setup>
import { computed } from 'vue';
import { RUNES, RUNE_SLOTS, displayDesc, scoreOf, gradeOf } from '../data/runeWordData.js';
import { evaluateLines, normalizeRuneWordCard } from '../utils/rollEquiv.js';
import { makeEmptyRuneword, runewordRows, runewordFilledCount } from '../utils/runewordLoadout.js';
import { fmt1 } from '../utils/format.js';

const props = defineProps({
  // 활성 캐릭터 T창 스탯 — 크댐환산 계산 기준 (BP 0 이면 환산 생략)
  stats: { type: Object, required: true },
});

// 장착 룬워드 — 부모(App.vue)의 활성 캐릭터 runeword 와 v-model 양방향. 룬 id 8개, 빈 칸 null.
const runeword = defineModel('runeword', { type: Array, default: () => makeEmptyRuneword() });

const slots = computed(() => {
  const arr = Array.isArray(runeword.value) && runeword.value.length === RUNE_SLOTS
    ? runeword.value
    : makeEmptyRuneword();
  return arr;
});

function setSlot(i, raw) {
  const val = raw === '' ? null : Number(raw);
  const arr = runeword.value;
  // 부모 배열을 제자리에서 고친다 — 통째로 교체하면 부모 반영(비동기) 전에 들어온 다음 입력이
  // 이전 값을 덮어쓴다. 길이가 어긋난 구버전 데이터만 새 배열로 바꾼다.
  if (Array.isArray(arr) && arr.length === RUNE_SLOTS) {
    arr[i] = val;
    return;
  }
  const next = makeEmptyRuneword();
  next[i] = val;
  runeword.value = next;
}

// 같은 룬은 한 룬워드에 두 번 못 들어간다 — 다른 칸이 쓰는 룬은 선택 불가
function isTaken(i, runeId) {
  return slots.value.some((id, j) => j !== i && id === runeId);
}

function reset() {
  runeword.value = makeEmptyRuneword();
}

const filled = computed(() => runewordFilledCount(slots.value));

const conv = computed(() => {
  const rows = runewordRows(slots.value);
  if (!rows.length) return null;
  return evaluateLines(normalizeRuneWordCard(rows), props.stats);
});

// info 사이트 점수 (참고용) — 왕룬 2배, 통찰 왕룬 120 고정
const score = computed(() => {
  let total = 0;
  slots.value.forEach((id, i) => {
    if (id === null || id === undefined) return;
    total += scoreOf(RUNES[id], i === RUNE_SLOTS - 1);
  });
  return total;
});
const grade = computed(() => gradeOf(score.value));
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <p class="text-xs leading-relaxed text-stone-500 dark:text-stone-300 max-w-2xl">
        장착한 룬 8개를 고르면 캐릭터와 함께 저장됩니다. 8번째 칸이 왕룬(수치 2배)입니다.
      </p>
      <div class="flex items-center gap-3 shrink-0 text-xs tabular-nums">
        <span class="text-stone-500 dark:text-stone-400">
          장착 {{ filled }}/{{ RUNE_SLOTS }}
          <span class="text-stone-300 dark:text-stone-600 mx-1">·</span>
          점수 <span class="font-semibold text-stone-900 dark:text-stone-50">{{ score }}</span>
          <span v-if="filled" class="text-stone-400 dark:text-stone-500"> {{ grade.label }}</span>
        </span>
        <span v-if="conv" class="text-stone-500 dark:text-stone-400">
          환산 <span class="font-semibold text-stone-900 dark:text-stone-50">{{ fmt1(conv.total) }}</span><span class="text-stone-400 ml-0.5">%급</span>
        </span>
        <button
          type="button"
          @click="reset"
          :disabled="filled === 0"
          class="h-8 px-3 rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 transition"
        >
          초기화
        </button>
      </div>
    </div>

    <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
      <div
        v-for="(id, i) in slots"
        :key="i"
        class="flex items-center gap-2"
      >
        <span
          class="text-[11px] w-7 shrink-0 tabular-nums text-right"
          :class="i === RUNE_SLOTS - 1 ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-stone-400 dark:text-stone-500'"
        >
          {{ i === RUNE_SLOTS - 1 ? '왕룬' : i + 1 }}
        </span>
        <select
          :value="id === null || id === undefined ? '' : id"
          @change="(e) => setSlot(i, e.target.value)"
          class="h-8 flex-1 min-w-0 rounded-lg border-0 ring-1 ring-stone-200 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          :class="[
            id === null || id === undefined ? 'text-stone-400 dark:text-stone-500' : '',
            i === RUNE_SLOTS - 1 ? 'ring-orange-300 dark:ring-orange-700/70' : '',
          ]"
          :title="id !== null && id !== undefined ? displayDesc(RUNES[id], i === RUNE_SLOTS - 1) : ''"
        >
          <option value="">빈 칸</option>
          <option
            v-for="r in RUNES"
            :key="r.id"
            :value="r.id"
            :disabled="isTaken(i, r.id)"
          >
            {{ r.name }} — {{ displayDesc(r, i === RUNE_SLOTS - 1) }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
