<script setup>
import { computed, markRaw, ref, toRaw, watch } from 'vue';
import { calculateBattlePower } from '../utils/battlePower.js';
import { RUNES, RUNE_SLOTS, scoreOf, gradeOf } from '../data/runeWordData.js';
import {
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
  expectedAfterRolls,
  winnerProfile,
  ELY_BUDGETS,
  DEFAULT_ELY_BUDGET,
  DEFAULT_SAMPLES,
} from '../utils/specupAdvisor.js';
import { pickLines } from '../utils/specupSlots.js';
import { runSpecupAnalysis } from '../utils/specupAdvisorRunner.js';
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

// 보기 필터 — 시스템별로만 순위를 보고 싶을 때 ("메모리얼 중 무엇부터")
const SYSTEM_FILTERS = ['전체', '각성석', '메모리얼', '룬워드'];
const systemFilter = ref('전체');

// 정렬 기준 — 기본은 엘리 예산 기대 이득(재화가 다른 내실을 한 줄에 세우는 유일한 기준).
//   나머지는 비용을 뺀 관점: 1회당 기대(확률×폭) / 개선 확률(가장 후진 카드) / 개선 시 폭(터졌을 때 상승).
const SORT_KEYS = [
  { key: 'budget', label: '엘리 예산 기대 이득', desc: '예산을 이 슬롯에 다 썼을 때 기대 상승 (비용 반영)' },
  { key: 'perRoll', label: '1회당 기대 이득', desc: '한 번 굴렸을 때 평균 상승 = 개선 확률 × 폭 (비용 무시)' },
  { key: 'pImprove', label: '개선 확률', desc: '굴려서 좋아질 확률이 높은 순 = 자기 분포에서 가장 후진 카드부터' },
  { key: 'ifImprove', label: '개선 시 상승 폭', desc: '성공했을 때 평균 얼마나 오르나 (확률 무시)' },
];
const sortKey = ref('budget');
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

// ── 슬롯 구성 — 저장된 내실을 분석 엔진 입력(직렬화 가능한 설명자)으로 ─────────
//   함수(rollFn/normalize)는 워커로 못 보내므로 kind 만 적고, 계산하는 쪽이 specupSlots.resolveSlot 으로 복원한다.
function buildSlots(scope = systemFilter.value) {
  const slots = [];

  props.awakStones.forEach((stone, i) => {
    slots.push({
      id: `awak-${i}`,
      label: `각성석 ${i + 1}`,
      system: '각성석',
      group: 'awakening',
      kind: 'awakening',
      lines: pickLines(normalizeAwakStoneLoadout(stone)),
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
      kind: 'memorial',
      memorialKey: card.key,
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
          lines: pickLines(normalizeMemorialCard(active)),
        });
      });
      return;
    }
    // 세트: 카드 1장(최대 4줄)이 한 번에 굴려진다
    slots.push({
      ...common,
      id: `memo-${i}`,
      label: `${name} #${i + 1}`,
      lines: pickLines(normalizeMemorialCard(activeMemorialLines(card))),
    });
  });

  // 룬워드는 캐릭터당 1개 — 빈 칸만 있으면 빈 슬롯
  slots.push({
    id: 'runeword',
    label: '룬워드',
    system: '룬워드',
    group: 'runeword',
    kind: 'runeword',
    lines: pickLines(normalizeRuneWordCard(runewordRows(props.runeword))),
    cost: '스크롤 1',
    costEly: elyFor(RUNE_COST_ITEMS),
  });

  const scoped = scope === '전체' ? slots : slots.filter((s) => s.system === scope);
  return includeEmpty.value ? scoped : scoped.filter((s) => s.lines.length > 0);
}

// 시스템별 후보 수 (빈 슬롯 포함 여부 반영) — 분석 대상 칩에 표시
const candidateCounts = computed(() => {
  const out = { 전체: 0, 각성석: 0, 메모리얼: 0, 룬워드: 0 };
  for (const s of buildSlots('전체')) {
    out.전체 += 1;
    if (out[s.system] !== undefined) out[s.system] += 1;
  }
  return out;
});

const slotCount = computed(() => buildSlots().length);

