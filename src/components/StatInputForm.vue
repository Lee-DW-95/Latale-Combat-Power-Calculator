<script setup>
import { computed } from 'vue';
import { getStatLabel } from '../utils/battlePower.js';
import { STAT_FIELD_DEFS, BASE_FIELD_DEFS } from '../data/statLabels.js';

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

// 기본 스탯 입력 진행도 (0~8개 입력 카운트)
const baseFilledCount = computed(() =>
  BASE_FIELD_DEFS.filter((d) => Number(props.modelValue[d.key] || 0) > 0).length
);
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
            'flex items-center gap-2 pl-2 pr-4 py-1.5 text-sm font-medium transition',
            stats.type === 'P'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
          ]"
        >
          <img
            src="/assets/latale/roguemaster.png"
            alt="로그마스터"
            class="w-8 h-8 rounded-full ring-1 ring-white/40 object-cover bg-slate-200 dark:bg-slate-700"
            style="object-position: 50% 12%"
            draggable="false"
          />
          물리
        </button>
        <button
          type="button"
          @click="setType('M')"
          :class="[
            'flex items-center gap-2 pl-2 pr-4 py-1.5 text-sm font-medium transition border-l border-slate-300 dark:border-slate-600',
            stats.type === 'M'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
          ]"
        >
          <img
            src="/assets/latale/rainia.png"
            alt="레이니아"
            class="w-8 h-8 rounded-full ring-1 ring-white/40 object-cover bg-slate-200 dark:bg-slate-700"
            style="object-position: 50% 22%"
            draggable="false"
          />
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
          class="block mt-1 text-xs text-orange-600 dark:text-orange-400"
        >
          ⚠ 최소뎀이 최대뎀({{ Number(stats.최대뎀).toLocaleString('ko-KR') }})을 초과 — 게임 메커니즘에 따라 최대뎀으로 cap되어 계산됨 (수련의방)
        </span>
      </label>
    </div>

    <!-- ─── 추가 세부정보 (% 옵션 환산용 기본 스탯) ─── -->
    <div class="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
      <header class="flex items-center justify-between mb-1">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
          📐 추가 세부정보
          <span class="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
            (선택 · % 옵션 환산용)
          </span>
        </h3>
        <span class="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
          {{ baseFilledCount }} / {{ BASE_FIELD_DEFS.length }} 입력됨
        </span>
      </header>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        T창 <strong>추가 세부정보</strong> 패널의 우측 +값(녹색 숫자)을 입력하세요.
        예: "근력 +1,118,069 (506%)" → 기본 근력 = <strong>1,118,069</strong>.
        장비 비교의 % 옵션과 빠른 시뮬의 % 옵션을 정확히 환산할 때 사용됩니다.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label v-for="def in BASE_FIELD_DEFS" :key="def.key" class="block">
          <span class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {{ def.label }}
          </span>
          <input
            type="number"
            :step="def.step"
            :value="stats[def.key]"
            @input="setField(def.key, $event.target.value)"
            :title="def.tooltip"
            class="w-full rounded-md border-0 ring-1 ring-emerald-200 dark:ring-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-emerald-400 focus:outline-none"
          />
        </label>
      </div>
    </div>
  </section>
</template>
