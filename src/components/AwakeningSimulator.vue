<script setup>
import { computed, ref, watch } from 'vue';
import {
  ALL_OPTION_LABELS,
  maxPossibleValue,
  stonesContainingOption,
} from '../data/awakeningData.js';
import {
  rollOnce,
  simulateUntilTargetReached,
  computeStatistics,
  COST_PER_ROLL,
} from '../utils/awakeningSim.js';
import {
  normalizeAwakeningCard,
  awakeningOptionKeys,
  evaluateLines,
} from '../utils/rollEquiv.js';
import { calculateBattlePower } from '../utils/battlePower.js';
import { useRollLog } from '../composables/useRollLog.js';
import RollLogPanel from './RollLogPanel.vue';
import RollBulkRun from './RollBulkRun.vue';
import { fmtInf as fmt, pctSmart } from '../utils/format.js';

const props = defineProps({
  // 활성 캐릭터 T창 스탯 — 굴림 결과의 "크댐 환산" 계산 기준.
  //   미입력(비로그인/빈 캐릭터)이면 환산·기록 기능이 비활성화된다.
  stats: { type: Object, default: null },
});

const MAX_TARGETS = 4;

// 목표 옵션 row — { displayLabel, value }
const targets = ref([{ displayLabel: ALL_OPTION_LABELS[0], value: '' }]);

const isRunning = ref(false);
const result = ref(null);          // 통계 결과
const sampleWinningCard = ref(null); // 1번 실행 성공 카드
const sampleRoll = ref(null);       // 1회 굴려보기 미리보기
const lastRollIndex = ref(0);      // 마지막으로 표시된 굴림의 회차 (rollCount 는 굴림 기록 컴포저블 소유)

function addTarget() {
  if (targets.value.length >= MAX_TARGETS) return;
  // 이미 선택된 옵션 외에서 첫 번째 사용 가능한 옵션을 기본값으로
  const used = new Set(targets.value.map((t) => t.displayLabel));
  const next = ALL_OPTION_LABELS.find((lbl) => !used.has(lbl)) ?? ALL_OPTION_LABELS[0];
  targets.value.push({ displayLabel: next, value: '' });
}

// row i 입장에서 다른 행이 이미 사용 중인 옵션 — select 에서 disable 처리
function isLabelDisabledForRow(label, rowIdx) {
  for (let i = 0; i < targets.value.length; i++) {
    if (i === rowIdx) continue;
    if (targets.value[i].displayLabel === label) return true;
  }
  return false;
}

function removeTarget(idx) {
  if (targets.value.length <= 1) return;
  targets.value.splice(idx, 1);
}

// 유효 목표만 추출
const validTargets = computed(() =>
  targets.value
    .filter((t) => t.displayLabel && Number(t.value) > 0)
    .map((t) => ({ displayLabel: t.displayLabel, value: Number(t.value) }))
);

// 행별 단일 카드 가능 여부
const targetFeasibilities = computed(() =>
  targets.value.map((t) => {
    if (!t.displayLabel || !t.value) return { feasible: null, max: null, stones: [] };
    const v = Number(t.value);
    if (!Number.isFinite(v) || v <= 0) return { feasible: null, max: null, stones: [] };
    const max = maxPossibleValue(t.displayLabel);
    const stones = stonesContainingOption(t.displayLabel);
    return { feasible: v <= max, max, stones };
  })
);

const allTargetsFeasible = computed(() =>
  targetFeasibilities.value.every((f) => f.feasible !== false)
);

// 성공 카드 라인 강조 (목표에 포함된 옵션이면 ★)
function lineHighlights(line) {
  return validTargets.value.some(
    (t) => t.displayLabel === line.displayLabel && line.value >= t.value
  );
}

async function runSimulation() {
  const ts = validTargets.value;
  if (ts.length === 0) return;
  if (!allTargetsFeasible.value) return;

  isRunning.value = true;
  await new Promise((r) => setTimeout(r, 30));

  try {
    const stats = computeStatistics(ts);
    result.value = { targets: ts, ...stats };
    const sample = simulateUntilTargetReached(ts);
    sampleWinningCard.value = sample;
  } finally {
    isRunning.value = false;
  }
}

