<script setup>
import { computed } from 'vue';
import { uniqueBaseLabels } from '../data/memorialProbabilities.js';
import { evaluateLines, normalizeMemorialCard } from '../utils/rollEquiv.js';
import {
  MEMORIAL_CARD_MAX,
  makeEmptyMemorialCard,
  activeMemorialLines,
  memorialOf,
  memorialChoices,
  choiceValueOf,
  parseChoiceValue,
  memorialLineCount,
  isNormalMemorialKey,
} from '../utils/memorialLoadout.js';
import { fmt1 } from '../utils/format.js';

const props = defineProps({
  // 활성 캐릭터 T창 스탯 — 카드별 크댐환산 계산 기준 (BP 0 이면 환산 생략)
  stats: { type: Object, required: true },
});

// 보유 메모리얼 카드 — 부모(App.vue)의 활성 캐릭터 memorials 와 v-model 양방향.
const memorials = defineModel('memorials', { type: Array, default: () => [] });

const memorialOptions = memorialChoices();

function labelsFor(card) {
  const m = memorialOf(card);
  return m ? uniqueBaseLabels(m) : [];
}

// 일반 메모리얼은 개별 슬롯 9개(각각 따로 굴림), 세트는 최대 4줄(한 번에 굴림).
function lineCountFor(card) {
  return memorialLineCount(card.key);
}
function isNormal(card) {
  return isNormalMemorialKey(card.key);
}

// 같은 메모리얼은 캐릭터당 한 장 — 이미 등록된 종류는 다른 카드에서 고를 수 없다.
function isChoiceTaken(cIdx, value) {
  return memorials.value.some((c, i) => i !== cIdx && choiceValueOf(c) === value);
}

const nextFreeChoice = computed(() =>
  memorialOptions.find((o) => !isChoiceTaken(-1, o.value)) || null,
);

function addCard() {
  if (memorials.value.length >= MEMORIAL_CARD_MAX) return;
  const free = nextFreeChoice.value;
  if (!free) return;
  memorials.value = [...memorials.value, makeEmptyMemorialCard(free.key, free.variant)];
}

function removeCard(idx) {
  memorials.value = memorials.value.filter((_, i) => i !== idx);
}

function resetAll() {
  memorials.value = [];
}

// 메모리얼 종류가 바뀌면 줄 수(일반 9 / 세트 4)를 다시 맞추고, 그 메모리얼에 없는 옵션 줄은 비운다.
function onChoiceChange(card, value) {
  const { key, variant } = parseChoiceValue(value);
  card.key = key;
  card.variant = variant;
  const labels = labelsFor(card);
  const n = lineCountFor(card);
  while (card.lines.length < n) card.lines.push({ label: '', value: '' });
  if (card.lines.length > n) card.lines.splice(n);
  for (const line of card.lines) {
    if (line.label && !labels.includes(line.label)) {
      line.label = '';
      line.value = '';
    }
  }
}

// 같은 카드 안에서 같은 옵션을 두 줄에 고르는 것은 허용한다 — 실제 게임에서도 같은 옵션이
// 두 줄 뜰 수 있고(티어만 다름), 환산은 줄마다 단독 측정 후 합산이라 문제가 없다.

const cardConvs = computed(() =>
  memorials.value.map((card) => {
    const lines = activeMemorialLines(card);
    if (!lines.length) return null;
    return evaluateLines(normalizeMemorialCard(lines), props.stats);
  }),
);

