<script setup>
import { computed } from 'vue';
import {
  getStatLabel,
  expectedConditionalMultiplier,
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
} from '../utils/battlePower.js';
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

// 조건부 환산 표시용 — 가동률 가중 (직접 BP 에만 곱셈 적용됨, 소환은 영향 없음)
//   props.battlePower 는 부모에서 'boss' 디폴트로 계산됨. 여기선 직접/소환 비율도 보여줌.
const expectedMultNormal = computed(() => expectedConditionalMultiplier(props.modelValue, 'normal'));
const expectedMultBoss = computed(() => expectedConditionalMultiplier(props.modelValue, 'boss'));

// 평균 BP — base / normal / boss (= (직접+소환)/2)
const baseBP = computed(() => calculateBattlePower(props.modelValue, 'base'));
const normalBP = computed(() => calculateBattlePower(props.modelValue, 'normal'));
const bossBP = computed(() => calculateBattlePower(props.modelValue, 'boss'));

// 직접 / 소환 분리 BP — base 기준 (소환은 가동률 무관)
const directBPBase = computed(() => calculateDirectBP(props.modelValue, 'base'));
const directBPBoss = computed(() => calculateDirectBP(props.modelValue, 'boss'));
const summonBP = computed(() => calculateSummonBP(props.modelValue));

const anyConditionalActive = computed(
  () => expectedMultNormal.value > 1 || expectedMultBoss.value > 1
);
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
            class="ml-1 text-amber-600 dark:text-amber-400 font-semibold tabular-nums"
            title="가동률 가중 환산 — 직접 BP에만 곱셈, 소환은 영향 없음"
          >
            (보스 환산)
          </span>
        </div>
        <div class="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums">
          {{ formatBP(battlePower) }}
        </div>
        <!-- 직접/소환 분리 (항상 표시) -->
        <div class="text-[10px] tabular-nums mt-0.5">
          <span class="text-amber-700 dark:text-amber-300 font-semibold">
            직접 {{ formatBP(directBPBoss) }}
          </span>
          <span class="text-slate-400 mx-1">·</span>
          <span class="text-sky-700 dark:text-sky-300 font-semibold">
            소환 {{ formatBP(summonBP) }}
          </span>
        </div>
        <div
          v-if="anyConditionalActive"
          class="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums mt-0.5"
          title="환산 없이 base 평균 / 일반·보스 환경별 평균"
        >
          base {{ formatBP(baseBP) }} · 일반 {{ formatBP(normalBP) }} · 보스 {{ formatBP(bossBP) }}
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

    <!-- ─── 조건부 대미지 환산 (백어택/근거리/상태이상) ─── -->
    <div class="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
      <header class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
          🎯 조건부 대미지 환산
        </h3>
        <span v-if="anyConditionalActive" class="text-xs tabular-nums font-semibold">
          <span class="text-sky-700 dark:text-sky-300">일반 ×{{ expectedMultNormal.toFixed(3) }}</span>
          <span class="mx-1 text-slate-400">/</span>
          <span class="text-rose-700 dark:text-rose-300">보스 ×{{ expectedMultBoss.toFixed(3) }}</span>
        </span>
      </header>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        엑셀 공식 (B!P18/19): <code class="text-amber-700 dark:text-amber-300">multiplier = 1 + Σ(값% × 가동률) / (D × (1 + 크댐%))</code>,
        D=0.6(일반)/0.3(보스). <strong>가동률</strong>은 직타비중 × 조건충족율 → 0~100 사이로 입력.
        <br />
        ⚠️ 백/근/상은 <strong class="text-amber-700 dark:text-amber-300">직접타격에만 영향</strong> — 소환 BP는 그대로, 직접 BP만 곱셈 → 표시(평균) BP는 직접 효과의 절반 정도 상승.
        <br />
        예: 백어택 1000% × 가동률 70% (크댐 9000%) → 직접 BP ×1.26, 소환 BP ×1.00, 표시 BP ×1.13.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="cfg in [
            { activeKey: '백어택활성', valueKey: '백어택', uptimeKey: '백어택가동률', label: '백어택 대미지', hint: '예: 1000' },
            { activeKey: '근거리활성', valueKey: '근거리', uptimeKey: '근거리가동률', label: '근거리 대미지', hint: '예: 100' },
            { activeKey: '상태대미지활성', valueKey: '상태대미지', uptimeKey: '상태대미지가동률', label: '상태이상 대미지', hint: '예: 50' },
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
            class="w-full rounded-md border-0 ring-1 ring-amber-200 dark:ring-amber-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-amber-400 focus:outline-none mb-2"
          />
          <label class="block">
            <span class="block text-[10px] font-medium text-slate-600 dark:text-slate-300 mb-0.5">
              가동률 (%) — BP 환산 가중치
            </span>
            <input
              type="number"
              step="any"
              min="0"
              max="100"
              :value="stats[cfg.uptimeKey]"
              @input="setField(cfg.uptimeKey, $event.target.value)"
              placeholder="0~100"
              class="w-full rounded-md border-0 ring-1 ring-amber-200 dark:ring-amber-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs tabular-nums focus:ring-2 focus:ring-amber-400 focus:outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  </section>
</template>
