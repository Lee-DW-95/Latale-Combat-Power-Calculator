<script setup>
// 대미지 계산 — 공개 분석 문서의 공식을 그대로 돌려 실제 대미지를 낸다.
//   ⚠ 인게임 실측 대조 전이다. docs/DAMAGE_FORMULA.md 의 검증 절차 참고.
import { computed, ref, watch } from 'vue';
import { calculateBattlePower } from '../utils/battlePower.js';
import { damageRange, expectedDamage, defenseConstant, defenseCoef } from '../utils/damageFormula.js';
import { attackerFromStats, targetFromPreset, weaponRangeOf } from '../utils/damageInputs.js';
import { MONSTER_PRESETS, scaledMonsterStats, hasDifficulty } from '../data/monsterPresets.js';
import { fmtRound as fmt, fmt1 } from '../utils/format.js';
import InfoNote from './InfoNote.vue';

const props = defineProps({
  stats: { type: Object, required: true },
});

const STORAGE_KEY = 'latale.damageCalc.v1';

// ── 입력 ──
const presetId = ref(MONSTER_PRESETS[0].id);
const difficulty = ref(4);
const level = ref(235);
const skillMode = ref('direct'); // 'direct' | 'summon'
const skillCoef = ref(1000);
const summonS = ref(100);
const summonSc = ref(2000);
const critRate = ref(100);
const finalCritPct = ref(0);
const finalMinPct = ref(0);
const finalMaxPct = ref(0);
const backAttack = ref(false);
const melee = ref(false);
const status = ref(false);

// 입력은 브라우저에 남긴다 — 매번 다시 채우지 않게.
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved) {
    for (const [k, r] of Object.entries({
      presetId, difficulty, level, skillMode, skillCoef, summonS, summonSc,
      critRate, finalCritPct, finalMinPct, finalMaxPct, backAttack, melee, status,
    })) {
      if (saved[k] !== undefined) r.value = saved[k];
    }
  }
} catch {
  /* localStorage 불가 환경 — 기본값 사용 */
}
watch(
  [presetId, difficulty, level, skillMode, skillCoef, summonS, summonSc, critRate, finalCritPct, finalMinPct, finalMaxPct, backAttack, melee, status],
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        presetId: presetId.value, difficulty: difficulty.value, level: level.value,
        skillMode: skillMode.value, skillCoef: skillCoef.value, summonS: summonS.value, summonSc: summonSc.value,
        critRate: critRate.value, finalCritPct: finalCritPct.value,
        finalMinPct: finalMinPct.value, finalMaxPct: finalMaxPct.value,
        backAttack: backAttack.value, melee: melee.value, status: status.value,
      }));
    } catch {
      /* 저장 실패는 무시 */
    }
  },
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

const attacker = computed(() =>
  attackerFromStats(props.stats, {
    target: preset.value.target,
    level: level.value,
    finalCritPct: finalCritPct.value,
    finalMinPct: finalMinPct.value,
    finalMaxPct: finalMaxPct.value,
  }),
);
const target = computed(() => targetFromPreset(targetStats.value));
const skill = computed(() => ({
  mode: skillMode.value,
  coef: Number(skillCoef.value) || 0,
  summonS: Number(summonS.value) || 0,
  summonSc: Number(summonSc.value) || 0,
}));
const conditions = computed(() => ({
  backAttack: backAttack.value,
  melee: melee.value,
  status: status.value,
}));

const nonCrit = computed(() => (hasStats.value ? damageRange(attacker.value, target.value, skill.value, { ...conditions.value, crit: false }) : null));
const crit = computed(() => (hasStats.value ? damageRange(attacker.value, target.value, skill.value, { ...conditions.value, crit: true }) : null));
const expected = computed(() =>
  hasStats.value ? expectedDamage(attacker.value, target.value, skill.value, conditions.value, (Number(critRate.value) || 0) / 100) : 0,
);

// 방어 계수 — "내 관통이 이 대상에 얼마나 먹히는지" 를 숫자로 보여준다.
const defenseInfo = computed(() => {
  const isMagic = props.stats?.type === 'M';
  const a = defenseConstant(isMagic ? 'M' : 'P', level.value);
  const def = isMagic ? target.value.res : target.value.armor;
  const pen = skillMode.value === 'summon' ? 99 : Number(props.stats?.관통) || 0;
  return { a, def, pen, coef: defenseCoef(def, a, pen), label: isMagic ? '저항력' : '방어력' };
});

const weapon = computed(() => weaponRangeOf(props.stats));
</script>

