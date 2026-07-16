<script setup>
import { computed } from 'vue';
import {
  getStatLabel,
  expectedConditionalMultiplier,
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
  calculateBPVsMonster,
} from '../utils/battlePower.js';
import { STAT_FIELD_DEFS, BASE_FIELD_DEFS } from '../data/statLabels.js';
import { fmt as formatBP } from '../utils/format.js';
import NumInput from './NumInput.vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  battlePower: { type: Number, default: 0 },
});
const emit = defineEmits(['update:modelValue']);

const stats = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

function setType(type) {
  emit('update:modelValue', { ...props.modelValue, type });
}

function setField(key, raw) {
  // boolean (체크박스) 그대로 통과
  if (typeof raw === 'boolean') {
    emit('update:modelValue', { ...props.modelValue, [key]: raw });
    return;
  }
  const num = raw === '' || raw === null ? 0 : Number(raw);
  emit('update:modelValue', { ...props.modelValue, [key]: Number.isFinite(num) ? num : 0 });
}

// V_BIG32: 물리 공격력 = 무기공 표시범위(min~max)의 중간값 — 게임 실측으로 확정된 입력 규칙.
// 두 칸 중 하나만 입력되면 그 값을 임시 사용, 둘 다 입력되면 (min+max)/2 를 공격력에 기록.
function setWeaponRange(key, raw) {
  const num = raw === '' || raw === null ? 0 : Number(raw);
  const next = { ...props.modelValue, [key]: Number.isFinite(num) ? num : 0 };
  const mn = Number(next.무기공표시min || 0);
  const mx = Number(next.무기공표시max || 0);
  if (mn > 0 && mx > 0) next.공격력 = (mn + mx) / 2;
  else if (mn > 0 || mx > 0) next.공격력 = mn || mx;
  else next.공격력 = 0;
  emit('update:modelValue', next);
}

const weaponRangeFilled = computed(
  () => Number(props.modelValue.무기공표시min || 0) > 0 && Number(props.modelValue.무기공표시max || 0) > 0
);
// 범위 미입력인데 공격력만 있는 경우 = 구버전 저장 캐릭터 (max 단일 입력 시절)
const weaponLegacyValue = computed(
  () =>
    props.modelValue.type === 'P' &&
    !Number(props.modelValue.무기공표시min || 0) &&
    !Number(props.modelValue.무기공표시max || 0) &&
    Number(props.modelValue.공격력 || 0) > 0
      ? Number(props.modelValue.공격력)
      : 0
);

// 기본 스탯 입력 진행도 (0~8개 입력 카운트)
const baseFilledCount = computed(() =>
  BASE_FIELD_DEFS.filter((d) => Number(props.modelValue[d.key] || 0) > 0).length
);

// 조건부 환산 표시용 — 가동률 가중 (직접 BP 에만 곱셈 적용됨, 소환은 영향 없음)
const expectedMultNormal = computed(() => expectedConditionalMultiplier(props.modelValue, 'normal'));
const expectedMultBoss = computed(() => expectedConditionalMultiplier(props.modelValue, 'boss'));

// 환산 없이 base / 일반 / 보스 환경별 평균 — 배지 툴팁에 노출
const baseBP = computed(() => calculateBattlePower(props.modelValue, 'base'));
const normalBP = computed(() => calculateBattlePower(props.modelValue, 'normal'));
const bossBP = computed(() => calculateBattlePower(props.modelValue, 'boss'));

// 직접 / 소환 / vs일반 / vs보스 — 브레이크다운 미니 카드
const directBPBoss = computed(() => calculateDirectBP(props.modelValue, 'boss'));
const summonBP = computed(() => calculateSummonBP(props.modelValue));
const bpVsNormal = computed(() => calculateBPVsMonster(props.modelValue, 'normal'));
const bpVsBoss = computed(() => calculateBPVsMonster(props.modelValue, 'boss'));

const anyConditionalActive = computed(
  () => expectedMultNormal.value > 1 || expectedMultBoss.value > 1
);

const conditionalBadgeTitle = computed(() =>
  [
    '가동률 가중 환산 — 직접 BP에만 곱셈, 소환은 영향 없음.',
    `환산 없는 평균: base ${formatBP(baseBP.value)} · 일반 ${formatBP(normalBP.value)} · 보스 ${formatBP(bossBP.value)}`,
  ].join('\n')
);

