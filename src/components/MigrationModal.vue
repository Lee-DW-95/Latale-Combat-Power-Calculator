<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 미리보기용 — [{ name, type }, ...] 형식.
  localCharacters: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue', 'confirm', 'skip']);

// 상태: 'idle' | 'uploading' | 'done' | 'error'
const status = ref('idle');
const resultLabel = ref('');

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      status.value = 'idle';
      resultLabel.value = '';
    }
  },
);

const previewLimit = 5;

async function onConfirm() {
  status.value = 'uploading';
  try {
    // 부모(App.vue) 가 실제 migrateLocalToServer 를 수행하고 결과를 다시 전달.
    const result = await new Promise((resolve, reject) => {
      emit('confirm', { resolve, reject });
    });
    status.value = 'done';
    resultLabel.value = `완료 — ${result.migrated}개 업로드${
      result.failed ? `, ${result.failed}개 실패` : ''
    }`;
    setTimeout(() => emit('update:modelValue', false), 1500);
  } catch (err) {
    status.value = 'error';
    resultLabel.value = err?.message || '업로드 실패';
  }
}

function onSkip() {
  emit('skip');
  emit('update:modelValue', false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        class="w-full max-w-md rounded-2xl bg-white dark:bg-stone-800 shadow-xl ring-1 ring-stone-200 dark:ring-stone-700 p-6"
        role="dialog"
        aria-modal="true"
      >
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">
          📦 기존 로컬 데이터 발견
        </h2>
        <p class="text-sm text-stone-600 dark:text-stone-300 leading-snug mb-3">
          이 브라우저에 저장된 캐릭터 <strong>{{ localCharacters.length }}개</strong>가 있습니다.
          계정에 업로드하면 다른 기기에서도 같은 데이터를 사용할 수 있습니다.
        </p>

        <ul class="text-xs space-y-0.5 mb-3 max-h-40 overflow-y-auto bg-stone-50 dark:bg-stone-900/40 rounded-md px-3 py-2 ring-1 ring-stone-200 dark:ring-stone-700">
          <li
            v-for="(c, i) in localCharacters.slice(0, previewLimit)"
            :key="i"
            class="flex justify-between text-stone-700 dark:text-stone-300"
          >
            <span class="truncate">{{ c.name }}</span>
            <span class="text-stone-400 dark:text-stone-500 ml-2 shrink-0">
              [{{ c.type === 'M' ? '마법' : '물리' }}]
            </span>
          </li>
          <li
            v-if="localCharacters.length > previewLimit"
            class="text-[11px] text-stone-400 dark:text-stone-500 italic pt-1"
          >
            … 외 {{ localCharacters.length - previewLimit }}개
          </li>
        </ul>

        <p class="text-[11px] text-stone-500 dark:text-stone-400 leading-snug mb-3">
          ⓘ 이름이 같은 캐릭터가 이미 계정에 있으면 <code class="text-stone-600 dark:text-stone-400">_local</code> 접미사가 자동으로 붙습니다.
          업로드 완료 후 로컬 데이터는 정리됩니다.
        </p>

        <p
          v-if="status === 'done' || status === 'error'"
          :class="[
            'text-xs font-medium mb-2',
            status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
          ]"
        >
          {{ resultLabel }}
        </p>

        <div class="flex items-center gap-2 justify-end">
          <button
            type="button"
            @click="onSkip"
            :disabled="status === 'uploading'"
            class="text-xs px-3 py-2 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition disabled:opacity-40"
          >
            나중에
          </button>
          <button
            type="button"
            @click="onConfirm"
            :disabled="status === 'uploading' || status === 'done'"
            class="text-sm px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition disabled:opacity-50"
          >
            {{
              status === 'uploading' ? '업로드 중...' :
              status === 'done' ? '완료' :
              `계정에 업로드 (${localCharacters.length}개)`
            }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
