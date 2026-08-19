<script setup>
import { computed, ref, watch } from 'vue';
import { ITEM_AWAKENING_SETS } from '../data/itemAwakeningData.js';
import {
  rollOnceWith,
  createSampler,
  fmtOptionValue,
  rowLabel,
  dedupeKey,
  valuePassProb,
  checkTargets,
  computeStatistics,
  buildSuccessCard,
  sampleGeometricTries,
  sumGroups,
  maxPossibleSum,
  isVitalOption,
  vitalLabel,
} from '../utils/itemAwakeningSim.js';
import { ITEM_AWAKENING_SIM } from '../utils/simConstants.js';
import {
  normalizeItemAwakeningCard,
  itemAwakeningOptionKeys,
  evaluateLines,
} from '../utils/rollEquiv.js';
import { calculateBattlePower } from '../utils/battlePower.js';
import { useRollLog } from '../composables/useRollLog.js';
import { fmt, fmtInf, pctSmart } from '../utils/format.js';
import CollapsibleSection from './CollapsibleSection.vue';
import RollLogPanel from './RollLogPanel.vue';
import RollBulkRun from './RollBulkRun.vue';

const props = defineProps({
  // 활성 캐릭터 T창 스탯 — 굴림 결과의 "크댐 환산" 계산 기준 (없으면 환산 생략).
  stats: { type: Object, default: null },
});

const MAX_TARGETS = ITEM_AWAKENING_SIM.MAX_TARGETS;

// ============================================================
// 선택 상태
// ============================================================
const activeIdx = ref(0);
const activeSet = computed(() => ITEM_AWAKENING_SETS[activeIdx.value]);
// 가중 추첨 누적합은 세트당 1번만 만든다 (98종 세트 × 6회 롤 대비).
const sampler = computed(() => createSampler(activeSet.value.rows));

// ============================================================
// 돌려보기 + 굴림 기록
//   여러 번 돌리다 놓친 카드를 되짚어 볼 수 있게, 조건을 넘은 카드만
//   회차 번호와 함께 우측 패널에 누적한다 (조건/기록은 공용 컴포저블).
// ============================================================
const rolls = ref([]); // 최근 배치의 결과 카드만 표시 (누적 X)

const {
  criterion: logCriterion,
  records: logRecords,
  count: tryCount,
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
} = useRollLog('latale_itemAwakRollLog_v1');

const baseBP = computed(() => (props.stats ? calculateBattlePower(props.stats) : 0));
const hasStats = computed(() => baseBP.value > 0);
const statsForLog = computed(() => (hasStats.value ? props.stats : null));

// 기록 조건 셀렉트 목록 — 현재 세트의 옵션 (등급 통합)
const logOptionKeys = computed(() => itemAwakeningOptionKeys(activeSet.value.rows));

// 세트를 바꾸면 옵션 목록이 달라진다 — 없는 옵션이 선택돼 있으면 첫 옵션으로.
watch(logOptionKeys, (list) => {
  if (!list.length) return;
  if (!list.some((o) => o.key === logCriterion.value.option)) {
    logCriterion.value.option = list[0].key;
  }
}, { immediate: true });

function run(times) {
  const batch = [];
  for (let i = 0; i < times; i += 1) {
    const roll = rollOnceWith(sampler.value);
    const no = nextIndex();
    const r = recordRoll({
      lines: normalizeItemAwakeningCard(roll),
      stats: statsForLog.value,
      index: no,
      tag: activeSet.value.label,
    });
    batch.push({ ...roll, no, conv: r.evaluated, hit: r.hit });
  }
  rolls.value = batch;
}

// 대량 굴림 — N 회를 한 번에 돌리고, 끝나면 그 구간 최고 카드 1장만 남겨 보여준다.
async function runBulk(times) {
  const smp = sampler.value;
  const s = await bulkRun({
    times,
    rollFn: () => rollOnceWith(smp),
    normalize: normalizeItemAwakeningCard,
    stats: statsForLog.value,
    tag: activeSet.value.label,
  });
  if (s && s.bestCard) {
    rolls.value = [{ ...s.bestCard, no: s.bestIndex, conv: s.bestEvaluated, hit: s.bestHit }];
  }
}

