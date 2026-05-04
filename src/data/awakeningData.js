/**
 * (기간제) 상급 각성석 raw 데이터
 *
 * 출처: latale.info/60 인라인 시뮬레이터 정의 (시뮬 로직 동일).
 *
 * 메커니즘 요약:
 *   1) 각성석 종류 추첨 (보라빛 95% / 신비한 5%)
 *   2) 라인 수 추첨 (1줄 40% / 2줄 40% / 3줄 15% / 4줄 5%)
 *   3) 라인 수만큼 옵션 타입을 균등 추첨 (한 카드 내 중복 없음, Fisher-Yates 셔플)
 *   4) 각 옵션마다 5개 티어(T1~T5) 중 하나를 균등 추첨 (가중치 없음)
 *   5) 선택된 티어의 [min, max] 범위 안에서 균등 분포로 값 추첨
 *      (지배력 등 소수 옵션은 0.1 step 균등)
 *
 * 비용: 1회당 최종 인던 재료 7개 + 플래티넘 망치 1개.
 *
 * tier 형식: { min, max }
 *   - min/max 둘 중 하나라도 소수면 0.1 step 균등 분포로 추첨.
 *   - 정수면 정수 균등 분포.
 */

// ============================================================
// 각성석 종류 분포 (95% / 5%)
// ============================================================
export const STONE_DIST = [
  { key: 'PURPLE', name: '상급 보라빛 각성석', p: 0.95 },
  { key: 'MYSTIC', name: '상급 신비한 각성석', p: 0.05 },
];

// ============================================================
// 라인 수 분포 (한 카드 줄 수)
// ============================================================
export const LINES_DIST = [
  { k: 1, p: 0.40 },
  { k: 2, p: 0.40 },
  { k: 3, p: 0.15 },
  { k: 4, p: 0.05 },
];

// ============================================================
// 1회 시뮬 비용
// ============================================================
export const ROLL_COST = Object.freeze({
  material: 7, // 최종 인던 재료
  hammer: 1,   // 플래티넘 망치
});

// ============================================================
// 상급 보라빛 각성석 옵션 (20종 × 5티어)
// ============================================================
export const PURPLE_TYPES = [
  { type: '근력/마법력', tiers: [{ min: 10, max: 1125 }, { min: 20, max: 2250 }, { min: 30, max: 3375 }, { min: 40, max: 4500 }, { min: 50, max: 12500 }] },
  { type: '행운',         tiers: [{ min: 10, max: 1125 }, { min: 20, max: 2250 }, { min: 30, max: 3375 }, { min: 40, max: 4500 }, { min: 50, max: 12500 }] },
  { type: '체력',         tiers: [{ min: 10, max: 1125 }, { min: 20, max: 2250 }, { min: 30, max: 3375 }, { min: 40, max: 4500 }, { min: 50, max: 12500 }] },
  { type: '최대 HP',      tiers: [{ min: 20, max: 3750 }, { min: 40, max: 7500 }, { min: 60, max: 11250 }, { min: 80, max: 15000 }, { min: 100, max: 25000 }] },
  { type: '방어력/마법 저항력', tiers: [{ min: 10, max: 750 }, { min: 20, max: 1500 }, { min: 30, max: 2250 }, { min: 40, max: 3000 }, { min: 50, max: 5000 }] },
  { type: '물리/마법 고정 대미지', tiers: [{ min: 20, max: 1500 }, { min: 40, max: 3000 }, { min: 60, max: 4500 }, { min: 80, max: 6000 }, { min: 100, max: 25000 }] },
  { type: '물리/마법 대미지 감소', tiers: [{ min: 5, max: 300 }, { min: 10, max: 600 }, { min: 15, max: 900 }, { min: 20, max: 1200 }, { min: 25, max: 2500 }] },
  { type: '무기 공격력/속성력', tiers: [{ min: 1, max: 22 }, { min: 2, max: 45 }, { min: 3, max: 67 }, { min: 4, max: 90 }, { min: 5, max: 250 }] },
  { type: '근력/마법력 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '행운 %',         tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '체력 %',         tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '최대 HP %',      tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '방어력/마법 저항력 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '물리/마법 고정 대미지 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '무기 공격력/속성력 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }] },
  { type: '물리/마법 명중률', tiers: [{ min: 1, max: 7 }, { min: 1, max: 15 }, { min: 2, max: 22 }, { min: 2, max: 30 }, { min: 3, max: 75 }] },
  { type: '이동속도',         tiers: [{ min: 1, max: 7 }, { min: 1, max: 15 }, { min: 2, max: 22 }, { min: 2, max: 30 }, { min: 3, max: 75 }] },
  { type: '물리/마법 최소대미지', tiers: [{ min: 1, max: 10 }, { min: 2, max: 20 }, { min: 3, max: 32 }, { min: 4, max: 45 }, { min: 5, max: 125 }] },
  { type: '물리/마법 최대대미지', tiers: [{ min: 1, max: 10 }, { min: 2, max: 20 }, { min: 3, max: 32 }, { min: 4, max: 45 }, { min: 5, max: 125 }] },
  { type: '물리/마법 크리티컬 대미지', tiers: [{ min: 1, max: 10 }, { min: 2, max: 20 }, { min: 3, max: 32 }, { min: 4, max: 45 }, { min: 5, max: 125 }] },
];