const BREAKDOWN_CARDS = [
  {
    key: 'direct',
    label: '직접',
    value: directBPBoss,
    cls: 'text-orange-600 dark:text-orange-300',
    title: '직접 타격 전투력 (보스 환산) — 백/근/상 조건부 환산이 곱해지는 영역',
  },
  {
    key: 'summon',
    label: '소환',
    value: summonBP,
    cls: 'text-teal-600 dark:text-teal-300',
    title: '소환 타격 전투력 — 조건부 환산 영향 없음',
  },
  {
    key: 'vsNormal',
    label: '🗡 vs 일반',
    value: bpVsNormal,
    cls: 'text-sky-600 dark:text-sky-300',
    title:
      '일몬추/일몬지만 적용한 일반 몬스터 상대 전투력.\n(vs 일반 + vs 보스) ÷ 2 는 곱셈 항 비선형성 때문에 종합 BP와 ±0.01% 미세 오차가 있을 수 있습니다.',
  },
  {
    key: 'vsBoss',
    label: '👑 vs 보스',
    value: bpVsBoss,
    cls: 'text-violet-600 dark:text-violet-300',
    title:
      '보몬추/보몬지만 적용한 보스 몬스터 상대 전투력.\n(vs 일반 + vs 보스) ÷ 2 는 곱셈 항 비선형성 때문에 종합 BP와 ±0.01% 미세 오차가 있을 수 있습니다.',
  },
];
</script>

