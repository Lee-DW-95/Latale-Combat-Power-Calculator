<script setup>
import { computed, ref } from 'vue';
import {
  calculateBattlePower,
  statMarginalEffect,
  getStatLabel,
  equipDelta,
  STAT_KEYS,
} from '../utils/battlePower.js';

const props = defineProps({
  stats: { type: Object, required: true },
});

// 8개 스탯은 기본값/누적%이 적용됨 (장비 % 옵션 환산용 기본 스탯)
const STATS_WITH_BASE = [
  '주스탯', '공격력', '크댐', '최소뎀', '최대뎀', '고댐', '일몬추', '보몬추',
];

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
// 빠른 시뮬 (A) — 부적/장비 가산 옵션 + % 옵션 시뮬
// ============================================================
const simStat = ref('주스탯');
const simAmount = ref('');     // 가산값 (부적 raw 옵션)
const simPct = ref('');        // % 옵션

// 선택한 스탯이 % 옵션을 지원하는지 (8개 기본스탯류)
const simSupportsPct = computed(() => STATS_WITH_BASE.includes(simStat.value));

// 선택한 스탯의 기본값 (예: 기본_주스탯)
const simBaseValue = computed(() => {
  if (!simSupportsPct.value) return 0;
  return Number(props.stats[`기본_${simStat.value}`] || 0);
});

// 현재 누적% (자동 계산)
const simCumulativePct = computed(() => {
  if (!simSupportsPct.value || simBaseValue.value <= 0) return null;
  const display = Number(props.stats[simStat.value] || 0);
  return ((display - simBaseValue.value) / simBaseValue.value) * 100;
});

const simResult = computed(() => {
  const amount = Number(simAmount.value) || 0;
  const pct = Number(simPct.value) || 0;
  if (amount === 0 && pct === 0) return null;
  if (baseBP.value <= 0) return null;

  // 장비 옵션 객체 구성 (한 옵션만 채움)
  const equip = { [simStat.value]: amount };
  if (simSupportsPct.value) {
    equip[`${simStat.value}_퍼`] = pct;
  }

  // equipDelta로 표시값 변화량 계산 (기본값/누적% 자동 반영)
  const delta = equipDelta(props.stats, equip);

  // 새 stats 만들어서 BP 계산
  const newStats = { ...props.stats };
  for (const k of STAT_KEYS) {
    newStats[k] = (Number(props.stats[k]) || 0) + (delta[k] || 0);
  }
  const newBP = calculateBattlePower(newStats);
  const change = newBP - baseBP.value;

  return {
    delta: change,
    deltaPct: (change / baseBP.value) * 100,
    displayDelta: delta[simStat.value] || 0, // 표시값 변화량 (부적 적용 후)
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
          부적/장비 한 옵션을 빠르게 입력해서 BP가 얼마 오르는지 확인.
          <strong>가산 옵션은 (기본값 + 가산) × (1 + 누적%) 메커니즘으로 계산</strong>되므로
          누적%가 큰 캐릭일수록 같은 가산값이라도 효과가 큽니다.
          기본값 미입력 시에는 단순 표시값 가산으로 폴백.
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
            placeholder="가산"
            title="부적/장비의 가산 옵션 (raw 값)"
            class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums w-24 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <template v-if="simSupportsPct">
            <span class="text-slate-500 dark:text-slate-400 font-medium">+</span>
            <input
              v-model="simPct"
              type="number"
              step="any"
              placeholder="% 옵션"
              :disabled="simBaseValue <= 0"
              :title="simBaseValue <= 0
                ? '% 옵션을 사용하려면 장비 비교 섹션의 기본 스탯을 먼저 입력하세요'
                : '부적/장비의 % 옵션'"
              class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums w-24 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span class="text-slate-400 dark:text-slate-500 text-xs">%</span>
          </template>
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

        <!-- 누적% 안내 / 기본값 미입력 안내 -->
        <p
          v-if="simSupportsPct && simBaseValue <= 0"
          class="mt-2 text-[11px] text-orange-600 dark:text-orange-400"
        >
          ⚠ <strong>{{ getStatLabel(stats.type, simStat) }}</strong>의 기본값이 미입력 상태 — 가산은 단순 더하기로 계산됩니다.
          정확한 메커니즘 적용을 원하면 장비 비교 섹션의
          <strong>"% 옵션 환산용 기본 스탯"</strong>을 펼쳐서
          <strong>기본_{{ simStat }}</strong>을(를) 입력하세요.
        </p>
        <p
          v-else-if="simSupportsPct && simCumulativePct != null && simResult"
          class="mt-2 text-[11px] text-slate-500 dark:text-slate-400"
        >
          💡 누적 <strong>+{{ simCumulativePct.toFixed(1) }}%</strong> 자동 반영 →
          표시 {{ getStatLabel(stats.type, simStat) }} 변화: <strong>{{ sign(simResult.displayDelta) }}</strong>
        </p>
      </div>
    </div>
  </section>
</template>
