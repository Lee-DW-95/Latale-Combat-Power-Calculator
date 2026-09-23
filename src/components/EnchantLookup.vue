<script setup>
// 🔍 인챈트 수치 조회 — 시뮬이 아닌 단순 환산기 (EnchantSimulator 에서 분리)
//   - 입력 stage 'base' (Lv2) / 'full' (Lv풀강) 선택
//   - 행 5개에 옵션·값 입력 → Lv2/Lv풀강 양쪽 환산값과 등급%, 평균 급
import { computed, ref, watch } from 'vue';
import { categoryKeys, partKeys, getPart } from '../data/enchantData.js';
import { fmt } from '../utils/format.js';
import { gradeBarColor, rollPctClass } from '../utils/enchantUi.js';

const catKeysList = categoryKeys();

const lookupCatKey = ref(catKeysList[0]);
const lookupPartKey = ref(partKeys(catKeysList[0])[0]);
const lookupStage = ref('base');
const lookupRows = ref(Array.from({ length: 5 }, () => ({ optionKey: '', value: '' })));
const lookupResult = ref(null);

const lookupPart = computed(() => getPart(lookupCatKey.value, lookupPartKey.value));
const lookupPartList = computed(() => partKeys(lookupCatKey.value));
const lookupFullLevel = computed(() => lookupPart.value?.fullLevel ?? '?');
// 단일 단계 부위(캔서 배찌)는 노강/풀강 환산 자체가 없다 — 입력 단계 토글·풀강 패널을 숨긴다.
const lookupSingleStage = computed(() => !!lookupPart.value?.singleStage);

watch(lookupCatKey, (newCat) => {
  lookupPartKey.value = partKeys(newCat)[0] ?? '';
  resetLookup();
});
watch(lookupPartKey, () => {
  if (lookupSingleStage.value) lookupStage.value = 'base';
  resetLookup();
});
watch(lookupStage, () => { lookupResult.value = null; });

function resetLookup() {
  lookupRows.value = Array.from({ length: 5 }, () => ({ optionKey: '', value: '' }));
  lookupResult.value = null;
}

