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
  conditionalMultiplier,
  conditionalMultiplierWith,
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
// 조건부 환산 적용 배율 — 1 이면 미적용, 1.43 이면 43% 증폭
const condMult = computed(() => {
  if (!props.stats.환산활성) return 1;
  return conditionalMultiplier(props.stats);
});
// 환산이 ON 인데 실제 입력이 없어 효과가 없는지 판단
const condEffective = computed(() => props.stats.환산활성 && condMult.value > 1);
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

// 8가지 시나리오 (백어택/근거리/상태이상 조합) 별 BP·예상 대미지
//   체크박스 조합과 무관하게 입력된 값 기준으로 모두 산출
//   → 사용자가 "어느 조건이 가장 큰 차이를 만드는지" 즉시 비교 가능
const scenarioMatrix = computed(() => {
  // 입력값이 있는 옵션만 시나리오에 포함 (없는 건 의미 없음)
  const hasBack = Number(props.stats.백어택 || 0) > 0;
  const hasClose = Number(props.stats.근거리 || 0) > 0;
  const hasStatus = Number(props.stats.상태대미지 || 0) > 0;
  const flags = [];
  if (hasBack) flags.push('백어택');
  if (hasClose) flags.push('근거리');
  if (hasStatus) flags.push('상태이상');
  if (flags.length === 0) return [];

  // 0..(2^N-1) 비트마스크로 모든 조합 생성
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
    const mult = conditionalMultiplierWith(props.stats, activeMap);
    // 시나리오별 BP — 기본 BP 에 multiplier 만 갈아끼움
    // 현재 stats 의 활성 플래그 영향 제외하기 위해 임시 stats 만들어 BP 계산
    const tempStats = {
      ...props.stats,
      백어택활성: false,
      근거리활성: false,
      상태대미지활성: false,
    };
    const baseBPNoCond = calculateBattlePower(tempStats);
    const scenarioBP = baseBPNoCond * mult;
    const dmg = calibrationC.value && scenarioBP > 0 && currentCoef.value > 0
      ? calibrationC.value * scenarioBP * (currentCoef.value / 100)
      : null;
    out.push({
      label: labels.length === 0 ? '기본 (조건 없음)' : labels.join(' + '),
      mult,
      bp: scenarioBP,
      dmg,
      activeCount: labels.length,
    });
  }
  return out.sort((a, b) => a.activeCount - b.activeCount || b.mult - a.mult);
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
          🎯 조건부 환산 — 시나리오별 ON/OFF
          <span v-if="condEffective" class="ml-2 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            현재 BP × {{ condMult.toFixed(3) }} (+{{ ((condMult - 1) * 100).toFixed(1) }}%)
          </span>
          <span v-else class="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
            모두 비활성 — 게임 표시값 그대로
          </span>
        </h2>
      </header>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        각 옵션의 체크박스를 독립적으로 켜고 끌 수 있습니다. 예: 백어택만 ON → 백어택 시나리오 대미지, 백어택+근거리 ON → 둘 다 적용된 대미지.
        하단 시나리오 비교표에서 8가지 조합 즉시 확인 가능.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="cfg in [
            { activeKey: '백어택활성', valueKey: '백어택', label: '백어택 대미지', hint: '예: 30' },
            { activeKey: '근거리활성', valueKey: '근거리', label: '근거리 대미지', hint: '예: 15' },
            { activeKey: '상태대미지활성', valueKey: '상태대미지', label: '상태이상 대미지', hint: '예: 10' },
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
            class="w-full rounded-md border-0 ring-1 ring-amber-200 dark:ring-amber-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-amber-400 focus:outline-none"
          />
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
            현재 BP
            <span v-if="condEffective" class="ml-1 text-amber-600 dark:text-amber-400 font-semibold">(환산 ×{{ condMult.toFixed(2) }})</span>
          </div>
          <div class="text-xl font-extrabold text-slate-700 dark:text-slate-200 tabular-nums">{{ fmtRound(currentBP) }}</div>
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
              <th class="px-3 py-2 text-left">시나리오</th>
              <th class="px-3 py-2 text-right">곱셈 배율</th>
              <th class="px-3 py-2 text-right">시나리오 BP</th>
              <th class="px-3 py-2 text-right">예상 대미지</th>
              <th class="px-3 py-2 text-right">vs 기본</th>
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
              <td class="px-3 py-2 text-right">×{{ s.mult.toFixed(3) }}</td>
              <td class="px-3 py-2 text-right">{{ fmtRound(s.bp) }}</td>
              <td class="px-3 py-2 text-right font-bold">
                <template v-if="s.dmg != null">{{ fmtRound(s.dmg) }}</template>
                <template v-else><span class="text-slate-400 font-normal">—</span></template>
              </td>
              <td class="px-3 py-2 text-right text-xs text-emerald-700 dark:text-emerald-400">
                +{{ ((s.mult - 1) * 100).toFixed(1) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        💡 시나리오 BP 는 위 패널의 체크박스와 무관 — 입력된 % 값을 기준으로 모든 조합을 산출합니다. 체크박스는 상단 "현재 BP" 카드에만 영향.
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