async function run() {
  if (!hasStats.value || running.value) return;
  const slots = buildSlots();
  if (!slots.length) return;

  running.value = true;
  cancelFlag = false;
  progress.value = null;
  try {
    // 워커(없으면 메인 스레드)에서 표본 추출. stats 는 반응형 프록시라 평범한 객체로 복사해 넘긴다.
    //   룬워드 점수 기준(info 사이트 점수) 분포도 같이 낸다 — 환산 순위와 별개로 룬워드 행에 병기.
    const r = await runSpecupAnalysis({
      stats: JSON.parse(JSON.stringify(toRaw(props.stats))),
      slots,
      samples: samples.value,
      runeScoreCurrent: currentRuneScore(),
      onProgress: (p) => { progress.value = p; },
      shouldCancel: () => cancelFlag,
    });
    if (r && !r.cancelled) {
      // 표시용 부가 정보(system)를 결과에 되돌려 붙이고, 표본 배열은 반응형에서 뺀다 (수만 개 × 그룹).
      const bySlot = new Map(slots.map((s) => [s.id, s]));
      r.slots.forEach((s) => { s.system = bySlot.get(s.id)?.system || ''; });
      r.dist = markRaw(r.dist);
      r.cards = markRaw(r.cards);
      if (r.runeScore) r.runeScore = markRaw(r.runeScore);
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

// 펼침 행 — "성공하면 어떤 카드인가" 예시·옵션 통계 (표본 카드 보관분에서)
function winnerInfo(slot) {
  const store = result.value?.cards?.get(slot.group);
  if (!store) return null;
  return winnerProfile(store, slot.current, slot.meanIfImprove, 3);
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
// 분석 대상을 바꾸면 결과 표는 즉시 그 시스템만 남기고(재정렬), 누락된 시스템이 있을 수 있으니 재분석을 권한다.
watch(systemFilter, (f) => {
  if (!result.value) return;
  const have = new Set(result.value.slots.map((s) => s.system));
  const need = f === '전체' ? ['각성석', '메모리얼', '룬워드'].filter((k) => candidateCounts.value[k] > 0) : [f];
  if (need.some((k) => !have.has(k))) stale.value = true;
});

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
  const filtered = systemFilter.value === '전체' ? rows : rows.filter((r) => r.system === systemFilter.value);
  const k = sortKey.value;
  const metric = (r) => {
    if (k === 'perRoll') return r.gainPerRoll;
    if (k === 'pImprove') return r.pImprove;
    if (k === 'ifImprove') return r.pImprove > 0 ? r.meanIfImprove - r.current : -Infinity;
    return r.gainAtBudget;
  };
  return filtered.sort((a, b) => metric(b) - metric(a) || b.gainAtBudget - a.gainAtBudget || (b.gainPer100M ?? 0) - (a.gainPer100M ?? 0));
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

// 희귀도 점 색 — 주황: 1,000장 중 1장급 이상 / 청록: 100장 중 1장급 / 회색: 그 이하
function rarityDot(p) {
  if (!(p > 0) || p < 0.001) return 'bg-orange-500';
  if (p < 0.01) return 'bg-cyan-500';
  if (p < 0.2) return 'bg-stone-400';
  return 'bg-stone-300 dark:bg-stone-600';
}

// 목록 막대 — 현재 정렬 기준의 1순위 대비 비율. 예산 기준이면 기대 이득, 그 외엔 해당 지표
function gainBarPct(slot) {
  const rows = ranked.value;
  if (!rows.length) return 0;
  const k = sortKey.value;
  const metric = (r) => {
    if (k === 'perRoll') return r.gainPerRoll;
    if (k === 'pImprove') return r.pImprove;
    if (k === 'ifImprove') return r.pImprove > 0 ? r.meanIfImprove - r.current : 0;
    return r.gainAtBudget;
  };
  const max = Math.max(...rows.map(metric));
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(100, (metric(slot) / max) * 100));
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

// "1억당 기대" 표기 — 값이 작아도 차이가 보이게 유효숫자 2자리 (0.0085 와 0.009 가 둘 다 0.01 로 뭉개지지 않게)
function fmtPerEok(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '+0';
  const abs = Math.abs(v);
  const digits = abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4;
  return (v > 0 ? '+' : '') + v.toFixed(digits);
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
  <div class="space-y-4">
    <p class="text-xs leading-relaxed text-stone-500 dark:text-stone-400">
      저장된 각성석·메모리얼·룬워드를 하나씩 "다시 굴렸을 때" 의 크댐환산 분포를 확률표로 표본 추출해
      현재 옵션과 비교합니다. 재화가 다른 내실을 한 줄에 세우기 위해 1회 비용을 시세로 엘리 환산하고,
      <strong class="font-medium text-stone-700 dark:text-stone-200">같은 엘리 예산</strong>을 어디에 쓰는 게 기대 이득이 큰지로 순위를 매깁니다.
      굴려서 나쁘면 이전 옵션을 유지한다는 전제입니다.
    </p>

    <div
      v-if="!hasStats"
      class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
    >
      T창 스탯을 먼저 입력하세요 — 환산 기준(전투력)이 없으면 분석할 수 없습니다.
    </div>

    <template v-else>
      <!-- ── 설정 ─────────────────────────────────────────── -->
      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 p-3 sm:p-4 space-y-3">
        <!-- 분석 대상: 세그먼트 컨트롤 -->
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">분석 대상</span>
          <div class="inline-flex rounded-lg bg-stone-100 dark:bg-stone-900/60 p-0.5">
            <button
              v-for="f in SYSTEM_FILTERS"
              :key="f"
              type="button"
              @click="systemFilter = f"
              :disabled="running || (f !== '전체' && candidateCounts[f] === 0)"
              class="px-3 py-1.5 rounded-md text-xs font-medium transition disabled:opacity-35 disabled:cursor-not-allowed"
              :class="systemFilter === f
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-50 shadow-sm ring-1 ring-stone-200 dark:ring-stone-600'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100'"
            >
              {{ f }}
              <span class="ml-1 tabular-nums text-stone-400 dark:text-stone-500">{{ candidateCounts[f] }}</span>
            </button>
          </div>
        </div>

        <!-- 예산 · 표본 · 옵션 · 실행 -->
        <div class="flex items-end gap-x-4 gap-y-3 flex-wrap">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">엘리 예산</span>
            <select
              v-model.number="budgetEly"
              class="h-9 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option v-for="b in ELY_BUDGETS" :key="b" :value="b">{{ elyLabel(b) }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">표본 수</span>
            <select
              v-model.number="samples"
              :disabled="running"
              class="h-9 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option v-for="n in SAMPLE_CHOICES" :key="n" :value="n">{{ fmt(n) }}장</option>
            </select>
          </label>
          <label class="flex items-center gap-2 h-9 cursor-pointer text-sm text-stone-600 dark:text-stone-300">
            <input v-model="includeEmpty" type="checkbox" :disabled="running" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" />
            빈 슬롯 포함
          </label>
          <button
            type="button"
            @click="showPrices = !showPrices"
            class="h-9 px-3 rounded-lg text-sm ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition"
          >
            시세 {{ showPrices ? '닫기' : '설정' }}
          </button>
          <span class="h-9 inline-flex items-center text-xs text-stone-400 dark:text-stone-500 tabular-nums">대상 {{ slotCount }}개</span>
          <div class="ml-auto flex items-center gap-2">
            <button
              v-if="running"
              type="button"
              @click="cancel"
              class="h-9 px-3 rounded-lg text-sm ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition"
            >
              중단
            </button>
            <button
              type="button"
              @click="run"
              :disabled="running || slotCount === 0"
              class="h-9 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {{ running ? '분석 중…' : result ? '다시 분석' : '분석 실행' }}
            </button>
          </div>
        </div>

        <!-- 시세 -->
        <div v-if="showPrices" class="rounded-lg bg-stone-50 dark:bg-stone-900/40 ring-1 ring-stone-200 dark:ring-stone-700 p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">재화 시세 · 만 엘리</span>
            <button type="button" @click="resetPrices" class="text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition">기본값으로</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            <label v-for="d in PRICE_DEFS" :key="d.key" class="flex items-center justify-between gap-3 text-sm">
              <span class="text-stone-600 dark:text-stone-300" :title="d.note || ''">{{ d.label }}</span>
              <span class="inline-flex items-center rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 overflow-hidden">
                <input
                  :value="priceMan(d.key)"
                  @input="(e) => setPriceMan(d.key, e.target.value)"
                  type="number"
                  min="0"
                  step="1"
                  class="w-24 h-8 border-0 bg-transparent text-stone-900 dark:text-stone-100 px-2 text-sm text-right tabular-nums focus:outline-none"
                />
                <span class="px-2 text-xs text-stone-400 border-l border-stone-200 dark:border-stone-700 h-8 inline-flex items-center">만</span>
              </span>
            </label>
          </div>
          <p class="mt-2 text-xs text-stone-500 dark:text-stone-400 tabular-nums">
            1회 비용 — 각성석 {{ elyLabel(elyFor(AWAK_COST_ITEMS)) }} · 룬워드 {{ elyLabel(elyFor(RUNE_COST_ITEMS)) }} · 메모리얼은 종류별 (세트 파편 20~40 + 결정 3 · 일반 파편 0.5~4 + 결정 0.5~1)
          </p>
        </div>

        <p v-if="slotCount === 0" class="text-xs text-stone-500 dark:text-stone-400">
          분석할 내실이 없습니다. 위의 각성석·메모리얼·룬워드 섹션에 현재 옵션을 입력하세요
          (값이 하나도 없는 슬롯은 "빈 슬롯 포함" 을 켜야 들어갑니다).
        </p>

        <div v-if="running">
          <div class="h-1.5 rounded-full bg-stone-100 dark:bg-stone-900/60 overflow-hidden">
            <div class="h-full bg-cyan-500 transition-all" :style="{ width: progressPct.toFixed(1) + '%' }"></div>
          </div>
          <p class="mt-1.5 text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
            분포 추출 {{ progress ? `${progress.groupIndex + 1}/${progress.groupCount}` : '' }} · {{ progressPct.toFixed(0) }}%
          </p>
        </div>
      </div>

      <!-- ── 결과 ─────────────────────────────────────────── -->
      <template v-if="result && ranked.length">
        <p v-if="stale" class="text-xs text-orange-600 dark:text-orange-400">
          분석 후 입력(스탯·내실) 또는 분석 대상이 바뀌었습니다. 아래 결과는 이전 분석 기준입니다 — "다시 분석" 을 눌러 주세요.
        </p>

        <!-- 추천 -->
        <div
          v-if="best"
          class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 border-l-4 border-cyan-500 px-4 py-3 flex items-center gap-4 flex-wrap"
        >
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">
              {{ systemFilter === '전체' ? '지금 굴릴 곳' : systemFilter + ' 중 먼저 굴릴 곳' }}
            </p>
            <p class="text-base font-semibold text-stone-900 dark:text-stone-50 truncate">{{ best.label }}</p>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
              {{ elyLabel(budgetEly) }}이면 {{ fmt(best.rolls) }}회 · 현재 {{ fmt1(best.current) }} → 기대 {{ fmt1(best.expectedAtBudget) }}%급
              <span class="mx-1 text-stone-300 dark:text-stone-600">|</span>
              {{ best.empty ? '빈 슬롯' : rarityLabel(best.pImprove) }}
              <span class="mx-1 text-stone-300 dark:text-stone-600">|</span>
              개선까지 평균 {{ Number.isFinite(best.expectedRollsToImprove) ? fmt(Math.round(best.expectedRollsToImprove)) + '회' : '—' }}
            </p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-2xl font-semibold tracking-tight tabular-nums text-cyan-700 dark:text-cyan-300 leading-none">
              +{{ fmt1(best.gainAtBudget) }}<span class="text-sm font-medium ml-0.5">%급</span>
            </p>
            <p class="text-[11px] text-stone-400 dark:text-stone-500 mt-1 tabular-nums">
              1억당 {{ fmtPerEok(best.gainPer100M) }}
            </p>
          </div>
        </div>

        <!-- 목록 헤더 -->
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
            {{ systemFilter === '전체' ? '전체' : systemFilter }} {{ ranked.length }}개
            <span class="text-stone-300 dark:text-stone-600 mx-1">·</span>
            막대는 1순위 대비 기대 이득
          </span>
          <label class="ml-auto flex items-center gap-2 text-xs">
            <span class="text-stone-400 dark:text-stone-500">정렬</span>
            <select
              v-model="sortKey"
              class="h-8 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              :title="SORT_KEYS.find((k) => k.key === sortKey)?.desc"
            >
              <option v-for="k in SORT_KEYS" :key="k.key" :value="k.key" :title="k.desc">{{ k.label }}</option>
            </select>
          </label>
        </div>
        <p v-if="sortKey !== 'budget'" class="-mt-2 text-[11px] text-stone-500 dark:text-stone-400">
          {{ SORT_KEYS.find((k) => k.key === sortKey)?.desc }} — 비용을 반영하지 않은 관점이라 재화가 다른 시스템끼리 비교에는 맞지 않습니다.
        </p>

        <!-- 슬롯 목록 -->
        <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 divide-y divide-stone-100 dark:divide-stone-700/70 overflow-hidden">
          <div v-for="(s, i) in ranked" :key="s.id">
            <button
              type="button"
              @click="toggle(s.id)"
              class="w-full text-left px-3 sm:px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-900/30 transition"
              :aria-expanded="expanded.has(s.id)"
            >
              <div class="grid grid-cols-[2rem_minmax(0,1fr)_auto] sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_7rem] items-center gap-x-3 gap-y-1.5">
                <!-- 순위 -->
                <span
                  class="h-7 w-7 inline-flex items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                  :class="i === 0
                    ? 'bg-cyan-600 text-white'
                    : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300'"
                >{{ i + 1 }}</span>

                <!-- 이름 + 막대 -->
                <div class="min-w-0">
                  <div class="flex items-start gap-2 min-w-0">
                    <span class="text-[10px] px-1.5 py-px rounded ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 shrink-0 mt-0.5">{{ s.system }}</span>
                    <span class="text-sm font-medium text-stone-900 dark:text-stone-50 leading-tight break-keep">{{ s.label }}</span>
                    <span v-if="s.empty" class="text-[10px] text-orange-600 dark:text-orange-400 shrink-0">빈 슬롯</span>
                  </div>
                  <div class="mt-1.5 h-1 rounded-full bg-stone-100 dark:bg-stone-700/70 overflow-hidden">
                    <div class="h-full rounded-full bg-cyan-500/80" :style="{ width: gainBarPct(s) + '%' }"></div>
                  </div>
                </div>

                <!-- 현재 카드 -->
                <div class="min-w-0 col-start-2 sm:col-start-auto">
                  <p class="text-sm tabular-nums text-stone-900 dark:text-stone-50">
                    <template v-if="s.empty"><span class="text-stone-400">—</span></template>
                    <template v-else><span class="font-semibold">{{ fmt1(s.current) }}</span><span class="text-stone-400 text-xs ml-0.5">%급</span></template>
                  </p>
                  <p v-if="!s.empty" class="text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5 truncate" :title="rarityTitle(s.pImprove)">
                    <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="rarityDot(s.pImprove)"></span>
                    <span class="truncate">{{ rarityLabel(s.pImprove) }}</span>
                  </p>
                  <p v-if="s.group === 'runeword' && result.runeScore" class="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums truncate">
                    점수 {{ result.runeScore.current }}점 · {{ gradeOf(result.runeScore.current).label }} · {{ rarityLabel(result.runeScore.pImprove) }}
                  </p>
                </div>

                <!-- 굴리면 -->
                <div class="min-w-0 col-start-2 sm:col-start-auto text-[12px] text-stone-600 dark:text-stone-300 tabular-nums">
                  <template v-if="s.pImprove > 0">
                    <p class="truncate">
                      개선까지 <span class="font-medium text-stone-900 dark:text-stone-50">{{ fmt(Math.round(s.expectedRollsToImprove)) }}회</span>
                      <span class="text-stone-400"> · {{ elyLabel(s.expectedRollsToImprove * s.costEly) }}</span>
                    </p>
                    <p class="truncate">
                      성공 시 평균 <span class="font-medium text-stone-900 dark:text-stone-50">{{ fmt1(s.meanIfImprove) }}%급</span>
                      <span class="text-stone-400"> · 1회 {{ elyLabel(s.costEly) }}</span>
                    </p>
                  </template>
                  <p v-else class="text-stone-400 dark:text-stone-500">표본 {{ fmt(result.samples) }}장 중 더 좋은 카드 없음 · 1회 {{ elyLabel(s.costEly) }}</p>
                  <p v-if="s.group === 'runeword' && result.runeScore && result.runeScore.pImprove > 0" class="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                    점수 기준 개선까지 {{ fmt(Math.round(result.runeScore.expectedRollsToImprove)) }}회 · 성공 시 평균 {{ Math.round(result.runeScore.meanIfImprove) }}점
                  </p>
                </div>

                <!-- 예산 기대 이득 -->
                <div class="text-right tabular-nums col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">
                  <p class="text-base font-semibold tracking-tight text-cyan-700 dark:text-cyan-300 leading-tight">
                    +{{ fmt1(s.gainAtBudget) }}
                  </p>
                  <p class="text-[11px] text-stone-400 dark:text-stone-500">{{ fmt(s.rolls) }}회 · 1억당 {{ fmtPerEok(s.gainPer100M) }}</p>
                  <p v-if="s.group === 'runeword' && result.runeScore && runeScoreAtBudget(s.rolls)" class="text-[11px] text-stone-400 dark:text-stone-500">
                    점수 +{{ Math.round(runeScoreAtBudget(s.rolls).gain) }} → {{ Math.round(runeScoreAtBudget(s.rolls).expected) }}점
                  </p>
                </div>
              </div>
            </button>

            <!-- 상세 -->
            <div v-if="expanded.has(s.id)" class="px-3 sm:px-4 pb-4 pt-1 bg-stone-50/70 dark:bg-stone-900/30">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                <div class="space-y-4">
                  <section>
                    <h4 class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase mb-1.5">현재 옵션</h4>
                    <p v-if="s.empty" class="text-stone-400">빈 슬롯 — 무엇이 나와도 이득입니다.</p>
                    <ul v-else class="space-y-1">
                      <li v-for="(l, li) in s.conv.lines" :key="li" class="flex justify-between gap-3">
                        <span class="text-stone-700 dark:text-stone-200">{{ l.text }}</span>
                        <span class="text-stone-500 dark:text-stone-400 whitespace-nowrap tabular-nums">{{ l.convertible ? `${fmt1(l.refAmount)}%급` : '환산 제외' }}</span>
                      </li>
                    </ul>
                    <p class="mt-2 text-stone-500 dark:text-stone-400 leading-relaxed">
                      {{ s.empty ? '' : rarityTitle(s.pImprove) + ' · ' }}1회당 기대 +{{ s.gainPerRoll.toFixed(2) }} · 1회 비용 {{ s.cost }} = {{ elyLabel(s.costEly) }}
                    </p>
                  </section>

                  <section v-if="winnerInfo(s) && winnerInfo(s).examples.length">
                    <h4 class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase mb-1.5">
                      성공하면 이런 카드
                      <span class="normal-case tracking-normal font-normal">
                        — 성공 = 크댐환산 합이 지금({{ fmt1(s.current) }})보다 높은 카드 ·
                        {{ winnerInfo(s).basis === 'top' ? '드물어서 상위 표본에서 뽑음' : '성공 카드 평균에 가까운 예시' }}
                      </span>
                    </h4>
                    <div class="grid grid-cols-1 gap-1.5">
                      <div
                        v-for="(ex, ei) in winnerInfo(s).examples"
                        :key="ei"
                        class="rounded-lg bg-white dark:bg-stone-800 ring-1 ring-stone-200 dark:ring-stone-700 px-3 py-2"
                      >
                        <div class="flex justify-between gap-2 mb-1">
                          <span class="text-[11px] text-stone-400 dark:text-stone-500">예시 {{ ei + 1 }}</span>
                          <span class="font-semibold text-stone-900 dark:text-stone-50 tabular-nums">{{ fmt1(ex.total) }}<span class="text-stone-400 text-[11px] ml-0.5">%급</span></span>
                        </div>
                        <ul class="space-y-0.5">
                          <li v-for="(l, li) in ex.lines" :key="li" class="flex justify-between gap-3">
                            <span :class="l.convertible ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400 dark:text-stone-500'">{{ l.text }}</span>
                            <span class="text-stone-500 dark:text-stone-400 whitespace-nowrap tabular-nums">{{ l.convertible ? `${fmt1(l.refAmount)}%급` : '—' }}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <h4 class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase mt-3 mb-1.5">
                      성공 카드에 든 옵션
                      <span class="normal-case tracking-normal font-normal">— {{ fmt(winnerInfo(s).winnerCount) }}장 중 포함 비율 · 들었을 때 평균</span>
                    </h4>
                    <ul class="space-y-1">
                      <li v-for="o in winnerInfo(s).options.slice(0, 6)" :key="o.key" class="flex items-center gap-2">
                        <span class="text-stone-700 dark:text-stone-200 w-40 truncate shrink-0">{{ o.label }}</span>
                        <span class="flex-1 h-1 rounded-full bg-stone-200/70 dark:bg-stone-700 overflow-hidden">
                          <span class="block h-full bg-stone-400 dark:bg-stone-500" :style="{ width: (o.share * 100).toFixed(0) + '%' }"></span>
                        </span>
                        <span class="text-stone-500 dark:text-stone-400 whitespace-nowrap tabular-nums w-40 text-right">
                          {{ (o.share * 100).toFixed(0) }}% · 평균 +{{ fmt1(o.avgValue) }} ({{ fmt1(o.avgRef) }}%급)
                        </span>
                      </li>
                    </ul>
                  </section>
                </div>

                <div class="space-y-4">
                  <section>
                    <h4 class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase mb-1.5">예산별 기대 환산 <span class="normal-case tracking-normal font-normal">— 현재 유지 포함</span></h4>
                    <ul class="space-y-1">
                      <li v-for="row in budgetCurve(s)" :key="row.budget" class="flex justify-between gap-3 tabular-nums">
                        <span class="text-stone-500 dark:text-stone-400">{{ elyLabel(row.budget) }} <span class="text-stone-400 dark:text-stone-500">· {{ fmt(row.rolls) }}회</span></span>
                        <span class="text-stone-900 dark:text-stone-50">{{ fmt1(row.expected) }} <span class="text-cyan-700 dark:text-cyan-300">+{{ fmt1(row.gain) }}</span></span>
                      </li>
                    </ul>
                    <p class="mt-2 text-stone-500 dark:text-stone-400 tabular-nums">
                      굴린 카드 표본 — 평균 {{ fmt1(s.sampleMean) }} · 중앙값 {{ fmt1(s.sampleMedian) }} · 최고 {{ fmt1(s.sampleMax) }}
                    </p>
                  </section>

                  <section v-if="s.group === 'runeword' && result.runeScore">
                    <h4 class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase mb-1.5">룬워드 점수 기준 <span class="normal-case tracking-normal font-normal">— info 사이트 점수 · 참고용, 순위에는 안 씀</span></h4>
                    <ul class="space-y-1">
                      <li v-for="row in runeScoreCurve()" :key="row.budget" class="flex justify-between gap-3 tabular-nums">
                        <span class="text-stone-500 dark:text-stone-400">{{ elyLabel(row.budget) }} <span class="text-stone-400 dark:text-stone-500">· {{ fmt(row.rolls) }}회</span></span>
                        <span class="text-stone-900 dark:text-stone-50">{{ Math.round(row.expected) }}점 <span class="text-cyan-700 dark:text-cyan-300">+{{ Math.round(row.gain) }}</span></span>
                      </li>
                    </ul>
                    <p class="mt-2 text-stone-500 dark:text-stone-400 tabular-nums">
                      점수 표본 — 평균 {{ Math.round(result.runeScore.sampleMean) }} · 중앙값 {{ Math.round(result.runeScore.sampleMedian) }} · 최고 {{ Math.round(result.runeScore.sampleMax) }} ·
                      지금 {{ result.runeScore.current }}점보다 높을 확률 {{ (result.runeScore.pImprove * 100).toFixed(2) }}%
                    </p>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="text-[11px] leading-relaxed text-stone-400 dark:text-stone-500">
          표본 {{ fmt(result.samples) }}장 기준 몬테카를로 — 1% 미만 확률은 오차가 큽니다 (표본 수를 늘리면 정밀해집니다).
          예산 기대 이득은 예산 전부를 그 슬롯 하나에 쓴다고 가정한 값이라 순서를 정하는 용도이고, 배분 계획은 아닙니다 —
          굴려서 카드가 좋아지면 개선 확률이 떨어지므로, 새 옵션을 저장한 뒤 다시 분석해 "1억당 기대" 가 가장 큰 곳으로 옮겨 가는 방식을 권합니다.
          환산은 현재 스탯에 옵션을 단독 적용한 ΔBP 기준이라 한 슬롯을 크게 올린 뒤에는 다른 슬롯의 수치가 조금 달라집니다.
          "최종 ~ 대미지" 는 크리 확률 100% 가정, 크리확률·명중률·방어력·체력 등 BP 무관 옵션은 0 으로 칩니다.
        </p>
      </template>
    </template>
  </div>
</template>
