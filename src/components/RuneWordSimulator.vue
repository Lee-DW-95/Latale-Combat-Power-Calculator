<script setup>
import { computed, ref, watch } from 'vue';
import {
  RUNES,
  RUNE_SLOTS,
  ELY_PER_ROLL,
  MAX_TOTAL,
  GRADES,
  RUNE_OPTIONS,
  RUNE_OPTION_GROUPS,
  RUNE_OPTION_BY_KEY,
  displayDesc,
  isMidRune,
  isMajorRune,
} from '../data/runeWordData.js';
import {
  buildResult,
  rollRuneWord,
  normalizeTarget,
  hasAnyCondition,
  computeTargetStats,
  simulateUntilTarget,
  maxAchievableTotal,
  contributingRuneIds,
  MAX_OPTION_TARGETS,
} from '../utils/runeWordSim.js';
import { fmt, fmtInf, pctSmart } from '../utils/format.js';

const INSIGHT_ID = 19;   // 통찰 — 왕룬 점수 예외
const FIRST_COMBO_ID = 20; // 20번부터 복합 룬

// ============================================================
// 서브 탭
// ============================================================
const SUB_TABS = [
  { id: 'manual',  label: '내 룬워드 책정' },
  { id: 'target',  label: '목표 옵션 시뮬' },
  { id: 'sim',     label: '무작위 시뮬' },
  { id: 'options', label: '룬워드 옵션표' },
];
const subTab = ref('manual');

// ============================================================
// 표시 헬퍼
// ============================================================
// 등급별 점수 색 — 상승/하락이 아니라 "가치 등급"이라 stone→cyan→amber→rose 로 단계화
const GRADE_TEXT = {
  bad:   'text-stone-500 dark:text-stone-400',
  temp:  'text-cyan-600 dark:text-cyan-400',
  final: 'text-amber-600 dark:text-amber-400',
  god:   'text-rose-600 dark:text-rose-400',
};
const GRADE_CHIP = {
  bad:   'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300',
  temp:  'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300',
  final: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  god:   'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
};

// 룬 등급 — 이름을 색칠하는 대신 좌측 액센트 바와 칩으로 표현한다
function runeTier(rune) {
  if (isMajorRune(rune)) return 'major';
  if (isMidRune(rune)) return 'mid';
  if (rune.score > 0) return 'minor';
  return 'none';
}
const TIER_BAR = {
  major: 'before:bg-rose-500',
  mid:   'before:bg-amber-500',
  minor: 'before:bg-stone-300 dark:before:bg-stone-600',
  none:  'before:bg-transparent',
};
const TIER_CHIP = {
  major: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
  mid:   'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  minor: '',
  none:  '',
};
const TIER_LABEL = { major: '주요', mid: '준주요', minor: '', none: '' };

// 옵션은 "이 옵션을 가진 룬 중 최고 점수" 로 등급을 매긴다
function tierOfScore(score) {
  if (score >= 30) return 'major';
  if (score >= 20) return 'mid';
  if (score > 0) return 'minor';
  return 'none';
}

// 왕룬 자리 점수 (통찰만 120 고정)
function scoreAsKing(rune) {
  return rune.id === INSIGHT_ID ? 120 : rune.score * 2;
}

// Ely 는 자릿수가 커서 조/억 단위로 축약 (원값은 title 로)
function fmtEly(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
  if (n >= 1e8) return `${fmt(Math.round(n / 1e8))}억`;
  return fmt(Math.round(n));
}

// ============================================================
// [1] 내 룬워드 책정기 — 8개 클릭, 마지막이 왕룬
// ============================================================
const manualOrder = ref([]);
const manualResult = ref(null);

const manualOrderMap = computed(() => {
  const m = {};
  manualOrder.value.forEach((id, i) => {
    m[id] = { order: i + 1, isKing: i === RUNE_SLOTS - 1 };
  });
  return m;
});

const manualKing = computed(() =>
  manualOrder.value.length === RUNE_SLOTS ? RUNES[manualOrder.value[RUNE_SLOTS - 1]] : null
);

// 8개 미만이면 왕룬 배수를 적용하지 않은 단순 합
const manualRunningTotal = computed(() => {
  const ids = manualOrder.value;
  if (ids.length === 0) return 0;
  if (ids.length === RUNE_SLOTS) return buildResult(ids).total;
  return ids.reduce((s, id) => s + RUNES[id].score, 0);
});

function toggleManualRune(id) {
  const idx = manualOrder.value.indexOf(id);
  if (idx >= 0) {
    manualOrder.value.splice(idx, 1);
  } else {
    if (manualOrder.value.length >= RUNE_SLOTS) return;
    manualOrder.value.push(id);
  }
  manualResult.value = null;
}

function calcManual() {
  if (manualOrder.value.length !== RUNE_SLOTS) return;
  manualResult.value = buildResult([...manualOrder.value]);
}

function resetManual() {
  manualOrder.value = [];
  manualResult.value = null;
}

// ============================================================
// [2] 목표 옵션 시뮬
// ============================================================
// 목표를 고르는 방식 — 옵션 기준이 기본.
//   'option' : 크리티컬 대미지 / 관통력 처럼 "붙었으면 하는 옵션" 으로 고른다.
//              같은 옵션이 여러 룬에 걸쳐 있어서(크댐 = 파멸 | 파멸&폭주) 룬 이름만으론 지정할 수 없다.
//   'rune'   : 특정 룬 자체를 지정한다.
const tSelectMode = ref('option');

// 목표는 각성석/메모리얼 시뮬과 동일하게 "행 추가" 방식으로 고른다.
//   각 행 = select 하나. '' 이면 그 행은 조건 없음.
const tOptionRows = ref([{ key: RUNE_OPTIONS[0].key }]);
const tRuneRows = ref([{ id: '' }]);

const tOptionKeys = computed(() => [
  ...new Set(tOptionRows.value.map((r) => r.key).filter(Boolean)),
]);
const tRuneIds = computed(() => [
  ...new Set(tRuneRows.value.map((r) => r.id).filter((v) => v !== '' && v != null).map(Number)),
]);

const tMode = ref('all');   // 'all' | 'atLeast'
const tAtLeast = ref(1);
const tKingId = ref('');    // '' = 상관없음
const tMinTotal = ref('');
const tStats = ref(null);
const tSample = ref(null);
const tRunning = ref(false);
const tRunTarget = ref(null);

const target = computed(() =>
  normalizeTarget({
    selectMode: tSelectMode.value,
    runeIds: tRuneIds.value,
    optionKeys: tOptionKeys.value,
    mode: tMode.value,
    atLeast: tAtLeast.value,
    kingId: tKingId.value === '' ? null : Number(tKingId.value),
    minTotal: tMinTotal.value,
  })
);

// 현재 모드에서 선택된 목표 개수
const tSelectedCount = computed(() =>
  tSelectMode.value === 'option' ? tOptionKeys.value.length : tRuneIds.value.length
);

// 행에 선택된 옵션 객체 (없으면 null)
function rowOption(row) {
  return row?.key ? RUNE_OPTION_BY_KEY[row.key] ?? null : null;
}

// 모드별 목표 행 배열 / 최대 행 수
const targetRows = computed(() => (tSelectMode.value === 'option' ? tOptionRows.value : tRuneRows.value));
const maxTargetRows = computed(() => (tSelectMode.value === 'option' ? MAX_OPTION_TARGETS : RUNE_SLOTS));

