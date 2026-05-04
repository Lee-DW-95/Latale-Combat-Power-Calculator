<script setup>
import { computed, ref, watch } from 'vue';
import {
  DIRECT_HIT_SKILLS,
  DIRECT_HIT_JOBS,
} from '../data/directHitSkills.js';
import {
  INSTALLER_SKILLS,
  INSTALLER_JOBS,
} from '../data/installerSkills.js';
import {
  getSkillCoef,
  predictDamage,
  calibrateC,
} from '../utils/damagePredict.js';
import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
  conditionalMultiplier,
  conditionalMultiplierWith,
  expectedConditionalMultiplier,
} from '../utils/battlePower.js';
import { fmt, fmtRound } from '../utils/format.js';

// 조건부 환산이 stats.환산활성 = true 면 calculateBattlePower 가 이미 곱셈을 반영함.
// → predictDamage / calibrateC 의 BP 도 자동 환산값 사용. 별도 처리 불필요.

const props = defineProps({
  stats: { type: Object, required: true },
});
const emit = defineEmits(['update:stats']);

// stats 의 일부 필드를 갱신하고 부모로 emit.
function updateStatField(key, value) {
  emit('update:stats', { ...props.stats, [key]: value });
}

// ============================================================
// 모드 / 선택 상태
// ============================================================
const mode = ref('direct'); // 'direct' | 'installer'

const jobList = computed(() =>
  mode.value === 'direct' ? DIRECT_HIT_JOBS : INSTALLER_JOBS,
);

const selectedJob = ref(DIRECT_HIT_JOBS[0]);
const selectedSkill = ref('');
const skillLevel = ref(20);

const skillList = computed(() => {
  const dict = mode.value === 'direct' ? DIRECT_HIT_SKILLS : INSTALLER_SKILLS;
  return dict[selectedJob.value] ?? [];
});

// 모드/직업 바뀌면 첫 스킬로 자동 선택
watch([mode, selectedJob], () => {
  if (mode.value === 'direct' && !DIRECT_HIT_JOBS.includes(selectedJob.value)) {
    selectedJob.value = DIRECT_HIT_JOBS[0];
  }
  if (mode.value === 'installer' && !INSTALLER_JOBS.includes(selectedJob.value)) {
    selectedJob.value = INSTALLER_JOBS[0];
  }
  const list = skillList.value;
  if (list.length > 0 && !list.find((s) => s.name === selectedSkill.value)) {
    selectedSkill.value = list[0].name;
  }
}, { immediate: true });

// ============================================================
// 캘리브레이션 C — localStorage 저장 (캐릭별)
// ============================================================
const STORAGE_KEY = 'latale_calibrationC';
const calibrationC = ref(loadC());
const measuredDamageInput = ref('');
const calibrationError = ref(''); // 적용 실패 사유 표시용

