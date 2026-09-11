<script setup>
import { computed } from 'vue';
import { ALL_MEMORIALS, uniqueBaseLabels } from '../data/memorialProbabilities.js';
import { evaluateLines, normalizeMemorialCard } from '../utils/rollEquiv.js';
import {
  MEMORIAL_CARD_MAX,
  makeEmptyMemorialCard,
  activeMemorialLines,
  memorialOf,
} from '../utils/memorialLoadout.js';
import { fmt1 } from '../utils/format.js';

const props = defineProps({
  // 활성 캐릭터 T창 스탯 — 카드별 크댐환산 계산 기준 (BP 0 이면 환산 생략)
  stats: { type: Object, required: true },
});

// 보유 메모리얼 카드 — 부모(App.vue)의 활성 캐릭터 memorials 와 v-model 양방향.
const memorials = defineModel('memorials', { type: Array, default: () => [] });

const memorialOptions = Object.entries(ALL_MEMORIALS).map(([key, m]) => ({ key, name: m.name }));

function labelsFor(card) {
  const m = memorialOf(card);
  return m ? uniqueBaseLabels(m) : [];
}

function addCard() {
  if (memorials.value.length >= MEMORIAL_CARD_MAX) return;
  memorials.value = [...memorials.value, makeEmptyMemorialCard()];
}

function removeCard(idx) {
  memorials.value = memorials.value.filter((_, i) => i !== idx);
}

function resetAll() {
  memorials.value = [];
}

// 메모리얼 종류가 바뀌면 그 메모리얼에 없는 옵션 줄은 비운다 (값은 남겨도 의미가 없다).
function onKeyChange(card) {
  const labels = labelsFor(card);
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
  <div>
    <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
      <span class="text-xs text-stone-500 dark:text-stone-400">
        보유 카드 {{ memorials.length }} / {{ MEMORIAL_CARD_MAX }}
      </span>
      <div class="flex items-center gap-1.5 text-[11px]">
        <button
          type="button"
          @click="addCard"
          :disabled="memorials.length >= MEMORIAL_CARD_MAX"
          class="px-2 py-1 rounded ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          + 카드 추가
        </button>
        <button
          type="button"
          @click="resetAll"
          :disabled="memorials.length === 0"
          class="px-2 py-1 rounded text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 transition"
        >
          초기화
        </button>
      </div>
    </div>
    <p class="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-snug">
      지금 장착 중인 메모리얼 카드의 옵션을 그대로 적어 두면 캐릭터와 함께 저장되고,
      아래 <strong>스펙업 방향</strong> 분석에서 "이 카드를 다시 굴릴 가치" 를 계산하는 기준이 됩니다.
      "최종 ~ 대미지" 는 대미지 배율을 BP 비율로 환산합니다.
    </p>

    <p
      v-if="memorials.length === 0"
      class="text-sm text-stone-400 dark:text-stone-500 italic py-3 text-center bg-stone-50 dark:bg-stone-900/40 rounded-lg"
    >
      아직 등록한 메모리얼이 없습니다. "카드 추가" 로 시작하세요.
    </p>

    <div v-else class="space-y-2">
      <div
        v-for="(card, cIdx) in memorials"
        :key="cIdx"
        class="rounded-md ring-1 ring-stone-200 dark:ring-stone-700 px-2 py-2"
      >
        <div class="flex items-center gap-2 flex-wrap mb-1.5">
          <span class="text-xs text-stone-500 dark:text-stone-400 w-5 shrink-0 tabular-nums font-semibold text-right">
            {{ cIdx + 1 }}.
          </span>
          <select
            v-model="card.key"
            @change="onKeyChange(card)"
            class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            <option v-for="o in memorialOptions" :key="o.key" :value="o.key">{{ o.name }}</option>
          </select>
          <span class="ml-auto text-xs tabular-nums">
            <template v-if="cardConvs[cIdx]">
              <span class="text-stone-500 dark:text-stone-400">크댐환산</span>
              <span class="font-semibold text-cyan-700 dark:text-cyan-300 ml-1">{{ fmt1(cardConvs[cIdx].total) }}%급</span>
            </template>
            <span v-else class="text-stone-400 dark:text-stone-500 italic">옵션 미입력</span>
          </span>
          <button
            type="button"
            @click="removeCard(cIdx)"
            class="text-[11px] text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
            title="카드 삭제"
          >
            ✕
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-7">
          <div
            v-for="(line, lIdx) in card.lines"
            :key="lIdx"
            class="flex items-center gap-1"
          >
            <select
              v-model="line.label"
              class="flex-1 min-w-0 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-1.5 py-1 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option value="">(빈 줄)</option>
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
              class="w-20 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-1.5 py-1 text-xs text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-40"
            />
          </div>
        </div>
      </div>

      <p class="text-xs text-right text-stone-500 dark:text-stone-400 tabular-nums pt-1">
        전체 합산
        <span class="font-semibold text-cyan-700 dark:text-cyan-300 ml-1">{{ fmt1(totalConv) }}%급</span>
      </p>
    </div>
  </div>
</template>
