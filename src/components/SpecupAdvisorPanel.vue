<script setup>
import { computed, ref, watch } from 'vue';
import { calculateBattlePower } from '../utils/battlePower.js';
import { rollOnce as rollAwakening } from '../utils/awakeningSim.js';
import { rollOnce as rollMemorial } from '../utils/memorialSim.js';
import { ROLL_COST as AWAK_ROLL_COST } from '../data/awakeningData.js';
import {
  normalizeAwakeningCard,
  normalizeAwakStoneLoadout,
  normalizeMemorialCard,
} from '../utils/rollEquiv.js';
import { activeMemorialLines, memorialOf } from '../utils/memorialLoadout.js';
import {
  analyzeSlots,
  BUDGETS,
  DEFAULT_BUDGET,
  DEFAULT_SAMPLES,
} from '../utils/specupAdvisor.js';
import { fmt, fmt1, pct } from '../utils/format.js';

const props = defineProps({
  stats: { type: Object, required: true },
  awakStones: { type: Array, default: () => [] },
  memorials: { type: Array, default: () => [] },
});

const SAMPLE_CHOICES = [5000, DEFAULT_SAMPLES, 50000];

const budget = ref(DEFAULT_BUDGET);
const samples = ref(DEFAULT_SAMPLES);
const includeEmpty = ref(false);

const running = ref(false);
const progress = ref(null); // { group, groupIndex, groupCount, done, total }
const result = ref(null);
const stale = ref(false);   // 분석 후 입력이 바뀌면 true — 결과가 이전 상태 기준임을 표시
let cancelFlag = false;

const baseBP = computed(() => calculateBattlePower(props.stats));
const hasStats = computed(() => baseBP.value > 0);

// ── 슬롯 구성 — 저장된 내실을 분석 엔진 입력으로 ─────────────────────
const awakCostText = `재료 ${AWAK_ROLL_COST.material} · 플래티넘 망치 ${AWAK_ROLL_COST.hammer}`;

function buildSlots() {
  const slots = [];

  props.awakStones.forEach((stone, i) => {
    slots.push({
      id: `awak-${i}`,
      label: `각성석 ${i + 1}`,
      system: '각성석',
      group: 'awakening',
      lines: normalizeAwakStoneLoadout(stone),
      rollFn: rollAwakening,
      normalize: normalizeAwakeningCard,
      cost: awakCostText,
    });
  });

  props.memorials.forEach((card, i) => {
    const m = memorialOf(card);
    if (!m) return;
    slots.push({
      id: `memo-${i}`,
      label: `${m.name} #${i + 1}`,
      system: '메모리얼',
      group: `memorial:${card.key}`,
      lines: normalizeMemorialCard(activeMemorialLines(card)),
      rollFn: () => rollMemorial(m),
      normalize: normalizeMemorialCard,
      cost: `조각 ${m.cost.frag} · 결정 ${m.cost.crystal}`,
    });
  });

  return includeEmpty.value ? slots : slots.filter((s) => s.lines.length > 0);
}

const slotCount = computed(() => buildSlots().length);

async function run() {
  if (!hasStats.value || running.value) return;
  const slots = buildSlots();
  if (!slots.length) return;

  running.value = true;
  cancelFlag = false;
  progress.value = null;
  try {
    const r = await analyzeSlots({
      stats: props.stats,
      slots,
      samples: samples.value,
      onProgress: (p) => { progress.value = p; },
      shouldCancel: () => cancelFlag,
    });
    if (r && !r.cancelled) {
      // 표시용 부가 정보(system)를 결과에 되돌려 붙인다.
      const bySlot = new Map(slots.map((s) => [s.id, s]));
      r.slots.forEach((s) => { s.system = bySlot.get(s.id)?.system || ''; });
      result.value = r;
      stale.value = false;
    }
  } finally {
    running.value = false;
    progress.value = null;
  }
}

