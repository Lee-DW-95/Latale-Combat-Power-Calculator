<script setup>
import { computed, ref } from 'vue';
import { calculateBattlePower, statMarginalEffect, getStatLabel } from '../utils/battlePower.js';

const props = defineProps({
  stats: { type: Object, required: true },
});

// 스탯별 "현실적인" step 단위 — 게임 내 흔한 변화량 기준
// (1당 효율로 비교하면 주스탯이 너무 작게 보이고 크댐 등이 과대평가되어 step별로 정규화)
const MARGINAL_STEPS = [
  { key: '주스탯', step: 100000, label: '+100,000' },
  { key: '공격력', step: 100,    label: '+100' },
  { key: '고댐',   step: 1000,   label: '+1,000' },
  { key: '크댐',   step: 100,    label: '+100' },
  { key: '최소뎀', step: 10,     label: '+10' },
  { key: '최대뎀', step: 10,     label: '+10' },
  { key: '일몬추', step: 1000,   label: '+1,000' },
  { key: '보몬추', step: 1000,   label: '+1,000' },
  { key: '일몬지', step: 1,      label: '+1%' },
  { key: '보몬지', step: 1,      label: '+1%' },
  { key: '근마효율', step: 1,    label: '+1%' },
  { key: '관통',   step: 1,      label: '+1' },
];

const baseBP = computed(() => calculateBattlePower(props.stats));

const efficiencies = computed(() => {
  if (baseBP.value <= 0) return [];
  return MARGINAL_STEPS
    .map(({ key, step, label }) => {
      const delta = statMarginalEffect(props.stats, key, step);
      return {
        key,
        step,
        stepLabel: label,
        label: getStatLabel(props.stats.type, key),
        delta,
        deltaPct: (delta / baseBP.value) * 100,
      };
    })
    .sort((a, b) => b.delta - a.delta);
});

const maxDelta = computed(() => {
  if (!efficiencies.value.length) return 1;
  const m = Math.max(...efficiencies.value.map((e) => Math.abs(e.delta)));
  return m > 0 ? m : 1;
});

// ============================================================
// 빠른 시뮬 (A)
// ============================================================
const simStat = ref('주스탯');
const simAmount = ref('');

const simResult = computed(() => {
  const amount = Number(simAmount.value);
  if (!Number.isFinite(amount) || amount === 0 || baseBP.value <= 0) return null;
  const delta = statMarginalEffect(props.stats, simStat.value, amount);
  return {
    delta,
    deltaPct: (delta / baseBP.value) * 100,
  };
});

function pickStat(key) {
  simStat.value = key;
}

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const sign = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
</script>

<template>
  <section
    class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
  >
    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">⚡ 효율 분석</h2>

    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
      현재 캐릭터 스탯 기준으로 자동 계산됩니다. 같은 옵션이라도
      <strong>본인 스탯과 누적%</strong>에 따라 BP 변화량이 다르게 산출됩니다.
    </p>

    <!-- 빈 상태 -->
    <div
      v-if="baseBP <= 0"
      class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center bg-slate-50 dark:bg-slate-900/40 rounded-lg"
    >
      먼저 위에서 <strong>캐릭터 T창 정보</strong>를 입력해주세요.
    </div>

    <div v-else>
      <!-- (B) 마진 효율 분석 -->
      <div class="mb-5">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          📊 스탯별 한계 효율 (효율 순 정렬)
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="e in efficiencies"
            :key="e.key"
            class="group flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded px-2 py-1 transition"
            @click="pickStat(e.key)"
            :title="`'${e.label}' 빠른 시뮬에 적용`"
          >
            <span class="text-slate-700 dark:text-slate-300 flex-shrink-0 w-28 sm:w-36 truncate">
              {{ e.label }}
              <span class="text-slate-400 dark:text-slate-500 text-[11px]">
                ({{ e.stepLabel }})
              </span>
            </span>
            <div class="flex-1 bg-slate-100 dark:bg-slate-900/50 rounded h-5 overflow-hidden relative min-w-0">
              <div
                class="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 dark:from-indigo-500 dark:to-indigo-300 transition-all"
                :style="{ width: `${Math.max(2, (e.delta / maxDelta) * 100)}%` }"
              />
            </div>
            <span class="text-slate-800 dark:text-slate-100 tabular-nums font-semibold flex-shrink-0 w-28 sm:w-36 text-right text-xs sm:text-sm">
              {{ sign(e.delta) }}
              <span class="text-slate-500 dark:text-slate-400 text-[11px] block sm:inline sm:ml-1">
                ({{ e.deltaPct >= 0 ? '+' : '' }}{{ e.deltaPct.toFixed(3) }}%)
              </span>
            </span>
          </li>
        </ul>
        <p class="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          💡 표 항목 클릭 시 아래 빠른 시뮬에 자동 적용됩니다.
        </p>
      </div>

      <!-- (A) 빠른 옵션 시뮬 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          🔮 빠른 옵션 시뮬
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
          옵션 1개를 빠르게 입력해서 본인 캐릭터에서 BP가 얼마 오르는지 확인.
          음수 입력 시 "옵션을 빼면 얼마 떨어지는지" 확인 가능.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="simStat"
            class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option v-for="m in MARGINAL_STEPS" :key="m.key" :value="m.key">
              {{ getStatLabel(stats.type, m.key) }}
            </option>
          </select>
          <span class="text-slate-500 dark:text-slate-400 font-medium">+</span>
          <input
            v-model="simAmount"
            type="number"
            step="any"
            placeholder="가산량"
            class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums w-32 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <span class="text-slate-500 dark:text-slate-400 font-medium">→</span>
          <span
            v-if="simResult"
            :class="[
              'font-semibold tabular-nums',
              simResult.delta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : simResult.delta < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500',
            ]"
          >
            BP {{ sign(simResult.delta) }}
            <span class="text-slate-500 dark:text-slate-400 text-xs ml-1 font-normal">
              ({{ simResult.deltaPct >= 0 ? '+' : '' }}{{ simResult.deltaPct.toFixed(2) }}%)
            </span>
          </span>
          <span v-else class="text-sm text-slate-400 dark:text-slate-500">값을 입력하세요</span>
        </div>
      </div>
    </div>
  </section>
</template>
