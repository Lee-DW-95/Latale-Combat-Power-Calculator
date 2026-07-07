<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  calculateBattlePower,
  calculateDirectBP,
  calculateSummonBP,
  calculateBPVsMonster,
  getStatLabel,
  equipDelta,
  solveEquivalentAmount,
  STAT_KEYS,
} from '../utils/battlePower.js';
import { fmtRound as fmt } from '../utils/format.js';
import { makeEmptyAwakStone } from '../utils/awakening.js';

const props = defineProps({
  stats: { type: Object, required: true },
});

// 각성석 옵션 — 부모(App.vue)와 v-model:awak-stones 양방향 바인딩.
//   부모가 활성 캐릭터의 awak_stones 와 묶어 자동 저장을 트리거한다.
//   부모가 안 넘기면 (테스트/단독 사용) 자체 ref 로 동작.
const awakStones = defineModel('awakStones', {
  type: Array,
  default: () => [],
});

// 8개 스탯은 기본값/누적%이 적용됨 (장비 % 옵션 환산용 기본 스탯)
const STATS_WITH_BASE = [
  '주스탯', '공격력', '크댐', '최소뎀', '최대뎀', '고댐', '일몬추', '보몬추',
];

// 옵션 +1 단위 (게임 부적/장비 옵션 단위) — 객관적 우선순위 비교
//   누적%P 옵션 (+1%): 주/공/고/일·보몬추
//   raw +1 가산:        크댐/최소뎀/최대뎀
//   직접 +1pp:          일/보몬지/근마효율
//   raw +1 (cap 99):    관통
const MARGINAL_STEPS = [
  { key: '주스탯',   label: '+1%',  unitNote: '누적' },
  { key: '공격력',   label: '+1%',  unitNote: '누적' },
  { key: '고댐',     label: '+1%',  unitNote: '누적' },
  { key: '크댐',     label: '+1',   unitNote: '가산' },
  { key: '최소뎀',   label: '+1',   unitNote: '가산' },
  { key: '최대뎀',   label: '+1',   unitNote: '가산' },
  { key: '일몬추',   label: '+1%',  unitNote: '누적' },
  { key: '보몬추',   label: '+1%',  unitNote: '누적' },
  { key: '일몬지',   label: '+1%',  unitNote: '가산' },
  { key: '보몬지',   label: '+1%',  unitNote: '가산' },
  { key: '근마효율', label: '+1%',  unitNote: '가산' },
  { key: '관통',     label: '+1',   unitNote: '가산' },
];

// ============================================================
// 공통 유틸 — 옵션 메커니즘 (한계 효율 + 환산 + 빠른 시뮬 공유)
// ============================================================
const PEN_CAP = 99;

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
    // BP 식 내부 Math.floor 때문에 일몬지/보몬지 1% 단위 입력이 plateau 에 갇혀
    // 짝수에서만 응답하는 문제 — amount × SCALE 로 측정한 뒤 선형 환산해 소수점 정밀도 확보.
    const SCALE = 10000;
    newStats[statKey] = (Number(baseStats[statKey]) || 0) + amount * SCALE;
    const scaledBP = bpFor(newStats, mode);
    const baseBPVal = bpFor(baseStats, mode);
    return baseBPVal + (scaledBP - baseBPVal) / SCALE;
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

const baseBP = computed(() => calculateBattlePower(props.stats));