function cancel() {
  cancelFlag = true;
}

// 입력(스탯·각성석·메모리얼)이 바뀌면 결과는 이전 상태 기준 — 다시 돌리라고 표시만 한다.
watch(
  () => [props.stats, props.awakStones, props.memorials],
  () => { if (result.value) stale.value = true; },
  { deep: true },
);

// ── 정렬·요약 — 예산(N회) 기준 기대 이득 내림차순. 예산을 바꾸면 재계산 없이 다시 정렬한다.
const ranked = computed(() => {
  if (!result.value) return [];
  const N = budget.value;
  return [...result.value.slots].sort((a, b) => b.gainAfter[N] - a.gainAfter[N]);
});

const best = computed(() => ranked.value[0] || null);

const progressPct = computed(() => {
  const p = progress.value;
  if (!p) return 0;
  return ((p.groupIndex + p.done / p.total) / p.groupCount) * 100;
});

const expanded = ref(new Set());
function toggle(id) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

function topPctLabel(p) {
  // percentile = 현재 이하 누적 비율. 0.977 → "상위 2.3%"
  const top = (1 - p) * 100;
  if (top < 0.1) return '상위 0.1% 이내';
  return `상위 ${top.toFixed(1)}%`;
}

function linesTitle(slot) {
  if (slot.empty) return '빈 슬롯';
  return slot.conv.lines.map((l) => `${l.text}${l.convertible ? ` (${fmt1(l.refAmount)})` : ' (환산 제외)'}`).join('\n');
}
</script>