function loadC() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function saveC(v) {
  try {
    if (v == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

function applyCalibration() {
  calibrationError.value = '';

  // 사전 검증 — 무엇이 빠졌는지 사용자에게 알려줌
  const bp = calculateBattlePower(props.stats);
  if (bp <= 0) {
    calibrationError.value = '전투력(BP)이 0 입니다. 먼저 "🛡️ 전투력 계산" 탭에서 스탯을 입력해주세요.';
    return;
  }
  if (!selectedSkill.value) {
    calibrationError.value = '스킬이 선택되지 않았습니다.';
    return;
  }
  const coef = getSkillCoef(mode.value, selectedJob.value, selectedSkill.value, skillLevel.value);
  if (coef <= 0) {
    calibrationError.value = '선택한 스킬의 계수를 못 찾았습니다 (직업·스킬 조합 확인 필요).';
    return;
  }
  const m = Number(measuredDamageInput.value);
  if (!Number.isFinite(m) || m <= 0) {
    calibrationError.value = '측정 평균 대미지를 양의 숫자로 입력해주세요.';
    return;
  }

  const v = calibrateC(
    props.stats,
    mode.value,
    selectedJob.value,
    selectedSkill.value,
    skillLevel.value,
    m,
  );
  if (v != null && v > 0) {
    calibrationC.value = v;
    saveC(v);
  } else {
    calibrationError.value = '캘리브레이션 계산 실패 — 입력값을 확인해주세요.';
  }
}

function resetCalibration() {
  calibrationC.value = null;
  measuredDamageInput.value = '';
  calibrationError.value = '';
  saveC(null);
}

// ============================================================
// 계산값
// ============================================================
const currentBP = computed(() => calculateBattlePower(props.stats));
const currentCoef = computed(() =>
  getSkillCoef(mode.value, selectedJob.value, selectedSkill.value, skillLevel.value),
);
// BP 환산 배율 — 가동률 가중 (직접 BP 에만 곱셈, 소환은 영향 없음)
const condMultNormal = computed(() => expectedConditionalMultiplier(props.stats, 'normal'));
const condMultBoss = computed(() => expectedConditionalMultiplier(props.stats, 'boss'));
const condEffective = computed(
  () => condMultNormal.value > 1 || condMultBoss.value > 1
);

// 평균 BP (직접+소환)/2 — base/일반/보스
const baseBP = computed(() => calculateBattlePower(props.stats, 'base'));
const normalBP = computed(() => calculateBattlePower(props.stats, 'normal'));
const bossBP = computed(() => calculateBattlePower(props.stats, 'boss'));

// 직접/소환 분리 BP — 환산 시각화용
const directBPBase = computed(() => calculateDirectBP(props.stats, 'base'));
const directBPNormal = computed(() => calculateDirectBP(props.stats, 'normal'));
const directBPBoss = computed(() => calculateDirectBP(props.stats, 'boss'));
const summonBP = computed(() => calculateSummonBP(props.stats));
const predicted = computed(() => {
  if (!calibrationC.value) return null;
  return predictDamage(
    props.stats,
    mode.value,
    selectedJob.value,
    selectedSkill.value,
    skillLevel.value,
    calibrationC.value,
  );
});

// 시나리오 매트릭스 — 백/근/상 ON/OFF 조합별 일반/보스 두 환경 BP/대미지
//   백/근/상은 직접 BP 에만 영향, 소환은 그대로 → 평균(표시) BP = (직접×mult + 소환)/2
const scenarioMatrix = computed(() => {
  const hasBack = Number(props.stats.백어택 || 0) > 0;
  const hasClose = Number(props.stats.근거리 || 0) > 0;
  const hasStatus = Number(props.stats.상태대미지 || 0) > 0;
  const flags = [];
  if (hasBack) flags.push('백어택');
  if (hasClose) flags.push('근거리');
  if (hasStatus) flags.push('상태이상');
  if (flags.length === 0) return [];

  // 가동률 영향 제외한 base 직접/소환 BP (시나리오는 ON/OFF 100% 적용 가정)
  const baseDirect = calculateDirectBP(props.stats, 'base');
  const baseSummon = calculateSummonBP(props.stats);

  const total = 1 << flags.length;
  const out = [];
  for (let mask = 0; mask < total; mask++) {
    const activeMap = {};
    const labels = [];
    for (let i = 0; i < flags.length; i++) {
      const on = (mask >> i) & 1;
      activeMap[flags[i]] = !!on;
      if (on) labels.push(flags[i]);
    }
    const multNormal = conditionalMultiplierWith(props.stats, activeMap, 'normal');
    const multBoss = conditionalMultiplierWith(props.stats, activeMap, 'boss');

    // 직접 BP × multiplier, 소환 BP 그대로
    const dirNormal = baseDirect * multNormal;
    const dirBoss = baseDirect * multBoss;
    const avgNormal = (dirNormal + baseSummon) / 2;
    const avgBoss = (dirBoss + baseSummon) / 2;

    const dmgNormal = calibrationC.value && avgNormal > 0 && currentCoef.value > 0
      ? calibrationC.value * avgNormal * (currentCoef.value / 100) : null;
    const dmgBoss = calibrationC.value && avgBoss > 0 && currentCoef.value > 0
      ? calibrationC.value * avgBoss * (currentCoef.value / 100) : null;
    out.push({
      label: labels.length === 0 ? '기본 (조건 없음)' : labels.join(' + '),
      multNormal,
      multBoss,
      dirNormal, dirBoss,
      summon: baseSummon,
      avgNormal, avgBoss,
      dmgNormal, dmgBoss,
      activeCount: labels.length,
    });
  }
  return out.sort((a, b) => a.activeCount - b.activeCount || b.avgBoss - a.avgBoss);
});

// 동일 캐릭으로 다른 스킬 비교 — C 없어도 계수 기반으로 상대 순위 노출
const allSkillPredictions = computed(() => {
  return skillList.value.map((s) => {
    const coef = getSkillCoef(mode.value, selectedJob.value, s.name, skillLevel.value);
    const dmg = calibrationC.value && currentBP.value > 0
      ? predictDamage(
          props.stats,
          mode.value,
          selectedJob.value,
          s.name,
          skillLevel.value,
          calibrationC.value,
        )
      : null;
    return { name: s.name, coef, dmg };
  }).sort((a, b) => b.coef - a.coef); // 계수 내림차순 (대미지 없을 땐 계수로 정렬)
});
</script>

<template>
  <div class="space-y-5">
    <!-- 안내 -->
    <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
      <strong>🎯 대미지 예측</strong> · <code>대미지 = C × BP × (스킬계수 / 100)</code>
      <br />
      <strong class="text-xs">사용 순서</strong>:
      ① <strong>🛡️ 전투력 계산</strong>에서 스탯 입력 →
      ② 여기서 직업·스킬·스킬레벨 선택 →
      ③ 인게임 허수아비 측정값 1회 입력해 C 도출 →
      ④ 이후 다른 스킬·스탯 변경 시 자동 예측.
      <br />
      <strong class="text-xs">⚠️</strong> 비공식 데이터 기반 — 실제 인게임 값과 ±5% 정도 오차 가능. C는 캐릭별 1회 측정 필요(타겟 변경 시 재측정).
    </div>

    <!-- BP 0 경고 -->
    <div
      v-if="currentBP <= 0"
      class="rounded-xl bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300 dark:ring-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
    >
      ⚠ <strong>전투력 = 0</strong> — 먼저 "🛡️ 전투력 계산" 탭에서 스탯을 입력해주세요. 그래야 캘리브레이션과 예측이 동작합니다.
    </div>

    <!-- 🎯 조건부 환산 (백어택/근거리/상태이상) — 옵션별 독립 ON/OFF -->
    <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-amber-300 dark:ring-amber-700 p-5">
      <header class="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 class="text-lg font-bold text-amber-700 dark:text-amber-300">
          🎯 조건부 환산 — 가동률 기반 BP
          <span v-if="condEffective" class="ml-2 text-xs font-semibold tabular-nums">
            <span class="text-sky-700 dark:text-sky-300">일반 ×{{ condMultNormal.toFixed(3) }}</span>
            <span class="mx-1 text-slate-400">/</span>
            <span class="text-rose-700 dark:text-rose-300">보스 ×{{ condMultBoss.toFixed(3) }}</span>
          </span>
          <span v-else class="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
            가동률 미입력 — 게임 표시값 그대로
          </span>
        </h2>
      </header>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        엑셀 공식 (B!P18/19): <code class="text-amber-700 dark:text-amber-300">multiplier = 1 + Σ(값% × 가동률) / (D × (1 + 크댐%))</code>,
        D=0.6(일반)/0.3(보스). 크댐이 클수록 배율 작아짐.
        <br />
        ⚠️ 백/근/상은 <strong class="text-amber-700 dark:text-amber-300">직접타격 전용</strong> — 소환 BP는 영향 없고 직접 BP만 multiplier 곱셈됩니다.
        표시(평균) BP = (직접 × mult + 소환) / 2 → 직접 효과의 약 절반이 표시 BP에 반영.
        <br />
        예: 크댐 9000%, 백어택 1000% × 가동률 70% → 직접 ×1.26 / 소환 ×1.00 / 평균 ×1.13 (보스 기준).
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="cfg in [
            { activeKey: '백어택활성', valueKey: '백어택', uptimeKey: '백어택가동률', label: '백어택 대미지', hint: '예: 1000' },
            { activeKey: '근거리활성', valueKey: '근거리', uptimeKey: '근거리가동률', label: '근거리 대미지', hint: '예: 100' },
            { activeKey: '상태대미지활성', valueKey: '상태대미지', uptimeKey: '상태대미지가동률', label: '상태이상 대미지', hint: '예: 50' },
          ]"
          :key="cfg.activeKey"
          class="rounded-md ring-1 ring-amber-200 dark:ring-amber-900 bg-amber-50/40 dark:bg-amber-950/20 p-3"
        >
          <label class="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="!!stats[cfg.activeKey]"
              @change="updateStatField(cfg.activeKey, $event.target.checked)"
              class="accent-amber-500"
            />
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {{ cfg.label }} <span class="text-slate-400">(%)</span>
            </span>
          </label>
          <input
            type="number"
            step="any"
            :value="stats[cfg.valueKey]"
            @input="updateStatField(cfg.valueKey, $event.target.value === '' ? 0 : Number($event.target.value) || 0)"
            :placeholder="cfg.hint"
            class="w-full rounded-md border-0 ring-1 ring-amber-200 dark:ring-amber-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-amber-400 focus:outline-none mb-2"
          />
          <label class="block">
            <span class="block text-[10px] font-medium text-slate-600 dark:text-slate-300 mb-0.5">
              가동률 (%) — BP 환산 가중치
            </span>
            <input
              type="number"
              step="any"
              min="0"
              max="100"
              :value="stats[cfg.uptimeKey]"
              @input="updateStatField(cfg.uptimeKey, $event.target.value === '' ? 0 : Number($event.target.value) || 0)"
              placeholder="0~100"
              class="w-full rounded-md border-0 ring-1 ring-amber-200 dark:ring-amber-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs tabular-nums focus:ring-2 focus:ring-amber-400 focus:outline-none"
            />
          </label>
        </div>
      </div>
    </section>

    <!-- 설정 -->
    <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">⚙️ 스킬 선택</h2>

      <!-- 모드 -->
      <div class="mb-4">
        <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">스킬 종류</span>
        <div class="flex gap-2">
          <button
            type="button"
            @click="mode = 'direct'"
            :class="[
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
              mode === 'direct'
                ? 'bg-indigo-600 text-white'
                : 'ring-1 ring-slate-300 dark:ring-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700',
            ]"
          >
            ⚔️ 직접 타격 (직타)
          </button>
          <button
            type="button"
            @click="mode = 'installer'"
            :class="[
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
              mode === 'installer'
                ? 'bg-indigo-600 text-white'
                : 'ring-1 ring-slate-300 dark:ring-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700',
            ]"
          >
            🌀 설치/소환
          </button>
        </div>
      </div>

      <!-- 직업 -->
      <label class="block mb-3">
        <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">직업</span>
        <select
          v-model="selectedJob"
          class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option v-for="j in jobList" :key="j" :value="j">{{ j }}</option>
        </select>
      </label>

      <!-- 스킬 -->
      <label class="block mb-3">
        <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          스킬 ({{ skillList.length }}개)
        </span>
        <select
          v-model="selectedSkill"
          class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option v-for="s in skillList" :key="s.name" :value="s.name">
            {{ s.name }} (기본 {{ fmt(s.baseCoef ?? Math.round(s.baseTotalMult * 100)) }})
          </option>
        </select>
      </label>

      <!-- 스킬 레벨 -->
      <label class="block">
        <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">스킬 레벨</span>
        <input
          v-model.number="skillLevel"
          type="number"
          min="1"
          max="30"
          class="w-32 rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </label>
    </section>

    <!-- 캘리브레이션 -->
    <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-emerald-300 dark:ring-emerald-700 p-5">
      <h2 class="text-lg font-bold text-emerald-700 dark:text-emerald-300 mb-2">🔧 캘리브레이션</h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        인게임 허수아비 대미지 1회 측정 → 캘리브레이션 상수 C 역산. 한 번 입력하면 localStorage에 저장돼 다음에도 자동 적용됩니다.
        <br />
        <strong>측정 방법</strong>: 위에서 선택한 동일 스킬·레벨로 허수아비를 N회 시전 → 평균 대미지 입력.
      </p>

      <div class="flex flex-wrap gap-3 items-end">
        <label class="block">
          <span class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">측정 평균 대미지</span>
          <input
            v-model="measuredDamageInput"
            type="number"
            step="any"
            placeholder="예: 12340000"
            class="w-48 rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          @click="applyCalibration"
          :disabled="!measuredDamageInput"
          class="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition"
        >
          🔧 C 적용
        </button>
        <button
          type="button"
          @click="resetCalibration"
          class="rounded-lg ring-1 ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition"
        >
          초기화
        </button>
      </div>

      <div v-if="calibrationError" class="mt-3 rounded-md bg-rose-50 dark:bg-rose-950/30 ring-1 ring-rose-300 dark:ring-rose-700 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
        ✗ {{ calibrationError }}
      </div>
      <div v-else-if="calibrationC" class="mt-3 text-xs text-emerald-700 dark:text-emerald-300 tabular-nums">
        ✓ 현재 C = {{ calibrationC.toExponential(3) }} (저장됨)
      </div>
      <div v-else class="mt-3 text-xs text-amber-600 dark:text-amber-400">
        ⚠ 아직 캘리브레이션 안 됨 — 위에 측정값 입력 후 'C 적용'
      </div>
    </section>

    <!-- 결과: 단일 스킬 -->
    <section class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">🎯 예상 대미지</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-700 p-3">
          <div class="text-xs text-slate-500 dark:text-slate-400">
            현재 BP <span class="text-rose-700 dark:text-rose-300 font-semibold">(보스 환산)</span>
          </div>
          <div class="text-xl font-extrabold text-slate-700 dark:text-slate-200 tabular-nums">{{ fmtRound(bossBP) }}</div>
          <div class="text-[10px] tabular-nums mt-0.5">
            <span class="text-amber-700 dark:text-amber-300 font-semibold">직접 {{ fmtRound(directBPBoss) }}</span>
            <span class="text-slate-400 mx-1">·</span>
            <span class="text-sky-700 dark:text-sky-300 font-semibold">소환 {{ fmtRound(summonBP) }}</span>
          </div>
          <div
            v-if="condEffective"
            class="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums mt-0.5"
          >
            평균 base {{ fmtRound(baseBP) }} · 일반 {{ fmtRound(normalBP) }}
          </div>
        </div>
        <div class="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800 p-3">
          <div class="text-xs text-indigo-600 dark:text-indigo-300">스킬 계수</div>
          <div class="text-xl font-extrabold text-indigo-700 dark:text-indigo-200 tabular-nums">{{ fmtRound(currentCoef) }}</div>
        </div>
        <div class="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-800 p-3">
          <div class="text-xs text-emerald-600 dark:text-emerald-300">예상 대미지</div>
          <div class="text-xl font-extrabold text-emerald-700 dark:text-emerald-200 tabular-nums">
            <template v-if="predicted != null">{{ fmtRound(predicted) }}</template>
            <template v-else>—</template>
          </div>
        </div>
      </div>
    </section>

    <!-- 시나리오 비교표 — 백/근/상 조합별 BP·예상 대미지 -->
    <section
      v-if="scenarioMatrix.length > 0"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-amber-300 dark:ring-amber-700 p-5"
    >
      <h2 class="text-lg font-bold text-amber-700 dark:text-amber-300 mb-2">
        🎲 시나리오 비교 — {{ scenarioMatrix.length }}가지 조합
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        입력된 옵션들의 ON/OFF 모든 조합 — 어떤 조건에서 가장 큰 대미지가 나오는지 한눈에 비교.
        (백어택+근거리+상태이상 모두 입력값 0 이면 표 미표시)
      </p>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm tabular-nums">
          <thead class="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">
            <tr>
              <th class="px-3 py-2 text-left" rowspan="2">시나리오</th>
              <th class="px-3 py-2 text-center bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300" colspan="4">
                🟦 일반 인던 (D=0.6)
              </th>
              <th class="px-3 py-2 text-center bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" colspan="4">
                🟥 보스 인던 (D=0.3)
              </th>
            </tr>
            <tr>
              <th class="px-3 py-1 text-right text-sky-700 dark:text-sky-300">배율</th>
              <th class="px-3 py-1 text-right text-sky-700 dark:text-sky-300">직접</th>
              <th class="px-3 py-1 text-right text-sky-700 dark:text-sky-300">평균</th>
              <th class="px-3 py-1 text-right text-sky-700 dark:text-sky-300">대미지</th>
              <th class="px-3 py-1 text-right text-rose-700 dark:text-rose-300">배율</th>
              <th class="px-3 py-1 text-right text-rose-700 dark:text-rose-300">직접</th>
              <th class="px-3 py-1 text-right text-rose-700 dark:text-rose-300">평균</th>
              <th class="px-3 py-1 text-right text-rose-700 dark:text-rose-300">대미지</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(s, i) in scenarioMatrix"
              :key="i"
              :class="[
                'border-t border-slate-200 dark:border-slate-700',
                s.activeCount === 0 ? 'bg-slate-50 dark:bg-slate-900/40' : '',
              ]"
            >
              <td class="px-3 py-2">{{ s.label }}</td>
              <td class="px-3 py-2 text-right text-sky-700 dark:text-sky-300">×{{ s.multNormal.toFixed(3) }}</td>
              <td class="px-3 py-2 text-right">{{ fmtRound(s.dirNormal) }}</td>
              <td class="px-3 py-2 text-right font-semibold">{{ fmtRound(s.avgNormal) }}</td>
              <td class="px-3 py-2 text-right">
                <template v-if="s.dmgNormal != null">{{ fmtRound(s.dmgNormal) }}</template>
                <template v-else><span class="text-slate-400">—</span></template>
              </td>
              <td class="px-3 py-2 text-right text-rose-700 dark:text-rose-300">×{{ s.multBoss.toFixed(3) }}</td>
              <td class="px-3 py-2 text-right">{{ fmtRound(s.dirBoss) }}</td>
              <td class="px-3 py-2 text-right font-semibold">{{ fmtRound(s.avgBoss) }}</td>
              <td class="px-3 py-2 text-right font-bold">
                <template v-if="s.dmgBoss != null">{{ fmtRound(s.dmgBoss) }}</template>
                <template v-else><span class="text-slate-400 font-normal">—</span></template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        💡 직접 BP에만 multiplier 곱, 소환 BP는 그대로. <strong>평균 = (직접 × mult + 소환) / 2</strong> — 게임 T창 표시 BP와 동일 산식.
        <br />
        ⚠️ 근거리·상태이상은 엑셀에 명시 공식이 없어 백어택과 동일 메커니즘으로 가정. 측정 데이터 도착 시 검증·보정 예정.
      </p>
    </section>

    <!-- 결과: 같은 직업 모든 스킬 비교 (C 없어도 항시 노출) -->
    <section
      v-if="allSkillPredictions.length > 0"
      class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
    >
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">📊 스킬별 비교 (현재 직업)</h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        스킬 레벨 {{ skillLevel }} 기준.
        <template v-if="!calibrationC">
          캘리브레이션 안 돼 있어 절대 대미지는 미표시 — 계수 기반 상대 순위만 노출됩니다.
        </template>
        <template v-else>
          캘리브레이션 C 적용된 절대 예상 대미지.
        </template>
      </p>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm tabular-nums">
          <thead class="text-xs uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40">
            <tr>
              <th class="px-3 py-2 text-left">스킬</th>
              <th class="px-3 py-2 text-right">계수</th>
              <th class="px-3 py-2 text-right">예상 대미지</th>
              <th class="px-3 py-2 text-right">vs 1위</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, i) in allSkillPredictions"
              :key="r.name"
              :class="[
                'border-t border-slate-200 dark:border-slate-700',
                r.name === selectedSkill ? 'bg-indigo-50 dark:bg-indigo-950/30' : '',
              ]"
            >
              <td class="px-3 py-2 truncate">{{ r.name }}</td>
              <td class="px-3 py-2 text-right">{{ fmtRound(r.coef) }}</td>
              <td class="px-3 py-2 text-right font-bold">
                <template v-if="r.dmg != null">{{ fmtRound(r.dmg) }}</template>
                <template v-else><span class="text-slate-400 font-normal">—</span></template>
              </td>
              <td class="px-3 py-2 text-right text-xs text-slate-500 dark:text-slate-400">
                {{ allSkillPredictions[0]?.coef > 0
                  ? `${(r.coef / allSkillPredictions[0].coef * 100).toFixed(0)}%`
                  : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