function setSelectMode(m) {
  if (tSelectMode.value === m) return;
  tSelectMode.value = m;
  tMode.value = 'all';
  tAtLeast.value = 1;
  tStats.value = null;
  tSample.value = null;
}

// 다른 행이 이미 쓰고 있는 값 — select 에서 disable 처리 (각성석 시뮬과 동일)
function isUsedInOtherRow(value, rowIdx) {
  if (value === '') return false;
  return targetRows.value.some((r, i) => {
    if (i === rowIdx) return false;
    return String(tSelectMode.value === 'option' ? r.key : r.id) === String(value);
  });
}

function addTargetRow() {
  const rows = targetRows.value;
  if (rows.length >= maxTargetRows.value) return;
  if (tSelectMode.value === 'option') {
    const used = new Set(rows.map((r) => r.key));
    const next = RUNE_OPTIONS.find((o) => !used.has(o.key))?.key ?? '';
    rows.push({ key: next });
  } else {
    const used = new Set(rows.map((r) => String(r.id)));
    const next = RUNES.find((r) => !used.has(String(r.id)))?.id ?? '';
    rows.push({ id: String(next) });
  }
  onTargetChanged();
}

function removeTargetRow(idx) {
  const rows = targetRows.value;
  if (rows.length <= 1) return;
  rows.splice(idx, 1);
  onTargetChanged();
}

// 목표가 바뀌면 이전 결과를 지우고 'N개 이상' 상한을 다시 맞춘다
function onTargetChanged() {
  if (tAtLeast.value > tSelectedCount.value) {
    tAtLeast.value = Math.max(1, tSelectedCount.value);
  }
  tStats.value = null;
  tSample.value = null;
}

const targetHasCondition = computed(() => hasAnyCondition(target.value));

const targetMaxTotal = computed(() => {
  if (tSelectedCount.value === 0 && tKingId.value === '') return MAX_TOTAL;
  return maxAchievableTotal(target.value);
});

const minTotalInfeasible = computed(() => {
  const m = target.value.minTotal;
  if (m <= 0) return false;
  const max = targetMaxTotal.value;
  return max === null || m > max;
});


// 왕룬으로 지정한 룬 — 2배 적용된 옵션 문구를 select 아래에 안내
const selectedKingRune = computed(() => {
  if (tKingId.value === '') return null;
  const r = RUNES[Number(tKingId.value)];
  return r ? { ...r, kingDesc: displayDesc(r, true) } : null;
});

const canRunTarget = computed(
  () => targetHasCondition.value && !minTotalInfeasible.value && !tRunning.value
);

function resetTarget() {
  tOptionRows.value = [{ key: RUNE_OPTIONS[0].key }];
  tRuneRows.value = [{ id: '' }];
  tMode.value = 'all';
  tAtLeast.value = 1;
  tKingId.value = '';
  tMinTotal.value = '';
  tStats.value = null;
  tSample.value = null;
  tRunTarget.value = null;
}

async function runTargetSim() {
  if (!canRunTarget.value) return;
  tRunning.value = true;
  await new Promise((r) => setTimeout(r, 30));
  try {
    const t = target.value;
    tRunTarget.value = t;
    tStats.value = computeTargetStats(t);
    // p 가 극단적으로 작으면 실제 굴리기는 생략 (수천만 회 = 수 초 이상)
    tSample.value = tStats.value.p >= 1e-6 ? simulateUntilTarget(t) : null;
  } finally {
    tRunning.value = false;
  }
}

// 목표 요약 — 이름만 나열하면 무슨 옵션인지 알 수 없으므로 항목마다 근거를 같이 낸다
//   items[].sub 는 "이 옵션을 가진 룬" 처럼 그 목표가 어떤 룬으로 충족되는지 설명한다
const targetSummary = computed(() => {
  const t = tRunTarget.value;
  if (!t) return [];
  const lines = [];

  if (t.selectMode === 'option' && t.optionKeys.length > 0) {
    lines.push({
      head:
        t.mode === 'all'
          ? `아래 ${t.optionKeys.length}개 옵션이 전부 등장`
          : `아래 옵션 중 ${t.atLeast}개 이상 등장`,
      items: t.optionKeys.map((key) => {
        const o = RUNE_OPTION_BY_KEY[key];
        return {
          id: key,
          main: o.text,
          // 어떤 룬으로 충족되는지 + 그 룬이 같이 주는 옵션까지 그대로 적는다
          sub: o.carriers
            .map((c) => (c.extras.length ? `${c.name} (${c.extras.join(', ')} 동반)` : c.name))
            .join(' 또는 '),
          tail: o.minScore === o.maxScore ? `${o.maxScore}점` : `${o.minScore}~${o.maxScore}점`,
        };
      }),
    });
  } else if (t.runeIds.length > 0) {
    lines.push({
      head:
        t.mode === 'all'
          ? `아래 ${t.runeIds.length}개 룬이 전부 등장`
          : `아래 룬 중 ${t.atLeast}개 이상 등장`,
      items: t.runeIds.map((id) => ({
        id,
        main: RUNES[id].name,
        sub: RUNES[id].desc,
        tail: `${RUNES[id].score}점`,
      })),
    });
  }

  if (t.kingId !== null) {
    lines.push({
      head: `왕룬 = ${RUNES[t.kingId].name}`,
      note: displayDesc(RUNES[t.kingId], true),
      items: [],
    });
  }
  if (t.minTotal > 0) lines.push({ head: `총점 ${t.minTotal}점 이상`, items: [] });
  return lines;
});

// 결과에서 목표를 실제로 충족시킨 룬들 (옵션 모드면 그 옵션을 들고 온 룬)
const tHitRuneIds = computed(() => {
  if (!tSample.value?.result || !tRunTarget.value) return new Set();
  return contributingRuneIds(tSample.value.result, tRunTarget.value);
});

function isTargetRune(runeId) {
  return tHitRuneIds.value.has(runeId);
}

// 평균 시도를 "N회에 1번" 문장으로
const targetOddsText = computed(() => {
  const s = tStats.value;
  if (!s || !Number.isFinite(s.mean)) return '';
  return `약 ${fmt(Math.round(s.mean))}회에 1번 꼴`;
});

// ============================================================
// [3] 무작위 시뮬
// ============================================================
const simCount = ref(0);
const simBest = ref(0);
const simFinalCount = ref(0); // 381점 이상
const simGodCount = ref(0);   // 471점 이상
const simCurrent = ref(null);
const simHistory = ref([]);
const simGoalScore = ref('');
const simLooping = ref(false);
const simLoopStart = ref(0);
const simLoopMsg = ref('');
const simLoopOk = ref(false);
const stopFlag = ref(false);

const MAX_HISTORY = 30;
const LOOP_BATCH = 5000;
const LOOP_SAFETY_CAP = 20_000_000;

function pushSimResult(r) {
  simCount.value++;
  if (r.total > simBest.value) simBest.value = r.total;
  if (r.total >= 381) simFinalCount.value++;
  if (r.total >= 471) simGodCount.value++;
  const entry = { ...r, seq: simCount.value };
  simCurrent.value = entry;
  simHistory.value.unshift(entry);
  if (simHistory.value.length > MAX_HISTORY) simHistory.value.pop();
}