const totalConv = computed(() =>
  cardConvs.value.reduce((acc, c) => acc + (c ? c.total : 0), 0),
);
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <p class="text-xs leading-relaxed text-stone-500 dark:text-stone-400 max-w-2xl">
        지금 장착 중인 메모리얼 옵션을 그대로 적어 두면 캐릭터와 함께 저장되고, 아래 스펙업 방향 분석의 기준이 됩니다.
        <span class="text-stone-700 dark:text-stone-200">일반</span>은 개별 옵션 슬롯 9개(슬롯마다 따로 굴림),
        <span class="text-stone-700 dark:text-stone-200">세트</span>는 한 번에 굴려지는 옵션 최대 4줄입니다.
      </p>
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-xs text-stone-400 dark:text-stone-500 tabular-nums">{{ memorials.length }} / {{ MEMORIAL_CARD_MAX }}</span>
        <button
          type="button"
          @click="addCard"
          :disabled="memorials.length >= MEMORIAL_CARD_MAX || !nextFreeChoice"
          :title="nextFreeChoice ? '' : '모든 메모리얼이 이미 등록되어 있습니다'"
          class="h-8 px-3 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          카드 추가
        </button>
        <button
          type="button"
          @click="resetAll"
          :disabled="memorials.length === 0"
          class="h-8 px-3 rounded-lg text-xs ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 transition"
        >
          초기화
        </button>
      </div>
    </div>

    <div
      v-if="memorials.length === 0"
      class="rounded-xl ring-1 ring-dashed ring-stone-300 dark:ring-stone-600 py-8 text-center text-sm text-stone-400 dark:text-stone-500"
    >
      아직 등록한 메모리얼이 없습니다. "카드 추가" 로 시작하세요.
    </div>

    <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <div
        v-for="(card, cIdx) in memorials"
        :key="cIdx"
        class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 overflow-hidden"
      >
        <div class="flex items-center gap-2 px-3 py-2 border-b border-stone-100 dark:border-stone-700/70">
          <span class="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums w-4 shrink-0">{{ cIdx + 1 }}</span>
          <select
            :value="choiceValueOf(card)"
            @change="(e) => onChoiceChange(card, e.target.value)"
            class="h-8 min-w-0 flex-1 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-sm font-medium focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            <option
              v-for="o in memorialOptions"
              :key="o.value"
              :value="o.value"
              :disabled="isChoiceTaken(cIdx, o.value)"
            >{{ o.name }}{{ isChoiceTaken(cIdx, o.value) ? ' (등록됨)' : '' }}</option>
          </select>
          <span class="text-sm tabular-nums shrink-0 ml-1">
            <template v-if="cardConvs[cIdx]">
              <span class="font-semibold text-stone-900 dark:text-stone-50">{{ fmt1(cardConvs[cIdx].total) }}</span><span class="text-xs text-stone-400 ml-0.5">%급</span>
            </template>
            <span v-else class="text-xs text-stone-400 dark:text-stone-500">미입력</span>
          </span>
          <button
            type="button"
            @click="removeCard(cIdx)"
            class="h-7 w-7 inline-flex items-center justify-center rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition"
            title="카드 삭제"
            aria-label="카드 삭제"
          >✕</button>
        </div>

        <div class="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
          <div
            v-for="(line, lIdx) in card.lines.slice(0, lineCountFor(card))"
            :key="lIdx"
            class="flex items-center gap-1.5"
          >
            <span
              v-if="isNormal(card)"
              class="text-[10px] text-stone-400 dark:text-stone-500 w-7 shrink-0 tabular-nums"
            >{{ lIdx + 1 }}</span>
            <select
              v-model="line.label"
              class="h-8 flex-1 min-w-0 rounded-lg border-0 ring-1 ring-stone-200 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              :class="line.label ? '' : 'text-stone-400 dark:text-stone-500'"
            >
              <option value="">빈 줄</option>
              <option v-for="lb in labelsFor(card)" :key="lb" :value="lb">{{ lb }}</option>
            </select>
            <input
              v-model="line.value"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              placeholder="값"
              :disabled="!line.label"
              class="h-8 w-20 rounded-lg border-0 ring-1 ring-stone-200 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-xs text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-40"
            />
          </div>
        </div>
      </div>
    </div>

    <p v-if="memorials.length" class="text-xs text-right text-stone-500 dark:text-stone-400 tabular-nums">
      전체 합산 <span class="font-semibold text-stone-900 dark:text-stone-50 ml-1">{{ fmt1(totalConv) }}</span><span class="text-stone-400 ml-0.5">%급</span>
    </p>
  </div>
</template>
