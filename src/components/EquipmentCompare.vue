<script setup>
import { computed } from 'vue';
import { getStatLabel, pctPool } from '../utils/battlePower.js';
import { EQUIP_ROW_DEFS } from '../data/statLabels.js';
import NumInput from './NumInput.vue';

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

// 올스탯은 근력/마법력/행운/체력을 동시에 올리지만, 전투력에 합산되는 건 근력/마법력(주스탯)뿐.
//   → 올스탯 옵션의 기본값·누적%는 주스탯 풀을 그대로 따른다 (equipDelta 도 기본_주스탯 기준으로 계산).
//   별도의 기본_올스탯 필드는 없으므로 올스탯 행은 주스탯의 표시값/기본값으로 환산한다.
function poolKeysFor(def) {
  if (def.key === '올스탯') return { displayKey: '주스탯', baseKey: '기본_주스탯' };
  return { displayKey: def.key, baseKey: `기본_${def.key}` };
}

// 누적% 자동 계산 (기본값/표시값 비율 → %)
// 주스탯은 올스탯%도 같은 풀이라 별도 분리 안 함 (표시는 합산값)
function pctPoolFor(def) {
  if (!def.pctKey) return null;
  const { displayKey, baseKey } = poolKeysFor(def);
  if (!props.stats?.[baseKey]) return null;
  const ratio = pctPool(props.stats, displayKey, baseKey);
  return ratio * 100;
}

function formatPct(p) {
  if (p == null) return '';
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}

// 누적% 배지 툴팁 — 올스탯은 주스탯 풀을 공유함을 명시.
function pctBadgeTitle(def) {
  const p = formatPct(pctPoolFor(def));
  if (def.key === '올스탯') {
    return `근력/마법력(주스탯)과 같은 누적 % 풀 — 자동 계산: ${p}`;
  }
  return `현재 누적 % (자동 계산): ${p}`;
}

