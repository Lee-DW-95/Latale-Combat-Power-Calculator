<script setup>
import { computed, markRaw, ref, watch } from 'vue';
import { calculateBattlePower } from '../utils/battlePower.js';
import { rollOnce as rollAwakening } from '../utils/awakeningSim.js';
import { rollOnce as rollMemorial } from '../utils/memorialSim.js';
import { rollRuneWord } from '../utils/runeWordSim.js';
import { RUNES, RUNE_SLOTS, scoreOf, gradeOf } from '../data/runeWordData.js';
import {
  normalizeAwakeningCard,
  normalizeAwakStoneLoadout,
  normalizeMemorialCard,
  normalizeRuneWordCard,
} from '../utils/rollEquiv.js';
import {
  activeMemorialLines,
  memorialOf,
  memorialDisplayName,
  isNormalMemorialKey,
} from '../utils/memorialLoadout.js';
import { runewordRows } from '../utils/runewordLoadout.js';
import {
  analyzeSlots,
  expectedAfterRolls,
  slotOutlook,
  ELY_BUDGETS,
  DEFAULT_ELY_BUDGET,
  DEFAULT_SAMPLES,
} from '../utils/specupAdvisor.js';
import { usePrices, PRICE_DEFS } from '../composables/usePrices.js';
import { fmt, fmt1 } from '../utils/format.js';

const props = defineProps({
  stats: { type: Object, required: true },
  awakStones: { type: Array, default: () => [] },
  memorials: { type: Array, default: () => [] },
  runeword: { type: Array, default: () => [] },
});

const SAMPLE_CHOICES = [5000, DEFAULT_SAMPLES, 50000];

const { prices, resetPrices, elyFor } = usePrices();

const budgetEly = ref(DEFAULT_ELY_BUDGET);
const samples = ref(DEFAULT_SAMPLES);
const includeEmpty = ref(false);
const showPrices = ref(false);

const running = ref(false);
const progress = ref(null); // { group, groupIndex, groupCount, done, total }
const result = ref(null);
const stale = ref(false);   // 분석 후 입력이 바뀌면 true — 결과가 이전 상태 기준임을 표시
let cancelFlag = false;

const baseBP = computed(() => calculateBattlePower(props.stats));
const hasStats = computed(() => baseBP.value > 0);

// ── 1회 비용 정의 — 재화 개수. 엘리 환산은 usePrices 시세로 한다 ─────────────
// 각성석: 최종 인던 재료 2종 × 7개 = 14개 + 플래티넘 망치 1개 (사용자 확인 2026-09-11)
const AWAK_COST_ITEMS = [
  { key: 'awakMaterial', count: 14 },
  { key: 'hammer', count: 1 },
];
const RUNE_COST_ITEMS = [{ key: 'runeScroll', count: 1 }];

function memorialCostItems(m) {
  return [
    { key: 'memoFrag', count: m.cost.frag },
    { key: 'memoCrystal', count: m.cost.crystal },
  ];
}

// "억" 단위 표기 — 1.85억 / 21.2억 / 0.45억
function elyLabel(ely) {
  const eok = ely / 1e8;
  if (eok >= 100) return `${fmt(Math.round(eok))}억`;
  if (eok >= 10) return `${eok.toFixed(1)}억`;
  return `${eok.toFixed(2)}억`;
}