// ============================================================
// 굴림 기록 — 1회 굴려보기를 여러 번 돌릴 때 놓친 대박 카드를
//   회차 번호와 함께 우측 패널에 누적한다 (조건/기록은 공용 컴포저블).
// ============================================================
const AWAK_OPTION_KEYS = awakeningOptionKeys();
const {
  criterion: logCriterion,
  records: logRecords,
  count: rollCount,
  nextIndex,
  record: recordRoll,
  clear: clearRollLog,
  resetAll: resetRollLog,
  bulkTimes,
  bulkRunning,
  bulkProgress,
  bulkSummary,
  bulkRun,
  bulkCancel,
} = useRollLog('latale_awakRollLog_v1');

const sampleConv = ref(null);    // 현재 표시 중인 굴림의 환산 결과
const sampleHit = ref(false);    // 현재 굴림이 기록 조건을 넘었는지

// 본 캐릭터 BP — 0 이면 T창 미입력 → 크댐 환산 불가
const baseBP = computed(() => (props.stats ? calculateBattlePower(props.stats) : 0));
const hasStats = computed(() => baseBP.value > 0);
const statsForLog = computed(() => (hasStats.value ? props.stats : null));

function rollSample() {
  const card = rollOnce();
  sampleRoll.value = card;
  lastRollIndex.value = nextIndex();

  const r = recordRoll({
    lines: normalizeAwakeningCard(card),
    stats: statsForLog.value,
    index: lastRollIndex.value,
    tag: card.stone.name,
    tagKey: card.stone.key,
  });
  sampleConv.value = r.evaluated;
  sampleHit.value = r.hit;
}

// 대량 굴림 — N 회를 한 번에 돌리고 조건을 넘은 굴림만 기록.
//   다 돌린 뒤엔 그 구간 최고 카드를 미리보기에 띄운다.
async function runBulk(times) {
  const s = await bulkRun({
    times,
    rollFn: rollOnce,
    normalize: normalizeAwakeningCard,
    stats: statsForLog.value,
    tagOf: (card) => ({ tag: card.stone.name, tagKey: card.stone.key }),
  });
  if (s && s.bestCard) {
    sampleRoll.value = s.bestCard;
    lastRollIndex.value = s.bestIndex;
    sampleConv.value = s.bestEvaluated;
    sampleHit.value = s.bestHit;
  }
}

function resetRollCount() {
  lastRollIndex.value = 0;
  sampleRoll.value = null;
  sampleConv.value = null;
  sampleHit.value = false;
  resetRollLog();
}

// 스탯이 바뀌면(캐릭터 전환 등) 표시 중인 굴림의 환산값을 다시 계산.
//   이미 쌓인 기록은 굴릴 당시 스탯 기준이라 그대로 둔다.
watch(baseBP, () => {
  if (!sampleRoll.value) return;
  sampleConv.value = statsForLog.value
    ? evaluateLines(normalizeAwakeningCard(sampleRoll.value), props.stats)
    : null;
});

// 환산치 표시 — 소수 1자리, 정수면 정수
function fmtRef(v) {
  if (!Number.isFinite(Number(v))) return '-';
  const n = Number(v);
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}

// 환산 합계 배지 색 — 기준 대비
function totalBadgeClass(total) {
  const th = logCriterion.value.type === 'equiv' ? Number(logCriterion.value.threshold) : null;
  if (!th) return 'text-stone-300';
  if (total >= th * 1.5) return 'text-rose-400';
  if (total >= th) return 'text-orange-300';
  return 'text-stone-400';
}

// ============================================================
// 라인 등급% 및 색상 — 해당 옵션의 단일 줄 최대값(maxValue) 대비 비율
// ============================================================
function linePct(line) {
  if (!line || line.value == null) return null;
  const max = maxPossibleValue(line.displayLabel);
  if (!max) return null;
  const p = (Number(line.value) / Number(max)) * 100;
  if (!Number.isFinite(p)) return null;
  return Math.floor(p);
}