function resetRolls() {
  rolls.value = [];
  resetRollLog();
}

// 환산치 표시 — 소수 1자리, 정수면 정수
function fmtRef(v) {
  if (!Number.isFinite(Number(v))) return '-';
  const n = Number(v);
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}

// ============================================================
// 목표 옵션 시뮬
//   targets = [{ mode, rowIndex, name, minValue }]  (minValue 는 입력 문자열)
//     mode 'row' — 특정 등급의 특정 옵션
//     mode 'sum' — 같은 옵션의 등급 무관 합계
//                  (중복 판정이 "등급+옵션명" 이라 같은 옵션도 등급이 다르면
//                   한 카드에 같이 붙는다. 예: [3] 무공 8% + [2] 무공 5% = 13%)
// ============================================================
const targets = ref([{ mode: 'row', rowIndex: 0, name: '', minValue: '' }]);
const isAnalyzing = ref(false);
const analysis = ref(null); // { targets, stats, tries, card }

// 합계 목표로 지정 가능한 옵션 (한 옵션이 2개 이상 등급에 걸쳐 있는 경우)
const groups = computed(() => sumGroups(activeSet.value.rows));
const groupByName = computed(() => new Map(groups.value.map((g) => [g.name, g])));

function addTarget() {
  if (targets.value.length >= MAX_TARGETS) return;
  const usedKeys = new Set(
    targets.value.filter((t) => t.mode === 'row').map((t) => dedupeKey(activeSet.value.rows[t.rowIndex])),
  );
  // 이미 쓰인 중복키를 피해 기본값을 고른다 — 애초에 불가능한 조합으로 시작하지 않도록.
  const nextIdx = activeSet.value.rows.findIndex((r) => !usedKeys.has(dedupeKey(r)));
  targets.value.push({
    mode: 'row',
    rowIndex: nextIdx >= 0 ? nextIdx : 0,
    name: '',
    minValue: '',
  });
}

function removeTarget(i) {
  if (targets.value.length <= 1) return;
  targets.value.splice(i, 1);
}

// 모드를 바꾸면 가리키는 대상이 달라지므로 기본값을 다시 잡는다.
function setMode(t, mode) {
  if (t.mode === mode) return;
  t.mode = mode;
  t.minValue = '';
  if (mode === 'sum') t.name = groups.value[0]?.name ?? '';
}

// 세트가 바뀌면 rowIndex/name 이 다른 표를 가리키므로 목표·결과를 모두 초기화한다.
watch(activeIdx, () => {
  targets.value = [{ mode: 'row', rowIndex: 0, name: '', minValue: '' }];
  analysis.value = null;
  resetRolls();
});

// 수치가 비어 있으면 "옵션만 뜨면 OK" 로 보고 최소 도달값을 목표로 삼는다.
const validTargets = computed(() =>
  targets.value.map((t) => {
    const raw = String(t.minValue).trim();
    if (t.mode === 'sum') {
      const g = groupByName.value.get(t.name);
      const floor = g ? Math.min(...g.rowIndexes.map((i) => Number(activeSet.value.rows[i].min))) : 0;
      const v = raw === '' ? floor : Number(raw);
      return { mode: 'sum', name: t.name, minValue: Number.isFinite(v) ? v : floor };
    }
    const row = activeSet.value.rows[t.rowIndex];
    const v = raw === '' ? Number(row.min) : Number(raw);
    return { mode: 'row', rowIndex: t.rowIndex, minValue: Number.isFinite(v) ? v : Number(row.min) };
  }),
);

const targetCheck = computed(() => checkTargets(activeSet.value.rows, validTargets.value));

// 행별 안내 — 최대치 초과 / 다른 목표와 겹침 / 참고 확률
const targetHints = computed(() =>
  targets.value.map((t, i) => {
    const vt = validTargets.value[i];
    const conflict = (targetCheck.value.conflicts || []).includes(i);
    const overMax = (targetCheck.value.overMax || []).includes(i);
    if (t.mode === 'sum') {
      const g = groupByName.value.get(t.name);
      return {
        mode: 'sum',
        conflict,
        overMax,
        max: maxPossibleSum(activeSet.value.rows, t.name),
        tiers: g ? g.tiers.join(' + ') : '',
        placeholder: '합계',
      };
    }
    const row = activeSet.value.rows[t.rowIndex];
    return {
      mode: 'row',
      conflict,
      overMax,
      max: Number(row.max),
      valueProb: valuePassProb(row, vt.minValue),
      placeholder: `≥ ${fmtOptionValue(row.min)}`,
    };
  }),
);