function simOnce() {
  simLoopMsg.value = '';
  pushSimResult(rollRuneWord());
}

function resetSim() {
  simCount.value = 0;
  simBest.value = 0;
  simFinalCount.value = 0;
  simGodCount.value = 0;
  simCurrent.value = null;
  simHistory.value = [];
  simLoopMsg.value = '';
  simLoopOk.value = false;
}

async function loopUntilGoal() {
  const goal = Number(simGoalScore.value);
  if (!simGoalScore.value || !Number.isFinite(goal)) {
    simLoopOk.value = false;
    simLoopMsg.value = `목표 총점을 입력해주세요 (최대 ${MAX_TOTAL}점).`;
    return;
  }
  if (goal > MAX_TOTAL) {
    simGoalScore.value = MAX_TOTAL;
    simLoopOk.value = false;
    simLoopMsg.value = `이론 최대 총점은 ${MAX_TOTAL}점입니다.`;
    return;
  }
  // 음수를 넣으면 첫 굴림에 무조건 "달성" 이 돼버린다 — 0 으로 잡는다
  if (goal < 0) {
    simGoalScore.value = 0;
    simLoopOk.value = false;
    simLoopMsg.value = '0 이상만 입력할 수 있습니다.';
    return;
  }

  simLooping.value = true;
  simLoopOk.value = false;
  stopFlag.value = false;
  simLoopStart.value = simCount.value;
  simLoopMsg.value = `목표 ${fmt(goal)}점까지 반복 중...`;

  try {
    let done = 0;
    while (!stopFlag.value && done < LOOP_SAFETY_CAP) {
      let found = null;
      for (let i = 0; i < LOOP_BATCH; i++) {
        const r = rollRuneWord();
        done++;
        if (r.total >= goal) {
          found = r;
          break;
        }
        // 배치 중간 결과는 통계만 반영 (히스토리 폭주 방지)
        simCount.value++;
        if (r.total > simBest.value) simBest.value = r.total;
        if (r.total >= 381) simFinalCount.value++;
        if (r.total >= 471) simGodCount.value++;
      }
      if (found) {
        pushSimResult(found);
        const tries = simCount.value - simLoopStart.value;
        simLoopOk.value = true;
        simLoopMsg.value = `목표 ${fmt(goal)}점 달성 — ${fmt(tries)}회 시도 · ${fmtEly(tries * ELY_PER_ROLL)} Ely`;
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    simLoopMsg.value = stopFlag.value
      ? `반복 중지 — 이번 반복에서 ${fmt(simCount.value - simLoopStart.value)}회 진행했습니다.`
      : `안전 상한 ${fmt(LOOP_SAFETY_CAP)}회에 도달해 중단했습니다.`;
  } finally {
    simLooping.value = false;
  }
}

function stopLoop() {
  stopFlag.value = true;
}

const simEly = computed(() => simCount.value * ELY_PER_ROLL);

// 입력한 목표 총점이 얼마나 어려운지 — 목표 시뮬과 같은 조합론 DP 로 정확히 계산해 미리 보여준다
const simGoalStats = computed(() => {
  const g = Number(simGoalScore.value);
  if (!simGoalScore.value || !Number.isFinite(g) || g <= 0 || g > MAX_TOTAL) return null;
  return computeTargetStats(normalizeTarget({ minTotal: g }));
});

function showHistory(item) {
  simCurrent.value = item;
}

// 탭을 벗어나면 반복을 멈춘다 (보이지 않는 곳에서 계속 도는 것 방지)
watch(subTab, (tab) => {
  if (tab !== 'sim' && simLooping.value) stopFlag.value = true;
});

// ============================================================
// [4] 옵션표 — 단일 룬 / 복합 룬 분리, 왕룬 기준 토글
// ============================================================
const optionKingView = ref(false);

function toOptionRow(r) {
  const tier = runeTier(r);
  return {
    ...r,
    tier,
    tierLabel: TIER_LABEL[tier],
    shownDesc: optionKingView.value ? displayDesc(r, true) : r.desc,
    shownScore: optionKingView.value ? scoreAsKing(r) : r.score,
  };
}

// 선택한 옵션 중 "다른 옵션이 같이 딸려오는" 게 하나라도 있으면 범례를 낸다
const anyRowHasExtras = computed(
  () =>
    tSelectMode.value === 'option' &&
    tOptionRows.value.some((r) => rowOption(r)?.hasExtras)
);

const optionGroups = computed(() => [
  { key: 'single', label: '단일 룬', rows: RUNES.filter((r) => r.id < FIRST_COMBO_ID).map(toOptionRow) },
  { key: 'combo', label: '복합 룬', rows: RUNES.filter((r) => r.id >= FIRST_COMBO_ID).map(toOptionRow) },
]);

// 등급 컷 범위 문자열 ("241 ~ 380점")
function gradeRange(g) {
  const i = GRADES.indexOf(g);
  const lo = i === 0 ? 0 : GRADES[i - 1].max + 1;
  return g.max === Infinity ? `${lo}점 이상` : `${lo} ~ ${g.max}점`;
}
</script>

<template>
  <div class="space-y-5">
    <!-- 개요 -->
    <div class="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 py-3 text-sm text-cyan-800 dark:text-cyan-200">
      <strong>🔮 룬 워드 시뮬레이터</strong> · 룬 30종 중 8개가 박히고, 마지막 8번째 룬이
      <strong>왕룬</strong>이 되어 옵션 수치와 점수가 2배가 됩니다 (통찰 왕룬만 120점 고정).
      <div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-cyan-700/90 dark:text-cyan-300/80">
        <span>스크롤 1개 = {{ fmt(ELY_PER_ROLL) }} Ely</span>
        <span>등급 컷 240 / 380 / 470</span>
        <span>이론 최대 {{ MAX_TOTAL }}점</span>
        <span>옵션 {{ RUNE_OPTIONS.length }}종</span>
        <span>점수 체계 latale.info 동일</span>
      </div>
    </div>

    <!-- 서브 탭 (세그먼트 컨트롤) -->
    <div class="overflow-x-auto -mx-1 px-1">
      <div class="inline-flex rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden bg-white dark:bg-stone-800">
        <button
          v-for="(t, i) in SUB_TABS"
          :key="t.id"
          type="button"
          @click="subTab = t.id"
          :class="[
            'px-4 py-2 text-sm font-medium transition whitespace-nowrap',
            i > 0 ? 'border-l border-stone-200 dark:border-stone-700' : '',
            subTab === t.id
              ? 'bg-cyan-600 text-white'
              : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
          ]"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- [1] 내 룬워드 책정                                            -->
    <!-- ============================================================ -->
    <template v-if="subTab === 'manual'">
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">📋 내 룬워드 책정</h2>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              내 룬 8개를 순서대로 클릭하세요. <strong>마지막 8번째가 왕룬</strong>으로 계산됩니다.
            </p>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              @click="calcManual"
              :disabled="manualOrder.length !== RUNE_SLOTS"
              class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-5 py-2 text-sm font-semibold text-white transition"
            >
              계산
            </button>
            <button
              type="button"
              @click="resetManual"
              class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-4 py-2 text-sm text-stone-600 dark:text-stone-300 transition"
            >
              초기화
            </button>
          </div>
        </div>

        <!-- 진행 상태 -->
        <div class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden mb-4">
          <dl class="grid grid-cols-2 sm:grid-cols-4 divide-x divide-stone-200 dark:divide-stone-700">
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">선택</dt>
              <dd class="text-xl font-bold tabular-nums text-stone-800 dark:text-stone-100 mt-0.5">
                {{ manualOrder.length }}<span class="text-sm font-semibold text-stone-400">/{{ RUNE_SLOTS }}</span>
              </dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">현재 총합</dt>
              <dd class="text-xl font-bold tabular-nums text-stone-800 dark:text-stone-100 mt-0.5">
                {{ fmt(manualRunningTotal) }}<span class="text-sm font-semibold text-stone-400">점</span>
              </dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">왕룬</dt>
              <dd
                :class="[
                  'text-sm font-bold mt-1 truncate',
                  manualKing ? 'text-violet-600 dark:text-violet-400' : 'text-stone-400 dark:text-stone-500',
                ]"
              >
                {{ manualKing ? manualKing.name : '미지정' }}
              </dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">이론 최대</dt>
              <dd class="text-xl font-bold tabular-nums text-stone-400 dark:text-stone-500 mt-0.5">
                {{ MAX_TOTAL }}<span class="text-sm font-semibold">점</span>
              </dd>
            </div>
          </dl>
        </div>

        <!-- 룬 그리드 -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <button
            v-for="r in RUNES"
            :key="r.id"
            type="button"
            @click="toggleManualRune(r.id)"
            :class="[
              'relative flex flex-col text-left rounded-lg pl-3 pr-2 py-2 transition ring-1 overflow-hidden',
              'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1',
              TIER_BAR[runeTier(r)],
              runeTier(r) === 'none' && !manualOrderMap[r.id] ? 'opacity-70 hover:opacity-100' : '',
              manualOrderMap[r.id]?.isKing
                ? 'bg-violet-50 dark:bg-violet-950/40 ring-violet-400 dark:ring-violet-600'
                : manualOrderMap[r.id]
                  ? 'bg-cyan-50 dark:bg-cyan-950/40 ring-cyan-400 dark:ring-cyan-600'
                  : 'bg-white dark:bg-stone-800/60 ring-stone-200 dark:ring-stone-700 hover:ring-stone-400 dark:hover:ring-stone-500',
            ]"
          >
            <span
              v-if="manualOrderMap[r.id]"
              :class="[
                'absolute top-1.5 right-1.5 rounded w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white',
                manualOrderMap[r.id].isKing ? 'bg-violet-600' : 'bg-cyan-600',
              ]"
            >
              {{ manualOrderMap[r.id].isKing ? '왕' : manualOrderMap[r.id].order }}
            </span>

            <span class="text-[13px] font-bold text-stone-800 dark:text-stone-100 leading-tight pr-6">
              {{ r.name }}
            </span>
            <span class="text-[11px] leading-snug text-stone-500 dark:text-stone-400 mt-1 flex-1">
              {{ r.desc }}
            </span>
            <span class="flex items-center justify-between gap-1 mt-2 pt-1.5 border-t border-stone-100 dark:border-stone-700">
              <span
                v-if="TIER_LABEL[runeTier(r)]"
                :class="['rounded px-1.5 py-0.5 text-[10px] font-semibold', TIER_CHIP[runeTier(r)]]"
              >{{ TIER_LABEL[runeTier(r)] }}</span>
              <span v-else></span>
              <span class="text-[11px] font-bold tabular-nums text-stone-600 dark:text-stone-300">
                {{ r.score }}점
                <span v-if="manualOrderMap[r.id]?.isKing" class="text-violet-600 dark:text-violet-400">
                  → {{ scoreAsKing(r) }}
                </span>
              </span>
            </span>
          </button>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500"></span> 주요 (30점 이상)
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500"></span> 준주요 (20~29점)
          </span>
          <span>다시 클릭하면 선택이 해제됩니다.</span>
        </div>
      </section>

      <!-- 책정 결과 -->
      <section
        v-if="manualResult"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden"
      >
        <div class="px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span :class="['text-4xl font-extrabold tabular-nums leading-none', GRADE_TEXT[manualResult.grade]]">
              {{ fmt(manualResult.total) }}<span class="text-xl font-bold">점</span>
            </span>
            <span :class="['rounded px-2 py-1 text-xs font-bold', GRADE_CHIP[manualResult.grade]]">
              {{ manualResult.gradeLabel }}
            </span>
          </div>
          <p class="text-sm text-stone-500 dark:text-stone-400 mt-1.5">{{ manualResult.judgeText }}</p>
        </div>

        <div class="px-5 py-3 flex items-baseline justify-between gap-3 bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-700">
          <span class="text-xs font-semibold text-stone-600 dark:text-stone-300">총 효과</span>
          <span class="text-[11px] text-stone-400 dark:text-stone-500">왕룬 옵션 수치 2배 적용</span>
        </div>

        <ul class="divide-y divide-stone-100 dark:divide-stone-700/70">
          <li
            v-for="row in manualResult.rows"
            :key="row.order"
            :class="[
              'relative flex items-start justify-between gap-3 px-5 py-2.5 text-sm',
              'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1',
              row.isKing ? 'before:bg-violet-500 bg-violet-50/50 dark:bg-violet-950/20' : TIER_BAR[runeTier(RUNES[row.runeId])],
            ]"
          >
            <span class="min-w-0">
              <span
                v-if="row.isKing"
                class="inline-block rounded bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 mr-1.5 align-middle"
              >왕룬</span>
              <strong class="text-stone-800 dark:text-stone-100">{{ row.name }}</strong>
              <span class="text-stone-500 dark:text-stone-400"> · {{ row.desc }}</span>
            </span>
            <span class="text-xs font-bold tabular-nums whitespace-nowrap text-stone-600 dark:text-stone-300 pt-0.5">
              {{ row.add }}점
            </span>
          </li>
        </ul>
      </section>
    </template>

    <!-- ============================================================ -->
    <!-- [2] 목표 옵션 시뮬                                            -->
    <!-- ============================================================ -->
    <template v-else-if="subTab === 'target'">
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">🎯 목표 옵션 시뮬</h2>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              원하는 <strong>옵션</strong>(크댐·관통 등)·왕룬·총점을 지정하면
              <strong>스크롤을 몇 번 써야 하는지</strong>를 계산합니다.
            </p>
          </div>
          <button
            type="button"
            @click="resetTarget"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-4 py-2 text-sm text-stone-600 dark:text-stone-300 transition"
          >
            초기화
          </button>
        </div>

        <!-- 선택 방식 -->
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="inline-flex rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden">
            <button
              type="button"
              @click="setSelectMode('option')"
              :class="[
                'px-3.5 py-2 text-xs font-medium transition',
                tSelectMode === 'option'
                  ? 'bg-cyan-600 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              옵션으로 선택
            </button>
            <button
              type="button"
              @click="setSelectMode('rune')"
              :class="[
                'px-3.5 py-2 text-xs font-medium transition border-l border-stone-200 dark:border-stone-700',
                tSelectMode === 'rune'
                  ? 'bg-cyan-600 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              룬으로 선택
            </button>
          </div>
          <span
            :class="[
              'text-xs tabular-nums font-semibold',
              tSelectedCount ? 'text-cyan-600 dark:text-cyan-400' : 'text-stone-400 dark:text-stone-500',
            ]"
          >
            목표 {{ tSelectedCount }}개
          </span>
        </div>

        <!-- 목표 옵션 행 (각성석/메모리얼 시뮬과 동일한 "+ 추가" 방식) -->
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span class="text-sm font-medium text-stone-700 dark:text-stone-300">
            목표 {{ tSelectMode === 'option' ? '옵션' : '룬' }}
            <span class="text-xs text-stone-400 dark:text-stone-500">
              (최대 {{ maxTargetRows }}개 — 한 룬워드에서 동시에 충족)
            </span>
          </span>
          <button
            type="button"
            @click="addTargetRow"
            :disabled="targetRows.length >= maxTargetRows"
            class="text-xs rounded-md ring-1 ring-cyan-300 dark:ring-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 transition"
          >
            + {{ tSelectMode === 'option' ? '옵션' : '룬' }} 추가
          </button>
        </div>

        <p v-if="tSelectMode === 'option'" class="text-xs text-stone-500 dark:text-stone-400 mb-2">
          같은 옵션이 여러 룬에 걸쳐 있으면 <strong>그 중 아무 룬이나 1개</strong> 뜨면 충족으로 봅니다
          (크리티컬 대미지 = 파멸 <em>또는</em> 파멸 &amp; 폭주).
        </p>

        <div class="space-y-2 mb-4">
          <div
            v-for="(row, i) in targetRows"
            :key="i"
            class="grid grid-cols-[1fr_auto] gap-2 items-start"
          >
            <!-- 옵션 모드 -->
            <div v-if="tSelectMode === 'option'">
              <select
                v-model="row.key"
                @change="onTargetChanged"
                class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="">— 선택 안 함 —</option>
                <optgroup v-for="g in RUNE_OPTION_GROUPS" :key="g.key" :label="g.label">
                  <option
                    v-for="o in g.options"
                    :key="o.key"
                    :value="o.key"
                    :disabled="isUsedInOtherRow(o.key, i)"
                  >
                    {{ o.text }} — {{ o.runeIds.map((id) => RUNES[id].name).join(' 또는 ') }}
                    ({{ o.minScore === o.maxScore ? o.maxScore : o.minScore + '~' + o.maxScore }}점){{ isUsedInOtherRow(o.key, i) ? ' · 선택됨' : '' }}
                  </option>
                </optgroup>
              </select>

              <!--
                옵션은 룬에 묶여서 온다. 예) 크리티컬 확률 +1% 은 파멸 & 폭주 로만 얻을 수 있고,
                그 룬은 크리티컬 대미지 +50% 도 같이 준다. 어떤 룬으로 충족되며 무엇이 딸려오는지 그대로 보여준다.
              -->
              <div v-if="rowOption(row)" class="mt-1.5 space-y-0.5">
                <div
                  v-for="c in rowOption(row).carriers"
                  :key="c.id"
                  class="text-[11px] leading-snug flex gap-1.5"
                >
                  <span class="text-stone-300 dark:text-stone-600 shrink-0">└</span>
                  <span class="min-w-0">
                    <strong class="text-stone-600 dark:text-stone-300">{{ c.name }}</strong>
                    <span class="text-stone-400 dark:text-stone-500"> · </span>
                    <template v-for="(eff, ei) in c.effects" :key="ei">
                      <span v-if="ei > 0" class="text-stone-400 dark:text-stone-500">, </span>
                      <span
                        :class="
                          rowOption(row).effects.includes(eff)
                            ? 'text-cyan-600 dark:text-cyan-400 font-semibold'
                            : 'text-amber-600 dark:text-amber-400'
                        "
                      >{{ eff }}</span>
                    </template>
                    <span class="tabular-nums text-stone-400 dark:text-stone-500"> ({{ c.score }}점)</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- 룬 모드 -->
            <select
              v-else
              v-model="row.id"
              @change="onTargetChanged"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option value="">— 선택 안 함 —</option>
              <optgroup v-for="g in optionGroups" :key="g.key" :label="g.label">
                <option
                  v-for="r in g.rows"
                  :key="r.id"
                  :value="String(r.id)"
                  :disabled="isUsedInOtherRow(r.id, i)"
                >
                  {{ r.name }} — {{ r.desc }} ({{ r.score }}점){{ isUsedInOtherRow(r.id, i) ? ' · 선택됨' : '' }}
                </option>
              </optgroup>
            </select>

            <button
              type="button"
              @click="removeTargetRow(i)"
              :disabled="targetRows.length <= 1"
              class="rounded-md ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-2 text-xs transition"
              title="이 행 제거"
            >
              ✕
            </button>
          </div>

          <p v-if="anyRowHasExtras" class="text-[11px] text-stone-400 dark:text-stone-500 pl-4">
            <span class="text-cyan-600 dark:text-cyan-400 font-semibold">청록</span> = 지정한 옵션 ·
            <span class="text-amber-600 dark:text-amber-400 font-semibold">주황</span> = 그 룬이 같이 주는 옵션
          </p>
        </div>

        <!-- 조건 -->
        <div class="grid gap-4 sm:grid-cols-3 mb-4 pt-4 border-t border-stone-200 dark:border-stone-700">
          <div>
            <span class="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1.5">달성 조건</span>
            <div class="inline-flex w-full rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden">
              <button
                type="button"
                @click="tMode = 'all'"
                :class="[
                  'flex-1 px-2 py-2 text-xs font-medium transition',
                  tMode === 'all'
                    ? 'bg-cyan-600 text-white'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
                ]"
              >
                전부 등장
              </button>
              <button
                type="button"
                @click="tMode = 'atLeast'"
                :disabled="tSelectedCount === 0"
                :class="[
                  'flex-1 px-2 py-2 text-xs font-medium transition border-l border-stone-200 dark:border-stone-700 disabled:opacity-40 disabled:cursor-not-allowed',
                  tMode === 'atLeast'
                    ? 'bg-cyan-600 text-white'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
                ]"
              >
                N개 이상
              </button>
            </div>
            <input
              v-if="tMode === 'atLeast'"
              v-model.number="tAtLeast"
              type="number"
              min="1"
              :max="tSelectedCount || 1"
              placeholder="최소 개수"
              class="mt-2 w-full rounded-lg px-3 py-2 text-sm tabular-nums bg-white dark:bg-stone-900 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <span class="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1.5">
              왕룬 지정 <span class="font-normal text-stone-400">선택</span>
            </span>
            <select
              v-model="tKingId"
              class="w-full rounded-lg px-3 py-2 text-sm bg-white dark:bg-stone-900 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option value="">상관없음</option>
              <option v-for="r in RUNES" :key="r.id" :value="String(r.id)">
                {{ r.name }} — 왕룬 {{ scoreAsKing(r) }}점 · {{ r.desc }}
              </option>
            </select>
            <p
              v-if="selectedKingRune"
              class="mt-1.5 text-xs text-violet-600 dark:text-violet-400 leading-snug"
            >
              왕룬 적용 → {{ selectedKingRune.kingDesc }}
            </p>
            <p v-else class="mt-1.5 text-xs text-stone-400 dark:text-stone-500">
              왕룬은 옵션 수치와 점수가 2배가 됩니다.
            </p>
          </div>

          <div>
            <span class="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1.5">
              최소 총점 <span class="font-normal text-stone-400">선택</span>
            </span>
            <input
              v-model="tMinTotal"
              type="number"
              min="0"
              :max="MAX_TOTAL"
              placeholder="예: 400"
              class="w-full rounded-lg px-3 py-2 text-sm tabular-nums bg-white dark:bg-stone-900 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
            <p v-if="minTotalInfeasible" class="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
              이 조건에서 가능한 최대 총점은 {{ targetMaxTotal ?? 0 }}점입니다.
            </p>
            <p v-else class="mt-1.5 text-xs text-stone-400 dark:text-stone-500">
              이 조건 최대 {{ targetMaxTotal ?? '-' }}점
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            @click="runTargetSim"
            :disabled="!canRunTarget"
            class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            {{ tRunning ? '계산 중...' : '목표 도달 시뮬' }}
          </button>
          <span v-if="!targetHasCondition" class="text-xs text-stone-400 dark:text-stone-500">
            원하는 {{ tSelectMode === 'option' ? '옵션' : '룬' }} · 왕룬 지정 · 최소 총점 중 하나 이상을 설정해주세요.
          </span>
        </div>
      </section>

      <!-- 확률 분석 -->
      <section
        v-if="tStats"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100 mb-3">확률 분석</h2>

        <!-- 목표 요약 -->
        <div class="rounded-lg bg-stone-50 dark:bg-stone-900/40 ring-1 ring-stone-200 dark:ring-stone-700 px-4 py-3 mb-4">
          <ul class="space-y-2">
            <li v-for="(line, i) in targetSummary" :key="i">
              <div class="text-sm font-semibold text-stone-700 dark:text-stone-200">{{ line.head }}</div>
              <div v-if="line.note" class="text-xs text-violet-600 dark:text-violet-400 leading-snug mt-0.5">
                {{ line.note }}
              </div>
              <ul v-if="line.items.length" class="mt-1 space-y-0.5">
                <li
                  v-for="it in line.items"
                  :key="it.id"
                  class="text-xs leading-snug flex gap-2"
                >
                  <span class="text-stone-300 dark:text-stone-600">—</span>
                  <span class="min-w-0">
                    <strong class="text-stone-700 dark:text-stone-200">{{ it.main }}</strong>
                    <span class="text-stone-500 dark:text-stone-400">&nbsp;·&nbsp;{{ it.sub }}</span>
                    <span class="tabular-nums text-stone-400 dark:text-stone-500">&nbsp;({{ it.tail }})</span>
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <!-- 핵심 지표 -->
        <div class="grid gap-3 sm:grid-cols-2 mb-4">
          <div class="rounded-lg bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 py-3">
            <div class="text-[11px] font-medium uppercase tracking-wider text-cyan-700/70 dark:text-cyan-400/70">
              1회 성공확률
            </div>
            <div class="text-3xl font-extrabold tabular-nums text-cyan-700 dark:text-cyan-300 mt-0.5 leading-none">
              {{ pctSmart(tStats.p) }}
            </div>
            <div class="text-xs text-cyan-700/80 dark:text-cyan-400/80 mt-1.5">{{ targetOddsText }}</div>
          </div>
          <div class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 px-4 py-3">
            <div class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
              평균 소요
            </div>
            <div class="text-3xl font-extrabold tabular-nums text-stone-800 dark:text-stone-100 mt-0.5 leading-none">
              {{ fmtInf(Math.round(tStats.mean)) }}<span class="text-lg font-bold text-stone-400">회</span>
            </div>
            <div class="text-xs text-stone-500 dark:text-stone-400 mt-1.5">
              스크롤 {{ fmtInf(Math.round(tStats.mean)) }}개 ·
              <span
                class="font-semibold text-amber-600 dark:text-amber-400"
                :title="Number.isFinite(tStats.meanEly) ? fmt(Math.round(tStats.meanEly)) + ' Ely' : ''"
              >{{ fmtEly(tStats.meanEly) }} Ely</span>
            </div>
          </div>
        </div>

        <!-- 분위수 -->
        <div class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden">
          <div class="flex items-baseline justify-between gap-3 px-4 py-2 bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-700">
            <span class="text-xs font-semibold text-stone-600 dark:text-stone-300">운에 따른 시도 횟수</span>
            <span class="text-[11px] text-stone-400 dark:text-stone-500">기하분포 · 매 시도 독립</span>
          </div>
          <dl class="grid grid-cols-4 divide-x divide-stone-200 dark:divide-stone-700">
            <div class="px-3 py-2.5">
              <dt class="text-[11px] text-stone-400 dark:text-stone-500">중앙값</dt>
              <dd class="text-base sm:text-lg font-bold tabular-nums text-cyan-600 dark:text-cyan-400 mt-0.5">
                {{ fmtInf(tStats.p50) }}<span class="text-xs font-semibold text-stone-400">회</span>
              </dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] text-stone-400 dark:text-stone-500">90% 안</dt>
              <dd class="text-base sm:text-lg font-bold tabular-nums text-stone-700 dark:text-stone-200 mt-0.5">
                {{ fmtInf(tStats.p90) }}<span class="text-xs font-semibold text-stone-400">회</span>
              </dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] text-stone-400 dark:text-stone-500">99% 안</dt>
              <dd class="text-base sm:text-lg font-bold tabular-nums text-stone-700 dark:text-stone-200 mt-0.5">
                {{ fmtInf(tStats.p99) }}<span class="text-xs font-semibold text-stone-400">회</span>
              </dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] text-stone-400 dark:text-stone-500">99.9% 안</dt>
              <dd class="text-base sm:text-lg font-bold tabular-nums text-stone-700 dark:text-stone-200 mt-0.5">
                {{ fmtInf(tStats.p999) }}<span class="text-xs font-semibold text-stone-400">회</span>
              </dd>
            </div>
          </dl>
        </div>
        <p class="mt-2 text-xs text-stone-400 dark:text-stone-500">
          Monte Carlo 추정이 아니라 조합론으로 정확히 계산한 확률입니다 (표본오차 없음).
        </p>
      </section>

      <!-- 실행 결과 -->
      <section
        v-if="tSample"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden"
      >
        <template v-if="tSample.success">
          <div class="px-5 py-4 border-b border-stone-200 dark:border-stone-700">
            <div class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">
              실제 굴려본 결과
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="text-3xl font-extrabold tabular-nums text-stone-800 dark:text-stone-100 leading-none">
                {{ fmt(tSample.tries) }}<span class="text-lg font-bold text-stone-400">회차에 성공</span>
              </span>
              <span :class="['rounded px-2 py-1 text-xs font-bold', GRADE_CHIP[tSample.result.grade]]">
                {{ fmt(tSample.result.total) }}점 · {{ tSample.result.gradeLabel }}
              </span>
            </div>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-2">
              스크롤 {{ fmt(tSample.tries) }}개 ·
              <span class="font-semibold text-amber-600 dark:text-amber-400" :title="fmt(tSample.ely) + ' Ely'">
                {{ fmtEly(tSample.ely) }} Ely
              </span>
              소모 — 같은 조건이라도 매번 회차가 달라집니다.
            </p>
          </div>

          <ul class="divide-y divide-stone-100 dark:divide-stone-700/70">
            <li
              v-for="row in tSample.result.rows"
              :key="row.order"
              :class="[
                'relative flex items-start justify-between gap-3 px-5 py-2.5 text-sm',
                'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1',
                row.isKing
                  ? 'before:bg-violet-500 bg-violet-50/50 dark:bg-violet-950/20'
                  : isTargetRune(row.runeId)
                    ? 'before:bg-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20'
                    : TIER_BAR[runeTier(RUNES[row.runeId])],
              ]"
            >
              <span class="min-w-0">
                <span
                  v-if="row.isKing"
                  class="inline-block rounded bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 mr-1.5 align-middle"
                >왕룬</span>
                <span
                  v-if="isTargetRune(row.runeId)"
                  class="inline-block rounded bg-cyan-600 text-white text-[10px] font-bold px-1.5 py-0.5 mr-1.5 align-middle"
                >목표</span>
                <strong class="text-stone-800 dark:text-stone-100">{{ row.name }}</strong>
                <span class="text-stone-500 dark:text-stone-400"> · {{ row.desc }}</span>
              </span>
              <span class="text-xs font-bold tabular-nums whitespace-nowrap text-stone-600 dark:text-stone-300 pt-0.5">
                {{ row.add }}점
              </span>
            </li>
          </ul>
        </template>
        <div v-else class="px-5 py-4 text-sm text-rose-600 dark:text-rose-400">
          {{ fmt(tSample.tries) }}회 굴렸지만 도달하지 못했습니다 (안전 상한 초과). 위 확률 분석 값을 참고해주세요.
        </div>
      </section>

      <div
        v-else-if="tStats && tStats.p > 0"
        class="rounded-xl bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
      >
        확률이 너무 낮아 (평균 {{ fmtInf(Math.round(tStats.mean)) }}회) 실제 굴리기 시연은 생략했습니다.
      </div>

      <div
        v-else-if="tStats && tStats.p === 0"
        class="rounded-xl bg-rose-50 dark:bg-rose-950/30 ring-1 ring-rose-200 dark:ring-rose-800 px-4 py-3 text-sm text-rose-800 dark:text-rose-200"
      >
        이 조건은 <strong>구조적으로 불가능</strong>합니다 — 어떤 조합으로도 만들 수 없습니다. 조건을 완화해주세요.
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- [3] 무작위 시뮬                                               -->
    <!-- ============================================================ -->
    <template v-else-if="subTab === 'sim'">
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">🎰 무작위 시뮬</h2>
        <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
          스크롤을 실제로 썼을 때 어떤 룬워드가 나오는지 돌려봅니다.
        </p>

        <div class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden mb-4">
          <dl class="grid grid-cols-2 sm:grid-cols-5 divide-x divide-stone-200 dark:divide-stone-700">
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">시뮬 횟수</dt>
              <dd class="text-xl font-bold tabular-nums text-stone-800 dark:text-stone-100 mt-0.5">{{ fmt(simCount) }}</dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">최고 점수</dt>
              <dd
                :class="[
                  'text-xl font-bold tabular-nums mt-0.5',
                  simBest ? 'text-cyan-600 dark:text-cyan-400' : 'text-stone-400 dark:text-stone-500',
                ]"
              >{{ fmt(simBest) }}</dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">381↑ 최종용</dt>
              <dd
                :class="[
                  'text-xl font-bold tabular-nums mt-0.5',
                  simFinalCount ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500',
                ]"
              >{{ fmt(simFinalCount) }}</dd>
            </div>
            <div class="px-3 py-2.5">
              <dt class="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">471↑ 최상급</dt>
              <dd
                :class="[
                  'text-xl font-bold tabular-nums mt-0.5',
                  simGodCount ? 'text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-stone-500',
                ]"
              >{{ fmt(simGodCount) }}</dd>
            </div>
            <div class="px-3 py-2.5 col-span-2 sm:col-span-1">
              <dt class="text-[11px] font-medium tracking-wider text-stone-400 dark:text-stone-500">소모 Ely</dt>
              <dd class="text-xl font-bold tabular-nums text-stone-700 dark:text-stone-200 mt-0.5" :title="fmt(simEly) + ' Ely'">
                {{ fmtEly(simEly) }}
              </dd>
            </div>
          </dl>
        </div>

        <div class="flex flex-wrap items-end gap-2">
          <button
            type="button"
            @click="simOnce"
            :disabled="simLooping"
            class="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-stone-300 disabled:dark:bg-stone-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            1회 시뮬
          </button>
          <label class="block">
            <span class="block text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">목표 총점</span>
            <input
              v-model="simGoalScore"
              type="number"
              min="0"
              :max="MAX_TOTAL"
              :placeholder="`0 ~ ${MAX_TOTAL}`"
              class="w-32 rounded-lg px-3 py-2 text-sm tabular-nums bg-white dark:bg-stone-900 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <p
            v-if="simGoalStats"
            class="text-xs text-stone-500 dark:text-stone-400 pb-2.5 tabular-nums"
          >
            1회 확률 <strong class="text-cyan-600 dark:text-cyan-400">{{ pctSmart(simGoalStats.p) }}</strong>
            · 평균 <strong class="text-stone-700 dark:text-stone-200">{{ fmtInf(Math.round(simGoalStats.mean)) }}회</strong>
            <span :title="Number.isFinite(simGoalStats.meanEly) ? fmt(Math.round(simGoalStats.meanEly)) + ' Ely' : ''">
              (<span class="text-amber-600 dark:text-amber-400">{{ fmtEly(simGoalStats.meanEly) }} Ely</span>)
            </span>
          </p>
          <button
            type="button"
            @click="loopUntilGoal"
            :disabled="simLooping"
            class="rounded-lg ring-1 ring-cyan-500 dark:ring-cyan-600 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold transition"
          >
            {{ simLooping ? '반복 중...' : '목표까지 반복' }}
          </button>
          <button
            v-if="simLooping"
            type="button"
            @click="stopLoop"
            class="rounded-lg ring-1 ring-rose-400 dark:ring-rose-600 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-4 py-2.5 text-sm font-semibold transition"
          >
            중지
          </button>
          <button
            type="button"
            @click="resetSim"
            :disabled="simLooping"
            class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 px-4 py-2.5 text-sm text-stone-600 dark:text-stone-300 transition"
          >
            초기화
          </button>
        </div>
        <p
          v-if="simLoopMsg"
          :class="[
            'mt-3 text-sm font-medium',
            simLoopOk ? 'text-cyan-700 dark:text-cyan-300' : 'text-stone-500 dark:text-stone-400',
          ]"
        >
          {{ simLoopMsg }}
        </p>
      </section>

      <!-- 현재 결과 -->
      <section
        v-if="simCurrent"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden"
      >
        <div class="px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span :class="['text-4xl font-extrabold tabular-nums leading-none', GRADE_TEXT[simCurrent.grade]]">
              {{ fmt(simCurrent.total) }}<span class="text-xl font-bold">점</span>
            </span>
            <span :class="['rounded px-2 py-1 text-xs font-bold', GRADE_CHIP[simCurrent.grade]]">
              {{ simCurrent.gradeLabel }}
            </span>
            <span v-if="simCurrent.seq" class="text-xs tabular-nums text-stone-400 dark:text-stone-500">
              {{ fmt(simCurrent.seq) }}회차
            </span>
          </div>
          <p class="text-sm text-stone-500 dark:text-stone-400 mt-1.5">{{ simCurrent.judgeText }}</p>
        </div>

        <ul class="divide-y divide-stone-100 dark:divide-stone-700/70">
          <li
            v-for="row in simCurrent.rows"
            :key="row.order"
            :class="[
              'relative flex items-start justify-between gap-3 px-5 py-2.5 text-sm',
              'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1',
              row.isKing ? 'before:bg-violet-500 bg-violet-50/50 dark:bg-violet-950/20' : TIER_BAR[runeTier(RUNES[row.runeId])],
            ]"
          >
            <span class="min-w-0">
              <span
                v-if="row.isKing"
                class="inline-block rounded bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 mr-1.5 align-middle"
              >왕룬</span>
              <strong class="text-stone-800 dark:text-stone-100">{{ row.name }}</strong>
              <span class="text-stone-500 dark:text-stone-400"> · {{ row.desc }}</span>
            </span>
            <span class="text-xs font-bold tabular-nums whitespace-nowrap text-stone-600 dark:text-stone-300 pt-0.5">
              {{ row.add }}점
            </span>
          </li>
        </ul>
      </section>

      <!-- 최근 기록 -->
      <section
        v-if="simHistory.length > 0"
        class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5"
      >
        <div class="flex items-baseline justify-between gap-3 mb-2.5">
          <h2 class="text-sm font-bold text-stone-700 dark:text-stone-200">최근 기록</h2>
          <span class="text-[11px] text-stone-400 dark:text-stone-500">클릭하면 해당 결과를 표시합니다</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="h in simHistory"
            :key="h.seq"
            type="button"
            @click="showHistory(h)"
            :class="[
              'rounded-md px-2.5 py-1.5 text-xs font-semibold tabular-nums ring-1 transition',
              simCurrent && simCurrent.seq === h.seq
                ? 'ring-cyan-500 dark:ring-cyan-500 bg-cyan-50 dark:bg-cyan-950/40'
                : 'ring-stone-200 dark:ring-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700',
              GRADE_TEXT[h.grade],
            ]"
          >
            {{ h.total }}점
            <span class="text-stone-400 dark:text-stone-500 font-normal">#{{ fmt(h.seq) }}</span>
          </button>
        </div>
      </section>
    </template>

    <!-- ============================================================ -->
    <!-- [4] 옵션표                                                    -->
    <!-- ============================================================ -->
    <template v-else>
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">📖 룬워드 옵션표</h2>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              단일 룬 20종 · 복합 룬 10종
            </p>
          </div>
          <div class="inline-flex rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden">
            <button
              type="button"
              @click="optionKingView = false"
              :class="[
                'px-3 py-1.5 text-xs font-medium transition',
                !optionKingView
                  ? 'bg-cyan-600 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              일반 기준
            </button>
            <button
              type="button"
              @click="optionKingView = true"
              :class="[
                'px-3 py-1.5 text-xs font-medium transition border-l border-stone-200 dark:border-stone-700',
                optionKingView
                  ? 'bg-violet-600 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
              ]"
            >
              왕룬 기준
            </button>
          </div>
        </div>

        <div class="overflow-x-auto -mx-5 px-5">
          <table class="w-full min-w-[520px] text-sm">
            <thead>
              <tr class="text-left text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500 border-b border-stone-200 dark:border-stone-700">
                <th class="py-2 pr-3 w-[7.5rem]">룬</th>
                <th class="py-2 pr-3">옵션</th>
                <th class="py-2 pl-3 text-right w-20">점수</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in optionGroups" :key="group.key">
                <tr>
                  <td
                    colspan="3"
                    class="pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500"
                  >
                    {{ group.label }} <span class="font-normal">({{ group.rows.length }}종)</span>
                  </td>
                </tr>
                <tr
                  v-for="r in group.rows"
                  :key="r.id"
                  class="border-b border-stone-100 dark:border-stone-700/60 align-top"
                >
                  <td class="py-2 pr-3">
                    <div class="relative pl-2.5">
                      <span
                        :class="[
                          'absolute left-0 top-0.5 bottom-0.5 w-1 rounded-sm',
                          r.tier === 'major' ? 'bg-rose-500' : r.tier === 'mid' ? 'bg-amber-500' : 'bg-stone-200 dark:bg-stone-700',
                        ]"
                      ></span>
                      <span class="font-bold text-stone-800 dark:text-stone-100 whitespace-nowrap">{{ r.name }}</span>
                      <span
                        v-if="r.tierLabel"
                        :class="['block mt-0.5 w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold', TIER_CHIP[r.tier]]"
                      >{{ r.tierLabel }}</span>
                    </div>
                  </td>
                  <td
                    :class="[
                      'py-2 pr-3 leading-snug',
                      optionKingView ? 'text-violet-700 dark:text-violet-300' : 'text-stone-600 dark:text-stone-300',
                    ]"
                  >
                    {{ r.shownDesc }}
                  </td>
                  <td
                    :class="[
                      'py-2 pl-3 text-right tabular-nums font-bold whitespace-nowrap',
                      optionKingView ? 'text-violet-600 dark:text-violet-400' : 'text-stone-700 dark:text-stone-200',
                    ]"
                  >
                    {{ r.shownScore }}점
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 등급 기준 -->
      <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
        <h2 class="text-sm font-bold text-stone-700 dark:text-stone-200 mb-3">총점 등급 기준</h2>
        <div class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden">
          <div
            v-for="g in GRADES"
            :key="g.key"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 border-b last:border-b-0 border-stone-100 dark:border-stone-700/60"
          >
            <span :class="['w-20 shrink-0 text-sm font-bold tabular-nums', GRADE_TEXT[g.key]]">
              {{ gradeRange(g) }}
            </span>
            <span :class="['rounded px-2 py-0.5 text-xs font-bold', GRADE_CHIP[g.key]]">{{ g.label }}</span>
            <span class="text-xs text-stone-500 dark:text-stone-400">{{ g.text }}</span>
          </div>
        </div>
      </section>
    </template>

    <!-- 기준 및 한계 -->
    <section class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 px-4 py-3">
      <h3 class="text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">
        기준 및 한계
      </h3>
      <dl class="space-y-1.5 text-xs text-stone-500 dark:text-stone-400">
        <div class="flex gap-2">
          <dt class="w-16 shrink-0 font-semibold text-stone-600 dark:text-stone-300">점수 기준</dt>
          <dd>latale.info 룬 워드 계산기(루루집사)의 가중치를 그대로 사용합니다. 옵션 수치는 게임 내 실제 값이지만, 점수는 밸런스 기준의 참고용 가중치입니다.</dd>
        </div>
        <div class="flex gap-2">
          <dt class="w-16 shrink-0 font-semibold text-stone-600 dark:text-stone-300">실 효율</dt>
          <dd>같은 점수라도 본인 스탯(근력/마법력)과 무기공격력·속성력 우위에 따라 체감 효율은 달라집니다.</dd>
        </div>
        <div class="flex gap-2">
          <dt class="w-16 shrink-0 font-semibold text-stone-600 dark:text-stone-300">확률 가정</dt>
          <dd>게임사 공개 확률이 없어 <strong class="text-stone-600 dark:text-stone-300">30종 균등 추첨</strong>으로 계산했습니다. 실제 게임 확률과 다를 수 있습니다.</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
