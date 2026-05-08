<script setup>
import { computed, ref } from 'vue';
import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
  calculateBPVsMonster,
  statMarginalEffect,
  getStatLabel,
  equipDelta,
  STAT_KEYS,
} from '../utils/battlePower.js';
import { fmtRound as fmt } from '../utils/format.js';

const props = defineProps({
  stats: { type: Object, required: true },
});

// 8개 스탯은 기본값/누적%이 적용됨 (장비 % 옵션 환산용 기본 스탯)
const STATS_WITH_BASE = [
  '주스탯', '공격력', '크댐', '최소뎀', '최대뎀', '고댐', '일몬추', '보몬추',
];

// 스탯별 "현실적인" step 단위 — 게임 내 흔한 변화량 기준
// (1당 효율로 비교하면 주스탯이 너무 작게 보이고 크댐 등이 과대평가되어 step별로 정규화)
const MARGINAL_STEPS = [
  { key: '주스탯', step: 100000, label: '+100,000' },
  { key: '공격력', step: 100,    label: '+100' },
  { key: '고댐',   step: 1000,   label: '+1,000' },
  { key: '크댐',   step: 100,    label: '+100' },
  { key: '최소뎀', step: 10,     label: '+10' },
  { key: '최대뎀', step: 10,     label: '+10' },
  { key: '일몬추', step: 1000,   label: '+1,000' },
  { key: '보몬추', step: 1000,   label: '+1,000' },
  { key: '일몬지', step: 1,      label: '+1%' },
  { key: '보몬지', step: 1,      label: '+1%' },
  { key: '근마효율', step: 1,    label: '+1%' },
  { key: '관통',   step: 1,      label: '+1' },
];

const baseBP = computed(() => calculateBattlePower(props.stats));

const efficiencies = computed(() => {
  if (baseBP.value <= 0) return [];
  return MARGINAL_STEPS
    .map(({ key, step, label }) => {
      const delta = statMarginalEffect(props.stats, key, step);
      return {
        key,
        step,
        stepLabel: label,
        label: getStatLabel(props.stats.type, key),
        delta,
        deltaPct: (delta / baseBP.value) * 100,
      };
    })
    .sort((a, b) => b.delta - a.delta);
});

const maxDelta = computed(() => {
  if (!efficiencies.value.length) return 1;
  const m = Math.max(...efficiencies.value.map((e) => Math.abs(e.delta)));
  return m > 0 ? m : 1;
});

// ============================================================
// 스탯간 옵션 % 동등 환산 — "근력 8% = 크댐 45%" 식의 게임 단위 환산.
//
//   라테일 부적 옵션 "+N%" 라벨이 스탯별로 다른 메커니즘:
//     주스탯/공격력/고댐/일몬추/보몬추 — 누적 +Npp (% 옵션 메커니즘)
//     크댐/최소뎀/최대뎀                — raw +N 가산 (가산값 메커니즘)
//     일/보몬지/근마효율                — raw +N (% 단위 자체, 직접 가산)
//     관통                              — raw +N (cap 99)
//
//   사용자 검증 (자료6, 근력 +8% 옵션 → ΔBP +38,487):
//     크댐 raw +45 가산 = ΔBP +38,487 (= "크댐 +45%" 부적과 동등)
//   사용자 입력 패턴(가산값 칼럼 vs % 옵션 칼럼) 그대로 자연 단위로 환산.
// ============================================================
const PEN_CAP = 99;

const equivStat = ref('주스탯');
const equivPct = ref(8); // 기본 +8% (사용자 예시 기준)
const equivMode = ref('avg'); // 'avg' | 'direct' | 'summon' | 'normal' | 'boss' — BP 기준

const ALL_STAT_KEYS_FOR_EQUIV = MARGINAL_STEPS.map((m) => m.key);

// 스탯별 자연 단위 메커니즘 — 사용자 인식 옵션 단위
//   'pct': 누적 +Npp (% 옵션 칼럼)
//   'raw': raw +N 가산 (가산값 칼럼)
const NATURAL_UNIT = {
  주스탯: 'pct', 공격력: 'pct', 고댐: 'pct', 일몬추: 'pct', 보몬추: 'pct',
  크댐: 'raw', 최소뎀: 'raw', 최대뎀: 'raw',
  일몬지: 'raw', 보몬지: 'raw', 근마효율: 'raw', 관통: 'raw',
};

