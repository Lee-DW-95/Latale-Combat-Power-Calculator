<script setup>
import { computed } from 'vue';
import { getStatLabel, pctPool } from '../utils/battlePower.js';
import { EQUIP_ROW_DEFS, EQUIP_SLOTS } from '../data/statLabels.js';

const props = defineProps({
  stats: { type: Object, required: true },
  slot: { type: String, default: '무기' },
  oldEquip: { type: Object, required: true },
  newEquip: { type: Object, required: true },
});
const emit = defineEmits([
  'update:slot',
  'update:oldEquip',
  'update:newEquip',
  'reset',
]);

const type = computed(() => props.stats?.type || 'P');

function setOld(key, raw) {
  if (!key) return;
  const num = raw === '' || raw === null ? 0 : Number(raw);
  emit('update:oldEquip', { ...props.oldEquip, [key]: Number.isFinite(num) ? num : 0 });
}
function setNew(key, raw) {
  if (!key) return;
  const num = raw === '' || raw === null ? 0 : Number(raw);
  emit('update:newEquip', { ...props.newEquip, [key]: Number.isFinite(num) ? num : 0 });
}

const slotProxy = computed({
  get: () => props.slot,
  set: (v) => emit('update:slot', v),
});

// 라벨 표시 (예: "근력 (%)" 같은 단위 처리)
function rowLabel(def) {
  const base = getStatLabel(type.value, def.key);
  return def.addUnit === '%' ? `${base} (${def.addUnit})` : base;
}

// 누적% 자동 계산 (기본값/표시값 비율 → %)
// 주스탯은 올스탯%도 같은 풀이라 별도 분리 안 함 (표시는 합산값)
function pctPoolFor(def) {
  if (!def.pctKey) return null;
  const baseKey = `기본_${def.key}`;
  if (!props.stats?.[baseKey]) return null;
  const ratio = pctPool(props.stats, def.key, baseKey);
  return ratio * 100;
}

function formatPct(p) {
  if (p == null) return '';
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}
</script>

<template>
  <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
    <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">🛡️ 장비 비교</h2>
      <div class="flex items-center gap-3">
        <label class="text-sm text-slate-600 dark:text-slate-300">
          부위:
          <select
            v-model="slotProxy"
            class="ml-2 rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1 text-sm"
          >
            <option v-for="s in EQUIP_SLOTS" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <button
          type="button"
          @click="emit('reset')"
          class="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          초기화
        </button>
      </div>
    </header>

    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
      한 부위 장비의 옵션을 그대로 입력하세요.
      <span class="text-rose-600 dark:text-rose-400 font-semibold">현재 장비</span>는 빼는 옵션,
      <span class="text-emerald-600 dark:text-emerald-400 font-semibold">새 장비</span>는 끼는 옵션.
      <br />
      📐 <strong>새 표시값 = (기본값 + 가산옵션) × (1 + 누적% + %옵션)</strong>
      — 같은 부적이라도 <strong>본인의 기본값과 누적%</strong>에 따라 변화량이 달라집니다.
      스탯명 옆 <span class="text-indigo-500 dark:text-indigo-400">파란 (+X%)</span>이 자동 계산된 현재 누적%입니다.
    </p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 dark:text-slate-400 text-xs">
            <th class="py-2 pr-3 font-medium">스탯</th>
            <th class="py-2 px-2 font-medium text-rose-600 dark:text-rose-400 text-center" colspan="2">현재 장비 (-)</th>
            <th class="py-2 px-2 font-medium text-emerald-600 dark:text-emerald-400 text-center" colspan="2">새 장비 (+)</th>
          </tr>
          <tr class="text-left text-slate-400 dark:text-slate-500 text-[11px]">
            <th></th>
            <th class="py-1 px-2 font-normal">가산값</th>
            <th class="py-1 px-2 font-normal">% 옵션</th>
            <th class="py-1 px-2 font-normal">가산값</th>
            <th class="py-1 px-2 font-normal">% 옵션</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="def in EQUIP_ROW_DEFS"
            :key="def.key"
            class="border-t border-slate-100 dark:border-slate-700"
          >
            <td class="py-2 pr-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {{ rowLabel(def) }}
              <span
                v-if="pctPoolFor(def) != null"
                class="ml-1 text-[11px] font-normal text-indigo-500 dark:text-indigo-400"
                :title="`현재 누적 % (자동 계산): ${formatPct(pctPoolFor(def))}`"
              >
                ({{ formatPct(pctPoolFor(def)) }})
              </span>
            </td>
            <!-- 현재 장비 가산 -->
            <td class="py-2 px-2">
              <input
                type="number"
                :step="def.addStep"
                :value="oldEquip[def.addKey]"
                @input="setOld(def.addKey, $event.target.value)"
                class="w-full rounded-md border-0 ring-1 ring-rose-200 dark:ring-rose-900 bg-rose-50 dark:bg-rose-950/30 text-slate-900 dark:text-slate-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-rose-400 focus:outline-none"
              />
            </td>
            <!-- 현재 장비 % -->
            <td class="py-2 px-2">
              <input
                v-if="def.pctKey"
                type="number"
                step="1"
                :value="oldEquip[def.pctKey]"
                @input="setOld(def.pctKey, $event.target.value)"
                placeholder="%"
                class="w-full rounded-md border-0 ring-1 ring-rose-200 dark:ring-rose-900 bg-rose-50/50 dark:bg-rose-950/20 text-slate-900 dark:text-slate-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-rose-400 focus:outline-none"
              />
              <span v-else class="block text-center text-slate-400 dark:text-slate-600">—</span>
            </td>
            <!-- 새 장비 가산 -->
            <td class="py-2 px-2">
              <input
                type="number"
                :step="def.addStep"
                :value="newEquip[def.addKey]"
                @input="setNew(def.addKey, $event.target.value)"
                class="w-full rounded-md border-0 ring-1 ring-emerald-200 dark:ring-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-slate-900 dark:text-slate-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              />
            </td>
            <!-- 새 장비 % -->
            <td class="py-2 px-2">
              <input
                v-if="def.pctKey"
                type="number"
                step="1"
                :value="newEquip[def.pctKey]"
                @input="setNew(def.pctKey, $event.target.value)"
                placeholder="%"
                class="w-full rounded-md border-0 ring-1 ring-emerald-200 dark:ring-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-900 dark:text-slate-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              />
              <span v-else class="block text-center text-slate-400 dark:text-slate-600">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </section>
</template>
