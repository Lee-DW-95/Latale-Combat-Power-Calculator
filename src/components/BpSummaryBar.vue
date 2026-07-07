<script setup>
// 하단 고정 전투력 요약 바 — 페이지 어디를 스크롤하든 "지금 내 전투력"과
// "장비 교체 시 변화"를 항상 보여준다 (입력은 흐르고 결과는 고정).
// BP 값이 바뀌면 상승/하락 색으로 짧게 플래시해 변화를 시각적으로 알린다.
import { computed, ref, watch } from 'vue';
import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
  calculateBPVsMonster,
} from '../utils/battlePower.js';
import { fmtRound } from '../utils/format.js';

const props = defineProps({
  stats: { type: Object, required: true },
  // compareEquipment() 결과 (없으면 null) — 장비 diff 표시용
  result: { type: Object, default: null },
});

const totalBP = computed(() => calculateBattlePower(props.stats));
const directBP = computed(() => calculateDirectBP(props.stats));
const summonBP = computed(() => calculateSummonBP(props.stats));
const vsNormal = computed(() => calculateBPVsMonster(props.stats, 'normal'));
const vsBoss = computed(() => calculateBPVsMonster(props.stats, 'boss'));

// 입력이 하나도 없으면 바 자체를 숨김 (빈 화면에서 0 뱃지 노출 방지)
const hasInput = computed(() => totalBP.value > 0);

// ── 변화 플래시 ──
// 'up' | 'down' | null — 값 변경 시 700ms 하이라이트.
const flash = ref(null);
let flashTimer = null;
watch(totalBP, (now, prev) => {
  if (!prev || !now) return;
  flash.value = now > prev ? 'up' : now < prev ? 'down' : null;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = null), 700);
});

const diff = computed(() => {
  if (!props.result) return null;
  return {
    change: props.result.change,
    pct: props.result.changePercent,
    up: props.result.change > 0,
    down: props.result.change < 0,
  };
});
</script>

<template>
  <transition
    enter-active-class="transition duration-300"
    enter-from-class="translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
  >
    <div
      v-if="hasInput"
      class="fixed bottom-0 inset-x-0 z-20 border-t border-stone-200 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-4 sm:gap-6 overflow-x-auto">
        <!-- 종합 BP -->
        <div class="shrink-0">
          <div class="text-[10px] leading-none text-stone-400 dark:text-stone-500 mb-0.5">전투력 (보스 환산)</div>
          <div
            :class="[
              'text-xl sm:text-2xl font-extrabold tabular-nums leading-none transition-colors duration-300',
              flash === 'up'
                ? 'text-emerald-500'
                : flash === 'down'
                ? 'text-rose-500'
                : 'text-cyan-600 dark:text-cyan-400',
            ]"
          >
            {{ fmtRound(totalBP) }}
          </div>
        </div>

        <!-- 장비 교체 diff — 있을 때만, 종합 바로 옆 (가장 중요한 정보) -->
        <div
          v-if="diff"
          :class="[
            'shrink-0 rounded-lg px-2.5 py-1 ring-1',
            diff.up
              ? 'bg-emerald-50 dark:bg-emerald-950/40 ring-emerald-200 dark:ring-emerald-800'
              : diff.down
              ? 'bg-rose-50 dark:bg-rose-950/40 ring-rose-200 dark:ring-rose-800'
              : 'bg-stone-50 dark:bg-stone-800 ring-stone-200 dark:ring-stone-700',
          ]"
        >
          <div class="text-[10px] leading-none text-stone-400 dark:text-stone-500 mb-0.5">장비 교체 시</div>
          <div
            :class="[
              'text-sm font-bold tabular-nums leading-none',
              diff.up
                ? 'text-emerald-600 dark:text-emerald-400'
                : diff.down
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-stone-500',
            ]"
          >
            {{ diff.change >= 0 ? '+' : '' }}{{ fmtRound(diff.change) }}
            <span class="text-[11px] font-semibold opacity-80">
              ({{ diff.pct >= 0 ? '+' : '' }}{{ diff.pct.toFixed(2) }}%)
            </span>
          </div>
        </div>

        <div class="hidden sm:block h-8 w-px bg-stone-200 dark:bg-stone-700 shrink-0" />

        <!-- 브레이크다운 — 모바일에선 숨김 -->
        <div class="hidden sm:flex items-center gap-5 shrink-0 text-xs tabular-nums">
          <div title="직접 타격 전투력 — 백/근/상 조건부 환산이 곱해지는 영역">
            <div class="text-[10px] leading-none text-stone-400 dark:text-stone-500 mb-0.5">직접</div>
            <div class="font-bold text-orange-600 dark:text-orange-300">{{ fmtRound(directBP) }}</div>
          </div>
          <div title="소환 타격 전투력 — 조건부 환산 영향 없음">
            <div class="text-[10px] leading-none text-stone-400 dark:text-stone-500 mb-0.5">소환</div>
            <div class="font-bold text-teal-600 dark:text-teal-300">{{ fmtRound(summonBP) }}</div>
          </div>
          <div title="일몬추/일몬지만 적용한 일반 몬스터 상대 전투력">
            <div class="text-[10px] leading-none text-stone-400 dark:text-stone-500 mb-0.5">🗡 vs 일반</div>
            <div class="font-bold text-sky-600 dark:text-sky-300">{{ fmtRound(vsNormal) }}</div>
          </div>
          <div title="보몬추/보몬지만 적용한 보스 몬스터 상대 전투력">
            <div class="text-[10px] leading-none text-stone-400 dark:text-stone-500 mb-0.5">👑 vs 보스</div>
            <div class="font-bold text-violet-600 dark:text-violet-300">{{ fmtRound(vsBoss) }}</div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>