async function runAnalysis() {
  if (!targetCheck.value.ok) return;
  isAnalyzing.value = true;
  analysis.value = null;
  // 최대 ~수백 ms 동기 루프라 스피너가 먼저 그려지도록 한 프레임 양보.
  await new Promise((r) => setTimeout(r, 30));
  try {
    const rows = activeSet.value.rows;
    const ts = validTargets.value;
    const stats = computeStatistics(rows, ts);
    let tries = Infinity;
    let card = null;
    if (stats.successRate > 0) {
      tries = sampleGeometricTries(stats.successRate);
      card = buildSuccessCard(rows, ts, stats.composition);
    }
    analysis.value = { targets: ts, stats, tries, card };
  } finally {
    isAnalyzing.value = false;
  }
}

// 성공 카드에서 목표에 기여한 줄인지 표시
function isTargetLine(line) {
  if (!analysis.value) return false;
  return analysis.value.targets.some((t) =>
    t.mode === 'sum'
      ? line.name === t.name
      : t.rowIndex === line.rowIndex && line.value >= t.minValue,
  );
}

// 합계 목표별 실제 달성치 (성공 카드 요약용)
const achievedSums = computed(() => {
  if (!analysis.value?.card) return [];
  return analysis.value.targets
    .filter((t) => t.mode === 'sum')
    .map((t) => ({
      name: t.name,
      target: t.minValue,
      total: analysis.value.card.lines
        .filter((l) => l.name === t.name)
        .reduce((a, l) => a + l.value, 0),
      parts: analysis.value.card.lines.filter((l) => l.name === t.name).length,
    }));
});

// ============================================================
// 스타일 매핑
// ============================================================
// 유효옵(무기 공격력, 크리티컬 대미지 …)은 굵게만 두면 눈에 안 들어와서 등급 색으로 칠한다.
//   [1] 초록 / [2] 노랑 / [3] 빨강 / [S] 보라 — 배지와 옵션 글자에 같은 색을 쓴다.
// 유효옵이 아닌 줄은 회색으로 눌러 유효옵만 떠 보이게 한다.
const TIER_CHIP = {
  1: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
  2: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  3: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
  S: 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300',
};
const MUTED_CHIP = 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400';

const TIER_TEXT = {
  1: 'text-emerald-600 dark:text-emerald-300',
  2: 'text-amber-600 dark:text-amber-300',
  3: 'text-rose-600 dark:text-rose-300',
  S: 'text-violet-600 dark:text-violet-300',
};
const MUTED_TEXT = 'text-stone-500 dark:text-stone-400';

function tierChip(tier, vital = true) {
  const palette = (vital && TIER_CHIP[tier]) || MUTED_CHIP;
  return `inline-block rounded px-1.5 text-[11px] font-bold tabular-nums align-[1px] ${palette}`;
}

// 범례에 쓸 유효옵 목록 — 세트마다 있는 옵션이 달라서 고정 문구로 두면 거짓말이 된다.
// (예: 올스탯% 는 액세서리 세트에만 있고 무기/정령석에는 아예 없다)
const vitalNamesInSet = computed(() => {
  const seen = new Set();
  for (const row of activeSet.value.rows) {
    if (isVitalOption(row)) seen.add(vitalLabel(row));
  }
  return [...seen];
});

// 유효옵만 등급 색 + 굵게. grade(값이 얼마나 잘 떴나)는 색을 또 쓰면 축이 겹치므로 밑줄로 얹는다.
//   (grade 가 붙는 줄은 전부 유효옵이다 — 3등급 주력 딜옵 / 대미지 감소% / S등급 스킬)
function lineClass(line) {
  if (!line.vital) return MUTED_TEXT;
  const strong = line.grade === 's-strong' ? ' underline decoration-2 underline-offset-2' : '';
  return `${TIER_TEXT[line.tier] ?? ''} font-bold${strong}`;
}