// % 배지 색상 (≥90 빨강, ≥70 주황, ≥30 인디고, 외 슬레이트)
function pctBadgeClass(p) {
  if (p == null) return 'text-stone-500';
  if (p >= 90) return 'text-rose-400 font-bold';
  if (p >= 70) return 'text-orange-300 font-bold';
  if (p >= 30) return 'text-cyan-300';
  return 'text-stone-500';
}

// 라인 텍스트 색상 — 선호옵(glow)에서 % 가 높으면 빨강/주황으로 승급
function lineColorClass(line, stoneKey) {
  if (line.glow) {
    const p = linePct(line);
    if (p != null) {
      if (p >= 90) return 'text-rose-400';
      if (p >= 70) return 'text-orange-300';
    }
  }
  return stoneKey === 'PURPLE' ? 'text-amber-300' : 'text-sky-400';
}

// 라인 글로우(textShadow) — 선호옵 + % 가 높으면 빨강/주황 글로우
function lineGlowShadow(line, stoneKey) {
  if (!line.glow) return undefined;
  const p = linePct(line);
  if (p != null) {
    if (p >= 90) return '0 0 2px #fb7185, 0 0 6px #fb7185';
    if (p >= 70) return '0 0 2px #fdba74, 0 0 6px #fdba74';
  }
  return stoneKey === 'PURPLE'
    ? '0 0 2px #fde047, 0 0 6px #fde047'
    : '0 0 2px #38bdf8, 0 0 6px #38bdf8';
}

// ============================================================
// 비용 계산 (평균 시도 × 1회 비용)
// ============================================================
const meanCost = computed(() => {
  if (!result.value || !Number.isFinite(result.value.mean)) return null;
  return {
    material: Math.round(result.value.mean * COST_PER_ROLL.material),
    hammer: Math.round(result.value.mean * COST_PER_ROLL.hammer),
  };
});