function computeLookup() {
  const part = lookupPart.value;
  if (!part) return;
  const baseRows = [];
  const fullRows = [];
  for (const row of lookupRows.value) {
    if (!row.optionKey) continue;
    const v = Number(row.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    const opt = part.options.find((o) => o.key === row.optionKey);
    if (!opt) continue;

    const D = opt.fullHi - opt.hi;
    let baseVal, fullVal;
    if (lookupStage.value === 'base') {
      baseVal = v;
      fullVal = v + D;
    } else {
      fullVal = v;
      baseVal = v - D;
    }
    if (opt.step && opt.step < 1) {
      baseVal = Math.round(baseVal * 10) / 10;
      fullVal = Math.round(fullVal * 10) / 10;
    }
    // 게임사 기준 Math.floor 사용
    const baseGrade = Math.floor((baseVal / opt.hi) * 100);
    const fullGrade = Math.floor((fullVal / opt.fullHi) * 100);

    baseRows.push({
      label: opt.label, value: baseVal, unit: opt.unit, grade: baseGrade,
      hi: opt.hi, step: opt.step,
    });
    fullRows.push({
      label: opt.label, value: fullVal, unit: opt.unit, grade: fullGrade,
      hi: opt.fullHi, step: opt.step,
    });
  }
  if (baseRows.length === 0) {
    lookupResult.value = null;
    return;
  }
  const avg = (arr) => Math.floor(arr.reduce((s, r) => s + r.grade, 0) / arr.length);
  lookupResult.value = {
    base: { rows: baseRows, avg: avg(baseRows), level: part.level },
    full: { rows: fullRows, avg: avg(fullRows), level: part.fullLevel },
    partName: part.name,
  };
}
</script>

<template>
  <div class="space-y-4">
    <!-- 입력 -->
    <section class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 p-5">
      <h2 class="text-base font-semibold text-stone-800 dark:text-stone-100 mb-1">🔍 인챈트 수치 조회</h2>
      <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">
        <template v-if="lookupSingleStage">
          게임에서 얻은 옵션 값을 입력하면 최대치 대비 등급%를 보여줍니다.
          ({{ lookupPartKey }}는 노강/풀강 구분이 없어 환산이 필요 없습니다.)
        </template>
        <template v-else>
          게임에서 얻은 옵션 값을 입력하면 노강(Lv2) ↔ 풀강(Lv{{ lookupFullLevel }}) 양쪽 환산값과 등급%를 보여줍니다.
          입력 단계를 노강/풀강 중 골라서 역환산 가능.
        </template>
      </p>

      <!-- 카테고리 -->
      <div class="mb-3">
        <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">카테고리</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="cat in catKeysList"
            :key="cat"
            type="button"
            @click="lookupCatKey = cat"
            :class="[
              'rounded-md px-3 py-1.5 text-xs font-medium transition',
              lookupCatKey === cat
                ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 shadow-sm'
                : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
            ]"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- 부위 -->
      <div class="mb-3">
        <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">부위</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in lookupPartList"
            :key="p"
            type="button"
            @click="lookupPartKey = p"
            :class="[
              'rounded-md px-3 py-1.5 text-xs font-medium transition',
              lookupPartKey === p
                ? 'bg-emerald-600 text-white'
                : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
            ]"
          >
            {{ p }}
          </button>
        </div>
      </div>

      <!-- 입력 단계 토글 — 단일 단계 부위(캔서 배찌)는 숨김 -->
      <div v-if="!lookupSingleStage" class="mb-4">
        <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">입력 단계 (어느 단계의 값인지)</span>
        <div class="flex gap-2">
          <button
            type="button"
            @click="lookupStage = 'base'"
            :class="[
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
              lookupStage === 'base'
                ? 'bg-amber-500 text-white'
                : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
            ]"
          >
            노강 (Lv2)
          </button>
          <button
            type="button"
            @click="lookupStage = 'full'"
            :class="[
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
              lookupStage === 'full'
                ? 'bg-emerald-600 text-white'
                : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700',
            ]"
          >
            풀강 (Lv{{ lookupFullLevel }})
          </button>
        </div>
      </div>

      <!-- 5행 입력 -->
      <div class="space-y-2 mb-4">
        <div
          v-for="(row, i) in lookupRows"
          :key="i"
          class="grid grid-cols-[1fr_140px] gap-2 items-center"
        >
          <select
            v-model="row.optionKey"
            class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            <option value="">옵션 선택</option>
            <option v-for="opt in lookupPart?.options ?? []" :key="opt.key" :value="opt.key">
              {{ opt.label }}
            </option>
          </select>
          <input
            v-model="row.value"
            type="number"
            step="any"
            placeholder="수치"
            class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          @click="computeLookup"
          class="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white transition"
        >
          🔍 수치조회
        </button>
        <button
          type="button"
          @click="resetLookup"
          class="rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-200 transition"
        >
          초기화
        </button>
      </div>
    </section>

    <!-- 결과: 두 패널 -->
    <div v-if="lookupResult" :class="lookupSingleStage ? '' : 'grid grid-cols-1 md:grid-cols-2 gap-4'">
      <!-- Lv2 패널 (단일 단계 부위는 이 패널 하나만) -->
      <section class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-amber-300 dark:ring-amber-700 p-5">
        <h3 class="text-base font-bold text-amber-700 dark:text-amber-300 mb-3">
          <template v-if="!lookupSingleStage">Lv{{ lookupResult.base.level }} </template>{{ lookupResult.partName }}
        </h3>
        <div class="space-y-3">
          <div v-for="(r, i) in lookupResult.base.rows" :key="i">
            <div class="flex items-center justify-between text-sm tabular-nums mb-1">
              <span class="text-stone-700 dark:text-stone-200 truncate">
                <template v-if="!lookupSingleStage">Lv{{ lookupResult.base.level }} </template>{{ r.label }} +{{ fmt(r.value) }}{{ r.unit }}
              </span>
              <span :class="['text-xs font-bold whitespace-nowrap', rollPctClass(r.grade)]">
                {{ r.grade }}%
              </span>
            </div>
            <div class="h-1.5 rounded bg-stone-200 dark:bg-stone-700 overflow-hidden">
              <div :class="['h-full', gradeBarColor(r.grade)]" :style="{ width: Math.min(r.grade, 100) + '%' }"></div>
            </div>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-amber-200 dark:border-amber-800 text-center text-sm font-bold text-amber-700 dark:text-amber-300">
          《 {{ lookupResult.base.avg }}% 급 》 장비
        </div>
      </section>

      <!-- Lv풀강 패널 — 단일 단계 부위(캔서 배찌)는 환산 대상이 없어 숨김 -->
      <section
        v-if="!lookupSingleStage"
        class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-emerald-300 dark:ring-emerald-700 p-5"
      >
        <h3 class="text-base font-bold text-emerald-700 dark:text-emerald-300 mb-3">
          [풀강] ★★★ Lv{{ lookupResult.full.level }} {{ lookupResult.partName }}
        </h3>
        <div class="space-y-3">
          <div v-for="(r, i) in lookupResult.full.rows" :key="i">
            <div class="flex items-center justify-between text-sm tabular-nums mb-1">
              <span class="text-stone-700 dark:text-stone-200 truncate">
                Lv{{ lookupResult.full.level }} {{ r.label }} +{{ fmt(r.value) }}{{ r.unit }}
              </span>
              <span :class="['text-xs font-bold whitespace-nowrap', rollPctClass(r.grade)]">
                {{ r.grade }}%
              </span>
            </div>
            <div class="h-1.5 rounded bg-stone-200 dark:bg-stone-700 overflow-hidden">
              <div :class="['h-full', gradeBarColor(r.grade)]" :style="{ width: Math.min(r.grade, 100) + '%' }"></div>
            </div>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-emerald-200 dark:border-emerald-800 text-center text-sm font-bold text-emerald-700 dark:text-emerald-300">
          《 {{ lookupResult.full.avg }}% 급 》 장비
        </div>
      </section>
    </div>
  </div>
</template>