// 기본값 미입력 경고 툴팁 — 올스탯은 기본 근력/마법력(기본_주스탯)을 가리킴.
function fallbackTitle(def) {
  if (def.key === '올스탯') {
    return '기본 근력/마법력(기본_주스탯) 미입력 — 올스탯 %가 누적 0% 가정으로 추정됨. 추가 세부정보의 근력/마법력 +값을 입력하세요.';
  }
  return '기본값(추가 세부정보) 미입력 — % 옵션이 누적%=0 가정으로 추정됨. 정확도를 위해 추가 세부정보의 +값을 입력하세요.';
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
  <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
    <!-- 제목은 아코디언 바가 담당 -->
    <header class="flex flex-wrap items-center justify-end gap-3 mb-1">
      <button
        type="button"
        @click="emit('reset')"
        class="rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
      >
        초기화
      </button>
    </header>

    <p class="text-xs text-stone-500 dark:text-stone-400 mb-1">
      한 부위 장비의 옵션을 그대로 입력하세요 —
      <span class="text-rose-600 dark:text-rose-400 font-semibold">현재 장비</span>는 빼는 옵션,
      <span class="text-emerald-600 dark:text-emerald-400 font-semibold">새 장비</span>는 끼는 옵션.
      결과는 하단 고정 바와 아래 결과 카드에 실시간 반영됩니다.
    </p>
    <details class="mb-3 text-xs text-stone-500 dark:text-stone-400">
      <summary class="cursor-pointer select-none text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300">
        % 옵션 · 계산 방식 자세히 보기
      </summary>
      <div class="mt-2 rounded-md bg-stone-50 dark:bg-stone-900/50 p-3 space-y-1">
        <p>
          📐 <strong>새 표시값 = (기본값 + 가산옵션) × (1 + 누적% + %옵션)</strong>
          — 같은 부적이라도 <strong>본인의 기본값과 누적%</strong>에 따라 변화량이 달라집니다.
          스탯명 옆 <span class="text-cyan-500 dark:text-cyan-400">파란 (+X%)</span>이 자동 계산된 현재 누적%입니다.
        </p>
        <p>
          ※ <strong>% 옵션</strong> 컬럼은 게임의 <strong>"최종 크리티컬 데미지 %"</strong>처럼 누적 풀에 더해지는 값입니다
          (부적의 "크댐 +5%" 옵션이라면 그대로 5 입력).
        </p>
        <p>
          ※ 크리/최소/최대 데미지는 게임 내에서 기본 스탯이 % 형태로 표기될 수 있으나
          (예: "크리티컬 데미지 135%"), 본 도구는 T창 능력치 세부정보의 영역값 숫자(예: 9,628)를 그대로 입력받습니다.
        </p>
      </div>
    </details>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-stone-500 dark:text-stone-400 text-xs">
            <th class="py-2 pr-3 font-medium">스탯</th>
            <th class="py-2 px-2 font-medium text-rose-600 dark:text-rose-400 text-center" colspan="2">현재 장비 (-)</th>
            <th class="py-2 px-2 font-medium text-emerald-600 dark:text-emerald-400 text-center" colspan="2">새 장비 (+)</th>
          </tr>
          <tr class="text-left text-stone-400 dark:text-stone-500 text-[11px]">
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
            class="border-t border-stone-100 dark:border-stone-700"
          >
            <td class="py-2 pr-3 text-stone-700 dark:text-stone-300 whitespace-nowrap">
              {{ rowLabel(def) }}
              <span
                v-if="pctPoolFor(def) != null"
                class="ml-1 text-[11px] font-normal text-cyan-500 dark:text-cyan-400"
                :title="pctBadgeTitle(def)"
              >
                ({{ formatPct(pctPoolFor(def)) }}<template v-if="def.key === '올스탯'"> · 주스탯 풀</template>)
              </span>
              <span
                v-else-if="needsFallbackWarning(def)"
                class="ml-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                :title="fallbackTitle(def)"
              >
                ⚠ {{ def.key === '올스탯' ? '기본 근력/마법력 미입력' : '기본값 미입력' }} (추정)
              </span>
            </td>
            <!-- 현재 장비 가산 -->
            <td class="py-2 px-2">
              <NumInput
                :step="def.addStep"
                :model-value="oldEquip[def.addKey]"
                @update:model-value="setOld(def.addKey, $event)"
                class="w-full rounded-md border-0 ring-1 ring-rose-200 dark:ring-rose-900 bg-rose-50 dark:bg-rose-950/30 text-stone-900 dark:text-stone-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-rose-400 focus:outline-none"
              />
            </td>
            <!-- 현재 장비 % -->
            <td class="py-2 px-2">
              <NumInput
                v-if="def.pctKey"
                step="1"
                :model-value="oldEquip[def.pctKey]"
                @update:model-value="setOld(def.pctKey, $event)"
                placeholder="%"
                class="w-full rounded-md border-0 ring-1 ring-rose-200 dark:ring-rose-900 bg-rose-50/50 dark:bg-rose-950/20 text-stone-900 dark:text-stone-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-rose-400 focus:outline-none"
              />
              <span v-else class="block text-center text-stone-400 dark:text-stone-600">—</span>
            </td>
            <!-- 새 장비 가산 -->
            <td class="py-2 px-2">
              <NumInput
                :step="def.addStep"
                :model-value="newEquip[def.addKey]"
                @update:model-value="setNew(def.addKey, $event)"
                class="w-full rounded-md border-0 ring-1 ring-emerald-200 dark:ring-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-stone-900 dark:text-stone-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              />
            </td>
            <!-- 새 장비 % -->
            <td class="py-2 px-2">
              <NumInput
                v-if="def.pctKey"
                step="1"
                :model-value="newEquip[def.pctKey]"
                @update:model-value="setNew(def.pctKey, $event)"
                placeholder="%"
                class="w-full rounded-md border-0 ring-1 ring-emerald-200 dark:ring-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-stone-900 dark:text-stone-100 px-2 py-1 tabular-nums focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              />
              <span v-else class="block text-center text-stone-400 dark:text-stone-600">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </section>
</template>
