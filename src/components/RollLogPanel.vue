<script setup>
/**
 * 굴림 기록 패널 — 각성석 / 아이템 각성 / 메모리얼 시뮬 공용 (우측 사이드 패널).
 *
 * 상태는 부모가 useRollLog() 로 들고 있고, 이 컴포넌트는 표시 + 조건 입력만 담당한다.
 */
import { computed } from 'vue';
import { fmt } from '../utils/format.js';

const props = defineProps({
  records: { type: Array, required: true },
  // [{ key, label }] — "특정 옵션" 조건에서 고를 수 있는 옵션 목록
  optionKeys: { type: Array, default: () => [] },
  // T창 정보가 있어 크댐 환산이 가능한지
  hasStats: { type: Boolean, default: false },
  title: { type: String, default: '📜 굴림 기록' },
  // 환산 기준 안내 문구에 쓸 시뮬 이름
  equivNote: { type: String, default: '' },
});

const criterion = defineModel('criterion', { type: Object, required: true });

const emit = defineEmits(['clear']);

const isOption = computed(() => criterion.value.type === 'option');

const optionLabel = computed(
  () => props.optionKeys.find((o) => o.key === criterion.value.option)?.label ?? '',
);

function setType(t) {
  criterion.value.type = t;
  // 옵션 모드로 처음 넘어갈 때 첫 옵션을 기본 선택 — 빈 조건으로 아무것도 안 걸리는 상태 방지.
  if (t === 'option' && !criterion.value.option && props.optionKeys.length) {
    criterion.value.option = props.optionKeys[0].key;
  }
}

// 환산치 표시 — 소수 1자리, 정수면 정수
function fmtRef(v) {
  if (!Number.isFinite(Number(v))) return '-';
  const n = Number(v);
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}

// 기록 1건의 헤드라인 수치 — 조건 종류에 따라 표기가 다르다
function recAmountText(rec) {
  if (rec.criterionType === 'option') return `합 ${fmtRef(rec.amount)}`;
  return `크댐 ${fmtRef(rec.amount ?? rec.total)}%급`;
}
</script>

<template>
  <aside
    class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-4 lg:sticky lg:top-4"
  >
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-bold text-stone-800 dark:text-stone-100">
        {{ title }}
        <span v-if="records.length" class="text-xs font-normal text-stone-400 ml-1">
          {{ records.length }}건
        </span>
      </h3>
      <button
        v-if="records.length"
        type="button"
        @click="emit('clear')"
        class="text-[11px] rounded-md ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-1 transition"
        title="기록 전체 삭제"
      >
        비우기
      </button>
    </div>

    <!-- 기록 조건 -->
    <div class="rounded-lg bg-stone-50 dark:bg-stone-900/50 ring-1 ring-stone-200 dark:ring-stone-700 p-2.5 mb-3">
      <div class="flex gap-1 mb-2">
        <button
          type="button"
          @click="setType('equiv')"
          :class="[
            'flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition',
            !isOption
              ? 'bg-cyan-600 text-white'
              : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700',
          ]"
        >
          크댐환산 합
        </button>
        <button
          type="button"
          @click="setType('option')"
          :class="[
            'flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition',
            isOption
              ? 'bg-cyan-600 text-white'
              : 'ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700',
          ]"
        >
          특정 옵션
        </button>
      </div>

      <select
        v-if="isOption"
        v-model="criterion.option"
        class="w-full mb-2 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none"
      >
        <option v-for="o in optionKeys" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>

      <label class="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
        <span class="whitespace-nowrap">
          {{ isOption ? '합' : '크댐환산' }} ≥
        </span>
        <input
          v-model="criterion.threshold"
          type="number"
          step="any"
          min="0"
          class="w-20 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 py-1 text-xs tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
        />
        <span class="whitespace-nowrap text-stone-400">이상만 기록</span>
      </label>
    </div>

    <p
      v-if="!isOption && !hasStats"
      class="rounded-lg bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
    >
      ⚠ T창 정보가 비어 있어 크댐 환산을 할 수 없습니다.
      <strong>전투력 계산</strong> 탭에서 캐릭터 정보를 입력하거나 로그인해 캐릭터를 불러오세요.
      환산 없이 쓰려면 위에서 <strong>특정 옵션</strong> 조건을 고르면 됩니다.
    </p>

    <p
      v-else-if="!records.length"
      class="text-xs text-stone-400 dark:text-stone-500 py-4 text-center"
    >
      아직 조건을 넘은 굴림이 없습니다.
    </p>

    <ul v-else class="space-y-2 max-h-[560px] overflow-y-auto pr-1">
      <li
        v-for="(rec, i) in records"
        :key="rec.n + '-' + i"
        class="rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/60 px-3 py-2"
      >
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <span class="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {{ fmt(rec.n) }}회차
          </span>
          <span class="text-xs font-extrabold tabular-nums text-orange-600 dark:text-orange-300">
            {{ recAmountText(rec) }}
          </span>
        </div>
        <div
          v-if="rec.tag"
          :class="[
            'text-[10px] font-semibold mb-1',
            rec.tagKey === 'PURPLE'
              ? 'text-amber-600 dark:text-amber-400'
              : rec.tagKey === 'MYSTIC'
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-stone-500 dark:text-stone-400',
          ]"
        >
          {{ rec.tag }}
        </div>
        <ul class="space-y-0.5 font-mono text-[11px] tabular-nums">
          <li
            v-for="(line, j) in rec.lines"
            :key="j"
            class="flex items-baseline justify-between gap-2"
          >
            <span
              :class="line.convertible
                ? 'text-stone-700 dark:text-stone-200'
                : 'text-stone-400 dark:text-stone-500'"
            >
              {{ line.text }}
            </span>
            <span
              v-if="line.convertible"
              class="text-stone-400 dark:text-stone-500 whitespace-nowrap"
            >
              ≈{{ fmtRef(line.refAmount) }}
            </span>
          </li>
        </ul>
      </li>
    </ul>

    <p class="mt-3 text-[10px] leading-relaxed text-stone-400 dark:text-stone-500">
      <template v-if="isOption">
        <strong>{{ optionLabel || '선택한 옵션' }}</strong> 의 한 카드 내 합이 기준치 이상이면 기록합니다.
      </template>
      <template v-else>
        환산 기준: 각 옵션을 <strong>단독 적용</strong>했을 때의 ΔBP 를 크댐 옵션 하나로 되돌린 값의 합
        (종합 BP 기준) — <strong>각성석 종합 환산</strong> 패널과 같은 계산입니다.
        <span v-if="equivNote">{{ equivNote }}</span>
      </template>
      기록은 브라우저에 저장돼 탭을 옮겨도 유지됩니다.
    </p>
  </aside>
</template>
