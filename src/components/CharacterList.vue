<script setup>
import { ref } from 'vue';
import { useCharacterStorage } from '../composables/useCharacterStorage.js';

const props = defineProps({
  currentStats: { type: Object, required: true },
});
const emit = defineEmits(['load']);

const { characters, activeId, saveCharacter, deleteCharacter, selectCharacter } =
  useCharacterStorage();

const newName = ref('');
const errorMsg = ref('');

function onSave() {
  errorMsg.value = '';
  try {
    const saved = saveCharacter(newName.value, props.currentStats);
    newName.value = '';
    emit('load', saved.stats);
  } catch (e) {
    errorMsg.value = e.message;
  }
}

function onSelect(id) {
  const c = selectCharacter(id);
  if (c) emit('load', c.stats);
}

function onDelete(id) {
  if (confirm('이 캐릭터를 삭제하시겠습니까?')) {
    deleteCharacter(id);
  }
}
</script>

<template>
  <section
    class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
  >
    <h2 class="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
      <img src="/assets/latale/char-75.png" alt="" class="w-7 h-7 rounded-full ring-1 ring-indigo-200 dark:ring-slate-600" draggable="false" />
      캐릭터
    </h2>

    <div class="flex gap-2 mb-3">
      <input
        v-model="newName"
        type="text"
        placeholder="캐릭터 이름"
        @keyup.enter="onSave"
        class="flex-1 rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
      />
      <button
        type="button"
        @click="onSave"
        class="rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-sm font-medium text-white transition"
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
            ? 'bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-300 dark:ring-indigo-700'
            : 'bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-700/50',
        ]"
        @click="onSelect(c.id)"
      >
        <span class="truncate">
          <span class="font-medium text-slate-800 dark:text-slate-100">{{ c.name }}</span>
          <span class="ml-2 text-xs text-slate-500 dark:text-slate-400">
            [{{ c.stats.type === 'M' ? '마법' : '물리' }}]
          </span>
        </span>
        <button
          type="button"
          @click.stop="onDelete(c.id)"
          class="text-xs text-slate-400 hover:text-rose-500"
          title="삭제"
        >
          🗑
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">
      저장된 캐릭터가 없습니다. 위에서 이름을 입력하고 저장하세요.
    </p>
  </section>
</template>
