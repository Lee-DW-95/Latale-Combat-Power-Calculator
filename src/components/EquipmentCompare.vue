<script setup>
import { computed } from 'vue';
import { getStatLabel, pctPool } from '../utils/battlePower.js';
import { EQUIP_ROW_DEFS } from '../data/statLabels.js';

const props = defineProps({
  stats: { type: Object, required: true },
  oldEquip: { type: Object, required: true },
  newEquip: { type: Object, required: true },
});
const emit = defineEmits([
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

// 기본값 미입력 + % 옵션 입력된 행 — 폴백 추정값 사용 중임을 알림
//   주스탯 행은 올스탯_퍼도 같은 풀이라 함께 검사
function needsFallbackWarning(def) {
  if (!def.pctKey) return false;
  if (pctPoolFor(def) != null) return false;
  const oldP = Number(props.oldEquip[def.pctKey] || 0);
  const newP = Number(props.newEquip[def.pctKey] || 0);
  let pctEntered = oldP !== 0 || newP !== 0;
  if (def.key === '주스탯') {
    pctEntered ||=
      Number(props.oldEquip['올스탯_퍼'] || 0) !== 0 ||
      Number(props.newEquip['올스탯_퍼'] || 0) !== 0;
  }
  return pctEntered;
}
</script>

<template>
  <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
    <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">🛡️ 장비 비교</h2>
      <button
        type="button"
        @click="emit('reset')"
        class="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        초기화
      </button>
    </header>

    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
      한 부위 장비의 옵션을 그대로 입력하세요.
      <span class="text-rose-600 dark:text-rose-400 font-semibold">현재 장비</span>는 빼는 옵션,
      <span class="text-emerald-600 dark:text-emerald-400 font-semibold">새 장비</span>는 끼는 옵션.
      <br />
      📐 <strong>새 표시값 = (기본값 + 가산옵션) × (1 + 누적% + %옵션)</strong>
      — 같은 부적이라도 <strong>본인의 기본값과 누적%</strong>에 따라 변화량이 달라집니다.
      스탯명 옆 <span class="text-indigo-500 dark:text-indigo-400">파란 (+X%)</span>이 자동 계산된 현재 누적%입니다.
      <br />
      ※ <strong>% 옵션</strong> 컬럼은 게임의 <strong>"최종 크리티컬 데미지 %"</strong>처럼 누적 풀에 더해지는 값입니다
      (부적의 "크댐 +5%" 옵션이라면 그대로 5 입력).
      <br />
      ※ 크리/최소/최대 데미지는 게임 내에서 기본 스탯이 % 형태로 표기될 수 있으나
      (예: "크리티컬 데미지 135%"), 본 도구는 T창 능력치 세부정보의 영역값 숫자(예: 9,628)를 그대로 입력받습니다.
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
            <th class="py-1 px-2 font-normal" title="누적% 풀에 더해지는 최종 % (예: 크리티컬 데미지 +5% 부적이면 5)">
              % 옵션 (최종)
            </th>
            <th class="py-1 px-2 font-normal">가산값</th>
            <th class="py-1 px-2 font-normal" title="누적% 풀에 더해지는 최종 % (예: 크리티컬 데미지 +5% 부적이면 5)">
              % 옵션 (최종)
            </th>
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
              <span
                v-else-if="needsFallbackWarning(def)"
                class="ml-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                title="기본값(추가 세부정보) 미입력 — % 옵션이 누적%=0 가정으로 추정됨. 정확도를 위해 추가 세부정보의 +값을 입력하세요."
              >
                ⚠ 기본값 미입력 (추정)
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
                placeholder="최종 %"
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
                placeholder="최종 %"
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
