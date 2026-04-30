<script setup>
import { computed, ref, watch } from 'vue';
import {
  RELICS,
  RELIC_KEYS,
  COMMON_STONE_OPTIONS,
  COMMON_STONE_SLOTS,
  relicMultiplier,
  createDefaultRelicSet,
} from '../data/relics.js';
import { fmt } from '../utils/format.js';

// ============================================================
// localStorage 저장
// ============================================================
const STORAGE_KEY = 'latale_relicSet';

function loadRelicSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultRelicSet();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return createDefaultRelicSet();
    return parsed;
  } catch {
    return createDefaultRelicSet();
  }
}

function saveRelicSet(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(set));
  } catch {
    /* ignore */
  }
}

const relicSet = ref(loadRelicSet());

// 자동 저장 (debounce 없이 단순)
watch(relicSet, (v) => saveRelicSet(v), { deep: true });

function resetAll() {
  relicSet.value = createDefaultRelicSet();
}

// ============================================================
// 환산 — 옵션별 보너스 합산
//   각 성물의 (전용석 + 공용석 2슬롯) × 성물배율(레벨) 적용
//   결과: { 옵션라벨: 합산값 }
// ============================================================
const totals = computed(() => {
  const acc = {};
  for (const r of relicSet.value) {
    if (!r) continue;
    const def = RELICS[r.key];
    if (!def?.affectsDamage) continue;

    const mult = relicMultiplier(r.level) / 100; // 0.50 at Lv90

    // 전용석
    if (r.exclusiveOptionType && r.exclusiveOptionValue > 0) {
      const v = Number(r.exclusiveOptionValue) * mult;
      acc[r.exclusiveOptionType] = (acc[r.exclusiveOptionType] ?? 0) + v;
    }
    // 공용석
    for (const cs of r.commonStones ?? []) {
      if (cs.option && cs.value > 0) {
        const v = Number(cs.value) * mult;
        acc[cs.option] = (acc[cs.option] ?? 0) + v;
      }
    }
  }
  return acc;
});

const totalsList = computed(() =>
  Object.entries(totals.value)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ option: k, value: v })),
);

// 옵션 종류별 단위 표시
function unitFor(option) {
  if (option.endsWith('%') || option.includes('지배력')) return '%';
  return '';
}

function fmtVal(v, option) {
  const u = unitFor(option);
  if (u === '%') return v.toFixed(1) + u;
  return fmt(Math.round(v));
}
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
      <strong>🌟 성물 시뮬</strong> · 5개 성물(대미지 영향) 각각의 레벨 + 전용석 옵션 + 공용석 2슬롯을 입력하면 합산 보너스가 산출됩니다.
      <br />
      <strong class="text-xs">계산</strong>: 성물 배율 = 레벨 × (50/90) (Lv90 ≈ 50.0). 옵션 보너스 = 옵션값 × 배율 / 100.
      <br />
      <strong class="text-xs">⚠️</strong> 단순화 모델 — 실제 인게임 증폭 공식은 더 복잡할 수 있음. localStorage 자동 저장.
    </div>

    <button
      type="button"
      @click="resetAll"
      class="rounded-md ring-1 ring-rose-300 dark:ring-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-3 py-1.5 text-xs font-medium transition"
    >
      🔄 모든 성물 초기화
    </button>

    <!-- 5개 성물 카드 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section
        v-for="(relic, i) in relicSet"
        :key="relic.key"
        class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-base font-bold text-slate-800 dark:text-slate-100">
            🌟 {{ relic.name }}
          </h3>
          <div class="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
            배율 {{ relicMultiplier(relic.level).toFixed(1) }}
          </div>
        </div>

        <!-- 레벨 -->
        <label class="block mb-3">
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">성물 레벨 (1~99)</span>
          <input
            v-model.number="relic.level"
            type="number"
            min="1"
            max="99"
            class="w-32 rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </label>

        <!-- 전용석 -->
        <div class="mb-4 rounded-md ring-1 ring-amber-200 dark:ring-amber-800 bg-amber-50/30 dark:bg-amber-950/10 p-3">
          <div class="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">전용석</div>
          <div class="grid grid-cols-[1fr_120px] gap-2">
            <select
              v-model="relic.exclusiveOptionType"
              class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs"
            >
              <option value="">옵션 없음</option>
              <option v-for="opt in RELICS[relic.key].exclusiveOptions" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
            <input
              v-model.number="relic.exclusiveOptionValue"
              type="number"
              step="any"
              placeholder="수치"
              class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs tabular-nums"
            />
          </div>
        </div>

        <!-- 공용석 슬롯 -->
        <div class="rounded-md ring-1 ring-sky-200 dark:ring-sky-800 bg-sky-50/30 dark:bg-sky-950/10 p-3">
          <div class="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-2">공용석 (2슬롯)</div>
          <div
            v-for="(cs, j) in relic.commonStones"
            :key="j"
            class="grid grid-cols-[1fr_120px] gap-2 mb-2 last:mb-0"
          >
            <select
              v-model="cs.option"
              class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs"
            >
              <option value="">슬롯 {{ j + 1 }} 없음</option>
              <option v-for="opt in COMMON_STONE_OPTIONS" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
            <input
              v-model.number="cs.value"
              type="number"
              step="any"
              placeholder="수치"
              class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs tabular-nums"
            />
          </div>
        </div>
      </section>
    </div>

    <!-- 합산 결과 -->
    <section
      v-if="totalsList.length > 0"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-emerald-300 dark:ring-emerald-700 p-5"
    >
      <h2 class="text-lg font-bold text-emerald-700 dark:text-emerald-300 mb-3">📊 성물 합산 보너스</h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        모든 성물의 전용석 + 공용석 옵션을 성물 배율로 환산한 합계. 인게임 적용 시 추가되는 스탯/효과 추정치.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          v-for="t in totalsList"
          :key="t.option"
          class="flex items-center justify-between rounded-md ring-1 ring-emerald-200 dark:ring-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 px-3 py-2 text-sm"
        >
          <span class="text-slate-700 dark:text-slate-200">{{ t.option }}</span>
          <span class="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            +{{ fmtVal(t.value, t.option) }}
          </span>
        </div>
      </div>
    </section>
    <section
      v-else
      class="rounded-2xl bg-slate-50 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-700 p-5 text-center text-sm text-slate-500 dark:text-slate-400"
    >
      성물 옵션 입력 시 합산 보너스가 여기에 표시됩니다.
    </section>
  </div>
</template>
