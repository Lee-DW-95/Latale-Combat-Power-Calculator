<script setup>
// 대미지 계산 — 공개 분석 문서의 공식을 그대로 돌려 실제 대미지를 낸다.
//   ⚠ 인게임 실측 대조 전이다. docs/DAMAGE_FORMULA.md 의 검증 절차 참고.
import { computed, reactive, ref, watch } from 'vue';
import { calculateBattlePower } from '../utils/battlePower.js';
import { damageRange, expectedDamage, defenseConstant, defenseCoef } from '../utils/damageFormula.js';
import { attackerFromStats, targetFromPreset, weaponRangeOf, splitFinal, applyStatDeltas, deltaMissingBase, DELTA_FIELDS } from '../utils/damageInputs.js';
import { MONSTER_PRESETS, scaledMonsterStats, hasDifficulty, isStatusImmune } from '../data/monsterPresets.js';
import { fmtRound as fmt, fmt1 } from '../utils/format.js';
import { TOZ_COEF_BONUS } from '../utils/skillEngine.js';
import InfoNote from './InfoNote.vue';
import NumInput from './NumInput.vue';
import SkillDamagePanel from './SkillDamagePanel.vue';

const props = defineProps({
  stats: { type: Object, required: true },
});

const STORAGE_KEY = 'latale.damageCalc.v1';

// ── 입력 ──
const presetId = ref(MONSTER_PRESETS[0].id);
const difficulty = ref(4);
const level = ref(235);
const inputMode = ref('skill'); // 'skill' 스킬 선택 | 'manual' 계수 직접 입력
const skillMode = ref('direct'); // 'direct' | 'summon'
const skillCoef = ref(1000);
const summonS = ref(100);
const summonSc = ref(2000);
const critRate = ref(100);
const backAttack = ref(false);
const melee = ref(false);
const status = ref(false);
const toz = ref(false); // 토즈 버프 — 직타 스킬 계수 +1000
const survival = ref(false); // 생존본능(수련의방) — 대미지 난수를 최대값으로 고정해 표기

// 입력은 브라우저에 남긴다 — 매번 다시 채우지 않게.
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved) {
    for (const [k, r] of Object.entries({
      presetId, difficulty, level, inputMode, skillMode, skillCoef, summonS, summonSc,
      critRate, backAttack, melee, status, toz, survival,
    })) {
      if (saved[k] !== undefined) r.value = saved[k];
    }
  }
} catch {
  /* localStorage 불가 환경 — 기본값 사용 */
}
watch(
  [presetId, difficulty, level, inputMode, skillMode, skillCoef, summonS, summonSc, critRate, backAttack, melee, status, toz, survival],
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        presetId: presetId.value, difficulty: difficulty.value, level: level.value,
        inputMode: inputMode.value, skillMode: skillMode.value, skillCoef: skillCoef.value, summonS: summonS.value, summonSc: summonSc.value,
        critRate: critRate.value,
        backAttack: backAttack.value, melee: melee.value, status: status.value, toz: toz.value, survival: survival.value,
      }));
    } catch {
      /* 저장 실패는 무시 */
    }
  },
);

// ── 스탯 조정 — 전투력 탭을 오가지 않고 T창 표시값을 가감해 대미지 변화를 본다 ──
const DELTA_KEY = 'latale.damageCalc.deltas.v1';
const deltas = reactive(Object.fromEntries(DELTA_FIELDS.map((f) => [f.key, 0])));
try {
  const saved = JSON.parse(localStorage.getItem(DELTA_KEY) || 'null');
  if (saved) for (const f of DELTA_FIELDS) if (Number(saved[f.key])) deltas[f.key] = Number(saved[f.key]);
} catch {
  /* localStorage 불가 — 조정 없음 */
}
watch(deltas, () => {
  try {
    localStorage.setItem(DELTA_KEY, JSON.stringify(deltas));
  } catch {
    /* 저장 실패 무시 */
  }
});
// 가감 기준 — 'display' 종합 T창(전투력 표기) 표시값 | 'base' 추가 세부정보 기본값
const DELTA_MODE_KEY = 'latale.damageCalc.deltaMode.v1';
const deltaMode = ref('base');
try {
  if (localStorage.getItem(DELTA_MODE_KEY) === 'display') deltaMode.value = 'display';
} catch {
  /* localStorage 불가 — 기본값 기준 */
}
watch(deltaMode, (v) => {
  try {
    localStorage.setItem(DELTA_MODE_KEY, v);
  } catch {
    /* 저장 실패 무시 */
  }
});
const adjusting = computed(() => DELTA_FIELDS.some((f) => Number(deltas[f.key])));
const deltaOpen = ref(adjusting.value);
const resetDeltas = () => DELTA_FIELDS.forEach((f) => (deltas[f.key] = 0));
/** 계산에 쓰는 스탯 — 조정값이 있으면 가감한 사본 */
const cur = computed(() => (adjusting.value ? applyStatDeltas(props.stats, deltas, deltaMode.value) : props.stats));
const deltaNoBase = computed(() => (adjusting.value ? deltaMissingBase(props.stats, deltas, deltaMode.value) : []));
const deltaSummary = computed(() =>
  DELTA_FIELDS.filter((f) => Number(deltas[f.key]))
    .map((f) => `${f.label.replace(/ %$/, '')} ${deltas[f.key] > 0 ? '+' : ''}${fmt1(deltas[f.key])}${/ %$/.test(f.label) ? '%' : ''}`)
    .join(' · '),
);