// 옵션 단위 라벨 — UI 표시 (사용자에게 통일된 "+N%" 또는 "+N pp/raw")
function optionUnitLabel(statKey) {
  // 모든 가산형 8 스탯 + 근마효율은 게임에서 "+N%" 표기 (메커니즘은 다를지라도)
  if (statKey === '관통') return '';
  return '%';
}

// BP 계산 — mode 별 ('avg' | 'direct' | 'summon' | 'normal' | 'boss')
function bpFor(stats, mode) {
  if (mode === 'direct') return calculateDirectBP(stats);
  if (mode === 'summon') return calculateSummonBP(stats);
  if (mode === 'normal') return calculateBPVsMonster(stats, 'normal');
  if (mode === 'boss') return calculateBPVsMonster(stats, 'boss');
  return calculateBattlePower(stats);
}

// 스탯 옵션 +amount 적용 시 BP 계산 (스탯별 자연 단위 메커니즘 적용)
function bpWithOption(baseStats, statKey, amount, mode = 'avg') {
  const newStats = { ...baseStats };
  const unit = NATURAL_UNIT[statKey];

  if (unit === 'pct') {
    // 누적 +Npp 옵션 (equipDelta 의 % 옵션 메커니즘)
    const equip = { [`${statKey}_퍼`]: amount };
    const delta = equipDelta(baseStats, equip);
    for (const k of STAT_KEYS) {
      newStats[k] = (Number(baseStats[k]) || 0) + (delta[k] || 0);
    }
    return bpFor(newStats, mode);
  }

  // raw 가산 메커니즘
  if (statKey === '근마효율') {
    newStats.근마효율 = (Number(baseStats.근마효율) || 0) + amount;
    return bpFor(newStats, mode);
  }
  if (statKey === '일몬지' || statKey === '보몬지') {
    newStats[statKey] = (Number(baseStats[statKey]) || 0) + amount;
    return bpFor(newStats, mode);
  }
  if (statKey === '관통') {
    newStats.관통 = Math.max(0, Math.min(PEN_CAP, (Number(baseStats.관통) || 0) + amount));
    return bpFor(newStats, mode);
  }
  // 크댐/최소뎀/최대뎀: equipDelta 가산값 메커니즘 (기본값에 raw +N → 표시 +N×(1+누적))
  const equip = { [statKey]: amount };
  const delta = equipDelta(baseStats, equip);
  for (const k of STAT_KEYS) {
    newStats[k] = (Number(baseStats[k]) || 0) + (delta[k] || 0);
  }
  return bpFor(newStats, mode);
}

const equivalents = computed(() => {
  const refKey = equivStat.value;
  const refAmount = Number(equivPct.value) || 0;
  const mode = equivMode.value;
  if (refAmount === 0 || baseBP.value <= 0) return null;

  const baseBPForMode = bpFor(props.stats, mode);
  if (baseBPForMode <= 0) return null;

  const refBP = bpWithOption(props.stats, refKey, refAmount, mode);
  const refDeltaBP = refBP - baseBPForMode;
  if (refDeltaBP === 0) return null;

  // 관통 cap 도달 체크 (기준이 관통일 때)
  let refCapped = false;
  if (refKey === '관통') {
    const requested = (Number(props.stats.관통) || 0) + refAmount;
    if (requested > PEN_CAP || requested < 0) refCapped = true;
  }

  const items = ALL_STAT_KEYS_FOR_EQUIV
    .filter((k) => k !== refKey)
    .map((k) => {
      // 이분법 — 단조 함수 가정 (옵션 추가 ↑ → BP ↑)
      let lo = -99, hi = 9999;
      let mid = 0;
      let lastDelta = 0;
      for (let i = 0; i < 80; i++) {
        mid = (lo + hi) / 2;
        const bp = bpWithOption(props.stats, k, mid, mode);
        const dBP = bp - baseBPForMode;
        lastDelta = dBP;
        if (refDeltaBP > 0) {
          if (dBP < refDeltaBP) lo = mid;
          else hi = mid;
        } else {
          if (dBP > refDeltaBP) lo = mid;
          else hi = mid;
        }
        if (Math.abs(dBP - refDeltaBP) < Math.abs(refDeltaBP) * 1e-7) break;
      }
      // 관통 cap 검사
      let capHit = false;
      if (k === '관통') {
        const requested = (Number(props.stats.관통) || 0) + mid;
        if (requested > PEN_CAP) capHit = true;
      }
      const converged = Math.abs(lastDelta - refDeltaBP) < Math.abs(refDeltaBP) * 1e-3;
      return {
        key: k,
        label: getStatLabel(props.stats.type, k),
        unit: optionUnitLabel(k),
        unitMechanism: NATURAL_UNIT[k] === 'pct' ? '누적' : '가산',
        amount: converged ? mid : null,
        note: capHit ? 'cap(99) 도달 — 도달 불가' : (!converged ? '도달 불가' : null),
      };
    })
    .sort((a, b) => {
      if (a.amount == null && b.amount == null) return 0;
      if (a.amount == null) return 1;
      if (b.amount == null) return -1;
      return Math.abs(a.amount) - Math.abs(b.amount);
    });

  return {
    refDeltaBP,
    refCapped,
    refUnit: optionUnitLabel(refKey),
    items,
  };
});