// ============================================================
// 상급 신비한 각성석 옵션 (20종 × 5티어)
// ============================================================
export const MYSTIC_TYPES = [
  { type: '올스탯', tiers: [{ min: 10, max: 1125 }, { min: 20, max: 2250 }, { min: 30, max: 3375 }, { min: 40, max: 4500 }, { min: 50, max: 12500 }] },
  { type: '물리/마법 크리티컬 대미지', tiers: [{ min: 1, max: 10 }, { min: 2, max: 20 }, { min: 3, max: 32 }, { min: 4, max: 45 }, { min: 5, max: 125 }] },
  { type: '체력', tiers: [{ min: 10, max: 1125 }, { min: 20, max: 2250 }, { min: 30, max: 3375 }, { min: 40, max: 4500 }, { min: 50, max: 12500 }] },
  { type: '최대 HP', tiers: [{ min: 20, max: 3750 }, { min: 40, max: 7500 }, { min: 60, max: 11250 }, { min: 80, max: 15000 }, { min: 100, max: 25000 }] },
  { type: '방어력/마법 저항력', tiers: [{ min: 10, max: 750 }, { min: 20, max: 1500 }, { min: 30, max: 2250 }, { min: 40, max: 3000 }, { min: 50, max: 5000 }] },
  { type: '물리/마법 고정 대미지', tiers: [{ min: 20, max: 1500 }, { min: 40, max: 3000 }, { min: 60, max: 4500 }, { min: 80, max: 6000 }, { min: 100, max: 25000 }] },
  { type: '물리/마법 크리티컬 확률', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 2 }] },
  { type: '무기 공격력/속성력', tiers: [{ min: 1, max: 22 }, { min: 2, max: 45 }, { min: 3, max: 67 }, { min: 4, max: 90 }, { min: 5, max: 250 }] },
  { type: '올스탯 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '행운 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '체력 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '최대 HP %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '방어력/마법 저항력 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }, { min: 1, max: 12 }] },
  { type: '무기 공격력/속성력 %', tiers: [{ min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 2 }, { min: 1, max: 5 }, { min: 1, max: 7 }] },
  { type: '물리/마법 명중률', tiers: [{ min: 1, max: 7 }, { min: 1, max: 15 }, { min: 2, max: 22 }, { min: 2, max: 30 }, { min: 3, max: 75 }] },
  { type: '이동속도', tiers: [{ min: 1, max: 7 }, { min: 1, max: 15 }, { min: 2, max: 22 }, { min: 2, max: 30 }, { min: 3, max: 75 }] },
  { type: '물리/마법 최소대미지', tiers: [{ min: 1, max: 10 }, { min: 2, max: 20 }, { min: 3, max: 32 }, { min: 4, max: 45 }, { min: 5, max: 125 }] },
  { type: '물리/마법 최대대미지', tiers: [{ min: 1, max: 10 }, { min: 2, max: 20 }, { min: 3, max: 32 }, { min: 4, max: 45 }, { min: 5, max: 125 }] },
  { type: '일반 몬스터 지배력', tiers: [{ min: 0.1, max: 0.7 }, { min: 0.1, max: 1.5 }, { min: 0.2, max: 2.2 }, { min: 0.2, max: 3.0 }, { min: 0.3, max: 7.5 }] },
  { type: '보스 몬스터 지배력', tiers: [{ min: 0.1, max: 0.7 }, { min: 0.1, max: 1.5 }, { min: 0.2, max: 2.2 }, { min: 0.2, max: 3.0 }, { min: 0.3, max: 7.5 }] },
];

// ============================================================
// 라벨에 % 단위가 강제되는 타입들 (latale.info/60 표시 규칙 그대로)
// ============================================================
export const FORCE_PERCENT = new Set([
  '물리/마법 최소대미지',
  '물리/마법 최대대미지',
  '물리/마법 크리티컬 대미지',
  '물리/마법 크리티컬 확률',
  '물리/마법 명중률',
  '이동속도',
  '일반 몬스터 지배력',
  '보스 몬스터 지배력',
]);

// 보라/신비 공통 강조(글로우) 타깃
const GLOW_BASES = new Set([
  '무기 공격력/속성력',
  '근력/마법력',
  '올스탯',
  '물리/마법 최소대미지',
  '물리/마법 최대대미지',
  '물리/마법 크리티컬 대미지',
  '일반 몬스터 지배력',
  '보스 몬스터 지배력',
]);

// 라벨 정규화: 끝에 %가 붙은 라벨은 base에서 제거하고 unit='%'.
// FORCE_PERCENT에 포함된 base도 unit='%'.
export function normalizeLabel(rawType) {
  let t = String(rawType).trim().replace(/\s*％/g, '%').replace(/\s+/g, ' ');
  const trailingPct = /\s*%$/.test(t);
  if (trailingPct) t = t.replace(/\s*%$/, '');
  const unit = trailingPct || FORCE_PERCENT.has(t) ? '%' : '';
  return { base: t, unit };
}