// ── 대상 ──
const preset = computed(() => MONSTER_PRESETS.find((p) => p.id === presetId.value) || MONSTER_PRESETS[0]);
const needsDifficulty = computed(() => hasDifficulty(preset.value));
const targetStats = computed(() => scaledMonsterStats(preset.value, difficulty.value));
const presetGroups = computed(() => {
  const out = new Map();
  for (const p of MONSTER_PRESETS) {
    if (!out.has(p.group)) out.set(p.group, []);
    out.get(p.group).push(p);
  }
  return [...out.entries()];
});

// ── 계산 ──
const hasStats = computed(() => calculateBattlePower(props.stats) > 0);

const attackerOf = (stats) => attackerFromStats(stats, { target: preset.value.target, level: level.value });
const attacker = computed(() => attackerOf(cur.value));
const target = computed(() => targetFromPreset(targetStats.value));
const skill = computed(() => ({
  mode: skillMode.value,
  coef: (Number(skillCoef.value) || 0) + (skillMode.value === 'direct' && toz.value ? TOZ_COEF_BONUS : 0),
  summonS: Number(summonS.value) || 0,
  summonSc: Number(summonSc.value) || 0,
}));
// 상태이상 면역 대상(보스 전부)은 체크 여부와 관계없이 상태이상 대미지를 빼고 계산한다
const statusImmune = computed(() => isStatusImmune(preset.value));
const conditions = computed(() => ({
  backAttack: backAttack.value,
  melee: melee.value,
  status: status.value && !statusImmune.value,
}));

const nonCrit = computed(() => (hasStats.value ? damageRange(attacker.value, target.value, skill.value, { ...conditions.value, crit: false }) : null));
const crit = computed(() => (hasStats.value ? damageRange(attacker.value, target.value, skill.value, { ...conditions.value, crit: true }) : null));
// 표시 기준 — 생존본능이면 난수 최대(맥댐)로 고정, 아니면 적분 평균(없으면 중앙값)
const pickVal = (r) => (survival.value ? r.max : (r.avg ?? r.mid));
function expectedFor(att) {
  const p = Math.min(1, Math.max(0, (Number(critRate.value) || 0) / 100));
  if (survival.value) {
    const nc = damageRange(att, target.value, skill.value, { ...conditions.value, crit: false });
    const c = damageRange(att, target.value, skill.value, { ...conditions.value, crit: true });
    return nc.max * (1 - p) + c.max * p;
  }
  return expectedDamage(att, target.value, skill.value, conditions.value, p);
}
const expected = computed(() => (hasStats.value ? expectedFor(attacker.value) : 0));
const baseExpected = computed(() => (hasStats.value && adjusting.value ? expectedFor(attackerOf(props.stats)) : null));
const diffPct = (now, before) => {
  const v = before ? ((now - before) / before) * 100 : 0;
  return `${v >= 0 ? '+' : ''}${(Math.round(v * 100) / 100).toLocaleString('ko-KR')}%`;
};

// 방어 계수 — "내 관통이 이 대상에 얼마나 먹히는지" 를 숫자로 보여준다.
const defenseInfo = computed(() => {
  const isMagic = cur.value?.type === 'M';
  const a = defenseConstant(isMagic ? 'M' : 'P', level.value);
  const def = isMagic ? target.value.res : target.value.armor;
  const pen = skillMode.value === 'summon' ? 99 : Number(cur.value?.관통) || 0;
  return { a, def, pen, coef: defenseCoef(def, a, pen), label: isMagic ? '저항력' : '방어력' };
});

