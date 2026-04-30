<script setup>
import { computed } from 'vue';
import { getStatLabel, conditionalMultiplier } from '../utils/battlePower.js';
import { STAT_FIELD_DEFS, BASE_FIELD_DEFS } from '../data/statLabels.js';
import { fmt as formatBP } from '../utils/format.js';

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
  // boolean (체크박스) 그대로 통과
  if (typeof raw === 'boolean') {
    emit('update:modelValue', { ...props.modelValue, [key]: raw });
    return;
  }
  const num = raw === '' || raw === null ? 0 : Number(raw);
  emit('update:modelValue', { ...props.modelValue, [key]: Number.isFinite(num) ? num : 0 });
}

// 기본 스탯 입력 진행도 (0~8개 입력 카운트)
const baseFilledCount = computed(() =>
  BASE_FIELD_DEFS.filter((d) => Number(props.modelValue[d.key] || 0) > 0).length
);

// 조건부 환산 표시용
const conditionalMult = computed(() => conditionalMultiplier(props.modelValue));
const anyConditionalActive = computed(() => conditionalMult.value > 1);
const activeConditionsLabel = computed(() => {
  const labels = [];
  if (props.modelValue.백어택활성 && Number(props.modelValue.백어택) > 0) labels.push(`백어택 ${props.modelValue.백어택}%`);
  if (props.modelValue.근거리활성 && Number(props.modelValue.근거리) > 0) labels.push(`근거리 ${props.modelValue.근거리}%`);
  if (props.modelValue.상태대미지활성 && Number(props.modelValue.상태대미지) > 0) labels.push(`상태이상 ${props.modelValue.상태대미지}%`);
  return labels.join(' · ') || '없음';
});
</script>

<template>
  <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
    <header class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">⚔️ 캐릭터 T창 정보</h2>
      <div class="text-right">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          계산된 전투력
          <span
            v-if="anyConditionalActive"
            class="ml-1 text-amber-600 dark:text-amber-400 font-semibold"
            :title="`조건부 환산 적용 중: ${activeConditionsLabel}`"
          >
            (환산 ON · ×{{ conditionalMult.toFixed(3) }})
          </span>
        </div>
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

    <!-- ─── 조건부 대미지 환산 (백어택/근거리/상태이상) — 개별 체크박스 ─── -->
    <div class="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
      <header class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
          🎯 조건부 대미지 환산
          <span class="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
            (시나리오별 ON/OFF · 활성 옵션만 BP/대미지에 곱셈 반영)
          </span>
        </h3>
        <span v-if="anyConditionalActive" class="text-xs tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
          현재 ×{{ conditionalMult.toFixed(3) }}
        </span>
      </header>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        각 옵션은 <strong>독립적으로 ON/OFF</strong> 가능. 백어택만 켜면 백어택 시나리오 BP, 근거리만 켜면 근거리 시나리오 BP 등 즉시 비교됩니다.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="cfg in [
            { activeKey: '백어택활성', valueKey: '백어택', label: '백어택 대미지', hint: '예: 30' },
            { activeKey: '근거리활성', valueKey: '근거리', label: '근거리 대미지', hint: '예: 15' },
            { activeKey: '상태대미지활성', valueKey: '상태대미지', label: '상태이상 대미지', hint: '예: 10' },
          ]"
          :key="cfg.activeKey"
          class="rounded-md ring-1 ring-amber-200 dark:ring-amber-900 bg-amber-50/40 dark:bg-amber-950/20 p-3"
        >
          <label class="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="!!stats[cfg.activeKey]"
              @change="setField(cfg.activeKey, $event.target.checked)"
              class="accent-amber-500"
            />
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {{ cfg.label }} <span class="text-slate-400">(%)</span>
            </span>
          </label>
          <input
            type="number"
            step="any"
            :value="stats[cfg.valueKey]"
            @input="setField(cfg.valueKey, $event.target.value)"
            :placeholder="cfg.hint"
            class="w-full rounded-md border-0 ring-1 ring-amber-200 dark:ring-amber-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-amber-400 focus:outline-none"
          />
        </div>
      </div>
    </div>
  </section>
</template>