<template>
  <div class="space-y-4">
    <InfoNote>
      <template #summary>
        T창 스탯과 대상 정보로 실제 대미지를 계산합니다.
        <strong class="font-medium text-orange-600 dark:text-orange-400">아직 인게임 실측과 대조하지 않은 계산</strong>이라 값이 틀릴 수 있습니다.
      </template>
      <p>
        공식 출처: 공개 분석 문서(alfm201/damage-test). 대상 수치도 그쪽이 정리한 값을 옮긴 것이라 우리 실측 검증 전입니다.
        검증 절차와 남은 일은 저장소의 <strong>docs/DAMAGE_FORMULA.md</strong> 에 적어 두었습니다.
      </p>
      <p>
        계산 구조: 기본 공격값 → {{ defenseInfo.label }}·관통 계수 → 고정·추가 대미지 → 피해 감소 →
        크리티컬·조건부 계수 → 최소~최대 난수 → 대미지 감소 → 지배력.
        무기공격력과 대미지 난수가 각각 있어 결과는 범위로 나옵니다.
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
      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 p-3 sm:p-4 space-y-3">
        <div class="flex items-end gap-x-4 gap-y-3 flex-wrap">
          <label class="flex flex-col gap-1 min-w-0">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">대상</span>
            <select
              v-model="presetId"
              class="h-9 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
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
          <label class="flex flex-col gap-1">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">캐릭터 레벨</span>
            <input
              v-model.number="level"
              type="number"
              min="1"
              class="h-9 w-24 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
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
          <label v-if="skillMode === 'direct'" class="flex flex-col gap-1">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">스킬 계수</span>
            <input
              v-model.number="skillCoef"
              type="number"
              min="0"
              class="h-9 w-28 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <template v-else>
            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">능력치 배율 %</span>
              <input v-model.number="summonS" type="number" min="0" class="h-9 w-24 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">공격력 계수 SC</span>
              <input v-model.number="summonSc" type="number" min="0" class="h-9 w-24 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </template>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">크리 확률 %</span>
            <input v-model.number="critRate" type="number" min="0" max="100" class="h-9 w-20 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>
        </div>

        <div class="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
          <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">조건</span>
          <label class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300">
            <input v-model="backAttack" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 백어택
          </label>
          <label v-if="skillMode === 'direct'" class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300">
            <input v-model="melee" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 근거리
          </label>
          <label v-if="skillMode === 'direct'" class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300">
            <input v-model="status" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 상태이상
          </label>
          <span class="text-stone-300 dark:text-stone-600">|</span>
          <span class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">최종 대미지 옵션 %</span>
          <label class="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            크리
            <input v-model.number="finalCritPct" type="number" class="h-8 w-16 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-xs text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>
          <label class="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            최소
            <input v-model.number="finalMinPct" type="number" class="h-8 w-16 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-xs text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>
          <label class="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            최대
            <input v-model.number="finalMaxPct" type="number" class="h-8 w-16 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-xs text-right tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>
        </div>
      </div>

      <!-- 결과 -->
      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 border-l-4 border-cyan-500 px-4 py-3">
        <p class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">
          기대 대미지 · 크리 {{ critRate }}%
        </p>
        <p class="text-3xl font-semibold tracking-tight tabular-nums text-cyan-700 dark:text-cyan-300 leading-none mt-1">
          {{ fmt(expected) }}
        </p>
        <p class="text-xs text-stone-500 dark:text-stone-400 mt-1.5 tabular-nums">
          {{ preset.label }} · {{ preset.target === 'boss' ? '보스' : '일반' }}
          <span class="mx-1 text-stone-300 dark:text-stone-600">|</span>
          {{ skillMode === 'direct' ? `직타 계수 ${fmt(skillCoef)}` : `소환 S ${summonS}% · SC ${fmt(summonSc)}` }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div v-for="row in [{ k: 'noncrit', label: '비크리', data: nonCrit }, { k: 'crit', label: '크리티컬', data: crit }]" :key="row.k"
          class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 px-4 py-3">
          <p class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase">{{ row.label }}</p>
          <p class="text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-50 mt-0.5">{{ fmt(row.data.mid) }}</p>
          <p class="text-xs text-stone-500 dark:text-stone-400 tabular-nums mt-0.5">
            {{ fmt(row.data.min) }} ~ {{ fmt(row.data.max) }}
          </p>
        </div>
      </div>

      <!-- 적용 값 확인 -->
      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 px-4 py-3">
        <p class="text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase mb-2">적용된 값</p>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-xs tabular-nums">
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">{{ defenseInfo.label }}</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(defenseInfo.def) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">레벨 상수 a</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(defenseInfo.a) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">관통</span><span class="text-stone-800 dark:text-stone-100">{{ defenseInfo.pen }}%</span></div>
          <div class="flex justify-between gap-2" :title="'방어 계수 — 1 이면 방어 무시, 0 에 가까우면 거의 막힘'"><span class="text-stone-500 dark:text-stone-400">방어 계수</span><span class="text-stone-800 dark:text-stone-100">{{ fmt1(defenseInfo.coef * 100) }}%</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">피해 감소(F)</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(stats.type === 'M' ? targetStats.F_M : targetStats.F_P) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">대미지 감소</span><span class="text-stone-800 dark:text-stone-100">{{ targetStats.Guard }}%</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">크리 저항</span><span class="text-stone-800 dark:text-stone-100">{{ targetStats.ELASTICITY }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">지배력</span><span class="text-stone-800 dark:text-stone-100">{{ attacker.dominance }}%</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">주스탯(효율 적용)</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(attacker.mainStat * (1 + attacker.eff / 100)) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">{{ stats.type === 'M' ? '속성력' : '무기공격력' }}</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(weapon.min) }}~{{ fmt(weapon.max) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">최소~최대 대미지</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(attacker.rawMin) }}~{{ fmt(attacker.rawMax) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-stone-500 dark:text-stone-400">추가 대미지</span><span class="text-stone-800 dark:text-stone-100">{{ fmt(attacker.addDamage) }}</span></div>
        </div>
        <p class="mt-2 text-[11px] text-stone-400 dark:text-stone-500 leading-relaxed">
          대상 수치는 아직 우리 실측으로 확인하지 않았습니다 ({{ preset.basis }}).
          목각인형 프리링은 모든 방어 항이 0 이라 공식 검증의 기준점으로 씁니다.
        </p>
      </div>
    </template>
  </div>
</template>