const weapon = computed(() => weaponRangeOf(cur.value));

// 크리·최소·최대 = 추가 세부정보 +값 × (1 + 최종 %) — 기본_* 로 역산한 결과를 보여준다
const finals = computed(() => [
  { label: '크리티컬 대미지', ...splitFinal(cur.value?.크댐, cur.value?.기본_크댐) },
  { label: '최소 대미지', ...splitFinal(cur.value?.최소뎀, cur.value?.기본_최소뎀) },
  { label: '최대 대미지', ...splitFinal(cur.value?.최대뎀, cur.value?.기본_최대뎀) },
]);
const finalsMissing = computed(() => finals.value.filter((f) => !f.derived).map((f) => f.label));
const pct = (f) => (Math.round(f * 100) / 100).toLocaleString('ko-KR');
</script>

<template>
  <div class="space-y-4">
    <InfoNote>
      <template #summary>
        T창 스탯과 대상 정보로 스킬별 실제 대미지를 계산합니다.
        <strong class="font-medium text-orange-600 dark:text-orange-400">아직 인게임 실측과 대조하지 않은 계산</strong>이라 값이 틀릴 수 있습니다.
      </template>
      <p>
        공식 출처: 공개 계산기 alfm201/damage-test (v9.17). 원본 계산 코드와 결과가 정수 단위로 일치하도록 맞췄지만,
        인게임 실측과는 아직 대조하지 않았습니다. 대상 수치도 그쪽이 정리한 값입니다.
        검증 절차와 남은 일은 저장소의 <strong>docs/DAMAGE_FORMULA.md</strong> 에 적어 두었습니다.
      </p>
      <p>
        계산 구조: 기본 공격값 → {{ defenseInfo.label }}·관통 계수 → 고정·추가 대미지 → 피해 감소 →
        크리티컬·조건부 계수 → 최소~최대 난수 → 대미지 감소 → 지배력.
        무기공격력과 대미지 난수가 각각 있어 결과는 범위로 나오고, 평균은 난수 구간을 적분해 구합니다.
      </p>
    </InfoNote>

    <div
      v-if="!hasStats"
      class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
    >
      전투력 계산 탭에서 T창 스탯을 먼저 입력하세요.
    </div>

    <template v-else>
      <!-- 설정 -->
      <div class="inline-flex rounded-lg bg-stone-100 dark:bg-stone-900/60 p-0.5 h-9">
        <button
          v-for="m in [{ id: 'skill', label: '스킬 선택' }, { id: 'manual', label: '계수 직접 입력' }]"
          :key="m.id"
          type="button"
          @click="inputMode = m.id"
          class="px-3 rounded-md text-xs font-medium transition"
          :class="inputMode === m.id
            ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-50 shadow-sm ring-1 ring-stone-200 dark:ring-stone-600'
            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100'"
        >{{ m.label }}</button>
      </div>

      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 p-3 sm:p-4 space-y-3">
        <div class="flex items-end gap-x-4 gap-y-3 flex-wrap">
          <label class="flex flex-col gap-1 min-w-0 w-full sm:w-auto">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">대상</span>
            <select
              v-model="presetId"
              class="h-9 w-full sm:w-auto max-w-full rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <optgroup v-for="[group, list] in presetGroups" :key="group" :label="group">
                <option v-for="p in list" :key="p.id" :value="p.id">{{ p.label }}</option>
              </optgroup>
            </select>
          </label>
          <label v-if="needsDifficulty" class="flex flex-col gap-1">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">난이도</span>
            <select
              v-model.number="difficulty"
              class="h-9 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            >
              <option v-for="n in 5" :key="n" :value="n">{{ n }}단계</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 flex-1 sm:flex-none">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">캐릭터 레벨</span>
            <input
              v-model.number="level"
              type="number"
              min="1"
              inputmode="numeric"
              class="h-9 w-full sm:w-24 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <label v-if="inputMode === 'manual'" class="flex flex-col gap-1">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">공격 방식</span>
            <div class="inline-flex rounded-lg bg-stone-100 dark:bg-stone-900/60 p-0.5 h-9">
              <button
                v-for="m in [{ id: 'direct', label: '직타' }, { id: 'summon', label: '소환' }]"
                :key="m.id"
                type="button"
                @click="skillMode = m.id"
                class="px-3 rounded-md text-xs font-medium transition"
                :class="skillMode === m.id
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-50 shadow-sm ring-1 ring-stone-200 dark:ring-stone-600'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100'"
              >{{ m.label }}</button>
            </div>
          </label>
          <label v-if="inputMode === 'manual' && skillMode === 'direct'" class="flex flex-col gap-1 flex-1 sm:flex-none">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">스킬 계수</span>
            <input
              v-model.number="skillCoef"
              type="number"
              min="0"
              inputmode="numeric"
              class="h-9 w-full sm:w-28 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <template v-else-if="inputMode === 'manual'">
            <label class="flex flex-col gap-1 flex-1 sm:flex-none">
              <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">능력치 배율 %</span>
              <input v-model.number="summonS" type="number" min="0" inputmode="numeric" class="h-9 w-full sm:w-24 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label class="flex flex-col gap-1 flex-1 sm:flex-none">
              <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">공격력 계수 SC</span>
              <input v-model.number="summonSc" type="number" min="0" inputmode="numeric" class="h-9 w-full sm:w-24 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </template>
          <label class="flex flex-col gap-1 flex-1 sm:flex-none">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">크리 확률 %</span>
            <input v-model.number="critRate" type="number" min="0" max="100" inputmode="numeric" class="h-9 w-full sm:w-20 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>
        </div>

        <div class="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
          <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">조건</span>
          <label class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300">
            <input v-model="backAttack" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 백어택
          </label>
          <label v-if="inputMode === 'skill' || skillMode === 'direct'" class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300">
            <input v-model="melee" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 근거리
          </label>
          <label
            v-if="inputMode === 'skill' || skillMode === 'direct'"
            class="flex items-center gap-1.5 text-stone-600 dark:text-stone-300"
            :class="statusImmune ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
            :title="statusImmune ? `${preset.label}는 상태이상에 걸리지 않아 상태이상 대미지가 적용되지 않습니다` : ''"
          >
            <input
              :checked="status && !statusImmune"
              :disabled="statusImmune"
              type="checkbox"
              class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500"
              @change="status = $event.target.checked"
            />
            상태이상<span v-if="statusImmune" class="text-[11px] text-stone-400 dark:text-stone-500">(면역)</span>
          </label>
          <label
            v-if="inputMode === 'skill' || skillMode === 'direct'"
            class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300"
            title="토즈 버프 — 직타 스킬 계수 +1000"
          >
            <input v-model="toz" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 토즈 <span class="text-[11px] text-stone-400 dark:text-stone-500">(계수 +1000)</span>
          </label>
          <label
            class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300"
            title="수련의방 생존본능 — 대미지·무기공격력 난수를 최대값으로 고정하고 최대 대미지만 표기합니다"
          >
            <input v-model="survival" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 생존본능 <span class="text-[11px] text-stone-400 dark:text-stone-500">(맥댐 고정)</span>
          </label>
        </div>
      </div>

      <!-- 스탯 조정 -->
      <div
        class="rounded-xl ring-1 bg-white dark:bg-stone-800/60 p-3 sm:p-4"
        :class="adjusting ? 'ring-cyan-400 dark:ring-cyan-600' : 'ring-stone-200 dark:ring-stone-700'"
      >
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-200 min-w-0" @click="deltaOpen = !deltaOpen">
            <span class="inline-block transition-transform duration-200 text-stone-400 text-xs" :class="deltaOpen ? 'rotate-90' : ''">▶</span>
            스탯 조정해서 비교
            <span v-if="adjusting" class="text-[11px] font-medium text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/40 rounded px-1.5 py-0.5">적용 중</span>
          </button>
          <button
            v-if="adjusting"
            type="button"
            class="h-7 px-2.5 rounded-md text-xs text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700/60 shrink-0"
            @click="resetDeltas"
          >초기화</button>
        </div>
        <p v-if="adjusting && !deltaOpen" class="text-xs text-stone-500 dark:text-stone-400 mt-1.5 tabular-nums">{{ deltaMode === 'base' ? '기본값' : '최종 스탯' }} 기준 · {{ deltaSummary }}</p>
        <div v-show="deltaOpen" class="mt-3 space-y-2">
          <div class="inline-flex rounded-lg bg-stone-100 dark:bg-stone-900/60 p-0.5 h-8">
            <button
              v-for="m in [{ id: 'display', label: '종합 T창 (최종 스탯)' }, { id: 'base', label: '추가 세부정보 (기본값)' }]"
              :key="m.id"
              type="button"
              @click="deltaMode = m.id"
              class="px-3 rounded-md text-xs font-medium transition"
              :class="deltaMode === m.id
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-50 shadow-sm ring-1 ring-stone-200 dark:ring-stone-600'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100'"
            >{{ m.label }}</button>
          </div>
          <p class="text-[11px] text-stone-400 dark:text-stone-500">
            <template v-if="deltaMode === 'base'">추가 세부정보의 기본값(+값)에 더하고 최종 %를 다시 곱합니다. 예) 크댐 −300 → 기본 크댐 −300.</template>
            <template v-else>전투력이 표기되는 종합 T창 값에 그대로 더합니다. 예) 크댐 −300 → 최종 크댐 −300.</template>
            % 칸은 장비 % 옵션처럼 누적 %에 더합니다 (최소·최대·크리는 최종 %). 빼려면 음수를 넣습니다. 캐릭터 스탯은 그대로 둡니다.
          </p>
          <p v-if="deltaNoBase.length" class="text-[11px] text-orange-600 dark:text-orange-400">
            {{ deltaNoBase.join('·') }}: 기본값이 없어 누적 %를 모르는 채로 계산했습니다 (가산은 표시값에 그대로, %는 누적 0%로 가정). 전투력 탭에서 기본값을 채우면 정확해집니다.
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2">
            <label v-for="f in DELTA_FIELDS" :key="f.key" class="flex flex-col gap-1 min-w-0">
              <span class="text-[11px] text-stone-500 dark:text-stone-400 truncate">{{ f.label }}</span>
              <NumInput
                v-model="deltas[f.key]"
                :step="f.step || 1"
                placeholder="±0"
                class="h-8 w-full rounded-lg border-0 ring-1 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                :class="Number(deltas[f.key]) ? 'ring-cyan-400 dark:ring-cyan-600' : 'ring-stone-300 dark:ring-stone-600'"
              />
            </label>
          </div>
        </div>
      </div>

      <SkillDamagePanel
        v-if="inputMode === 'skill'"
        :stats="cur"
        :base-stats="adjusting ? stats : null"
        :target-stats="targetStats"
        :target-type="preset.target"
        :level="Number(level) || 1"
        :crit-rate="Number(critRate) || 0"
        :conditions="conditions"
        :toz="toz"
        :survival="survival"
      />

      <!-- 결과 (계수 직접 입력) -->
      <template v-else>
      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 border-l-4 border-cyan-500 px-4 py-3">
        <p class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">
          기대 대미지 · 크리 {{ critRate }}%<span v-if="survival"> · 생존본능(최대 고정)</span>
        </p>
        <p class="text-3xl font-semibold tracking-tight tabular-nums text-cyan-700 dark:text-cyan-300 leading-none mt-1">
          {{ fmt(expected) }}
        </p>
        <p v-if="baseExpected != null" class="text-sm tabular-nums text-stone-600 dark:text-stone-300 mt-1.5">
          조정 전 {{ fmt(baseExpected) }}
          <span class="font-semibold" :class="expected >= baseExpected ? 'text-cyan-700 dark:text-cyan-300' : 'text-orange-600 dark:text-orange-400'">
            → {{ expected >= baseExpected ? '+' : '' }}{{ fmt(expected - baseExpected) }} ({{ diffPct(expected, baseExpected) }})
          </span>
        </p>
        <p class="text-xs text-stone-500 dark:text-stone-400 mt-1.5 tabular-nums">
          {{ preset.label }} · {{ preset.target === 'boss' ? '보스' : '일반' }}
          <span class="mx-1 text-stone-300 dark:text-stone-600">|</span>
          {{ skillMode === 'direct' ? `직타 계수 ${fmt(skillCoef)}${toz ? ` + 토즈 ${fmt(TOZ_COEF_BONUS)}` : ''}` : `소환 S ${summonS}% · SC ${fmt(summonSc)}` }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div v-for="row in [{ k: 'noncrit', label: '비크리', data: nonCrit }, { k: 'crit', label: '크리티컬', data: crit }]" :key="row.k"
          class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 px-4 py-3">
          <p class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">
            {{ row.label }} · {{ survival ? '최대 고정' : row.data.avg != null ? '평균' : '중앙값' }}
          </p>
          <p class="text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-50 mt-0.5">{{ fmt(pickVal(row.data)) }}</p>
          <p class="text-xs text-stone-500 dark:text-stone-400 tabular-nums mt-0.5">
            <template v-if="survival">난수 미적용 (생존본능)</template>
            <template v-else>{{ fmt(row.data.min) }} ~ {{ fmt(row.data.max) }}</template>
          </p>
          <p v-if="row.data.floorActive" class="text-[11px] text-orange-600 dark:text-orange-400 mt-1">
            방어가 공격을 넘어 최소 대미지(1~2) 구간입니다.
          </p>
        </div>
      </div>

      </template>

      <!-- 적용 값 확인 -->
      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 px-4 py-3">
        <p class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase mb-2">적용된 값<span v-if="adjusting" class="normal-case tracking-normal"> · 스탯 조정 반영</span><span v-if="inputMode === 'skill'" class="normal-case tracking-normal"> · 특화석·버프 적용 전</span></p>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-xs tabular-nums">
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">{{ defenseInfo.label }}</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(defenseInfo.def) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">레벨 상수 a</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(defenseInfo.a) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">관통</span><span class="text-stone-800 dark:text-stone-100">{{ defenseInfo.pen }}%</span></div>
          <div class="flex justify-between gap-2" :title="'방어 계수 — 1 이면 방어 무시, 0 에 가까우면 거의 막힘'"><span class="text-stone-500 dark:text-stone-400">방어 계수</span><span class="text-stone-800 dark:text-stone-100">{{ fmt1(defenseInfo.coef * 100) }}%</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">피해 감소(F)</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(stats.type === 'M' ? targetStats.F_M : targetStats.F_P) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">대미지 감소</span><span class="text-stone-800 dark:text-stone-100">{{ targetStats.Guard }}%</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">크리 저항</span><span class="text-stone-800 dark:text-stone-100">{{ targetStats.ELASTICITY }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">지배력</span><span class="text-stone-800 dark:text-stone-100">{{ attacker.dominance }}%</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">{{ stats.type === 'M' ? '마법력' : '근력' }}</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(attacker.mainStat) }}</span></div>
          <div class="flex justify-between gap-2" title="직타의 능력치 항에만 곱해진다: floor(근력 × (1 + 효율%)). T창 근력·소환 대미지에는 영향 없음">
            <span class="text-stone-500 dark:text-stone-400">{{ stats.type === 'M' ? '마법력' : '근력' }} 효율 <span class="text-stone-400 dark:text-stone-500">(직타만)</span></span>
            <span class="text-stone-800 dark:text-stone-100">+{{ attacker.eff }}% → {{ fmt(Math.floor(attacker.mainStat * (1 + attacker.eff / 100))) }}</span>
          </div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">{{ stats.type === 'M' ? '속성력' : '무기공격력' }}</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(weapon.min) }}~{{ fmt(weapon.max) }}</span></div>
          <div v-for="f in finals" :key="f.label" class="flex justify-between gap-2">
            <span class="text-stone-500 dark:text-stone-400">{{ f.label }}</span>
            <span class="text-stone-800 dark:text-stone-100">{{ fmt(f.raw) }}<span v-if="f.f" class="text-stone-500 dark:text-stone-400"> · 최종 +{{ pct(f.f) }}%</span></span>
          </div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">추가 대미지</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(attacker.addDamage) }}</span></div>
        </div>
        <p v-if="finalsMissing.length" class="mt-2 text-[11px] text-orange-600 dark:text-orange-400 leading-relaxed">
          {{ finalsMissing.join('·') }}의 기본값(T창 추가 세부정보 +값)이 없어 최종 %를 나누지 못했습니다.
          한 방 대미지는 같지만, 특화석·노블레스의 최종 % 효과가 조금 크게 잡힙니다.
        </p>
        <p class="mt-2 text-[11px] text-stone-400 dark:text-stone-500 leading-relaxed">
          대상 수치는 아직 우리 실측으로 확인하지 않았습니다 ({{ preset.basis }}).
          목각인형 프리링은 모든 방어 항이 0 이라 공식 검증의 기준점으로 씁니다.
        </p>
      </div>
    </template>
  </div>
</template>