// ============================================================
// 빠른 시뮬 (A) — 부적/장비 가산 옵션 + % 옵션 시뮬
// ============================================================
const simStat = ref('주스탯');
const simAmount = ref('');     // 가산값 (부적 raw 옵션)
const simPct = ref('');        // % 옵션

// PEN_CAP 은 환산 섹션에서 선언됨 (재사용)

// 선택한 스탯이 % 옵션을 지원하는지 (8개 기본스탯류)
const simSupportsPct = computed(() => STATS_WITH_BASE.includes(simStat.value));

// 선택한 스탯의 기본값 (예: 기본_주스탯)
const simBaseValue = computed(() => {
  if (!simSupportsPct.value) return 0;
  return Number(props.stats[`기본_${simStat.value}`] || 0);
});

// 현재 누적% (자동 계산)
const simCumulativePct = computed(() => {
  if (!simSupportsPct.value || simBaseValue.value <= 0) return null;
  const display = Number(props.stats[simStat.value] || 0);
  return ((display - simBaseValue.value) / simBaseValue.value) * 100;
});

// 관통 cap 까지 남은 여유분 (음수 방지). 관통 외엔 null.
const simRemainingHeadroom = computed(() => {
  if (simStat.value !== '관통') return null;
  return Math.max(0, PEN_CAP - (Number(props.stats.관통) || 0));
});

const simResult = computed(() => {
  const amount = Number(simAmount.value) || 0;
  const pct = Number(simPct.value) || 0;
  if (amount === 0 && pct === 0) return null;
  if (baseBP.value <= 0) return null;

  const newStats = { ...props.stats };
  let displayDelta = 0;
  let capped = false;

  if (simStat.value === '근마효율') {
    // 근마효율은 장비 옵션이 아니라 표시값 그대로 가산되는 캐릭터 스탯
    //   (equipDelta 는 이걸 모델링하지 않아 0 을 반환 → 직접 가산)
    const next = (Number(props.stats.근마효율) || 0) + amount;
    newStats.근마효율 = next;
    displayDelta = next - (Number(props.stats.근마효율) || 0);
  } else {
    // 장비 옵션 객체 구성 (한 옵션만 채움)
    const equip = { [simStat.value]: amount };
    if (simSupportsPct.value) {
      equip[`${simStat.value}_퍼`] = pct;
    }

    // equipDelta로 표시값 변화량 계산 (기본값/누적% 자동 반영)
    const delta = equipDelta(props.stats, equip);

    for (const k of STAT_KEYS) {
      newStats[k] = (Number(props.stats[k]) || 0) + (delta[k] || 0);
    }
    displayDelta = delta[simStat.value] || 0;

    // 관통 99 cap — 게임상 99 초과는 무시되므로 BP 도 그만큼만 반영
    if (simStat.value === '관통') {
      const requested = newStats.관통;
      if (requested > PEN_CAP) {
        newStats.관통 = PEN_CAP;
        displayDelta = PEN_CAP - (Number(props.stats.관통) || 0);
        capped = true;
      }
    }
  }

  const newBP = calculateBattlePower(newStats);
  const change = newBP - baseBP.value;

  return {
    delta: change,
    deltaPct: (change / baseBP.value) * 100,
    displayDelta,
    capped,
  };
});

function pickStat(key) {
  simStat.value = key;
}

const sign = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
</script>