// ============================================================
// 등급% — 이 줄의 값이 해당 등급 행의 최대치 대비 몇 % 인지
//   (인챈트 시뮬 규칙: value / max × 100, Math.floor · ≥90 빨강 / ≥70 노랑)
//   min~max 가 등급([1]~[3]/[S])마다 다르므로 "그 줄이 속한 행" 의 max 를 기준으로 잡는다.
// ============================================================
function lineRow(line) {
  if (!line || line.rowIndex == null) return null;
  return activeSet.value.rows[line.rowIndex] ?? null;
}

function lineMax(line) {
  const row = lineRow(line);
  return row ? Number(row.max) : null;
}

function linePct(line) {
  const max = lineMax(line);
  if (!max || line.value == null) return null;
  const p = (Number(line.value) / max) * 100;
  if (!Number.isFinite(p)) return null;
  return Math.floor(p);
}

function pctBadgeClass(p) {
  if (p == null) return 'text-stone-400 dark:text-stone-500';
  if (p >= 90) return 'text-rose-600 dark:text-rose-400 font-bold';
  if (p >= 70) return 'text-amber-600 dark:text-amber-400 font-bold';
  return 'text-stone-400 dark:text-stone-500';
}

// 합계 목표 달성치의 % — 이론상 최대 합계 대비
function sumPct(s) {
  const max = maxPossibleSum(activeSet.value.rows, s.name);
  if (!max) return null;
  const p = (Number(s.total) / Number(max)) * 100;
  return Number.isFinite(p) ? Math.floor(p) : null;
}