// 강조 표시 여부 — 근력/마법력·올스탯은 % 단위일 때만, 나머지는 base만 일치하면 true.
export function isGlowLine(base, unit) {
  if (!GLOW_BASES.has(base)) return false;
  if (base === '근력/마법력' || base === '올스탯') return unit === '%';
  return true;
}

// 한 색상 카드의 옵션 테이블 반환
export function tableForStone(stoneKey) {
  return stoneKey === 'PURPLE' ? PURPLE_TYPES : MYSTIC_TYPES;
}

// 옵션 라벨 목록 (UI 셀렉트용) — base+unit 결합
export function uniqueDisplayLabels(stoneKey) {
  const table = tableForStone(stoneKey);
  return table.map((t) => {
    const { base, unit } = normalizeLabel(t.type);
    return unit ? `${base} ${unit}` : base;
  });
}

// 한 옵션 row(type)에 대한 displayLabel 계산
function entryDisplayLabel(entry) {
  const { base, unit } = normalizeLabel(entry.type);
  return unit ? `${base} ${unit}` : base;
}

// 보라/신비 통합: displayLabel → { stones: [{key, tiers}], maxValue, displayLabel, base, unit }
//   같은 라벨이 양쪽에 있으면 stones에 둘 다 등록 (티어는 사실상 동일하지만 각각 보존)
function buildOptionIndex() {
  const map = new Map();
  for (const [stoneKey, table] of [
    ['PURPLE', PURPLE_TYPES],
    ['MYSTIC', MYSTIC_TYPES],
  ]) {
    for (const entry of table) {
      const label = entryDisplayLabel(entry);
      const { base, unit } = normalizeLabel(entry.type);
      if (!map.has(label)) {
        map.set(label, { displayLabel: label, base, unit, stones: [] });
      }
      map.get(label).stones.push({ key: stoneKey, tiers: entry.tiers });
    }
  }
  // maxValue: 가장 큰 티어 max (옵션 한 줄로 받을 수 있는 최댓값)
  for (const meta of map.values()) {
    let mx = -Infinity;
    for (const s of meta.stones) {
      for (const tier of s.tiers) if (tier.max > mx) mx = tier.max;
    }
    meta.maxValue = mx;
  }
  return map;
}

const OPTION_INDEX = buildOptionIndex();

// UI select 에서 노출하지 않을 옵션 라벨
//   시뮬 확률 모델에는 그대로 포함 (실제로 카드에 등장 가능) — 단지 "목표 옵션" 후보에서만 제외.
//   사용자가 보통 추구하지 않는 보조 스탯류.
const EXCLUDED_FROM_TARGET_SELECT = new Set([
  '행운',
  '방어력/마법 저항력',
  '물리/마법 대미지 감소',
  '행운 %',
  '방어력/마법 저항력 %',
]);

// 사용자 우선 노출 순서 — 자주 추구되는 핵심 옵션 우선
//   여기 명시되지 않은 옵션은 뒤에 데이터 등장 순서대로 추가됨.
const PRIORITY_ORDER = [
  '물리/마법 크리티컬 대미지 %',
  '물리/마법 최대대미지 %',
  '물리/마법 최소대미지 %',
  '일반 몬스터 지배력 %',
  '보스 몬스터 지배력 %',
  '무기 공격력/속성력 %',
  '올스탯 %',
  '근력/마법력 %',
  '무기 공격력/속성력',
  '올스탯',
  '근력/마법력',
];

// 통합 옵션 라벨 목록 — PRIORITY_ORDER 우선, 나머지는 데이터 등장 순서대로.
//   EXCLUDED_FROM_TARGET_SELECT 항목은 제외.
export const ALL_OPTION_LABELS = (() => {
  const allLabels = [];
  const seen = new Set();
  for (const e of PURPLE_TYPES) {
    const lb = entryDisplayLabel(e);
    if (!seen.has(lb)) { allLabels.push(lb); seen.add(lb); }
  }
  for (const e of MYSTIC_TYPES) {
    const lb = entryDisplayLabel(e);
    if (!seen.has(lb)) { allLabels.push(lb); seen.add(lb); }
  }
  const visible = allLabels.filter((lb) => !EXCLUDED_FROM_TARGET_SELECT.has(lb));
  const visibleSet = new Set(visible);

  const head = PRIORITY_ORDER.filter((lb) => visibleSet.has(lb));
  const headSet = new Set(head);
  const tail = visible.filter((lb) => !headSet.has(lb));
  return [...head, ...tail];
})();

// 옵션 메타 조회
export function getOptionMeta(displayLabel) {
  return OPTION_INDEX.get(displayLabel) || null;
}

// 옵션의 단일 줄 최대 가능 값
export function maxPossibleValue(displayLabel) {
  const m = OPTION_INDEX.get(displayLabel);
  return m ? m.maxValue : 0;
}

// 옵션이 어느 각성석 종류에서 나오는지 — UI 안내용
export function stonesContainingOption(displayLabel) {
  const m = OPTION_INDEX.get(displayLabel);
  if (!m) return [];
  return m.stones.map((s) => s.key);
}