// ============================================================
// 한계 효율 분석 — 옵션 +1 단위 객관적 비교 (게임 부적 단위 통일)
// ============================================================
const efficiencies = computed(() => {
  if (baseBP.value <= 0) return [];
  return MARGINAL_STEPS
    .map(({ key, label, unitNote }) => {
      const newBP = bpWithOption(props.stats, key, 1, 'avg');
      const delta = newBP - baseBP.value;
      return {
        key,
        stepLabel: label,
        unitNote,
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
// ============================================================
const equivStat = ref('주스탯');
const equivPct = ref(8); // 기본 +8% (사용자 예시 기준)
const equivMode = ref('avg'); // 'avg' | 'direct' | 'summon' | 'normal' | 'boss' — BP 기준

const ALL_STAT_KEYS_FOR_EQUIV = MARGINAL_STEPS.map((m) => m.key);

// 환산 불가 사유 — solveEquivalentAmount 가 reachable:false 를 줄 때 스탯별 안내.
//   관통/최소뎀은 게임 메커니즘상 천장이 있어 "진짜" 도달 불가다 (양자화 근사와 구분).
function unreachableReason(key) {
  if (key === '관통') return 'cap(99) 도달 — 도달 불가';
  if (key === '최소뎀') return '최대뎀까지만 효과 — 도달 불가';
  return '도달 불가';
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
      // floor 양자화·하드캡·주스탯² 비선형을 모두 처리하는 공용 솔버 사용.
      //   기존 brittle 이분법은 크댐 등 계단 스탯에서 수렴 실패 → '도달 불가' 오표기했음.
      const r = solveEquivalentAmount(
        (amt) => bpWithOption(props.stats, k, amt, mode) - baseBPForMode,
        refDeltaBP,
      );
      const base = {
        key: k,
        label: getStatLabel(props.stats.type, k),
        unit: optionUnitLabel(k),
        unitMechanism: NATURAL_UNIT[k] === 'pct' ? '누적' : '가산',
      };
      if (!r.reachable) {
        return { ...base, amount: null, approx: false, coarse: false, note: unreachableReason(k) };
      }
      return {
        ...base,
        amount: r.amount,
        approx: r.approx,
        coarse: r.coarse,
        achieved: r.achieved,
        note: null,
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
// 각성석 종합 환산 — 최대 4 옵션 합산 ΔBP → "크댐 X%급" 환산
// ============================================================
// 각성석 옵션 중 BP 에 영향을 주는 스탯만 노출.
//   주스탯/공격력/고댐: 게임 옵션에 raw + pct 두 종이 존재 → 단위 토글 노출.
//   크댐/최소뎀/최대뎀/일몬지/보몬지: 게임상 표기는 "%"지만 내부적으론 raw 가산 한 종뿐.
const AWAK_STAT_OPTIONS = [
  { key: '주스탯',  units: ['raw', 'pct'] },
  { key: '공격력',  units: ['raw', 'pct'] },
  { key: '고댐',    units: ['raw', 'pct'] },
  { key: '크댐',    units: ['raw'] },
  { key: '최소뎀',  units: ['raw'] },
  { key: '최대뎀',  units: ['raw'] },
  { key: '일몬지',  units: ['raw'] },
  { key: '보몬지',  units: ['raw'] },
];

function awakUnitsFor(statKey) {
  return AWAK_STAT_OPTIONS.find((o) => o.key === statKey)?.units || ['raw'];
}

// 각성석 표기 단위 라벨 — 크댐/최소뎀/최대뎀/일몬지/보몬지 raw 는 게임상 "%" 로 표시
function awakUnitLabel(statKey, unit) {
  if (unit === 'pct') return '%';
  if (['크댐', '최소뎀', '최대뎀', '일몬지', '보몬지'].includes(statKey)) return '%';
  return '';
}

// 각성석 — 인게임에서 최대 10 개 장착, 각 각성석은 4 옵션 슬롯. 시작은 1 행.
const AWAK_STONE_MAX = 10;
const AWAK_OPTIONS_PER_STONE = 4;

// 각성석은 한 각성석 내 같은 옵션이 중복 출현하지 않으므로,
// 신규 각성석 기본값은 서로 다른 옵션 4종으로 시작 — 정의는 utils/awakening.js 공유.
const makeEmptyStone = makeEmptyAwakStone;

// 빈 상태(=신규 캐릭터/비로그인 초기) 에서 첫 행 자동 추가. 양방향 바인딩이라
// 부모(App.vue) 의 활성 캐릭터 awak_stones 도 1행으로 동기화된다.
onMounted(() => {
  if (!Array.isArray(awakStones.value) || awakStones.value.length === 0) {
    awakStones.value = [makeEmptyStone()];
  }
});

// 부모가 활성 캐릭터를 빈 awak_stones 로 교체했을 때 자동 1행 보장.
watch(awakStones, (val) => {
  if (Array.isArray(val) && val.length === 0) {
    awakStones.value = [makeEmptyStone()];
  }
});

// "급" 환산 기준 스탯 — 사용자가 가장 자주 비교하는 크댐을 디폴트
const awakRefStat = ref('크댐');

// 평균 환산 표시 토글 — 합산값을 활성 각성석 수로 나눠 평균 급 표시
const awakShowAvg = ref(false);

// 각성석 드롭다운 축약 라벨 — 캐릭터 type 은 이미 상단 탭에서 결정되므로 (물리)/(마법) 접미사 제거.
const AWAK_SHORT_LABEL = {
  주스탯: { P: '근력', M: '마법력' },
  공격력: { P: '무기공격력', M: '속성력' },
  고댐: '고정뎀',
  크댐: '크댐',
  최소뎀: '최소뎀',
  최대뎀: '최대뎀',
  일몬지: '일몬지',
  보몬지: '보몬지',
};

// stat+unit 합쳐진 셀렉트 옵션 목록 — raw+pct 둘 다 가능한 스탯은 항목 2개로 분리.
const AWAK_DROPDOWN_OPTIONS = AWAK_STAT_OPTIONS.flatMap((o) =>
  o.units.map((u) => ({ key: `${o.key}__${u}`, stat: o.key, unit: u })),
);

function awakDropdownKey(opt) {
  return `${opt.stat}__${opt.unit}`;
}
function awakDropdownLabel(d, charType) {
  const def = AWAK_SHORT_LABEL[d.stat];
  const base = typeof def === 'string' ? def : (def?.[charType] ?? def?.P ?? d.stat);
  if (awakUnitsFor(d.stat).length <= 1) return base;
  return d.unit === 'pct' ? `${base} %` : `${base} +`;
}
function onAwakDropdownChange(stoneIdx, optIdx, key) {
  const found = AWAK_DROPDOWN_OPTIONS.find((d) => d.key === key);
  if (!found) return;
  const opt = awakStones.value[stoneIdx].options[optIdx];
  opt.stat = found.stat;
  opt.unit = found.unit;
}

// 같은 각성석 내 다른 옵션이 이미 사용 중인 키는 셀렉트박스에서 선택 불가.
function isAwakDropdownKeyDisabled(stoneIdx, optIdx, key) {
  const stone = awakStones.value[stoneIdx];
  return stone.options.some((opt, i) => i !== optIdx && awakDropdownKey(opt) === key);
}

function addAwakStone() {
  if (awakStones.value.length >= AWAK_STONE_MAX) return;
  awakStones.value.push(makeEmptyStone());
}
function setAwakStonesMax() {
  while (awakStones.value.length < AWAK_STONE_MAX) {
    awakStones.value.push(makeEmptyStone());
  }
}
function resetAwakStones() {
  awakStones.value = [makeEmptyStone()];
}
function resetAwakStoneAt(idx) {
  if (idx < 0 || idx >= awakStones.value.length) return;
  // 마지막 한 행만 남았을 때도 그대로 빈 행으로 리셋 (전체 초기화와 동일한 결과).
  awakStones.value.splice(idx, 1, makeEmptyStone());
}

// equip 객체를 stats 에 적용해 새 stats 객체 반환 (equipDelta 활용)
function applyEquipToStats(baseStats, equip) {
  const delta = equipDelta(baseStats, equip);
  const out = { ...baseStats };
  for (const k of STAT_KEYS) {
    out[k] = (Number(baseStats[k]) || 0) + (delta[k] || 0);
  }
  return out;
}

// 주어진 ΔBP 를 기준 스탯(기본 크댐) 옵션 하나로 재현했을 때 필요한 amount.
//   공용 솔버로 floor 양자화·캡을 일관 처리. 기준 스탯이 천장에 막혀 도달 불가하면
//   합산이 깨지지 않도록 천장값 기준 선형 근사로 폴백한다 (refStat=크댐 은 사실상 항상 도달).
function solveRefAmountForDelta(refKey, targetDelta, baseBPForMode, mode) {
  const r = solveEquivalentAmount(
    (amt) => bpWithOption(props.stats, refKey, amt, mode) - baseBPForMode,
    targetDelta,
  );
  if (r.reachable) return r.amount;
  // 도달 불가(캡): 천장값에 비례한 선형 추정으로 폴백.
  if (Number.isFinite(r.reachableDelta) && r.reachableDelta !== 0) {
    const probe = bpWithOption(props.stats, refKey, 1, mode) - baseBPForMode;
    if (probe !== 0) return targetDelta / probe;
  }
  return 0;
}

// 각성석 환산 결과 — 각 옵션을 단독 적용한 ΔBP 를 기준 스탯(예: 크댐) 환산값으로 바꾼 뒤 합산.
//   예) 최대뎀 +100%(단독 ΔBP X) + 크댐 +100%(단독 ΔBP Y) → 크댐 환산 N% + M% = 합산 (N+M)% 급
//   ※ 옵션별 환산 합은 "각 옵션이 기준 스탯 몇 %에 해당하는지" 의 직관적인 척도.
//      각성석 옵션은 한 각성석 내에서 같은 스탯이 중복 출현하지 않는 전제.
const awakResult = computed(() => {
  const mode = equivMode.value;
  const baseBPForMode = bpFor(props.stats, mode);
  if (baseBPForMode <= 0) return null;

  const refKey = awakRefStat.value;
  const refNaturalUnit = NATURAL_UNIT[refKey];
  const stonesInfo = [];
  let activeCount = 0;
  let activeStoneCount = 0;
  let totalDelta = 0;
  let refAmountSum = 0;

  // 모드별 base BP 캐시 — 단독 적용 ΔBP 와 크댐 환산값을 4가지 모드로도 합산.
  const SPLIT_MODES = ['direct', 'summon', 'normal', 'boss'];
  const baseBPByMode = {};
  for (const m of SPLIT_MODES) baseBPByMode[m] = bpFor(props.stats, m);
  const totalDeltaByMode = { direct: 0, summon: 0, normal: 0, boss: 0 };
  const refAmountByMode = { direct: 0, summon: 0, normal: 0, boss: 0 };

  for (const stone of awakStones.value) {
    const optionsInfo = [];
    let stoneActive = 0;
    let stoneDelta = 0;
    let stoneRefAmount = 0;
    const stoneDeltaByMode = { direct: 0, summon: 0, normal: 0, boss: 0 };
    const stoneRefAmountByMode = { direct: 0, summon: 0, normal: 0, boss: 0 };

    for (const r of stone.options) {
      const v = Number(r.value);
      if (!Number.isFinite(v) || v === 0) {
        optionsInfo.push(null);
        continue;
      }
      activeCount++;
      stoneActive++;
      const equipKey = r.unit === 'pct' ? `${r.stat}_퍼` : r.stat;

      // 일몬지/보몬지는 BP 식 내부 floor() 때문에 plateau 갇힘 — SCALE 배수 측정 후 선형 환산해
      // 소수점/홀수 입력도 정확한 ΔBP 산출.
      const isDomStat = r.stat === '일몬지' || r.stat === '보몬지';
      const measureScale = isDomStat ? 10000 : 1;
      const singleStats = applyEquipToStats(props.stats, { [equipKey]: v * measureScale });

      // 단독 적용 ΔBP — 본 스탯에 이 옵션 하나만 적용했을 때
      const optDelta = (bpFor(singleStats, mode) - baseBPForMode) / measureScale;
      totalDelta += optDelta;
      stoneDelta += optDelta;

      // 옵션별 환산: 이 ΔBP 를 기준 스탯 하나로 내려면 얼마?
      //   기준 스탯·자연 단위와 정확히 일치하면 이분법을 건너뛰고 입력값 v 를 그대로 사용.
      const isSameAsRef = r.stat === refKey && r.unit === refNaturalUnit;
      const optRefAmount = isSameAsRef
        ? v
        : solveRefAmountForDelta(refKey, optDelta, baseBPForMode, mode);
      refAmountSum += optRefAmount;
      stoneRefAmount += optRefAmount;

      // 모드별 ΔBP + 크댐 환산값 — 좌측 종합 표시와 별개로 직접/소환/일반/보스 분리.
      for (const m of SPLIT_MODES) {
        const optDeltaM = (bpFor(singleStats, m) - baseBPByMode[m]) / measureScale;
        totalDeltaByMode[m] += optDeltaM;
        stoneDeltaByMode[m] += optDeltaM;
        const optRefAmountM = isSameAsRef
          ? v
          : solveRefAmountForDelta(refKey, optDeltaM, baseBPByMode[m], m);
        refAmountByMode[m] += optRefAmountM;
        stoneRefAmountByMode[m] += optRefAmountM;
      }

      optionsInfo.push({ delta: optDelta, refAmount: optRefAmount });
    }

    if (stoneActive > 0) activeStoneCount++;

    stonesInfo.push({
      activeCount: stoneActive,
      delta: stoneDelta,
      refAmount: stoneRefAmount,
      deltaByMode: stoneDeltaByMode,
      refAmountByMode: stoneRefAmountByMode,
      options: optionsInfo,
    });
  }

  if (activeCount === 0) return null;

  const refAmountAvg = activeStoneCount > 0 ? refAmountSum / activeStoneCount : 0;

  return {
    activeCount,
    activeStoneCount,
    totalDelta,
    totalDeltaPct: (totalDelta / baseBPForMode) * 100,
    totalDeltaByMode,
    refAmountByMode,
    stonesInfo,
    refKey,
    refAmount: refAmountSum,
    refAmountAvg,
    refUnit: optionUnitLabel(refKey),
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
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
          📊 스탯별 한계 효율 — 옵션 +1 단위 객관 비교
        </h3>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-snug">
          모든 스탯을 게임 부적 옵션 단위 (+1%) 로 통일해 BP 영향 직접 비교.
          각 스탯의 메커니즘은 항목별 (누적/가산) 표시.
        </p>
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
              <span class="text-[10px] tabular-nums">
                <span class="text-slate-400 dark:text-slate-500">{{ e.stepLabel }}</span>
                <span
                  :class="[
                    'ml-1',
                    e.unitNote === '누적'
                      ? 'text-indigo-500/70 dark:text-indigo-400/70'
                      : 'text-rose-500/70 dark:text-rose-400/70',
                  ]"
                  :title="e.unitNote === '누적' ? '누적%P 옵션' : 'raw 가산 옵션'"
                >
                  ({{ e.unitNote }})
                </span>
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

      <!-- (C) 스탯간 옵션 % 동등 환산 — 숨김 처리 (v-if="false"), 재노출 시 조건만 제거 -->
      <div v-if="false" class="border-t border-slate-200 dark:border-slate-700 pt-4 mb-5">
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
                :title="`${e.unitMechanism === '누적' ? '누적%P 추가 옵션' : 'raw 절대값 가산 옵션'}${
                  e.coarse ? ' · 옵션 한 단위가 기준 효과보다 커서 선형 근사값'
                  : e.approx ? ' · floor 단위라 가장 근접한 근사 환산값' : ''
                } — ${
                  Math.abs(e.amount) < Math.abs(equivPct)
                    ? getStatLabel(stats.type, equivStat) + ' 보다 효율 좋음'
                    : getStatLabel(stats.type, equivStat) + ' 보다 효율 낮음'
                }`"
              >
                <span
                  v-if="e.approx || e.coarse"
                  class="text-slate-400 dark:text-slate-500 font-normal mr-0.5"
                >≈</span>{{ e.amount >= 0 ? '+' : '' }}{{ e.amount.toFixed(2) }}{{ e.unit }}<span
                  v-if="e.coarse"
                  class="text-[9px] text-amber-500/80 dark:text-amber-400/80 ml-0.5"
                  title="옵션 단위가 커서 정밀 환산 불가 — 선형 근사"
                >단위큼</span>
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
            ⓘ <strong>≈</strong> 는 옵션이 정수 단위(floor)로만 적용돼 가장 근접한 근사 환산값임을 뜻합니다 ·
            <strong>도달 불가</strong> 는 관통 cap(99)·최소뎀 한계처럼 게임상 천장에 막힌 경우입니다.
            정확한 환산은 장비비교 섹션의 <strong>기본 스탯</strong> 입력이 필요합니다 (미입력 시 누적 0% 폴백).
          </p>
        </div>
        <p v-else class="text-xs text-slate-400 dark:text-slate-500 italic">
          기준 스탯과 옵션 값을 입력하면 다른 옵션들의 동등 변화량이 표시됩니다.
        </p>
      </div>

      <!-- (D) 각성석 종합 환산 -->
      <div class="border-t border-slate-200 dark:border-slate-700 pt-4 mb-5">
        <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
            💎 각성석 종합 환산
          </h3>
          <div class="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              @click="addAwakStone"
              :disabled="awakStones.length >= AWAK_STONE_MAX"
              class="px-2 py-1 rounded ring-1 ring-slate-300 dark:ring-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              + 행 추가
            </button>
            <button
              type="button"
              @click="setAwakStonesMax"
              :disabled="awakStones.length >= AWAK_STONE_MAX"
              class="px-2 py-1 rounded ring-1 ring-slate-300 dark:ring-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              행 MAX ({{ AWAK_STONE_MAX }})
            </button>
            <button
              type="button"
              @click="awakShowAvg = !awakShowAvg"
              :class="[
                'px-2 py-1 rounded ring-1 transition',
                awakShowAvg
                  ? 'bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700'
                  : 'ring-slate-300 dark:ring-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
              ]"
              title="활성 각성석 수로 나눈 평균 급 표시"
            >
              Avg
            </button>
            <button
              type="button"
              @click="resetAwakStones"
              class="px-2 py-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              초기화
            </button>
          </div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-snug">
          각 옵션을 <strong>단독 적용했을 때의 ΔBP</strong> 를 기준 스탯으로 환산해 합산합니다 —
          예: "최대대미지 +100% + 크리티컬 대미지 +100%" → <strong>합산 160%급</strong>.
          각성석은 최대 10 개 장착 가능하며, 위쪽 환산 섹션과 같은 <strong>BP 기준 모드</strong>를 공유합니다.
        </p>

        <div class="space-y-2 mb-3">
          <div
            v-for="(stone, sIdx) in awakStones"
            :key="sIdx"
            class="flex items-center gap-1.5 flex-wrap rounded-md ring-1 ring-slate-200 dark:ring-slate-700 pl-1 pr-2 py-2"
          >
            <span class="text-xs text-slate-500 dark:text-slate-400 w-5 shrink-0 tabular-nums font-semibold text-right">
              {{ sIdx + 1 }}.
            </span>
            <div
              v-for="(opt, oIdx) in stone.options"
              :key="oIdx"
              class="flex items-center gap-0.5 shrink-0"
              :title="awakResult?.stonesInfo[sIdx]?.options[oIdx] ? `단독 ${sign(awakResult.stonesInfo[sIdx].options[oIdx].delta)} BP` : ''"
            >
              <select
                :value="awakDropdownKey(opt)"
                @change="(e) => onAwakDropdownChange(sIdx, oIdx, e.target.value)"
                class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-1 py-1 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none w-24"
              >
                <option
                  v-for="d in AWAK_DROPDOWN_OPTIONS"
                  :key="d.key"
                  :value="d.key"
                  :disabled="isAwakDropdownKeyDisabled(sIdx, oIdx, d.key)"
                >
                  {{ awakDropdownLabel(d, stats.type) }}
                </option>
              </select>
              <input
                v-model="opt.value"
                type="number"
                step="any"
                placeholder="값"
                class="rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-1.5 py-1 text-xs tabular-nums w-14 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <!-- 행(각성석)별 환산 합 + 행 초기화 — 우측 -->
            <div class="ml-auto pl-2 flex items-center gap-1.5 shrink-0">
              <span
                v-if="awakResult?.stonesInfo[sIdx]?.activeCount > 0"
                class="text-xs text-orange-600 dark:text-orange-400 tabular-nums font-semibold"
                title="이 각성석 옵션 합 ≈ 크댐 환산"
              >
                ≈ {{ awakResult.stonesInfo[sIdx].refAmount >= 0 ? '+' : '' }}{{ awakResult.stonesInfo[sIdx].refAmount.toFixed(2) }}{{ awakResult.refUnit }}급
              </span>
              <button
                type="button"
                @click="resetAwakStoneAt(sIdx)"
                class="w-5 h-5 inline-flex items-center justify-center rounded text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition text-sm leading-none"
                title="이 행 초기화"
                aria-label="이 행 초기화"
              >
                ×
              </button>
            </div>

            <!-- 행별 모드 분리 표시 (직접/소환/vs 일반/vs 보스) — w-full 로 wrap 강제 -->
            <div
              v-if="awakResult?.stonesInfo[sIdx]?.activeCount > 0"
              class="w-full grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-0.5 pl-6 pt-1 mt-0.5 border-t border-slate-100 dark:border-slate-700/50 text-[10px] tabular-nums leading-tight"
            >
              <div class="flex items-baseline gap-1 min-w-0">
                <span class="text-amber-700 dark:text-amber-300 font-semibold shrink-0">직접</span>
                <span class="text-slate-700 dark:text-slate-300 truncate">{{ sign(awakResult.stonesInfo[sIdx].deltaByMode.direct) }}</span>
                <span class="text-indigo-600 dark:text-indigo-400 truncate">
                  ≈ {{ awakResult.stonesInfo[sIdx].refAmountByMode.direct >= 0 ? '+' : '' }}{{ awakResult.stonesInfo[sIdx].refAmountByMode.direct.toFixed(2) }}{{ awakResult.refUnit }}
                </span>
              </div>
              <div class="flex items-baseline gap-1 min-w-0">
                <span class="text-sky-700 dark:text-sky-300 font-semibold shrink-0">소환</span>
                <span class="text-slate-700 dark:text-slate-300 truncate">{{ sign(awakResult.stonesInfo[sIdx].deltaByMode.summon) }}</span>
                <span class="text-indigo-600 dark:text-indigo-400 truncate">
                  ≈ {{ awakResult.stonesInfo[sIdx].refAmountByMode.summon >= 0 ? '+' : '' }}{{ awakResult.stonesInfo[sIdx].refAmountByMode.summon.toFixed(2) }}{{ awakResult.refUnit }}
                </span>
              </div>
              <div class="flex items-baseline gap-1 min-w-0">
                <span class="text-emerald-700 dark:text-emerald-300 font-semibold shrink-0">vs 일반</span>
                <span class="text-slate-700 dark:text-slate-300 truncate">{{ sign(awakResult.stonesInfo[sIdx].deltaByMode.normal) }}</span>
                <span class="text-indigo-600 dark:text-indigo-400 truncate">
                  ≈ {{ awakResult.stonesInfo[sIdx].refAmountByMode.normal >= 0 ? '+' : '' }}{{ awakResult.stonesInfo[sIdx].refAmountByMode.normal.toFixed(2) }}{{ awakResult.refUnit }}
                </span>
              </div>
              <div class="flex items-baseline gap-1 min-w-0">
                <span class="text-rose-700 dark:text-rose-300 font-semibold shrink-0">vs 보스</span>
                <span class="text-slate-700 dark:text-slate-300 truncate">{{ sign(awakResult.stonesInfo[sIdx].deltaByMode.boss) }}</span>
                <span class="text-indigo-600 dark:text-indigo-400 truncate">
                  ≈ {{ awakResult.stonesInfo[sIdx].refAmountByMode.boss >= 0 ? '+' : '' }}{{ awakResult.stonesInfo[sIdx].refAmountByMode.boss.toFixed(2) }}{{ awakResult.refUnit }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 기준 스탯 셀렉터 + 결과 -->
        <div v-if="awakResult" class="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800 px-3 py-3 space-y-2">
          <div class="flex items-start gap-2 flex-wrap text-sm">
            <span class="text-slate-600 dark:text-slate-300 leading-6">
              합산 BP
            </span>
            <span
              :class="[
                'font-bold tabular-nums leading-6',
                awakResult.totalDelta > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : awakResult.totalDelta < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500',
              ]"
            >
              {{ sign(awakResult.totalDelta) }}
            </span>
            <span class="text-slate-500 dark:text-slate-400 text-xs tabular-nums leading-6">
              ({{ awakResult.totalDeltaPct >= 0 ? '+' : '' }}{{ awakResult.totalDeltaPct.toFixed(2) }}%)
            </span>
            <span class="text-[11px] text-slate-400 dark:text-slate-500 leading-6">
              · {{ awakResult.activeCount }} 옵션 / {{ awakResult.activeStoneCount }} 각성석
            </span>

            <!-- 우측: 모드별 ΔBP + 크댐 환산값 -->
            <div class="ml-auto grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] tabular-nums leading-tight">
              <div class="flex items-baseline gap-1 justify-end">
                <span class="text-amber-700 dark:text-amber-300 font-semibold">
                  직접 {{ sign(awakResult.totalDeltaByMode.direct) }}
                </span>
                <span class="text-indigo-600 dark:text-indigo-400">
                  ≈ 크댐 {{ awakResult.refAmountByMode.direct >= 0 ? '+' : '' }}{{ awakResult.refAmountByMode.direct.toFixed(2) }}{{ awakResult.refUnit }}급
                </span>
              </div>
              <div class="flex items-baseline gap-1 justify-end">
                <span class="text-sky-700 dark:text-sky-300 font-semibold">
                  소환 {{ sign(awakResult.totalDeltaByMode.summon) }}
                </span>
                <span class="text-indigo-600 dark:text-indigo-400">
                  ≈ 크댐 {{ awakResult.refAmountByMode.summon >= 0 ? '+' : '' }}{{ awakResult.refAmountByMode.summon.toFixed(2) }}{{ awakResult.refUnit }}급
                </span>
              </div>
              <div class="flex items-baseline gap-1 justify-end">
                <span class="text-emerald-700 dark:text-emerald-300 font-semibold">
                  vs 일반 {{ sign(awakResult.totalDeltaByMode.normal) }}
                </span>
                <span class="text-indigo-600 dark:text-indigo-400">
                  ≈ 크댐 {{ awakResult.refAmountByMode.normal >= 0 ? '+' : '' }}{{ awakResult.refAmountByMode.normal.toFixed(2) }}{{ awakResult.refUnit }}급
                </span>
              </div>
              <div class="flex items-baseline gap-1 justify-end">
                <span class="text-rose-700 dark:text-rose-300 font-semibold">
                  vs 보스 {{ sign(awakResult.totalDeltaByMode.boss) }}
                </span>
                <span class="text-indigo-600 dark:text-indigo-400">
                  ≈ 크댐 {{ awakResult.refAmountByMode.boss >= 0 ? '+' : '' }}{{ awakResult.refAmountByMode.boss.toFixed(2) }}{{ awakResult.refUnit }}급
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap text-sm">
            <span class="text-slate-600 dark:text-slate-300">≈ 크댐</span>
            <span class="font-bold text-indigo-700 dark:text-indigo-300 tabular-nums text-base">
              {{ awakResult.refAmount >= 0 ? '+' : '' }}{{ awakResult.refAmount.toFixed(2) }}{{ awakResult.refUnit }}
            </span>
            <span class="text-slate-600 dark:text-slate-300 text-sm">급</span>
            <template v-if="awakShowAvg">
              <span class="text-slate-400 dark:text-slate-500 text-xs">·</span>
              <span class="text-slate-600 dark:text-slate-300 text-xs">평균</span>
              <span class="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums text-sm">
                {{ awakResult.refAmountAvg >= 0 ? '+' : '' }}{{ awakResult.refAmountAvg.toFixed(2) }}{{ awakResult.refUnit }}
              </span>
              <span class="text-slate-500 dark:text-slate-400 text-xs">
                급 / 각성석 (÷{{ awakResult.activeStoneCount }})
              </span>
            </template>
          </div>
        </div>
        <p v-else class="text-xs text-slate-400 dark:text-slate-500 italic">
          옵션 값을 하나 이상 입력하면 합산 BP / "급" 환산이 표시됩니다.
        </p>

        <p class="mt-2 text-[10px] text-slate-400 dark:text-slate-500 italic leading-snug">
          ⓘ % 옵션 정확 계산은 장비비교 섹션의 <strong>기본 스탯</strong> 입력이 필요합니다 (미입력 시 누적 0% 폴백).
          각 옵션을 단독 적용했을 때의 ΔBP 를 기준 스탯으로 환산해 합산합니다.
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
