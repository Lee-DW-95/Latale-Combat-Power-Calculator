<script setup>
import { ref } from 'vue';
import { useCharacterStorage } from '../composables/useCharacterStorage.js';
import { calculateBattlePower } from '../utils/battlePower.js';
import { fmtRound } from '../utils/format.js';

// 목록에서 캐릭터별 전투력 확인 — 캐릭터 간 비교의 최소 단위.
function characterBP(c) {
  try {
    return calculateBattlePower(c.stats || {});
  } catch {
    return 0;
  }
}

function updatedLabel(c) {
  if (!c.updatedAt) return '';
  const d = new Date(c.updatedAt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

const props = defineProps({
  currentStats: { type: Object, required: true },
  currentAwakStones: { type: Array, default: () => [] },
});

const { characters, activeId, saveCharacter, deleteCharacter, selectCharacter } =
  useCharacterStorage();

const newName = ref('');
const errorMsg = ref('');

async function onSave() {
  errorMsg.value = '';
  try {
    // saveCharacter 가 activeId 를 갱신 → App.vue 의 watch(activeCharacter) 가
    // stats/awakStones 동기화를 처리. 별도 emit 불필요.
    await saveCharacter(newName.value, props.currentStats, props.currentAwakStones);
    newName.value = '';
  } catch (e) {
    errorMsg.value = e.message;
  }
}

function onSelect(id) {
  selectCharacter(id); // activeId 변경 → App.vue watch 가 stats/awakStones 동기화.
}

async function onDelete(id) {
  if (!confirm('이 캐릭터를 삭제하시겠습니까?')) return;
  try {
    await deleteCharacter(id);
  } catch (e) {
    errorMsg.value = e.message;
  }
}
</script>

<template>
  <section
    class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
  >
    <!-- 제목은 아코디언 바가 담당 -->
    <div class="flex gap-2 mb-3">
      <input
        v-model="newName"
        type="text"
        placeholder="캐릭터 이름"
        @keyup.enter="onSave"
        class="flex-1 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
      />
      <button
        type="button"
        @click="onSave"
        class="rounded-md bg-cyan-600 hover:bg-cyan-700 px-3 py-2 text-sm font-medium text-white transition"
      >
        저장
      </button>
    </div>
    <p v-if="errorMsg" class="text-xs text-rose-500 mb-2">{{ errorMsg }}</p>

    <ul v-if="characters.length > 0" class="space-y-1">
      <li
        v-for="c in characters"
        :key="c.id"
        :class="[
          'flex items-center justify-between rounded-md px-3 py-2 text-sm transition cursor-pointer',
          activeId === c.id
            ? 'bg-cyan-50 dark:bg-cyan-950/40 ring-1 ring-cyan-300 dark:ring-cyan-700'
            : 'bg-stone-50 dark:bg-stone-900/40 hover:bg-stone-100 dark:hover:bg-stone-700/50',
        ]"
        @click="onSelect(c.id)"
      >
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="font-medium text-stone-800 dark:text-stone-100 truncate">{{ c.name }}</span>
            <span
              :class="[
                'shrink-0 text-[10px] font-semibold px-1 py-px rounded',
                c.stats.type === 'M'
                  ? 'bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300'
                  : 'bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-300',
              ]"
            >
              {{ c.stats.type === 'M' ? '마법' : '물리' }}
            </span>
          </span>
          <span class="flex items-baseline gap-1.5 text-xs">
            <span class="font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
              {{ fmtRound(characterBP(c)) }}
            </span>
            <span v-if="updatedLabel(c)" class="text-[10px] text-stone-400 dark:text-stone-500">
              {{ updatedLabel(c) }}
            </span>
          </span>
        </span>
        <button
          type="button"
          @click.stop="onDelete(c.id)"
          class="ml-2 shrink-0 text-xs text-stone-400 hover:text-rose-500"
          title="삭제"
        >
          🗑
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-stone-500 dark:text-stone-400">
      저장된 캐릭터가 없습니다. 위에서 이름을 입력하고 저장하세요.
    </p>
  </section>
</template>