<template>
  <section class="rounded-2xl bg-white dark:bg-stone-800 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700 p-5">
    <!-- ── 헤더: 제목 + 계산된 전투력 ── -->
    <header class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">⚔️ 캐릭터 T창 정보</h2>
      <div class="text-right">
        <div class="text-xs text-stone-500 dark:text-stone-400">
          계산된 전투력
          <span
            v-if="anyConditionalActive"
            class="ml-1 text-orange-600 dark:text-orange-400 font-semibold cursor-help"
            :title="conditionalBadgeTitle"
          >
            (보스 환산) ⓘ
          </span>
        </div>
        <div class="text-3xl font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums leading-tight">
          {{ formatBP(battlePower) }}
        </div>
      </div>
    </header>

    <!-- ── 브레이크다운 미니 카드 (직접/소환/vs일반/vs보스) ── -->
    <div v-if="battlePower > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      <div
        v-for="card in BREAKDOWN_CARDS"
        :key="card.key"
        class="rounded-lg bg-stone-50 dark:bg-stone-900/50 ring-1 ring-stone-200 dark:ring-stone-700 px-3 py-2 cursor-help"
        :title="card.title"
      >
        <div class="text-[11px] text-stone-400 dark:text-stone-500 leading-none mb-1">{{ card.label }}</div>
        <div :class="['text-sm font-bold tabular-nums leading-none', card.cls]">
          {{ formatBP(card.value.value) }}
        </div>
      </div>
    </div>

    <div class="mb-4">
      <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">직업 타입</span>
      <div class="inline-flex rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 overflow-hidden">
        <button
          type="button"
          @click="setType('P')"
          :class="[
            'flex items-center gap-2 pl-2 pr-4 py-1.5 text-sm font-medium transition',
            stats.type === 'P'
              ? 'bg-cyan-600 text-white'
              : 'bg-white text-stone-700 hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
          ]"
        >
          <img
            src="/assets/latale/roguemaster.png"
            alt="로그마스터"
            class="w-8 h-8 rounded-full ring-1 ring-white/40 object-cover bg-stone-200 dark:bg-stone-700"
            style="object-position: 50% 12%"
            draggable="false"
          />
          물리
        </button>
        <button
          type="button"
          @click="setType('M')"
          :class="[
            'flex items-center gap-2 pl-2 pr-4 py-1.5 text-sm font-medium transition border-l border-stone-300 dark:border-stone-600',
            stats.type === 'M'
              ? 'bg-cyan-600 text-white'
              : 'bg-white text-stone-700 hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
          ]"
        >
          <img
            src="/assets/latale/rainia.png"
            alt="레이니아"
            class="w-8 h-8 rounded-full ring-1 ring-white/40 object-cover bg-stone-200 dark:bg-stone-700"
            style="object-position: 50% 22%"
            draggable="false"
          />
          마법
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <label
        v-for="def in STAT_FIELD_DEFS"
        :key="def.key"
        class="block"
      >
        <span class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
          {{ getStatLabel(stats.type, def.key) }}
          <span v-if="def.key === '공격력' && stats.type === 'P'" class="text-stone-400">(표시범위)</span>
          <span v-else-if="def.unit" class="text-stone-400">({{ def.unit }})</span>
        </span>
        <!-- 물리 무기공격력: T창 표시범위 두 값 → 중간값 자동 적용 (V_BIG32) -->
        <template v-if="def.key === '공격력' && stats.type === 'P'">
          <div class="flex items-center gap-1" :title="def.tooltip">
            <NumInput
              :step="def.step"
              :model-value="stats.무기공표시min"
              @update:model-value="setWeaponRange('무기공표시min', $event)"
              placeholder="86,931"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
            <span class="text-stone-400 text-sm shrink-0">~</span>
            <NumInput
              :step="def.step"
              :model-value="stats.무기공표시max"
              @update:model-value="setWeaponRange('무기공표시max', $event)"
              placeholder="89,042"
              class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </div>
          <span v-if="weaponRangeFilled" class="block mt-1 text-[11px] text-cyan-700 dark:text-cyan-400 tabular-nums">
            적용값(중간값): {{ Number(stats.공격력).toLocaleString('ko-KR') }}
          </span>
          <span v-else-if="weaponLegacyValue" class="block mt-1 text-[11px] text-orange-600 dark:text-orange-400 tabular-nums">
            ⚠ 구버전 단일값 {{ weaponLegacyValue.toLocaleString('ko-KR') }} 사용 중 — T창 표시범위 두 값을 입력하면 정확도가 올라갑니다 (max 단일 입력은 +0.5% 안팎 과대계산)
          </span>
        </template>
        <NumInput
          v-else
          :step="def.step"
          :model-value="stats[def.key]"
          @update:model-value="setField(def.key, $event)"
          :title="def.tooltip"
          class="w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
        />
        <span
          v-if="def.key === '최소뎀' && Number(stats.최소뎀) > Number(stats.최대뎀)"
          class="block mt-1 text-xs text-orange-600 dark:text-orange-400"
        >
          ⚠ 최소뎀이 최대뎀({{ Number(stats.최대뎀).toLocaleString('ko-KR') }})을 초과 — 게임 메커니즘에 따라 최대뎀으로 cap되어 계산됨 (수련의방)
        </span>
      </label>
    </div>

    <!-- ─── 추가 세부정보 (% 옵션 환산용 기본 스탯) ─── -->
    <div class="mt-5 pt-4 border-t border-stone-200 dark:border-stone-700">
      <header class="flex items-center justify-between mb-1">
        <h3 class="text-sm font-semibold text-stone-700 dark:text-stone-200">
          📐 추가 세부정보
          <span class="ml-1 text-xs font-normal text-stone-400 dark:text-stone-500">
            (선택 · % 옵션 환산용)
          </span>
        </h3>
        <span class="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
          {{ baseFilledCount }} / {{ BASE_FIELD_DEFS.length }} 입력됨
        </span>
      </header>
      <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
        T창 <strong>추가 세부정보</strong> 패널의 우측 <strong class="text-emerald-600 dark:text-emerald-400">+값(녹색 숫자)</strong>을 입력하면
        장비 비교의 % 옵션이 정확히 환산됩니다.
        <span
          class="cursor-help underline decoration-dotted"
          title='예: "근력 +1,118,069 (506%)" 로 표시되면 기본 근력 = 1,118,069 입니다. 입력하지 않으면 % 옵션이 누적 0% 가정으로 추정됩니다.'
        >어디서 보나요? ⓘ</span>
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label v-for="def in BASE_FIELD_DEFS" :key="def.key" class="block">
          <span class="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
            {{ def.label }}
          </span>
          <NumInput
            :step="def.step"
            :model-value="stats[def.key]"
            @update:model-value="setField(def.key, $event)"
            :title="def.tooltip"
            class="w-full rounded-md border-0 ring-1 ring-emerald-200 dark:ring-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-emerald-400 focus:outline-none"
          />
        </label>
      </div>
    </div>

    <!-- ─── 조건부 대미지 환산 (백어택/근거리/상태이상) ─── -->
    <div class="mt-5 pt-4 border-t border-stone-200 dark:border-stone-700">
      <header class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-stone-700 dark:text-stone-200">
          🎯 조건부 대미지 환산
        </h3>
        <span v-if="anyConditionalActive" class="text-xs tabular-nums font-semibold">
          <span class="text-sky-700 dark:text-sky-300">일반 ×{{ expectedMultNormal.toFixed(3) }}</span>
          <span class="mx-1 text-stone-400">/</span>
          <span class="text-rose-700 dark:text-rose-300">보스 ×{{ expectedMultBoss.toFixed(3) }}</span>
        </span>
      </header>
      <p class="text-xs text-stone-500 dark:text-stone-400 mb-2">
        T창 수치와 <strong>가동률</strong>(직타비중 × 조건충족율, 0~100)을 입력하면 기댓값으로 전투력에 환산됩니다.
        직접 타격에만 적용되고 소환은 영향이 없습니다.
      </p>
      <details class="mb-3 text-xs text-stone-500 dark:text-stone-400">
        <summary class="cursor-pointer select-none text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300">
          계산 방식 자세히 보기
        </summary>
        <div class="mt-2 rounded-md bg-stone-50 dark:bg-stone-900/50 p-3 space-y-1">
          <p>
            공식: <code class="text-orange-700 dark:text-orange-300">multiplier = 1 + Σ(값% × 가동률) / (D × (1 + 크댐%))</code>,
            D=0.6(일반) / 0.3(보스).
          </p>
          <p>
            백/근/상은 직접타격에만 곱해지므로, 표시(평균) BP는 직접 효과의 절반 정도 상승합니다.
            예: 백어택 1000% × 가동률 70% (크댐 9000%) → 직접 BP ×1.26, 소환 BP ×1.00, 표시 BP ×1.13.
          </p>
        </div>
      </details>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="cfg in [
            { activeKey: '백어택활성', valueKey: '백어택', uptimeKey: '백어택가동률', label: '백어택 대미지', hint: '예: 1000' },
            { activeKey: '근거리활성', valueKey: '근거리', uptimeKey: '근거리가동률', label: '근거리 대미지', hint: '예: 100' },
            { activeKey: '상태대미지활성', valueKey: '상태대미지', uptimeKey: '상태대미지가동률', label: '상태이상 대미지', hint: '예: 50' },
          ]"
          :key="cfg.activeKey"
          class="rounded-md ring-1 ring-orange-200 dark:ring-orange-900 bg-orange-50/40 dark:bg-orange-950/20 p-3"
        >
          <label class="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="!!stats[cfg.activeKey]"
              @change="setField(cfg.activeKey, $event.target.checked)"
              class="accent-orange-500"
            />
            <span class="text-xs font-semibold text-stone-700 dark:text-stone-200">
              {{ cfg.label }} <span class="text-stone-400">(%)</span>
            </span>
          </label>
          <NumInput
            step="any"
            :model-value="stats[cfg.valueKey]"
            @update:model-value="setField(cfg.valueKey, $event)"
            :placeholder="cfg.hint"
            class="w-full rounded-md border-0 ring-1 ring-orange-200 dark:ring-orange-900 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-orange-400 focus:outline-none mb-2"
          />
          <label class="block">
            <span class="block text-[10px] font-medium text-stone-600 dark:text-stone-300 mb-0.5">
              가동률 (%) — BP 환산 가중치
            </span>
            <NumInput
              step="any"
              :min="0"
              :max="100"
              :model-value="stats[cfg.uptimeKey]"
              @update:model-value="setField(cfg.uptimeKey, $event)"
              placeholder="0~100"
              class="w-full rounded-md border-0 ring-1 ring-orange-200 dark:ring-orange-900 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-1.5 text-xs tabular-nums focus:ring-2 focus:ring-orange-400 focus:outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  </section>
</template>