function cardStyle(roll) {
  if (roll.hasS) {
    return 'ring-2 ring-fuchsia-400 dark:ring-fuchsia-500 bg-fuchsia-50/60 dark:bg-fuchsia-950/20';
  }
  if (roll.hasGood) {
    return 'ring-2 ring-orange-400 dark:ring-orange-500 bg-orange-50/60 dark:bg-orange-950/20';
  }
  return 'ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800';
}
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div
      class="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 py-3 text-sm text-cyan-800 dark:text-cyan-200"
    >
      <strong>💠 아이템 각성 시뮬레이터</strong> · 장비/파츠 종류별 각성 옵션을 실제 확률표대로
      돌려보고, <strong>원하는 옵션이 나올 때까지 몇 번 각성해야 하는지</strong>를 분석한다.
      <br />
      <strong>옵션 수</strong>: 기본 2줄 확정 → 50% 로 3줄 → 3줄이 떴을 때만 30% 로 4줄. 한 카드
      안에서 같은 등급·같은 옵션은 중복되지 않는다.
      <br />
      <strong>강조</strong>:
      <span class="text-amber-500 dark:text-amber-400 font-bold">◆</span> = 유효옵 (챙길 값어치가
      있는 주력 옵션 — 이 세트 기준:
      <template v-if="vitalNamesInSet.length">{{ vitalNamesInSet.join(', ') }}</template>
      <template v-else>없음</template>). 유효옵만 등급 색으로 칠하고, 나머지 줄은
      <span :class="MUTED_TEXT">회색</span>으로 눌러둔다.
      <br />
      <strong>유효옵 등급 색</strong>:
      <span :class="tierChip(1)">[1]</span> <span :class="`${TIER_TEXT[1]} font-bold`">초록</span> ·
      <span :class="tierChip(2)">[2]</span> <span :class="`${TIER_TEXT[2]} font-bold`">노랑</span> ·
      <span :class="tierChip(3)">[3]</span> <span :class="`${TIER_TEXT[3]} font-bold`">빨강</span> ·
      <span :class="tierChip('S')">[S]</span>
      <span :class="`${TIER_TEXT.S} font-bold`">보라</span> — 숫자가 클수록 같은 옵션이라도 수치
      범위가 높다 (S 는 스킬 레벨 옵션).
      <span class="font-bold underline decoration-2 underline-offset-2">밑줄</span> = S등급 18 이상.
      <br />
      <strong class="text-xs">⚠️</strong> 비공식 시뮬레이터 — 공개 자료 기반이라 실제 게임 확률과
      다를 수 있음.
    </div>

    <!-- 각성 대상 선택 -->
    <section
      class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
    >
      <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-4">⚙️ 각성 대상 선택</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(set, idx) in ITEM_AWAKENING_SETS"
          :key="set.id"
          type="button"
          @click="activeIdx = idx"
          :class="[
            'rounded-md px-3 py-1.5 text-xs font-medium transition',
            activeIdx === idx
              ? 'bg-cyan-600 text-white'
              : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
          ]"
        >
          {{ set.label }}
        </button>
      </div>
      <div class="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700">
        <div class="text-xl font-bold text-stone-800 dark:text-stone-100">
          {{ activeSet.category }}
        </div>
        <div class="text-sm text-stone-500 dark:text-stone-400">
          {{ activeSet.level }} · 옵션 {{ activeSet.rows.length }}종
        </div>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- 목표 옵션 시뮬                                                -->
    <!-- ============================================================ -->
    <section
      class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
    >
      <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-1">🎯 목표 옵션 시뮬</h2>
      <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
        원하는 옵션 + 최소 수치를 지정하면 <strong>한 번의 각성으로 전부 동시에</strong> 만족할
        확률과, 거기까지 필요한 각성 횟수를 계산한다. 수치를 비우면 "옵션만 뜨면 OK"로 본다.
        (최대 {{ MAX_TARGETS }}개 — 한 카드 최대 줄 수)
      </p>

      <div class="space-y-3">
        <div v-for="(t, i) in targets" :key="i" class="flex flex-wrap items-start gap-2">
          <!-- 모드 토글: 등급 지정 / 등급 합계 -->
          <div class="inline-flex rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden">
            <button
              type="button"
              @click="setMode(t, 'row')"
              :class="[
                'px-2.5 py-2 text-xs font-medium transition',
                t.mode === 'row'
                  ? 'bg-cyan-600 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              등급 지정
            </button>
            <button
              type="button"
              @click="setMode(t, 'sum')"
              :disabled="groups.length === 0"
              :class="[
                'px-2.5 py-2 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed',
                t.mode === 'sum'
                  ? 'bg-cyan-600 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              등급 합계
            </button>
          </div>

          <select
            v-if="t.mode === 'row'"
            v-model.number="t.rowIndex"
            class="flex-1 min-w-[15rem] rounded-lg px-3 py-2 text-sm bg-white dark:bg-stone-900 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200"
          >
            <option v-for="(row, ri) in activeSet.rows" :key="ri" :value="ri">
              {{ isVitalOption(row) ? '◆ ' : '' }}{{ rowLabel(row) }}
            </option>
          </select>
          <select
            v-else
            v-model="t.name"
            class="flex-1 min-w-[15rem] rounded-lg px-3 py-2 text-sm bg-white dark:bg-stone-900 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200"
          >
            <option v-for="g in groups" :key="g.name" :value="g.name">
              {{ g.name }} — 등급 {{ g.tiers.join('+') }} 합산 (최대 {{ fmtOptionValue(g.maxSum) }})
            </option>
          </select>

          <input
            v-model="t.minValue"
            type="number"
            step="any"
            :placeholder="targetHints[i].placeholder"
            class="w-28 rounded-lg px-3 py-2 text-sm bg-white dark:bg-stone-900 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200"
          />
          <button
            type="button"
            @click="removeTarget(i)"
            :disabled="targets.length <= 1"
            class="rounded-lg px-3 py-2 text-sm ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            ✕
          </button>

          <div class="w-full text-xs pl-1">
            <span v-if="targetHints[i].overMax" class="text-rose-600 dark:text-rose-400">
              ⚠ 도달 가능한 최대치({{ fmtOptionValue(targetHints[i].max) }})를 넘는 수치입니다 —
              달성 불가.
            </span>
            <span v-else-if="targetHints[i].conflict" class="text-rose-600 dark:text-rose-400">
              ⚠ 다른 목표와 같은 옵션을 가리켜 서로 간섭합니다 — 하나로 합쳐주세요.
            </span>
            <span v-else-if="targetHints[i].mode === 'sum'" class="text-stone-400 dark:text-stone-500">
              등급 {{ targetHints[i].tiers }} 을(를) 합산 · 이론상 최대
              {{ fmtOptionValue(targetHints[i].max) }}
              — 여러 등급이 같이 떠야 하므로 등장 확률이 낮아집니다.
            </span>
            <span v-else class="text-stone-400 dark:text-stone-500">
              이 줄이 떴을 때 수치 통과 확률 {{ pctSmart(targetHints[i].valueProb) }}
            </span>
          </div>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          @click="addTarget"
          :disabled="targets.length >= MAX_TARGETS"
          class="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          ＋ 목표 추가
        </button>
        <button
          type="button"
          @click="runAnalysis"
          :disabled="!targetCheck.ok || isAnalyzing"
          class="rounded-lg px-4 py-2 text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {{ isAnalyzing ? '분석 중…' : '📈 시뮬 실행' }}
        </button>
      </div>

      <!-- 분석 결과 -->
      <div v-if="analysis" class="mt-5 pt-5 border-t border-stone-200 dark:border-stone-700">
        <div
          v-if="analysis.stats.successRate <= 0"
          class="rounded-xl bg-rose-50 dark:bg-rose-950/30 ring-1 ring-rose-200 dark:ring-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
        >
          <strong>사실상 불가능</strong> — 표본 {{ fmt(ITEM_AWAKENING_SIM.PRESENCE_PHASE2) }}회
          안에서 이 조합이 한 번도 등장하지 않았습니다. 목표 수를 줄이거나 더 흔한 옵션으로
          바꿔보세요.
        </div>

        <template v-else>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div class="rounded-xl bg-stone-50 dark:bg-stone-900/40 p-3">
              <div class="text-xs text-stone-500 dark:text-stone-400">1회 성공 확률</div>
              <div class="text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
                {{ pctSmart(analysis.stats.successRate) }}
              </div>
            </div>
            <div class="rounded-xl bg-stone-50 dark:bg-stone-900/40 p-3">
              <div class="text-xs text-stone-500 dark:text-stone-400">평균 소요</div>
              <div class="text-lg font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {{ fmtInf(Math.round(analysis.stats.mean)) }}회
              </div>
            </div>
            <div class="rounded-xl bg-stone-50 dark:bg-stone-900/40 p-3">
              <div class="text-xs text-stone-500 dark:text-stone-400">절반이 성공 (p50)</div>
              <div class="text-lg font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {{ fmtInf(analysis.stats.p50) }}회
              </div>
            </div>
            <div class="rounded-xl bg-stone-50 dark:bg-stone-900/40 p-3">
              <div class="text-xs text-stone-500 dark:text-stone-400">99%가 성공 (p99)</div>
              <div class="text-lg font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {{ fmtInf(analysis.stats.p99) }}회
              </div>
            </div>
          </div>

          <div class="text-xs text-stone-500 dark:text-stone-400 mb-4">
            분위수 —
            <strong>p25</strong> {{ fmtInf(analysis.stats.p25) }}회 ·
            <strong>p75</strong> {{ fmtInf(analysis.stats.p75) }}회 ·
            <strong>p90</strong> {{ fmtInf(analysis.stats.p90) }}회 ·
            <strong>p99.9</strong> {{ fmtInf(analysis.stats.p999) }}회
            <br />
            구성 — 목표 옵션이 전부 등장할 확률
            {{ pctSmart(analysis.stats.compositionRate) }} × 수치 조건 통과 확률
            {{ pctSmart(analysis.stats.valueProb) }}
          </div>

          <!-- 합계 목표 달성 요약 -->
          <div
            v-if="achievedSums.length"
            class="mb-4 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 py-3 text-sm text-cyan-800 dark:text-cyan-200"
          >
            <div
              v-for="s in achievedSums"
              :key="s.name"
              class="flex items-center justify-between gap-3"
            >
              <span>
                <strong>{{ s.name }}</strong> 합계
                <strong>{{ fmtOptionValue(s.total) }}</strong>
                (목표 {{ fmtOptionValue(s.target) }}) — {{ s.parts }}개 등급 합산
              </span>
              <span
                v-if="sumPct(s) != null"
                :class="['text-xs whitespace-nowrap tabular-nums', pctBadgeClass(sumPct(s))]"
                :title="`이론상 최대 합계 ${fmtOptionValue(maxPossibleSum(activeSet.rows, s.name))} 대비`"
              >
                [{{ sumPct(s) }}%]
              </span>
            </div>
          </div>

          <!-- 성공 카드 샘플 -->
          <div v-if="analysis.card">
            <div class="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">
              🎉 성공 카드 예시 —
              <span class="text-cyan-700 dark:text-cyan-300">
                {{ fmtInf(analysis.tries) }}회차
              </span>
              에 등장
            </div>
            <div :class="['rounded-xl p-4 shadow-sm max-w-xl', cardStyle(analysis.card)]">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-bold text-stone-700 dark:text-stone-200">각성 결과</span>
                <span class="text-xs text-stone-500 dark:text-stone-400">
                  {{ analysis.card.count }}옵션
                </span>
              </div>
              <div class="space-y-1">
                <div
                  v-for="(line, i) in analysis.card.lines"
                  :key="i"
                  class="text-sm leading-relaxed flex items-center justify-between gap-3"
                >
                  <span :class="lineClass(line)">
                    <span v-if="isTargetLine(line)" class="text-cyan-600 dark:text-cyan-400">★</span>
                    <span
                      v-if="line.vital"
                      class="text-amber-500 dark:text-amber-400"
                      title="유효옵 — 각성석에서도 유효옵으로 표기되는 주력 옵션"
                      >◆</span
                    >
                    <span :class="tierChip(line.tier, line.vital)">[{{ line.tier }}]</span>
                    {{ line.body }}
                  </span>
                  <span
                    v-if="linePct(line) != null"
                    :class="['text-xs whitespace-nowrap tabular-nums', pctBadgeClass(linePct(line))]"
                    :title="`[${line.tier}] 등급 최대 ${fmtOptionValue(lineMax(line))} 대비`"
                  >
                    [{{ linePct(line) }}%]
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- 돌려보기 + 우측 굴림 기록                                      -->
    <!-- ============================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <section
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <div class="flex flex-wrap items-end justify-between gap-4 mb-4">
          <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">🎲 직접 돌려보기</h2>
          <div class="text-right">
            <div class="text-xs text-stone-500 dark:text-stone-400">시도 횟수</div>
            <div class="text-2xl font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
              {{ fmt(tryCount) }}회
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            @click="run(1)"
            class="rounded-lg px-4 py-2.5 text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 transition"
          >
            🎯 1회 돌리기
          </button>
          <button
            type="button"
            @click="run(6)"
            class="rounded-lg px-4 py-2.5 text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 transition"
          >
            🔥 6회 돌리기
          </button>
          <button
            type="button"
            @click="resetRolls"
            class="rounded-lg px-4 py-2.5 text-sm font-semibold bg-white dark:bg-stone-800 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition"
            title="시도 횟수 + 굴림 기록 초기화"
          >
            ♻️ 초기화
          </button>
        </div>

        <RollBulkRun
          v-model:times="bulkTimes"
          :running="bulkRunning"
          :progress="bulkProgress"
          :summary="bulkSummary"
          :criterion="logCriterion"
          :option-label="logOptionKeys.find((o) => o.key === logCriterion.option)?.label ?? ''"
          :has-stats="hasStats"
          @run="runBulk"
          @cancel="bulkCancel"
        />

        <p
          v-if="rolls.length === 0"
          class="text-sm text-stone-500 dark:text-stone-400 py-6 text-center"
        >
          돌리기 버튼을 눌러주세요. 설정한 조건을 넘은 카드는 우측에 회차와 함께 기록됩니다.
        </p>

        <div
          v-else
          class="mt-4"
          :class="
            rolls.length === 1
              ? 'grid grid-cols-1'
              : 'grid grid-cols-1 md:grid-cols-2 gap-3'
          "
        >
          <div
            v-for="roll in rolls"
            :key="roll.no"
            :class="['rounded-xl p-4 shadow-sm', cardStyle(roll)]"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-bold text-stone-700 dark:text-stone-200">각성 결과</span>
              <span class="text-xs text-stone-500 dark:text-stone-400">
                #{{ roll.no }} · {{ roll.count }}옵션
              </span>
            </div>
            <div
              v-if="roll.conv"
              :class="[
                'inline-flex items-baseline gap-1 px-2 py-0.5 rounded ring-1 mb-2 text-xs font-extrabold tabular-nums',
                roll.hit
                  ? 'ring-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300'
                  : 'ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400',
              ]"
              title="이 카드의 모든 옵션을 크댐 하나로 환산했을 때의 합 (종합 BP 기준)"
            >
              <span class="text-[10px] font-semibold text-stone-400">크댐환산</span>
              {{ fmtRef(roll.conv.total) }}%
              <span v-if="roll.hit" class="text-[10px] font-semibold ml-0.5">기록됨 ★</span>
            </div>
            <div
              v-else-if="roll.hit"
              class="inline-flex px-2 py-0.5 rounded ring-1 mb-2 text-xs font-extrabold ring-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300"
            >
              기록됨 ★
            </div>
            <div class="space-y-1">
              <div
                v-for="(line, i) in roll.lines"
                :key="i"
                class="text-sm leading-relaxed flex items-center justify-between gap-3"
              >
                <span :class="lineClass(line)">
                  <span
                    v-if="line.vital"
                    class="text-amber-500 dark:text-amber-400"
                    title="유효옵 — 각성석에서도 유효옵으로 표기되는 주력 옵션"
                    >◆</span
                  >
                  <span :class="tierChip(line.tier, line.vital)">[{{ line.tier }}]</span>
                  {{ line.body }}
                </span>
                <span class="flex items-center gap-2 whitespace-nowrap">
                  <span
                    v-if="roll.conv && roll.conv.lines[i] && roll.conv.lines[i].convertible"
                    class="text-xs tabular-nums text-emerald-600 dark:text-emerald-400"
                    title="이 옵션 단독 효과를 크댐으로 환산한 값"
                  >
                    ≈크댐 {{ fmtRef(roll.conv.lines[i].refAmount) }}%
                  </span>
                  <span
                    v-if="linePct(line) != null"
                    :class="['text-xs tabular-nums', pctBadgeClass(linePct(line))]"
                    :title="'[' + line.tier + '] 등급 최대 ' + fmtOptionValue(lineMax(line)) + ' 대비'"
                  >
                    [{{ linePct(line) }}%]
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RollLogPanel
        v-model:criterion="logCriterion"
        :records="logRecords"
        :option-keys="logOptionKeys"
        :has-stats="hasStats"
        title="📜 대박 각성 기록"
        equiv-note="스킬 레벨·백어택 등 T창 BP 식 밖의 옵션은 환산에서 빠집니다."
        @clear="clearRollLog"
      />
    </div>


    <!-- ============================================================ -->
    <!-- 확률표 (기본 접힘)                                            -->
    <!-- ============================================================ -->
    <CollapsibleSection
      id="itemAwakening.table"
      :title="`📊 확률표 · ${activeSet.label} (${activeSet.rows.length}종)`"
      :default-open="false"
    >
      <div
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr
                class="text-left text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700"
              >
                <th class="py-2 pr-3 font-medium">등급</th>
                <th class="py-2 pr-3 font-medium">옵션</th>
                <th class="py-2 pr-3 font-medium text-right">범위</th>
                <th class="py-2 font-medium text-right">확률</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in activeSet.rows"
                :key="i"
                class="border-b border-stone-100 dark:border-stone-700/50"
              >
                <td class="py-1.5 pr-3">
                  <span :class="tierChip(row.tier, isVitalOption(row))">[{{ row.tier }}]</span>
                </td>
                <td
                  :class="[
                    'py-1.5 pr-3',
                    isVitalOption(row) ? `${TIER_TEXT[row.tier] ?? ''} font-bold` : MUTED_TEXT,
                  ]"
                >
                  <span v-if="isVitalOption(row)" class="text-amber-500 dark:text-amber-400">◆</span>
                  {{ row.name }}
                </td>
                <td class="py-1.5 pr-3 text-right tabular-nums text-stone-600 dark:text-stone-300">
                  {{ fmtOptionValue(row.min) }} ~ {{ fmtOptionValue(row.max) }}
                </td>
                <td class="py-1.5 text-right tabular-nums text-stone-600 dark:text-stone-300">
                  {{ row.prob }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </CollapsibleSection>
  </div>
</template>