<template>
  <div>
    <p class="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-snug">
      저장된 각성석·메모리얼을 하나씩 "다시 굴렸을 때" 의 크댐환산 분포를 확률표로 표본 추출해,
      현재 카드보다 좋아질 확률과 기대 이득을 비교합니다. 굴려서 나쁘면 이전 카드를 유지한다는 전제입니다.
      순위는 <strong>같은 굴림 횟수</strong>를 쓴다고 했을 때의 기대 이득 기준이며, 재화 종류가 달라 비용은 따로 표기합니다.
    </p>

    <p
      v-if="!hasStats"
      class="text-sm text-stone-500 dark:text-stone-400 py-4 text-center bg-stone-50 dark:bg-stone-900/40 rounded-lg"
    >
      T창 스탯을 먼저 입력하세요 — 환산 기준(전투력)이 없으면 분석할 수 없습니다.
    </p>

    <template v-else>
      <!-- 설정 줄 -->
      <div class="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs mb-3">
        <label class="flex items-center gap-1.5">
          <span class="text-stone-500 dark:text-stone-400">굴림 예산</span>
          <select
            v-model.number="budget"
            class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            <option v-for="n in BUDGETS" :key="n" :value="n">{{ fmt(n) }}회</option>
          </select>
        </label>
        <label class="flex items-center gap-1.5">
          <span class="text-stone-500 dark:text-stone-400">표본 수</span>
          <select
            v-model.number="samples"
            :disabled="running"
            class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            <option v-for="n in SAMPLE_CHOICES" :key="n" :value="n">{{ fmt(n) }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input v-model="includeEmpty" type="checkbox" :disabled="running" class="rounded text-cyan-600 focus:ring-cyan-500" />
          <span class="text-stone-600 dark:text-stone-300">빈 슬롯 포함</span>
        </label>
        <span class="text-stone-400 dark:text-stone-500">분석 대상 {{ slotCount }}개</span>
        <div class="ml-auto flex items-center gap-1.5">
          <button
            v-if="running"
            type="button"
            @click="cancel"
            class="px-3 py-1.5 rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition"
          >
            중단
          </button>
          <button
            type="button"
            @click="run"
            :disabled="running || slotCount === 0"
            class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {{ running ? '분석 중…' : result ? '다시 분석' : '분석 실행' }}
          </button>
        </div>
      </div>

      <p v-if="slotCount === 0" class="text-xs text-stone-400 dark:text-stone-500 italic mb-3">
        분석할 내실이 없습니다. 위의 각성석·메모리얼 섹션에 현재 옵션을 입력하세요
        (값이 하나도 없는 슬롯은 "빈 슬롯 포함" 을 켜야 들어갑니다).
      </p>

      <!-- 진행률 -->
      <div v-if="running" class="mb-3">
        <div class="h-2 rounded bg-stone-100 dark:bg-stone-900/50 overflow-hidden">
          <div class="h-full bg-cyan-500 transition-all" :style="{ width: progressPct.toFixed(1) + '%' }"></div>
        </div>
        <p class="text-[11px] text-stone-400 dark:text-stone-500 mt-1 tabular-nums">
          분포 추출 {{ progress ? `${progress.groupIndex + 1}/${progress.groupCount}` : '' }} · {{ progressPct.toFixed(0) }}%
        </p>
      </div>

      <template v-if="result && ranked.length">
        <p
          v-if="stale"
          class="text-[11px] text-orange-600 dark:text-orange-400 mb-2"
        >
          ⚠ 분석 후 스탯 또는 내실 입력이 바뀌었습니다. 아래 결과는 이전 입력 기준입니다 — "다시 분석" 을 눌러 주세요.
        </p>

        <!-- 추천 요약 -->
        <div
          v-if="best"
          class="rounded-lg bg-cyan-50 dark:bg-cyan-900/20 ring-1 ring-cyan-200 dark:ring-cyan-800 px-3 py-2.5 mb-3 text-sm"
        >
          <span class="text-cyan-800 dark:text-cyan-200 font-semibold">1순위: {{ best.label }}</span>
          <span class="text-stone-600 dark:text-stone-300">
            — {{ fmt(budget) }}회 굴리면 크댐환산 평균
            <strong class="text-cyan-700 dark:text-cyan-300 tabular-nums">+{{ fmt1(best.gainAfter[budget]) }}%급</strong>
            기대 (현재 {{ fmt1(best.current) }} → {{ fmt1(best.expectedAfter[budget]) }}).
            1회 굴려 좋아질 확률 {{ pct(best.pImprove) }}, 1회 비용 {{ best.cost }}.
          </span>
        </div>

        <!-- 순위표 -->
        <div class="overflow-x-auto -mx-1">
          <table class="min-w-full text-xs tabular-nums">
            <thead>
              <tr class="text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                <th class="px-2 py-1.5 text-left font-medium w-8">#</th>
                <th class="px-2 py-1.5 text-left font-medium">슬롯</th>
                <th class="px-2 py-1.5 text-right font-medium">현재</th>
                <th class="px-2 py-1.5 text-right font-medium">분포 위치</th>
                <th class="px-2 py-1.5 text-right font-medium">1회 개선 확률</th>
                <th class="px-2 py-1.5 text-right font-medium">1회당 기대</th>
                <th class="px-2 py-1.5 text-right font-medium text-cyan-700 dark:text-cyan-300">{{ fmt(budget) }}회 기대 이득</th>
                <th class="px-2 py-1.5 text-left font-medium">1회 비용</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(s, i) in ranked" :key="s.id">
                <tr
                  @click="toggle(s.id)"
                  class="border-b border-stone-100 dark:border-stone-800 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-900/40 transition"
                  :class="i === 0 ? 'bg-cyan-50/60 dark:bg-cyan-900/10' : ''"
                >
                  <td class="px-2 py-1.5 text-stone-500 dark:text-stone-400">{{ i + 1 }}</td>
                  <td class="px-2 py-1.5">
                    <span class="text-[10px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300 mr-1">{{ s.system }}</span>
                    <span class="text-stone-800 dark:text-stone-100" :title="linesTitle(s)">{{ s.label }}</span>
                    <span v-if="s.empty" class="ml-1 text-[10px] text-orange-600 dark:text-orange-400">빈 슬롯</span>
                  </td>
                  <td class="px-2 py-1.5 text-right text-stone-700 dark:text-stone-200">{{ fmt1(s.current) }}</td>
                  <td class="px-2 py-1.5 text-right text-stone-500 dark:text-stone-400">{{ s.empty ? '—' : topPctLabel(s.percentile) }}</td>
                  <td class="px-2 py-1.5 text-right text-stone-700 dark:text-stone-200">{{ pct(s.pImprove) }}</td>
                  <td class="px-2 py-1.5 text-right text-stone-700 dark:text-stone-200">+{{ s.gainPerRoll.toFixed(2) }}</td>
                  <td class="px-2 py-1.5 text-right font-semibold text-cyan-700 dark:text-cyan-300">+{{ fmt1(s.gainAfter[budget]) }}</td>
                  <td class="px-2 py-1.5 text-left text-stone-500 dark:text-stone-400 whitespace-nowrap">{{ s.cost }}</td>
                </tr>
                <tr v-if="expanded.has(s.id)" class="border-b border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/30">
                  <td colspan="8" class="px-3 py-2">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <p class="font-semibold text-stone-600 dark:text-stone-300 mb-1">현재 카드</p>
                        <p v-if="s.empty" class="text-stone-400 italic">빈 슬롯 — 무엇이 나와도 이득입니다.</p>
                        <ul v-else class="space-y-0.5">
                          <li v-for="(l, li) in s.conv.lines" :key="li" class="flex justify-between gap-3">
                            <span class="text-stone-700 dark:text-stone-200">{{ l.text }}</span>
                            <span class="text-stone-500 dark:text-stone-400">{{ l.convertible ? `${fmt1(l.refAmount)}%급` : '환산 제외' }}</span>
                          </li>
                        </ul>
                        <p class="mt-1.5 text-stone-500 dark:text-stone-400">
                          개선 성공 시 평균 {{ fmt1(s.meanIfImprove) }} · 개선까지 평균 {{ Number.isFinite(s.expectedRollsToImprove) ? fmt(Math.round(s.expectedRollsToImprove)) + '회' : '표본 내 없음' }}
                        </p>
                      </div>
                      <div>
                        <p class="font-semibold text-stone-600 dark:text-stone-300 mb-1">굴림 횟수별 기대 환산 (현재 유지 포함)</p>
                        <ul class="space-y-0.5">
                          <li v-for="n in result.budgets" :key="n" class="flex justify-between gap-3">
                            <span class="text-stone-500 dark:text-stone-400">{{ fmt(n) }}회</span>
                            <span class="text-stone-700 dark:text-stone-200">
                              {{ fmt1(s.expectedAfter[n]) }}
                              <span class="text-cyan-700 dark:text-cyan-300">(+{{ fmt1(s.gainAfter[n]) }})</span>
                            </span>
                          </li>
                        </ul>
                        <p class="mt-1.5 text-stone-500 dark:text-stone-400">
                          표본 평균 {{ fmt1(s.sampleMean) }} · 중앙값 {{ fmt1(s.sampleMedian) }} · 표본 최고 {{ fmt1(s.sampleMax) }}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <p class="mt-2 text-[10px] text-stone-400 dark:text-stone-500 italic leading-snug">
          ⓘ 표본 {{ fmt(result.samples) }}장 기준 몬테카를로 — 1% 미만 확률은 오차가 큽니다 (표본 수를 늘리면 정밀해집니다).
          환산은 현재 스탯에 옵션을 단독 적용한 ΔBP 기준이라, 한 슬롯을 크게 올린 뒤에는 다른 슬롯의 수치가 조금 달라집니다.
          "최종 ~ 대미지" 는 크리 확률 100% 가정, 크리확률·명중률·방어력 등 BP 무관 옵션은 0 으로 칩니다.
        </p>
      </template>
    </template>
  </div>
</template>