function fmtVal(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1).replace(/\.0$/, '');
}
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div
      class="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 py-3 text-sm text-cyan-800 dark:text-cyan-200"
    >
      <strong>💎 (기간제) 상급 각성석 시뮬레이터</strong> ·
      원하는 옵션 + 수치를 설정하면 <strong>한 카드 안에서 모두 동시에 만족</strong>하는 카드를
      만나기까지 <strong>몇 회 돌려야 하는지</strong>를 분석합니다.
      <br />
      <strong class="text-xs">메커니즘</strong>: 각성석 종류 추첨 (보라 95% / 신비 5%) → 라인 수
      추첨 (1줄 40% · 2줄 40% · 3줄 15% · 4줄 5%) → 각 라인마다 옵션 무중복 균등 추첨 → 5개 티어 중
      균등 추첨 → [최소,최대] 균등 분포로 값 결정.
      <br />
      비용 1회당 <strong>최종 인던 재료 7개</strong> + <strong>플래티넘 망치 1개</strong>.
    </div>

    <!-- 입력 -->
    <section
      class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
    >
      <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-4">⚙️ 시뮬 조건</h2>

      <div class="mb-2 flex items-center justify-between">
        <span class="block text-sm font-medium text-stone-700 dark:text-stone-300">
          목표 옵션 (최대 {{ MAX_TARGETS }}개 — 한 카드 안에서 모두 동시 만족)
        </span>
        <button
          type="button"
          @click="addTarget"
          :disabled="targets.length >= MAX_TARGETS"
          class="text-xs rounded-md ring-1 ring-cyan-300 dark:ring-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 transition"
        >
          + 옵션 추가
        </button>
      </div>

      <div class="space-y-2 mb-4">
        <div
          v-for="(t, i) in targets"
          :key="i"
          class="grid grid-cols-[1fr_140px_auto] gap-2 items-start"
        >
          <select
            v-model="t.displayLabel"
            class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            <option
              v-for="lbl in ALL_OPTION_LABELS"
              :key="lbl"
              :value="lbl"
              :disabled="isLabelDisabledForRow(lbl, i)"
            >
              {{ lbl }}{{ isLabelDisabledForRow(lbl, i) ? ' (선택됨)' : '' }}
            </option>
          </select>
          <div>
            <input
              v-model="t.value"
              type="number"
              step="any"
              placeholder="목표 ≥"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
            <span
              v-if="targetFeasibilities[i]?.feasible === false"
              class="block mt-1 text-xs text-rose-600 dark:text-rose-400"
            >
              ⚠ 단일 카드 최대 {{ targetFeasibilities[i].max }} 초과
            </span>
            <span
              v-else-if="targetFeasibilities[i]?.max != null"
              class="block mt-1 text-xs text-stone-400"
            >
              최대 {{ targetFeasibilities[i].max }}
              <span v-if="targetFeasibilities[i].stones.length === 1" class="ml-0.5">
                ·
                <span
                  :class="
                    targetFeasibilities[i].stones[0] === 'PURPLE'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-sky-600 dark:text-sky-400'
                  "
                >
                  {{ targetFeasibilities[i].stones[0] === 'PURPLE' ? '보라' : '신비' }}
                  전용
                </span>
              </span>
            </span>
          </div>
          <button
            type="button"
            @click="removeTarget(i)"
            :disabled="targets.length <= 1"
            class="rounded-md ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 text-xs transition"
            title="이 옵션 제거"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          @click="runSimulation"
          :disabled="isRunning || validTargets.length === 0 || !allTargetsFeasible"
          class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
        >
          {{ isRunning ? '⏳ 시뮬 중...' : '🎲 목표 도달 시뮬' }}
        </button>
        <button
          type="button"
          @click="rollSample"
          class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-200 transition"
        >
          🎰 1회 굴려보기<span v-if="rollCount > 0" class="ml-1 text-xs text-stone-500 dark:text-stone-400">(누적 {{ fmt(rollCount) }}회)</span>
        </button>
        <button
          v-if="rollCount > 0"
          type="button"
          @click="resetRollCount"
          class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400 transition"
          title="누적 횟수 + 굴림 기록 초기화"
        >
          ↺ 초기화
        </button>
      </div>

      <RollBulkRun
        v-model:times="bulkTimes"
        :running="bulkRunning"
        :progress="bulkProgress"
        :summary="bulkSummary"
        :criterion="logCriterion"
        :option-label="logCriterion.option"
        :has-stats="hasStats"
        :costs="[
          { label: '인던 재료', per: COST_PER_ROLL.material },
          { label: '플래티넘 망치', per: COST_PER_ROLL.hammer },
        ]"
        @run="runBulk"
        @cancel="bulkCancel"
      />
    </section>

    <!-- 1회 굴림 미리보기 + 우측 기록 패널 -->
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <!-- 좌: 이번 굴림 카드 -->
      <section
        v-if="sampleRoll"
        class="rounded-2xl bg-stone-900 ring-1 ring-stone-700 p-5 shadow-lg"
      >
        <h2 class="text-base font-bold text-stone-200 mb-3 flex items-center justify-between">
          <span>🎰 1회 굴림 결과 <span class="text-xs text-emerald-300 font-semibold ml-1">#{{ fmt(lastRollIndex) }}회차</span></span>
          <span class="text-xs text-stone-400 font-normal">{{ sampleRoll.lineCount }}줄 · 누적 {{ fmt(rollCount) }}회</span>
        </h2>

        <div class="flex flex-wrap items-center gap-2 mb-3">
          <div
            :class="[
              'inline-block px-3 py-1.5 rounded-md ring-1 text-sm font-extrabold tracking-wide',
              sampleRoll.stone.key === 'PURPLE'
                ? 'ring-amber-300 text-amber-300'
                : 'ring-sky-400 text-sky-400',
            ]"
            :style="{
              textShadow:
                sampleRoll.stone.key === 'PURPLE' ? '0 0 4px #fde047' : '0 0 4px #38bdf8',
            }"
          >
            {{ sampleRoll.stone.name }}
          </div>

          <!-- 합산 크댐 환산 -->
          <div
            v-if="sampleConv"
            :class="[
              'inline-flex items-baseline gap-1 px-3 py-1.5 rounded-md ring-1 text-sm font-extrabold tabular-nums',
              sampleHit ? 'ring-orange-400/70 bg-orange-500/10' : 'ring-stone-600',
              totalBadgeClass(sampleConv.total),
            ]"
            title="이 카드의 모든 옵션을 크댐 하나로 환산했을 때의 합 (종합 BP 기준)"
          >
            <span class="text-[11px] font-semibold text-stone-400">크댐환산</span>
            {{ fmtRef(sampleConv.total) }}%
            <span v-if="sampleHit" class="text-[11px] font-semibold text-orange-300 ml-0.5">기록됨 ★</span>
          </div>
          <div
            v-else
            class="text-xs text-stone-500 px-2 py-1.5"
            title="T창 정보(주스탯/공격력/크댐 등)를 입력하면 환산이 활성화됩니다"
          >
            크댐환산 — T창 정보 필요
          </div>
        </div>

        <ul class="space-y-1.5 font-mono text-sm">
          <li
            v-for="(line, i) in sampleRoll.lines"
            :key="i"
            class="tabular-nums font-bold flex items-center justify-between gap-3"
          >
            <span
              :class="lineColorClass(line, sampleRoll.stone.key)"
              :style="{ textShadow: lineGlowShadow(line, sampleRoll.stone.key) }"
            >
              ▶ {{ line.base }} +{{ fmtVal(line.value) }}{{ line.unit }}
            </span>
            <span class="flex items-center gap-2 whitespace-nowrap">
              <span
                v-if="sampleConv && sampleConv.lines[i]"
                :class="[
                  'text-xs tabular-nums',
                  sampleConv.lines[i].convertible ? 'text-emerald-300/90' : 'text-stone-600',
                ]"
                :title="sampleConv.lines[i].convertible
                  ? '이 옵션 단독 효과를 크댐으로 환산한 값'
                  : '전투력 공식에 들어가지 않는 옵션 — 환산 제외'"
              >
                {{ sampleConv.lines[i].convertible ? '≈크댐 ' + fmtRef(sampleConv.lines[i].refAmount) + '%' : '환산 제외' }}
              </span>
              <span
                v-if="linePct(line) != null"
                :class="['text-xs tabular-nums', pctBadgeClass(linePct(line))]"
                :title="'해당 옵션 최대값 ' + fmtVal(maxPossibleValue(line.displayLabel)) + line.unit + ' 대비'"
              >
                {{ linePct(line) }}%
              </span>
            </span>
          </li>
        </ul>
      </section>

      <!-- 좌측 자리 채움 — 아직 한 번도 안 굴렸을 때 -->
      <section
        v-else
        class="rounded-2xl bg-stone-100 dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 p-5 text-sm text-stone-500 dark:text-stone-400"
      >
        🎰 위의 <strong>1회 굴려보기</strong>를 누르면 카드 1장이 여기 표시되고,
        크댐 환산 합이 기준치 이상이면 우측에 회차와 함께 기록됩니다.
      </section>

      <!-- 우: 굴림 기록 (공용 패널) -->
      <RollLogPanel
        v-model:criterion="logCriterion"
        :records="logRecords"
        :option-keys="AWAK_OPTION_KEYS"
        :has-stats="hasStats"
        title="📜 대박 굴림 기록"
        @clear="clearRollLog"
      />
    </div>

    <!-- 시뮬 조건 요약 -->
    <section
      v-if="result"
      class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
    >
      <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">
        🎯 시뮬 조건 요약
      </h2>
      <ul class="space-y-0.5 mb-2">
        <li
          v-for="(t, i) in result.targets"
          :key="i"
          class="text-sm text-cyan-600 dark:text-cyan-400 font-medium"
        >
          ▸ {{ t.displayLabel }} ≥ {{ t.value }}
        </li>
      </ul>
      <p class="text-xs text-stone-500 dark:text-stone-400">
        평균 <strong class="text-stone-700 dark:text-stone-200">{{ fmt(result.mean) }}회</strong> 시도 예상
        <span v-if="meanCost">
          (평균 인던 재료 <strong class="text-amber-700 dark:text-amber-300">{{ fmt(meanCost.material) }}</strong>개,
          망치 <strong class="text-rose-700 dark:text-rose-300">{{ fmt(meanCost.hammer) }}</strong>개)
        </span>
        · 단일 카드 성공률 {{ pctSmart(result.successRate) }}
      </p>
    </section>

    <!-- 1번 실행의 성공 카드 -->
    <section
      v-if="sampleWinningCard"
      class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
    >
      <div v-if="sampleWinningCard.success" class="space-y-3">
        <!-- 핵심 헤드라인 — N회차 + 실제 소비 -->
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-stone-200 dark:border-stone-700 pb-3">
          <span class="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
            🎉 {{ fmt(sampleWinningCard.tries) }}회차에 성공
          </span>
          <span class="text-sm text-stone-600 dark:text-stone-300 tabular-nums">
            <span class="text-amber-700 dark:text-amber-300 font-semibold">
              인던 재료 {{ fmt(sampleWinningCard.tries * COST_PER_ROLL.material) }}개
            </span>
            ·
            <span class="text-rose-700 dark:text-rose-300 font-semibold">
              플래티넘 망치 {{ fmt(sampleWinningCard.tries * COST_PER_ROLL.hammer) }}개
            </span>
          </span>
        </div>

        <p class="text-xs text-stone-500 dark:text-stone-400">
          이번 시뮬 1회 실행 결과 — 같은 조건이라도 매번 회차가 다릅니다 (위 버튼 다시 누르면 재실행).
        </p>

        <!-- 카드 -->
        <div class="rounded-lg bg-stone-900 ring-1 ring-emerald-500 p-3">
          <div
            :class="[
              'inline-block px-3 py-1 rounded ring-1 mb-2 text-xs font-extrabold tracking-wide',
              sampleWinningCard.card.stone.key === 'PURPLE'
                ? 'ring-amber-300 text-amber-300'
                : 'ring-sky-400 text-sky-400',
            ]"
          >
            {{ sampleWinningCard.card.stone.name }}
          </div>
          <ul class="space-y-1 font-mono text-sm mb-3">
            <li
              v-for="(line, i) in sampleWinningCard.card.lines"
              :key="i"
              class="tabular-nums flex items-center justify-between gap-3"
            >
              <span
                :class="
                  lineHighlights(line)
                    ? 'text-emerald-300 font-bold'
                    : lineColorClass(line, sampleWinningCard.card.stone.key)
                "
                :style="{
                  textShadow: lineHighlights(line)
                    ? undefined
                    : lineGlowShadow(line, sampleWinningCard.card.stone.key),
                }"
              >
                ▶ {{ line.base }} +{{ fmtVal(line.value) }}{{ line.unit }}
                <span v-if="lineHighlights(line)" class="text-[10px]">★</span>
              </span>
              <span
                v-if="linePct(line) != null"
                :class="['text-xs whitespace-nowrap tabular-nums', pctBadgeClass(linePct(line))]"
                :title="`해당 옵션 최대값 ${fmtVal(maxPossibleValue(line.displayLabel))}${line.unit} 대비`"
              >
                {{ linePct(line) }}%
              </span>
            </li>
          </ul>
          <div class="text-xs space-y-0.5 border-t border-emerald-700/50 pt-2 text-emerald-300">
            <div
              v-for="(t, i) in result?.targets ?? []"
              :key="i"
              class="font-medium"
            >
              ✓ <strong>{{ t.displayLabel }}</strong> ≥ {{ t.value }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-rose-600 dark:text-rose-400">
        ⚠ {{ fmt(sampleWinningCard.tries) }}회 굴렸지만 도달 실패 (maxTries 한도 초과).
      </div>
    </section>

    <p class="text-center text-[11px] text-stone-400 dark:text-stone-500 pt-2">
      자료 출처 ·
      <a
        href="https://lataleinfo.tistory.com"
        target="_blank"
        rel="noopener noreferrer"
        class="underline decoration-dotted hover:text-cyan-500 dark:hover:text-cyan-400"
      >라테일인포 (lataleinfo.tistory.com)</a>
    </p>
  </div>
</template>