// ── 슬롯 구성 — 저장된 내실을 분석 엔진 입력으로 ─────────────────────
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
      cost: '재료 14 (2종×7) · 망치 1',
      costEly: elyFor(AWAK_COST_ITEMS),
    });
  });

  props.memorials.forEach((card, i) => {
    const m = memorialOf(card);
    if (!m) return;
    const name = memorialDisplayName(card.key, card.variant);
    const common = {
      system: '메모리얼',
      group: `memorial:${card.key}`,
      rollFn: () => rollMemorial(m),
      normalize: normalizeMemorialCard,
      cost: `파편 ${m.cost.frag} · 결정 ${m.cost.crystal}`,
      costEly: elyFor(memorialCostItems(m)),
    };
    if (isNormalMemorialKey(card.key)) {
      // 일반: 슬롯 9개가 각각 따로 굴려진다 → 슬롯마다 독립 분석 대상
      card.lines.forEach((line, j) => {
        const active = line.label && Number(line.value) > 0
          ? [{ label: line.label, value: Number(line.value) }]
          : [];
        slots.push({
          ...common,
          id: `memo-${i}-${j}`,
          label: `${name} 슬롯 ${j + 1}`,
          lines: normalizeMemorialCard(active),
        });
      });
      return;
    }
    // 세트: 카드 1장(최대 4줄)이 한 번에 굴려진다
    slots.push({
      ...common,
      id: `memo-${i}`,
      label: `${name} #${i + 1}`,
      lines: normalizeMemorialCard(activeMemorialLines(card)),
    });
  });

  // 룬워드는 캐릭터당 1개 — 빈 칸만 있으면 빈 슬롯
  slots.push({
    id: 'runeword',
    label: '룬워드',
    system: '룬워드',
    group: 'runeword',
    lines: normalizeRuneWordCard(runewordRows(props.runeword)),
    rollFn: rollRuneWord,
    normalize: (r) => normalizeRuneWordCard(r.rows),
    cost: '스크롤 1',
    costEly: elyFor(RUNE_COST_ITEMS),
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
      // 표시용 부가 정보(system)를 결과에 되돌려 붙이고, 표본 배열은 반응형에서 뺀다 (수만 개 × 그룹).
      const bySlot = new Map(slots.map((s) => [s.id, s]));
      r.slots.forEach((s) => { s.system = bySlot.get(s.id)?.system || ''; });
      r.dist = markRaw(r.dist);
      // 룬워드 점수 기준(info 사이트 점수) 분포 — 환산 순위와 별개로 룬워드 행에 병기한다.
      //   점수는 BP 계산이 없어 빠르므로 여기서 바로 표본을 만든다.
      if (r.slots.some((s) => s.group === 'runeword')) {
        const n = samples.value;
        const scores = new Float64Array(n);
        for (let i = 0; i < n; i += 1) scores[i] = rollRuneWord().total;
        scores.sort();
        const cur = currentRuneScore();
        r.runeScore = markRaw({ sorted: scores, current: cur, ...slotOutlook(scores, cur, r.budgets) });
      }
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

// 지금 장착한 룬워드의 info 사이트 점수 (왕룬 2배, 통찰 왕룬 120 고정)
function currentRuneScore() {
  let total = 0;
  (props.runeword || []).forEach((id, i) => {
    if (id === null || id === undefined || !RUNES[id]) return;
    total += scoreOf(RUNES[id], i === RUNE_SLOTS - 1);
  });
  return total;
}

// 룬워드 점수 기준 — 예산(굴림 횟수) 소진 시 기대 점수
function runeScoreAtBudget(rolls) {
  const rs = result.value?.runeScore;
  if (!rs) return null;
  const e = rolls > 0 ? expectedAfterRolls(rs.sorted, rs.current, rolls) : rs.current;
  return { expected: e, gain: e - rs.current };
}

function runeScoreCurve() {
  const rs = result.value?.runeScore;
  const s = ranked.value.find((x) => x.group === 'runeword');
  if (!rs || !s) return [];
  return ELY_BUDGETS.map((B) => {
    const rolls = s.costEly > 0 ? Math.floor(B / s.costEly) : 0;
    const e = rolls > 0 ? expectedAfterRolls(rs.sorted, rs.current, rolls) : rs.current;
    return { budget: B, rolls, expected: e, gain: e - rs.current };
  });
}

// 입력(스탯·각성석·메모리얼·룬워드)이 바뀌면 결과는 이전 상태 기준 — 다시 돌리라고 표시만 한다.
//   시세 변경은 분포와 무관하므로(비용만 바뀜) 재분석 없이 아래 computed 가 바로 반영한다.
watch(
  () => [props.stats, props.awakStones, props.memorials, props.runeword],
  () => { if (result.value) stale.value = true; },
  { deep: true },
);

// ── 예산 기준 순위 — 슬롯마다 굴릴 수 있는 횟수 floor(예산 / 1회 비용) 로 기대 이득 ──
//   시세·예산을 바꾸면 분포는 그대로이므로 재분석 없이 여기서만 다시 계산한다.
const ranked = computed(() => {
  const r = result.value;
  if (!r) return [];
  const B = budgetEly.value;
  const rows = r.slots.map((s) => {
    // 시세가 바뀌었을 수 있으니 비용은 분석 시점 값이 아니라 지금 시세로 다시 구한다
    const costEly = currentCostEly(s);
    const rolls = costEly > 0 ? Math.floor(B / costEly) : 0;
    const sorted = r.dist.get(s.group);
    const expected = rolls > 0 ? expectedAfterRolls(sorted, s.current, rolls) : s.current;
    return {
      ...s,
      costEly,
      rolls,
      expectedAtBudget: expected,
      gainAtBudget: expected - s.current,
      gainPer100M: costEly > 0 ? (s.gainPerRoll / costEly) * 1e8 : null,
    };
  });
  return rows.sort((a, b) => b.gainAtBudget - a.gainAtBudget || (b.gainPer100M ?? 0) - (a.gainPer100M ?? 0));
});

function currentCostEly(slot) {
  if (slot.group === 'awakening') return elyFor(AWAK_COST_ITEMS);
  if (slot.group === 'runeword') return elyFor(RUNE_COST_ITEMS);
  if (slot.group.startsWith('memorial:')) {
    const m = memorialOf({ key: slot.group.slice('memorial:'.length) });
    return m ? elyFor(memorialCostItems(m)) : 0;
  }
  return slot.costEly || 0;
}

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

// ── 희귀도 — "굴렸을 때 지금보다 좋은 카드가 나올 확률" p 를 사람이 읽는 말로 ─────
//   확률표 기준이라 다른 유저와 무관하게 "지금 카드가 얼마나 귀한가" 를 뜻한다.
//   체력/방어력처럼 환산 0 인 옵션은 값이 아무리 커도 잡옵으로 취급된다.
function rarityLabel(p) {
  if (!(p > 0)) return '표본 내 최고';
  const top = p * 100;
  const oneIn = Math.round(1 / p);
  if (top < 0.1) return `상위 0.1% 이내 · ${fmt(oneIn)}장 중 1장급`;
  if (top < 1) return `상위 ${top.toFixed(2)}% · ${fmt(oneIn)}장 중 1장급`;
  if (top < 20) return `상위 ${top.toFixed(1)}% · ${fmt(oneIn)}장 중 1장급`;
  return `상위 ${top.toFixed(0)}% · 흔함`;
}
function rarityTitle(p) {
  if (!(p > 0)) return `표본 ${fmt(result.value?.samples || 0)}장 중 지금보다 좋은 카드가 한 장도 없음`;
  return `이 슬롯을 다시 굴리면 ${(p * 100).toFixed(2)}% 확률로만 지금보다 좋은 카드가 나온다 (평균 ${fmt(Math.round(1 / p))}회에 1장)`;
}
function rarityClass(p) {
  if (!(p > 0) || p < 0.001) return 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300';
  if (p < 0.01) return 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300';
  if (p < 0.2) return 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300';
  return 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500';
}

// 펼친 행의 "예산별 기대" 표 — 예산 후보 전체에 대해 즉석 계산
function budgetCurve(slot) {
  const sorted = result.value?.dist.get(slot.group);
  if (!sorted) return [];
  return ELY_BUDGETS.map((B) => {
    const rolls = slot.costEly > 0 ? Math.floor(B / slot.costEly) : 0;
    const e = rolls > 0 ? expectedAfterRolls(sorted, slot.current, rolls) : slot.current;
    return { budget: B, rolls, expected: e, gain: e - slot.current };
  });
}

// 시세 입력은 "만 엘리" 단위로 받는다 (250 → 250만)
function priceMan(key) {
  return Math.round((Number(prices.value[key]) || 0) / 1e4);
}
function setPriceMan(key, raw) {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return;
  prices.value[key] = Math.round(v * 1e4);
}
</script>

<template>
  <div>
    <p class="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-snug">
      저장된 각성석·메모리얼·룬워드를 하나씩 "다시 굴렸을 때" 의 크댐환산 분포를 확률표로 표본 추출해,
      현재 옵션보다 좋아질 확률과 기대 이득을 구합니다. 재화가 다른 내실끼리 비교하기 위해 1회 비용을
      시세로 <strong>엘리 환산</strong>하고, <strong>같은 엘리 예산</strong>을 어디에 쓰는 게 기대 이득이 큰지로 순위를 매깁니다.
      굴려서 나쁘면 이전 옵션을 유지한다는 전제입니다.
    </p>

    <p
      v-if="!hasStats"
      class="text-sm text-stone-500 dark:text-stone-400 py-4 text-center bg-stone-50 dark:bg-stone-900/40 rounded-lg"
    >
      T창 스탯을 먼저 입력하세요 — 환산 기준(전투력)이 없으면 분석할 수 없습니다.
    </p>

    <template v-else>
      <!-- 설정 줄 -->
      <div class="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs mb-2">
        <label class="flex items-center gap-1.5">
          <span class="text-stone-500 dark:text-stone-400">엘리 예산</span>
          <select
            v-model.number="budgetEly"
            class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            <option v-for="b in ELY_BUDGETS" :key="b" :value="b">{{ elyLabel(b) }}</option>
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
        <button
          type="button"
          @click="showPrices = !showPrices"
          class="px-2 py-1 rounded ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition"
        >
          💰 시세 {{ showPrices ? '접기' : '설정' }}
        </button>
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

      <!-- 시세 편집 — 만 엘리 단위 -->
      <div
        v-if="showPrices"
        class="rounded-md ring-1 ring-stone-200 dark:ring-stone-700 px-3 py-2 mb-3 text-xs"
      >
        <div class="flex items-center justify-between mb-1.5">
          <span class="font-semibold text-stone-600 dark:text-stone-300">재화 시세 (만 엘리 단위, 브라우저에 저장)</span>
          <button type="button" @click="resetPrices" class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition">기본값</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
          <label v-for="d in PRICE_DEFS" :key="d.key" class="flex items-center gap-2">
            <span class="flex-1 text-stone-600 dark:text-stone-300" :title="d.note || ''">{{ d.label }}</span>
            <input
              :value="priceMan(d.key)"
              @input="(e) => setPriceMan(d.key, e.target.value)"
              type="number"
              min="0"
              step="1"
              class="w-24 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-1.5 py-1 text-xs text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
            <span class="text-stone-400 w-4">만</span>
          </label>
        </div>
        <p class="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
          1회 비용 → 각성석 {{ elyLabel(elyFor(AWAK_COST_ITEMS)) }} · 룬워드 {{ elyLabel(elyFor(RUNE_COST_ITEMS)) }} ·
          메모리얼은 종류별 (세트 파편 20~40 + 결정 3, 일반 파편 0.5~4 + 결정 0.5~1)
        </p>
      </div>

      <p v-if="slotCount === 0" class="text-xs text-stone-400 dark:text-stone-500 italic mb-3">
        분석할 내실이 없습니다. 위의 각성석·메모리얼·룬워드 섹션에 현재 옵션을 입력하세요
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
            — {{ elyLabel(budgetEly) }} 예산이면 {{ fmt(best.rolls) }}회 굴릴 수 있고, 크댐환산 평균
            <strong class="text-cyan-700 dark:text-cyan-300 tabular-nums">+{{ fmt1(best.gainAtBudget) }}%급</strong>
            기대 (현재 {{ fmt1(best.current) }} → {{ fmt1(best.expectedAtBudget) }}).
            지금 카드는 {{ best.empty ? '빈 슬롯' : rarityLabel(best.pImprove) }}이고, 1회 {{ elyLabel(best.costEly) }}로
            개선까지 평균 {{ Number.isFinite(best.expectedRollsToImprove) ? fmt(Math.round(best.expectedRollsToImprove)) + '회' : '—' }}
            (엘리 1억당 기대 +{{ best.gainPer100M !== null ? best.gainPer100M.toFixed(2) : '—' }}).
          </span>
        </div>

        <!-- 순위표 — 슬롯마다 "지금 카드가 얼마나 귀한가 / 굴리면 어떻게 되나 / 예산을 쓰면" 세 칸 -->
        <div class="overflow-x-auto -mx-1">
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                <th class="px-2 py-1.5 text-left font-medium w-8">#</th>
                <th class="px-2 py-1.5 text-left font-medium">슬롯</th>
                <th
                  class="px-2 py-1.5 text-left font-medium cursor-help underline decoration-dotted"
                  title="크댐환산과, 이 슬롯을 다시 굴렸을 때 나오는 카드들 사이에서의 위치. '상위 5%' = 굴린 카드 100장 중 5장만 지금보다 좋다 = 20장 중 1장급. 다른 유저와 비교한 값이 아니라 확률표 기준 희귀도"
                >현재 카드</th>
                <th
                  class="px-2 py-1.5 text-left font-medium cursor-help underline decoration-dotted"
                  title="지금보다 좋은 카드가 나올 때까지 평균 몇 회(얼마)가 드는지, 그리고 그때 카드의 평균 크댐환산"
                >굴리면</th>
                <th
                  class="px-2 py-1.5 text-right font-medium text-cyan-700 dark:text-cyan-300 cursor-help underline decoration-dotted whitespace-nowrap"
                  title="예산 전부를 이 슬롯에 썼을 때 기대되는 크댐환산 상승. 아래 작은 글씨는 지금 상태에서 1회 굴렸을 때 엘리 1억당 기대 상승 (한계 효율)"
                >{{ elyLabel(budgetEly) }} 예산 기대 이득</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(s, i) in ranked" :key="s.id">
                <tr
                  @click="toggle(s.id)"
                  class="border-b border-stone-100 dark:border-stone-800 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-900/40 transition align-top"
                  :class="i === 0 ? 'bg-cyan-50/60 dark:bg-cyan-900/10' : ''"
                >
                  <td class="px-2 py-2 text-stone-500 dark:text-stone-400 tabular-nums">{{ i + 1 }}</td>
                  <td class="px-2 py-2 whitespace-nowrap">
                    <span class="text-[10px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300 mr-1">{{ s.system }}</span>
                    <span class="text-stone-800 dark:text-stone-100">{{ s.label }}</span>
                    <span class="ml-1 text-[10px] text-stone-400 dark:text-stone-500">1회 {{ elyLabel(s.costEly) }}</span>
                  </td>
                  <td class="px-2 py-2 whitespace-nowrap">
                    <template v-if="s.empty">
                      <span class="text-orange-600 dark:text-orange-400 font-semibold">빈 슬롯</span>
                    </template>
                    <template v-else>
                      <span class="font-semibold text-stone-800 dark:text-stone-100 tabular-nums">{{ fmt1(s.current) }}%급</span>
                      <span
                        class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
                        :class="rarityClass(s.pImprove)"
                        :title="rarityTitle(s.pImprove)"
                      >{{ rarityLabel(s.pImprove) }}</span>
                      <div v-if="s.group === 'runeword' && result.runeScore" class="mt-1 text-[10px] text-stone-500 dark:text-stone-400 tabular-nums">
                        점수 <strong class="text-stone-700 dark:text-stone-200">{{ result.runeScore.current }}점</strong>
                        ({{ gradeOf(result.runeScore.current).label }})
                        <span class="ml-1 px-1.5 py-0.5 rounded-full" :class="rarityClass(result.runeScore.pImprove)" :title="'점수 기준: ' + rarityTitle(result.runeScore.pImprove)">{{ rarityLabel(result.runeScore.pImprove) }}</span>
                      </div>
                    </template>
                  </td>
                  <td class="px-2 py-2 text-stone-600 dark:text-stone-300 whitespace-nowrap tabular-nums">
                    <template v-if="s.pImprove > 0">
                      개선까지 평균 <strong class="text-stone-800 dark:text-stone-100">{{ fmt(Math.round(s.expectedRollsToImprove)) }}회</strong>
                      <span class="text-stone-400 dark:text-stone-500">≈ {{ elyLabel(s.expectedRollsToImprove * s.costEly) }}</span>
                      <span class="text-stone-400 dark:text-stone-500 mx-1">·</span>
                      성공하면 평균 <strong class="text-stone-800 dark:text-stone-100">{{ fmt1(s.meanIfImprove) }}%급</strong>
                    </template>
                    <span v-else class="text-stone-400 dark:text-stone-500 italic">표본 {{ fmt(result.samples) }}장 중 더 좋은 카드 없음</span>
                    <div v-if="s.group === 'runeword' && result.runeScore" class="mt-1 text-[10px] text-stone-500 dark:text-stone-400">
                      점수 기준:
                      <template v-if="result.runeScore.pImprove > 0">
                        개선까지 평균 <strong class="text-stone-700 dark:text-stone-200">{{ fmt(Math.round(result.runeScore.expectedRollsToImprove)) }}회</strong>
                        ≈ {{ elyLabel(result.runeScore.expectedRollsToImprove * s.costEly) }} ·
                        성공하면 평균 <strong class="text-stone-700 dark:text-stone-200">{{ Math.round(result.runeScore.meanIfImprove) }}점</strong>
                      </template>
                      <span v-else class="italic">표본 내 더 높은 점수 없음</span>
                    </div>
                  </td>
                  <td class="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    <div class="font-semibold text-cyan-700 dark:text-cyan-300">
                      +{{ fmt1(s.gainAtBudget) }}
                      <span class="font-normal text-stone-400 dark:text-stone-500">({{ fmt(s.rolls) }}회)</span>
                    </div>
                    <div class="text-[10px] text-stone-400 dark:text-stone-500">
                      1억당 {{ s.gainPer100M !== null ? '+' + s.gainPer100M.toFixed(2) : '—' }}
                    </div>
                    <div v-if="s.group === 'runeword' && result.runeScore && runeScoreAtBudget(s.rolls)" class="mt-1 text-[10px] text-stone-500 dark:text-stone-400">
                      점수 <strong class="text-stone-700 dark:text-stone-200">+{{ Math.round(runeScoreAtBudget(s.rolls).gain) }}점</strong>
                      (기대 {{ Math.round(runeScoreAtBudget(s.rolls).expected) }}점)
                    </div>
                  </td>
                </tr>
                <tr v-if="expanded.has(s.id)" class="border-b border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/30">
                  <td colspan="5" class="px-3 py-2">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <p class="font-semibold text-stone-600 dark:text-stone-300 mb-1">현재 옵션</p>
                        <p v-if="s.empty" class="text-stone-400 italic">빈 슬롯 — 무엇이 나와도 이득입니다.</p>
                        <ul v-else class="space-y-0.5">
                          <li v-for="(l, li) in s.conv.lines" :key="li" class="flex justify-between gap-3">
                            <span class="text-stone-700 dark:text-stone-200">{{ l.text }}</span>
                            <span class="text-stone-500 dark:text-stone-400 whitespace-nowrap">{{ l.convertible ? `${fmt1(l.refAmount)}%급` : '환산 제외' }}</span>
                          </li>
                        </ul>
                        <p class="mt-1.5 text-stone-500 dark:text-stone-400">
                          {{ s.empty ? '' : rarityTitle(s.pImprove) + ' · ' }}1회당 기대 +{{ s.gainPerRoll.toFixed(2) }} ·
                          1회 비용 {{ s.cost }} = {{ elyLabel(s.costEly) }}
                        </p>
                      </div>
                      <div>
                        <p class="font-semibold text-stone-600 dark:text-stone-300 mb-1">예산별 기대 환산 (현재 유지 포함)</p>
                        <ul class="space-y-0.5">
                          <li v-for="row in budgetCurve(s)" :key="row.budget" class="flex justify-between gap-3">
                            <span class="text-stone-500 dark:text-stone-400">{{ elyLabel(row.budget) }} <span class="text-stone-400">({{ fmt(row.rolls) }}회)</span></span>
                            <span class="text-stone-700 dark:text-stone-200">
                              {{ fmt1(row.expected) }}
                              <span class="text-cyan-700 dark:text-cyan-300">(+{{ fmt1(row.gain) }})</span>
                            </span>
                          </li>
                        </ul>
                        <p class="mt-1.5 text-stone-500 dark:text-stone-400">
                          굴린 카드 표본: 평균 {{ fmt1(s.sampleMean) }} · 중앙값 {{ fmt1(s.sampleMedian) }} · 최고 {{ fmt1(s.sampleMax) }}
                        </p>
                        <template v-if="s.group === 'runeword' && result.runeScore">
                          <p class="font-semibold text-stone-600 dark:text-stone-300 mt-3 mb-1">
                            룬워드 점수 기준 (info 사이트 점수 · 참고용, 순위에는 안 씀)
                          </p>
                          <ul class="space-y-0.5">
                            <li v-for="row in runeScoreCurve()" :key="row.budget" class="flex justify-between gap-3">
                              <span class="text-stone-500 dark:text-stone-400">{{ elyLabel(row.budget) }} <span class="text-stone-400">({{ fmt(row.rolls) }}회)</span></span>
                              <span class="text-stone-700 dark:text-stone-200">
                                {{ Math.round(row.expected) }}점
                                <span class="text-cyan-700 dark:text-cyan-300">(+{{ Math.round(row.gain) }})</span>
                              </span>
                            </li>
                          </ul>
                          <p class="mt-1.5 text-stone-500 dark:text-stone-400">
                            점수 표본: 평균 {{ Math.round(result.runeScore.sampleMean) }} · 중앙값 {{ Math.round(result.runeScore.sampleMedian) }} · 최고 {{ Math.round(result.runeScore.sampleMax) }} ·
                            지금 {{ result.runeScore.current }}점보다 높을 확률 {{ (result.runeScore.pImprove * 100).toFixed(2) }}%
                          </p>
                        </template>
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
          예산 기대 이득은 예산 전부를 그 슬롯 하나에 쓴다고 가정한 값이라 순서를 정하는 용도이고, 배분 계획은 아닙니다 —
          굴려서 카드가 좋아지면 개선 확률이 떨어지므로, 새 옵션을 저장한 뒤 다시 분석해 "1억당 기대" 가 가장 큰 곳으로 옮겨 가는 방식을 권합니다.
          환산은 현재 스탯에 옵션을 단독 적용한 ΔBP 기준이라, 한 슬롯을 크게 올린 뒤에는 다른 슬롯의 수치가 조금 달라집니다.
          "최종 ~ 대미지" 는 크리 확률 100% 가정, 크리확률·명중률·방어력·체력 등 BP 무관 옵션은 0 으로 칩니다.
        </p>
      </template>
    </template>
  </div>
</template>
