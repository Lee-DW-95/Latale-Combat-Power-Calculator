<script setup>
import { computed, ref, watch } from 'vue';
import {
  ACTIVE_RELICS,
  STONE_OPTION_DEFS,
  RELIC_ACTIVE_MULT,
  createEmptyRelicLoadout,
  compareRelicActivation,
  missingBaseWarnings,
} from '../utils/relicActive.js';
import { RELIC_BASE_OPTIONS, relicBaseOptionValue } from '../data/relics.js';
import { getStatLabel } from '../utils/battlePower.js';
import { fmt } from '../utils/format.js';

const props = defineProps({
  stats: { type: Object, required: true },
});

// ============================================================
// 상태 — localStorage 영속
//   current  : 현재 착용 세팅
//   candidate: 교체안 (교체 미리보기 켰을 때만 존재)
//   activeKey: 발동 중인 성물 key (단일) — 성물은 성물별 개별 액티브 스킬이고
//              중첩 불가 (다른 액티브 사용 시 기존 버프 소멸). 발동한 1종만 ×50 적용.
// ============================================================
const STORAGE_KEY = 'latale_relicActive_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

// 저장 포맷이 바뀌어도 빈 로드아웃 골격에 덮어써 안전하게 복원
function hydrateLoadout(saved) {
  const empty = createEmptyRelicLoadout();
  if (!saved) return empty;
  for (const key of Object.keys(empty)) {
    const s = saved[key];
    if (!s) continue;
    empty[key].level = Math.max(1, Math.min(10, Number(s.level) || 1));
    empty[key].enchantValue = Number(s.enchantValue) || 0;
    for (let i = 0; i < empty[key].stones.length; i++) {
      const st = s.stones?.[i];
      if (!st) continue;
      for (let j = 0; j < empty[key].stones[i].lines.length; j++) {
        const ln = st.lines?.[j];
        if (!ln) continue;
        empty[key].stones[i].lines[j].option = typeof ln.option === 'string' ? ln.option : '';
        empty[key].stones[i].lines[j].value = Number(ln.value) || 0;
      }
    }
  }
  return empty;
}

const VALID_KEYS = new Set(ACTIVE_RELICS.map((r) => r.key));

// 백어택 옵션 라벨 (STONE_OPTION_DEFS 의 special: '백어택' 항목)
const BACK_ATK_LABEL = STONE_OPTION_DEFS.find((d) => d.special === '백어택')?.label ?? '';

const saved = loadState();
const current = ref(hydrateLoadout(saved?.current));
// 백어택 가동률 (%) — 성물 백어택 옵션 BP 환산 가중치.
//   스탯 폼의 백어택 활성/가동률과 무관하게 발동 계산에서 이 값이 우선 적용된다.
//   초기값: 저장값 → 스탯 폼 가동률(활성 시) → 0
const backAtkUptime = ref(
  Number.isFinite(Number(saved?.backAtkUptime))
    ? Math.max(0, Math.min(100, Number(saved.backAtkUptime)))
    : props.stats?.백어택활성
    ? Math.max(0, Math.min(100, Number(props.stats?.백어택가동률) || 0))
    : 0,
);
// 발동 성물 (단일). 구버전 배열 저장(activeKeys)은 첫 항목만 승계.
const activeKey = ref(
  VALID_KEYS.has(saved?.activeKey)
    ? saved.activeKey
    : Array.isArray(saved?.activeKeys) && VALID_KEYS.has(saved.activeKeys[0])
    ? saved.activeKeys[0]
    : null,
);
const previewOn = ref(!!saved?.previewOn);
const candidate = ref(saved?.candidate ? hydrateLoadout(saved.candidate) : null);
// 편집 대상 탭: 'current' | 'candidate'
const editTarget = ref(previewOn.value && saved?.editTarget === 'candidate' ? 'candidate' : 'current');

watch(
  [current, activeKey, previewOn, candidate, editTarget, backAtkUptime],
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: current.value,
        activeKey: activeKey.value,
        previewOn: previewOn.value,
        candidate: candidate.value,
        editTarget: editTarget.value,
        backAtkUptime: backAtkUptime.value,
      }));
    } catch { /* ignore */ }
  },
  { deep: true },
);

// 편집 중인 로드아웃 (카드 UI 바인딩 대상)
const editing = computed(() =>
  editTarget.value === 'candidate' && candidate.value ? candidate.value : current.value,
);