<template>
  <section
    class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-5"
  >
    <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">⚡ 효율 분석</h2>

    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
      현재 캐릭터 스탯 기준으로 자동 계산됩니다. 같은 옵션이라도
      <strong>본인 스탯과 누적%</strong>에 따라 BP 변화량이 다르게 산출됩니다.
    </p>

    <!-- 빈 상태 -->
    <div
      v-if="baseBP <= 0"
      class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center bg-slate-50 dark:bg-slate-900/40 rounded-lg"
    >
      먼저 위에서 <strong>캐릭터 T창 정보</strong>를 입력해주세요.
    </div>

    <div v-else>
      <!-- (B) 마진 효율 분석 -->
      <div class="mb-5">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          📊 스탯별 한계 효율 (효율 순 정렬)
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="e in efficiencies"
            :key="e.key"
            class="group flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded px-2 py-1 transition"
            @click="pickStat(e.key)"
            :title="`'${e.label}' 빠른 시뮬에 적용`"
          >
            <span class="flex flex-col flex-shrink-0 w-32 sm:w-44 leading-tight">
              <span class="text-slate-700 dark:text-slate-300 text-xs sm:text-sm truncate">
                {{ e.label }}
              </span>
              <span class="text-slate-400 dark:text-slate-500 text-[10px] tabular-nums">
                ({{ e.stepLabel }})
              </span>
            </span>
            <div class="flex-1 bg-slate-100 dark:bg-slate-900/50 rounded h-5 overflow-hidden relative min-w-0">
              <div
                class="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 dark:from-indigo-500 dark:to-indigo-300 transition-all"
                :style="{ width: `${Math.max(2, (e.delta / maxDelta) * 100)}%` }"
              />
            </div>
            <span class="flex flex-col flex-shrink-0 w-24 sm:w-32 text-right leading-tight">
              <span class="text-slate-800 dark:text-slate-100 tabular-nums font-semibold text-xs sm:text-sm">
                {{ sign(e.delta) }}
              </span>
              <span class="text-slate-500 dark:text-slate-400 text-[10px] tabular-nums">
                ({{ e.deltaPct >= 0 ? '+' : '' }}{{ e.deltaPct.toFixed(3) }}%)
              </span>
            </span>
          </li>
        </ul>
        <p class="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          💡 표 항목 클릭 시 아래 빠른 시뮬에 자동 적용됩니다.
        </p>
      </div>

      <!-- (C) 스탯간 옵션 % 동등 환산 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4 mb-5">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          🔄 스탯간 옵션 % 동등 환산
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
          기준 옵션과 같은 BP 효과를 내는 다른 옵션 환산 — <strong>"근력 +8% = 크댐 +45%"</strong> 식.
          작은 %로 같은 효과 = 효율 좋음 (인디고 색).
          <span class="text-slate-400 dark:text-slate-500">결과에 마우스 올리면 옵션 메커니즘 표시.</span>
        </p>
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <span class="text-slate-500 dark:text-slate-400 text-sm">기준</span>
          <select
            v-model="equivStat"
            class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option v-for="m in MARGINAL_STEPS" :key="m.key" :value="m.key">
              {{ getStatLabel(stats.type, m.key) }}
            </option>
          </select>
          <span class="text-slate-500 dark:text-slate-400 font-medium">옵션 +</span>
          <input
            v-model.number="equivPct"
            type="number"
            step="any"
            class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums w-20 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <span class="text-slate-500 dark:text-slate-400 text-sm">{{ equivalents?.refUnit ?? '%' }}</span>
        </div>

        <!-- BP 기준 모드 토글 -->
        <div class="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <span class="text-slate-500 dark:text-slate-400">BP 기준:</span>
          <!-- 직접/소환 분리 -->
          <div class="inline-flex rounded-md ring-1 ring-slate-300 dark:ring-slate-600 overflow-hidden">
            <button
              type="button"
              v-for="m in [
                { v: 'avg', label: '종합' },
                { v: 'direct', label: '직접' },
                { v: 'summon', label: '소환' },
              ]"
              :key="m.v"
              @click="equivMode = m.v"
              :class="[
                'px-3 py-1 transition',
                equivMode === m.v
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
              ]"
            >
              {{ m.label }}
            </button>
          </div>
          <span class="text-slate-300 dark:text-slate-600">·</span>
          <!-- 일반/보스 몬스터 분리 -->
          <div class="inline-flex rounded-md ring-1 ring-slate-300 dark:ring-slate-600 overflow-hidden">
            <button
              type="button"
              v-for="m in [
                { v: 'normal', label: 'vs 일반' },
                { v: 'boss', label: 'vs 보스' },
              ]"
              :key="m.v"
              @click="equivMode = m.v"
              :class="[
                'px-3 py-1 transition',
                equivMode === m.v
                  ? (m.v === 'normal' ? 'bg-emerald-600 text-white font-semibold' : 'bg-rose-600 text-white font-semibold')
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
              ]"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
        <p class="text-[10px] text-slate-400 dark:text-slate-500 italic mb-3 leading-snug">
          직타/소환 비중에 맞춰 직접·소환 모드 / 일반·보스 던전 콘텐츠에 맞춰 vs 일반·vs 보스 모드 선택.
        </p>

        <div v-if="equivalents" class="text-sm">
          <p class="text-slate-600 dark:text-slate-300 mb-2">
            <strong>{{ getStatLabel(stats.type, equivStat) }}</strong>
            <span :class="equivPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
              {{ equivPct >= 0 ? '+' : '' }}{{ equivPct }}{{ equivalents.refUnit }} 옵션
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">
              ({{
                equivMode === 'avg' ? '종합' :
                equivMode === 'direct' ? '직접' :
                equivMode === 'summon' ? '소환' :
                equivMode === 'normal' ? 'vs 일반' : 'vs 보스'
              }} BP
              {{ equivalents.refDeltaBP >= 0 ? '+' : '' }}{{ fmt(equivalents.refDeltaBP) }})
            </span>
            <span class="text-slate-500 dark:text-slate-400">≈ 다른 옵션</span>
          </p>
          <p
            v-if="equivalents.refCapped"
            class="text-[11px] text-orange-600 dark:text-orange-400 mb-2"
          >
            ⚠ 기준 스탯이 cap에 걸려 실제 ΔBP 가 입력값보다 작습니다.
          </p>
          <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <li
              v-for="e in equivalents.items"
              :key="e.key"
              class="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              <span class="text-slate-700 dark:text-slate-300 truncate">{{ e.label }}</span>
              <span
                v-if="e.amount != null"
                :class="[
                  'tabular-nums font-semibold',
                  Math.abs(e.amount) < Math.abs(equivPct)
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400',
                ]"
                :title="`${e.unitMechanism === '누적' ? '누적%P 추가 옵션' : 'raw 절대값 가산 옵션'} — ${
                  Math.abs(e.amount) < Math.abs(equivPct)
                    ? getStatLabel(stats.type, equivStat) + ' 보다 효율 좋음'
                    : getStatLabel(stats.type, equivStat) + ' 보다 효율 낮음'
                }`"
              >
                {{ e.amount >= 0 ? '+' : '' }}{{ e.amount.toFixed(2) }}{{ e.unit }}
              </span>
              <span
                v-else
                class="text-[10px] text-slate-400 dark:text-slate-500 italic"
              >
                {{ e.note }}
              </span>
            </li>
          </ul>
          <p class="mt-2 text-[10px] text-slate-400 dark:text-slate-500 italic leading-snug">
            ⓘ 정확한 환산은 장비비교 섹션의 <strong>기본 스탯</strong> 입력이 필요합니다 (미입력 시 누적 0% 폴백).
          </p>
        </div>
        <p v-else class="text-xs text-slate-400 dark:text-slate-500 italic">
          기준 스탯과 옵션 값을 입력하면 다른 옵션들의 동등 변화량이 표시됩니다.
        </p>
      </div>

      <!-- (A) 빠른 옵션 시뮬 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          🔮 빠른 옵션 시뮬
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
          부적/장비 한 옵션을 빠르게 입력해서 BP가 얼마 오르는지 확인.
          <strong>가산 옵션은 (기본값 + 가산) × (1 + 누적%) 메커니즘으로 계산</strong>되므로
          누적%가 큰 캐릭일수록 같은 가산값이라도 효과가 큽니다.
          기본값 미입력 시에는 단순 표시값 가산으로 폴백.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="simStat"
            class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option v-for="m in MARGINAL_STEPS" :key="m.key" :value="m.key">
              {{ getStatLabel(stats.type, m.key) }}
            </option>
          </select>
          <span class="text-slate-500 dark:text-slate-400 font-medium">+</span>
          <input
            v-model="simAmount"
            type="number"
            step="any"
            :min="simStat === '관통' ? 0 : undefined"
            :max="simStat === '관통' ? simRemainingHeadroom : undefined"
            :disabled="simStat === '관통' && simRemainingHeadroom <= 0"
            :placeholder="simStat === '관통' && simRemainingHeadroom <= 0 ? 'cap 99 도달' : '가산'"
            :title="simStat === '관통'
              ? (simRemainingHeadroom <= 0
                ? '관통은 cap(99) 에 도달해 추가 가산이 BP 에 반영되지 않습니다'
                : `관통은 cap 99 — 최대 +${simRemainingHeadroom} 까지 효과`)
              : '부적/장비의 가산 옵션 (raw 값)'"
            class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums w-24 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <template v-if="simSupportsPct">
            <span class="text-slate-500 dark:text-slate-400 font-medium">+</span>
            <input
              v-model="simPct"
              type="number"
              step="any"
              placeholder="% 옵션"
              :disabled="simBaseValue <= 0"
              :title="simBaseValue <= 0
                ? '% 옵션을 사용하려면 장비 비교 섹션의 기본 스탯을 먼저 입력하세요'
                : '부적/장비의 % 옵션'"
              class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm tabular-nums w-24 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span class="text-slate-400 dark:text-slate-500 text-xs">%</span>
          </template>
          <span class="text-slate-500 dark:text-slate-400 font-medium">→</span>
          <span
            v-if="simResult"
            :class="[
              'font-semibold tabular-nums',
              simResult.delta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : simResult.delta < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500',
            ]"
          >
            BP {{ sign(simResult.delta) }}
            <span class="text-slate-500 dark:text-slate-400 text-xs ml-1 font-normal">
              ({{ simResult.deltaPct >= 0 ? '+' : '' }}{{ simResult.deltaPct.toFixed(2) }}%)
            </span>
          </span>
          <span v-else class="text-sm text-slate-400 dark:text-slate-500">값을 입력하세요</span>
        </div>

        <!-- 누적% 안내 / 기본값 미입력 안내 / 관통 cap 안내 -->
        <p
          v-if="simStat === '관통' && simRemainingHeadroom <= 0"
          class="mt-2 text-[11px] text-orange-600 dark:text-orange-400"
        >
          ⚠ <strong>관통력</strong>이 이미 cap(99) 에 도달했습니다 — 추가 가산은 BP 에 반영되지 않습니다.
        </p>
        <p
          v-else-if="simStat === '관통' && simResult?.capped"
          class="mt-2 text-[11px] text-orange-600 dark:text-orange-400"
        >
          ⚠ 관통은 최대 99 까지만 적용 — 입력값 중 <strong>+{{ simResult.displayDelta }}</strong> 만 BP 에 반영됩니다.
        </p>
        <p
          v-else-if="simStat === '관통'"
          class="mt-2 text-[11px] text-slate-500 dark:text-slate-400"
        >
          💡 관통은 cap 99 — 최대 <strong>+{{ simRemainingHeadroom }}</strong> 까지 효과가 있습니다.
        </p>
        <p
          v-else-if="simStat === '근마효율' && simResult"
          class="mt-2 text-[11px] text-slate-500 dark:text-slate-400"
        >
          💡 근마효율 표시값에 <strong>+{{ simResult.displayDelta }}%</strong> 가산 — 직접타격 cross-term (근력 × 근마효율%) 으로 환산됩니다.
        </p>
        <p
          v-else-if="simSupportsPct && simBaseValue <= 0"
          class="mt-2 text-[11px] text-orange-600 dark:text-orange-400"
        >
          ⚠ <strong>{{ getStatLabel(stats.type, simStat) }}</strong>의 기본값이 미입력 상태 — 가산은 단순 더하기로 계산됩니다.
          정확한 메커니즘 적용을 원하면 장비 비교 섹션의
          <strong>"% 옵션 환산용 기본 스탯"</strong>을 펼쳐서
          <strong>기본_{{ simStat }}</strong>을(를) 입력하세요.
        </p>
        <p
          v-else-if="simSupportsPct && simCumulativePct != null && simResult"
          class="mt-2 text-[11px] text-slate-500 dark:text-slate-400"
        >
          💡 누적 <strong>+{{ simCumulativePct.toFixed(1) }}%</strong> 자동 반영 →
          표시 {{ getStatLabel(stats.type, simStat) }} 변화: <strong>{{ sign(simResult.displayDelta) }}</strong>
        </p>
      </div>
    </div>
  </section>
</template>