// ============================================================
// 성물 발동 토글 — 단일 선택 (중첩 불가: 다른 액티브 사용 시 기존 버프 소멸)
// ============================================================
function isActive(key) {
  return activeKey.value === key;
}

function toggleActive(key) {
  activeKey.value = isActive(key) ? null : key; // 같은 성물 재클릭 = 해제, 다른 성물 = 교체
}

const anyActive = computed(() => !!activeKey.value);
// 유틸은 집합을 받으므로 단일 키를 배열로 감싸 전달
const activeKeysArr = computed(() => (activeKey.value ? [activeKey.value] : []));
const activeRelicName = computed(
  () => ACTIVE_RELICS.find((r) => r.key === activeKey.value)?.name ?? '',
);

// ============================================================
// 교체 미리보기 토글
// ============================================================
function startPreview() {
  candidate.value = hydrateLoadout(JSON.parse(JSON.stringify(current.value)));
  previewOn.value = true;
  editTarget.value = 'candidate';
}

function stopPreview() {
  previewOn.value = false;
  candidate.value = null;
  editTarget.value = 'current';
}

// 교체안 확정 — 교체안을 현재 세팅으로 승격
function commitCandidate() {
  if (!candidate.value) return;
  current.value = hydrateLoadout(JSON.parse(JSON.stringify(candidate.value)));
  stopPreview();
}

function resetAll() {
  current.value = createEmptyRelicLoadout();
  activeKey.value = null;
  stopPreview();
}

// ============================================================
// BP 비교 — 발동 중인 성물(단일)만 반영
// ============================================================
const activeOpts = computed(() => ({ backAtkUptime: backAtkUptime.value }));

const currentResult = computed(() =>
  compareRelicActivation(props.stats, current.value, activeKeysArr.value, activeOpts.value),
);
const candidateResult = computed(() =>
  previewOn.value && candidate.value
    ? compareRelicActivation(props.stats, candidate.value, activeKeysArr.value, activeOpts.value)
    : null,
);

// 발동 성물에 백어택 옵션이 있는데 가동률 0 → BP 미반영 경고용
const activeBackAtkNoUptime = computed(
  () =>
    anyActive.value &&
    !(Number(backAtkUptime.value) > 0) &&
    !!current.value[activeKey.value]?.stones?.some(
      (st) => st.lines.some((ln) => ln.option === BACK_ATK_LABEL && Number(ln.value) > 0),
    ),
);

// 교체 판정 — 발동(ON) 기준 BP 차이
const swapVerdict = computed(() => {
  if (!candidateResult.value) return null;
  const diff = candidateResult.value.onBP - currentResult.value.onBP;
  return {
    diff,
    pct: currentResult.value.onBP > 0 ? (diff / currentResult.value.onBP) * 100 : 0,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
  };
});

// % 옵션 정확도 경고 (기본_* 미입력)
const baseWarnings = computed(() =>
  missingBaseWarnings(props.stats, editing.value, activeKeysArr.value),
);

// 발동 후 최소뎀 > 최대뎀 — 게임 메커니즘상 초과분은 BP 미반영 (effectiveMinDmg cap).
//   글레이프니르처럼 최소뎀 증폭이 큰 성물 발동 시 사용자가 오판하지 않게 안내.
const minDmgCapped = computed(() => {
  if (!anyActive.value) return null;
  const ns = currentResult.value.newStats;
  const mn = Number(ns?.최소뎀 || 0);
  const mx = Number(ns?.최대뎀 || 0);
  return mn > mx ? { min: mn, max: mx } : null;
});

// 접힘 상태 (성물 카드)
const openCards = ref(new Set());
function toggleCard(key) {
  const s = new Set(openCards.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  openCards.value = s;
}

// 성물 카드 요약 라벨 — 기본옵션 현재값
function baseSummary(def, loadout) {
  const v = relicBaseOptionValue(def.key, loadout[def.key].level);
  const opt = RELIC_BASE_OPTIONS[def.key]?.option ?? '';
  return `${opt} +${v}`;
}

function fmtSigned(n) {
  const v = Math.round(n);
  return (v > 0 ? '+' : '') + fmt(v);
}
</script>

<template>
  <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
    <!-- ═══════ 헤더 ═══════ -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
      <div>
        <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">🗿 성물 발동 시뮬</h2>
        <p class="text-xs text-stone-500 dark:text-stone-400">
          성물은 <strong>성물별 개별 액티브</strong> — 발동한 성물 1종의 (전용석 + 공용석) 옵션만
          <strong>×{{ RELIC_ACTIVE_MULT }}</strong> 증폭 적용. 다른 액티브를 쓰면 기존 버프는 사라집니다 (중첩 불가).
        </p>
      </div>
      <div
        :class="[
          'text-xs font-bold rounded-full px-3 py-1.5 ring-1',
          anyActive
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-emerald-300 dark:ring-emerald-700'
            : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 ring-stone-300 dark:ring-stone-600',
        ]"
      >
        {{ anyActive ? `발동 중 · ${activeRelicName}` : '발동 없음' }}
      </div>
    </div>

    <!-- ═══════ 성물 발동 선택 (단일 — 라디오처럼 동작, 재클릭 시 해제) ═══════ -->
    <div class="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="발동 성물 선택">
      <button
        v-for="def in ACTIVE_RELICS"
        :key="def.key"
        type="button"
        role="radio"
        :aria-checked="isActive(def.key)"
        @click="toggleActive(def.key)"
        :class="[
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition',
          isActive(def.key)
            ? 'bg-emerald-600 text-white ring-emerald-600 shadow'
            : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 ring-stone-300 dark:ring-stone-600 hover:ring-emerald-400',
        ]"
        :title="isActive(def.key) ? `${def.name} 발동 해제` : `${def.name} 발동 (기존 발동 성물은 해제됨)`"
      >
        <span
          :class="[
            'inline-block h-2 w-2 rounded-full',
            isActive(def.key) ? 'bg-white animate-pulse' : 'bg-stone-400 dark:bg-stone-500',
          ]"
        />
        {{ def.icon }} {{ def.name }}
      </button>
    </div>

    <!-- ═══════ BP 요약 ═══════ -->
    <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40 px-3 py-2">
        <div class="text-[11px] text-stone-500 dark:text-stone-400">발동 전 BP</div>
        <div class="text-base font-bold tabular-nums text-stone-800 dark:text-stone-100">
          {{ fmt(currentResult.offBP) }}
        </div>
      </div>
      <div
        :class="[
          'rounded-lg ring-1 px-3 py-2',
          anyActive
            ? 'ring-emerald-300 dark:ring-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20'
            : 'ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40 opacity-60',
        ]"
      >
        <div class="text-[11px] text-stone-500 dark:text-stone-400">발동 후 BP {{ anyActive ? '' : '(발동 없음)' }}</div>
        <div class="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {{ fmt(currentResult.onBP) }}
        </div>
      </div>
      <div
        :class="[
          'rounded-lg ring-1 px-3 py-2',
          anyActive && currentResult.direction === 'up'
            ? 'ring-emerald-300 dark:ring-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20'
            : 'ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40',
          anyActive ? '' : 'opacity-60',
        ]"
      >
        <div class="text-[11px] text-stone-500 dark:text-stone-400">발동 증가량</div>
        <div
          :class="[
            'text-base font-bold tabular-nums',
            currentResult.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-500',
          ]"
        >
          {{ fmtSigned(currentResult.change) }}
          <span class="text-xs font-medium">({{ currentResult.changePercent >= 0 ? '+' : '' }}{{ currentResult.changePercent.toFixed(2) }}%)</span>
        </div>
      </div>
    </div>

    <!-- 스탯별 기여 (발동 중 + 변화 있을 때) -->
    <div v-if="anyActive && currentResult.contributions.length" class="mt-2 flex flex-wrap gap-1.5">
      <span
        v-for="c in currentResult.contributions"
        :key="c.stat"
        class="inline-flex items-center gap-1 rounded-md bg-cyan-50 dark:bg-cyan-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-2 py-0.5 text-[11px] text-cyan-700 dark:text-cyan-300 tabular-nums"
        :title="`단독 BP 기여 ${fmtSigned(c.impact)}`"
      >
        {{ getStatLabel(c.stat) }} {{ fmtSigned(c.diff) }}
      </span>
    </div>

    <!-- 최소뎀 cap 안내 (발동 후 최소 > 최대) -->
    <div
      v-if="minDmgCapped"
      class="mt-2 rounded-md bg-sky-50 dark:bg-sky-950/20 ring-1 ring-sky-300 dark:ring-sky-800 px-3 py-2 text-xs text-sky-800 dark:text-sky-200 tabular-nums"
    >
      ℹ️ 발동 후 최소 대미지({{ fmt(Math.round(minDmgCapped.min)) }})가 최대 대미지({{ fmt(Math.round(minDmgCapped.max)) }})를
      초과 — 게임 메커니즘상 초과분은 전투력에 반영되지 않아 <strong>최대 대미지 기준으로 cap 계산</strong>됩니다.
    </div>

    <!-- 백어택 가동률 미입력 경고 (발동 성물에 백어택 옵션이 있는데 가동률 0) -->
    <div
      v-if="activeBackAtkNoUptime"
      class="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-300 dark:ring-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
    >
      ⚠️ 발동 성물에 <strong>백어택 대미지</strong> 옵션이 있지만 <strong>가동률이 0</strong>이라 BP에 반영되지 않았어요.
      공용석의 백어택 입력 아래 가동률(%)을 입력하면 기댓값으로 환산됩니다.
    </div>

    <!-- % 옵션 정확도 경고 -->
    <div
      v-if="anyActive && baseWarnings.length"
      class="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-300 dark:ring-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
    >
      ⚠️ % 옵션 정확 반영에 <strong>{{ baseWarnings.join(', ') }}</strong> 입력이 필요합니다
      (T창 추가 세부정보의 +값). 미입력 시 표시값 기준으로 과대 계산될 수 있어요.
    </div>

    <!-- ═══════ 교체 미리보기 바 ═══════ -->
    <div class="mt-4 rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50/60 dark:bg-stone-900/30 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm font-semibold text-stone-700 dark:text-stone-200">
          🔁 교체 미리보기
          <span class="block sm:inline text-[11px] font-normal text-stone-500 dark:text-stone-400">
            — 인게임 교체 시 기존 돌이 사라지므로, 교체 전에 여기서 강해지는지 확인하세요
          </span>
        </div>
        <div class="flex items-center gap-2">
          <template v-if="!previewOn">
            <button
              type="button"
              @click="startPreview"
              class="rounded-md bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 text-xs font-semibold transition"
            >
              현재 세팅 복사해서 시작
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              @click="commitCandidate"
              class="rounded-md bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-semibold transition"
              title="교체안을 현재 세팅으로 저장 (실제 교체 완료 후 누르세요)"
            >
              ✅ 교체 완료 반영
            </button>
            <button
              type="button"
              @click="stopPreview"
              class="rounded-md ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 px-3 py-1.5 text-xs font-medium transition"
            >
              닫기
            </button>
          </template>
        </div>
      </div>

      <!-- 편집 대상 탭 + 판정 -->
      <template v-if="previewOn && candidateResult">
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden text-xs font-semibold">
            <button
              type="button"
              @click="editTarget = 'current'"
              :class="[
                'px-3 py-1.5 transition',
                editTarget === 'current'
                  ? 'bg-stone-700 text-white dark:bg-stone-200 dark:text-stone-900'
                  : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300',
              ]"
            >
              현재 세팅
            </button>
            <button
              type="button"
              @click="editTarget = 'candidate'"
              :class="[
                'px-3 py-1.5 transition',
                editTarget === 'candidate'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300',
              ]"
            >
              교체안 편집
            </button>
          </div>

          <!-- 판정 배지 -->
          <div
            v-if="swapVerdict && anyActive"
            :class="[
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ring-1 tabular-nums',
              swapVerdict.direction === 'up'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-emerald-300 dark:ring-emerald-700'
                : swapVerdict.direction === 'down'
                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 ring-rose-300 dark:ring-rose-700'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 ring-stone-300 dark:ring-stone-600',
            ]"
          >
            <template v-if="swapVerdict.direction === 'up'">📈 교체하면 더 강해짐</template>
            <template v-else-if="swapVerdict.direction === 'down'">📉 교체하면 약해짐</template>
            <template v-else>➖ 변화 없음</template>
            {{ fmtSigned(swapVerdict.diff) }} ({{ swapVerdict.pct >= 0 ? '+' : '' }}{{ swapVerdict.pct.toFixed(2) }}%)
          </div>
          <span v-else-if="previewOn && !anyActive" class="text-[11px] text-stone-400 dark:text-stone-500">
            위에서 발동할 성물을 켜면 교체 판정이 표시됩니다
          </span>
        </div>

        <!-- 발동 기준 BP 비교 -->
        <div v-if="anyActive" class="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-md ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800 px-3 py-2">
            <div class="text-stone-500 dark:text-stone-400">현재 세팅 · 발동 BP</div>
            <div class="font-bold tabular-nums text-stone-800 dark:text-stone-100">{{ fmt(currentResult.onBP) }}</div>
          </div>
          <div class="rounded-md ring-1 ring-cyan-200 dark:ring-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20 px-3 py-2">
            <div class="text-cyan-600 dark:text-cyan-300">교체안 · 발동 BP</div>
            <div class="font-bold tabular-nums text-cyan-700 dark:text-cyan-300">{{ fmt(candidateResult.onBP) }}</div>
          </div>
        </div>
      </template>
    </div>

    <!-- ═══════ 성물 6종 입력 카드 ═══════ -->
    <div class="mt-4 flex items-center justify-between">
      <div class="text-sm font-semibold text-stone-700 dark:text-stone-200">
        {{ editTarget === 'candidate' ? '✏️ 교체안 세팅 입력' : '⚙️ 현재 세팅 입력' }}
      </div>
      <button
        type="button"
        @click="resetAll"
        class="rounded-md ring-1 ring-rose-300 dark:ring-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2.5 py-1 text-[11px] font-medium transition"
      >
        🔄 전체 초기화
      </button>
    </div>

    <div class="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div
        v-for="def in ACTIVE_RELICS"
        :key="def.key"
        :class="[
          'rounded-xl ring-1 transition',
          isActive(def.key)
            ? 'ring-emerald-300 dark:ring-emerald-700'
            : editTarget === 'candidate'
            ? 'ring-cyan-300 dark:ring-cyan-700'
            : 'ring-stone-200 dark:ring-stone-700',
          editTarget === 'candidate'
            ? 'bg-cyan-50/30 dark:bg-cyan-950/10'
            : 'bg-stone-50/40 dark:bg-stone-900/20',
        ]"
      >
        <!-- 카드 헤더 (접기/펴기 + 발동 토글) -->
        <div class="w-full flex items-center justify-between px-4 py-3 gap-2">
          <button
            type="button"
            @click="toggleCard(def.key)"
            class="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            <span>{{ def.icon }}</span>
            <span class="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">{{ def.name }}</span>
            <span class="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums shrink-0">
              Lv.{{ editing[def.key].level }}
            </span>
            <span class="hidden sm:inline text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums truncate">
              {{ baseSummary(def, editing) }}%
            </span>
            <span class="text-stone-400 text-xs shrink-0">{{ openCards.has(def.key) ? '▲' : '▼' }}</span>
          </button>
          <!-- 성물 발동 토글 (단일 선택 — 다른 성물 발동 시 이 성물로 교체됨) -->
          <button
            type="button"
            role="radio"
            :aria-checked="isActive(def.key)"
            @click.stop="toggleActive(def.key)"
            :title="isActive(def.key) ? '발동 해제' : '이 성물 발동 (기존 발동은 해제)'"
            :class="[
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition',
              isActive(def.key)
                ? 'bg-emerald-600 text-white ring-emerald-600'
                : 'bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 ring-stone-300 dark:ring-stone-600 hover:ring-emerald-400',
            ]"
          >
            {{ isActive(def.key) ? '발동 ON' : 'OFF' }}
          </button>
        </div>

        <!-- 카드 본문 -->
        <div v-if="openCards.has(def.key)" class="px-4 pb-4 space-y-3">
          <!-- 전용석 레벨 + 기본옵션 -->
          <div class="rounded-lg ring-1 ring-orange-200 dark:ring-orange-800 bg-orange-50/40 dark:bg-orange-950/10 p-3">
            <div class="text-[11px] font-semibold text-orange-700 dark:text-orange-300 mb-2">
              전용석 (Lv → 기본옵션 자동)
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-2">
                <span class="text-xs text-stone-500 dark:text-stone-400">레벨</span>
                <select
                  v-model.number="editing[def.key].level"
                  class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs tabular-nums"
                >
                  <option v-for="lv in 10" :key="lv" :value="lv">Lv.{{ lv }}</option>
                </select>
              </label>
              <div class="text-xs tabular-nums" :class="def.base ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-400 dark:text-stone-500'">
                {{ baseSummary(def, editing) }}%
                <template v-if="def.base">
                  → 발동 <strong>+{{ (relicBaseOptionValue(def.key, editing[def.key].level) * RELIC_ACTIVE_MULT).toFixed(1).replace(/\.0$/, '') }}{{ def.base.previewUnit }}</strong>
                  <span v-if="def.base.previewUnit === ''" class="ml-1 text-[10px] text-stone-400">(기본값 가산 → 누적% 적용)</span>
                </template>
                <template v-else>
                  <span class="ml-1 text-[10px]">(BP 미반영)</span>
                </template>
              </div>
            </div>

            <!-- 인챈트옵션 -->
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="text-xs text-stone-500 dark:text-stone-400">인챈트 · {{ def.enchant.label }}</span>
              <input
                v-model.number="editing[def.key].enchantValue"
                type="number"
                min="0"
                :step="def.enchant.step"
                placeholder="0"
                class="w-24 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs tabular-nums"
              />
              <span class="text-xs text-stone-400">{{ def.enchant.unit }}</span>
              <span
                v-if="editing[def.key].enchantValue > 0"
                class="text-[11px] tabular-nums"
                :class="def.enchant.map ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'"
              >
                <template v-if="def.enchant.map">
                  → 발동 +{{ (editing[def.key].enchantValue * RELIC_ACTIVE_MULT).toLocaleString() }}{{ def.enchant.previewUnit ?? def.enchant.unit }}
                  <span v-if="def.enchant.previewUnit === ''" class="text-[10px] text-stone-400">(기본값 가산)</span>
                </template>
                <template v-else>(BP 미반영)</template>
              </span>
            </div>
          </div>

          <!-- 공용석 2슬롯 -->
          <div
            v-for="(stone, si) in editing[def.key].stones"
            :key="si"
            class="rounded-lg ring-1 ring-sky-200 dark:ring-sky-800 bg-sky-50/40 dark:bg-sky-950/10 p-3"
          >
            <div class="text-[11px] font-semibold text-sky-700 dark:text-sky-300 mb-2">
              공용석 {{ si + 1 }} <span class="font-normal text-stone-400">(최대 4줄)</span>
            </div>
            <template v-for="(line, li) in stone.lines" :key="li">
              <div class="grid grid-cols-[1fr_90px] gap-1.5 mb-1.5 last:mb-0">
                <select
                  v-model="line.option"
                  class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-[11px]"
                >
                  <option value="">{{ li + 1 }}줄 없음</option>
                  <option v-for="opt in STONE_OPTION_DEFS" :key="opt.label" :value="opt.label">
                    {{ opt.label }}{{ opt.equip || opt.special ? '' : ' (BP 미반영)' }}
                  </option>
                </select>
                <input
                  v-model.number="line.value"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="수치"
                  class="rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-[11px] tabular-nums"
                />
              </div>
              <!-- 백어택 옵션 선택 시 → 가동률 입력 (전 성물 공용 값, 발동 BP 환산 가중치) -->
              <div
                v-if="line.option === BACK_ATK_LABEL"
                class="mb-1.5 rounded-md ring-1 ring-orange-200 dark:ring-orange-800 bg-orange-50/50 dark:bg-orange-950/10 px-2 py-1.5"
              >
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-[11px] text-orange-700 dark:text-orange-300 font-medium">↳ 백어택 가동률</span>
                  <input
                    v-model.number="backAtkUptime"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    placeholder="0~100"
                    class="w-16 rounded-md border-0 ring-1 ring-orange-300 dark:ring-orange-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-0.5 text-[11px] tabular-nums"
                  />
                  <span class="text-[11px] text-orange-700 dark:text-orange-300">%</span>
                </div>
                <p class="mt-0.5 text-[10px] leading-snug text-orange-600/80 dark:text-orange-400/70">
                  백어택 성립 비율 (직타비중 × 백어택 유지율). 발동 BP 환산에만 쓰이며
                  스탯 입력의 백어택 가동률보다 우선 적용 · <strong>0이면 백어택 옵션은 BP 미반영</strong>
                </p>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 미반영 옵션 안내 -->
    <p v-if="anyActive && currentResult.ignored.length" class="mt-3 text-[11px] text-stone-400 dark:text-stone-500">
      ℹ️ BP 미반영 옵션 (대미지 무관 또는 모델 미지원):
      {{ currentResult.ignored.map((i) => `${i.relic}·${i.label}`).join(', ') }}
    </p>

    <details class="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
      <summary class="cursor-pointer select-none hover:text-stone-600 dark:hover:text-stone-300">
        계산 기준 참고
      </summary>
      <p class="mt-1 leading-snug">
        성물 발동은 액티브 스킬 지속시간(예: 30초) 동안만 적용되며, 다른 성물 발동 시 기존 버프는 사라집니다.
        "발동 후 BP"는 선택한 성물 1종이 발동 중인 순간의 스탯 기준 추정치입니다.
        백어택 옵션은 공용석 입력 아래의 <strong>가동률(%)</strong> 값으로 기댓값 환산되며,
        발동 계산에서는 스탯 입력의 백어택 활성/가동률 설정보다 우선 적용됩니다.
      </p>
    </details>
  </section>
</template>
