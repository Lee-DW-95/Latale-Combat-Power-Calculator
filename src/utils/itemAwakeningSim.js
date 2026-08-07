/**
 * [아이템 각성] 시뮬 엔진 — 순수 함수 모음.
 *
 * 데이터: src/data/itemAwakeningData.js (ITEM_AWAKENING_SETS)
 *
 * 1회 각성 절차 (rollOnce):
 *   1) 기본 2옵션 확정
 *   2) THIRD_LINE_CHANCE(50%) 로 3번째 옵션 추가
 *   3) 3번째가 붙은 경우에만 FOURTH_LINE_CHANCE(30%) 로 4번째 옵션 추가
 *   4) 각 줄은 rows 의 prob 를 가중치로 추첨하되,
 *      같은 (등급 + 기본 옵션명) 조합은 한 카드 내 중복 불가 → 재추첨
 *   5) 확정된 줄마다 [min, max] 범위에서 값 추첨 (소수 포함 시 0.1 step)
 *
 * ── 목표 시뮬 통계 산출 방식 ──────────────────────────────────
 * 한 카드가 목표를 만족할 확률 p 를 두 조각으로 분리한다:
 *
 *   p = P(목표 옵션들이 전부 등장)  ×  Π P(그 줄의 값 ≥ 목표수치)
 *       └─ Monte Carlo 추정 ────┘     └─ 해석해 (균등분포 꼬리확률) ─┘
 *
 * 값 추첨은 줄이 확정된 뒤 독립적으로 이루어지므로 이 분해는 근사가 아니라
 * 정확하다. 등장 확률만 MC 로 추정하면 되는데, 이쪽은 수치 조건까지 포함한
 * 전체 p 보다 훨씬 커서 같은 표본 수로도 정밀도가 크게 올라간다.
 * (예: p_전체 ~ 1e-7 이라 200K 표본으로는 0회 관측되는 목표도,
 *      등장확률은 ~1e-3 수준이라 안정적으로 추정된다)
 *
 * 시도 횟수 분포는 각 카드가 독립이므로 기하분포 닫힌 수식으로 즉시 산출.
 *   E[X] = 1/p,  분위수 k_q = ⌈ln(1-q) / ln(1-p)⌉
 */

import { rollValue } from './random.js';
import { ITEM_AWAKENING_SIM } from './simConstants.js';
import { THIRD_LINE_CHANCE, FOURTH_LINE_CHANCE } from '../data/itemAwakeningData.js';

// ============================================================
// 이름 파싱 헬퍼
// ============================================================

/** "물리/마법 최소대미지 +n%" → true. 값이 퍼센트 옵션인지 판별. */
export function isPercentName(name) {
  return /\+n%/.test(String(name));
}

/**
 * 중복 판정용 기본 이름 — 플레이스홀더를 걷어낸 순수 옵션명.
 *   "근력/마법력 +n"          → "근력/마법력"
 *   "질풍 Lv. n"               → "질풍 Lv"
 *   "표풍일식 Lv. 1 ~ Lv. n"   → "표풍일식 Lv"
 *
 * ⚠ "물리/마법 최소대미지 +n" 과 "+n%" 는 같은 등급이면 같은 키가 된다.
 *   원본 시뮬레이터의 중복 판정 규칙이 그러해서 그대로 따른다
 *   (= 한 카드에 같은 옵션의 고정치/퍼센트가 동시에 붙지 않는다).
 */
export function baseName(name) {
  return String(name)
    .replace(/\s+/g, ' ')
    .replace(/\s*\+n%?/g, '')
    .replace(/Lv\.\s*1\s*~\s*Lv\.\s*n/g, 'Lv')
    .replace(/Lv\.\s*n/g, 'Lv')
    .trim();
}

/** 중복 판정 키 — 등급 + 기본 옵션명 */
export function dedupeKey(row) {
  return `${row.tier}|${baseName(row.name)}`;
}

/** 소수면 1자리(끝의 .0 제거), 정수면 천단위 콤마. */
export function fmtOptionValue(v) {
  if (typeof v === 'number' && Math.abs(v - Math.round(v)) > 1e-9) {
    return v.toFixed(1).replace(/\.0$/, '');
  }
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 플레이스홀더에 실제 추첨값을 끼워넣어 표시 문자열을 만든다. */
export function formatOption(name, val) {
  const v = fmtOptionValue(val);
  let out = String(name).replace(/\s+/g, ' ').trim();
  out = out.replace(/Lv\.\s*1\s*~\s*Lv\.\s*n/g, `Lv. ${v}`);
  out = out.replace(/Lv\.\s*n/g, `Lv. ${v}`);
  out = out.replace(/\+n%/g, `+${v}%`);
  out = out.replace(/\+n/g, `+${v}`);
  return out;
}

/** 목표 선택 드롭다운용 라벨 — "[3] 물리/마법 크리티컬 대미지 +n% (7~40)" */
export function rowLabel(row) {
  return `[${row.tier}] ${row.name} (${fmtOptionValue(row.min)}~${fmtOptionValue(row.max)})`;
}

// ============================================================
// 값 추첨 — min/max 둘 중 하나라도 소수면 0.1 step, 아니면 정수
// ============================================================

function isDecimalRow(row) {
  const min = Number(row.min);
  const max = Number(row.max);
  return Math.abs(min - Math.round(min)) > 1e-9 || Math.abs(max - Math.round(max)) > 1e-9;
}

/** 값 추첨 스케일 — 0.1 step 이면 10, 정수면 1 */
function scaleOf(row) {
  return isDecimalRow(row) ? 10 : 1;
}

export function drawValue(min, max) {
  const decimal =
    Math.abs(min - Math.round(min)) > 1e-9 || Math.abs(max - Math.round(max)) > 1e-9;
  return rollValue(min, max, decimal ? 0.1 : 1);
}

/**
 * P(추첨값 ≥ minValue) — 균등분포 꼬리확률 (해석해).
 * 범위를 정수 격자로 환산해 개수 비율로 계산한다.
 */
export function valuePassProb(row, minValue) {
  const v = Number(minValue);
  if (!Number.isFinite(v)) return 1;
  const s = scaleOf(row);
  const a = Math.round(Number(row.min) * s);
  const b = Math.round(Number(row.max) * s);
  const t = Math.ceil(v * s - 1e-9);
  if (t <= a) return 1;
  if (t > b) return 0;
  return (b - t + 1) / (b - a + 1);
}

/** 값 ≥ minValue 로 잘라낸 균등분포에서 1개 샘플 (성공 카드 조립용). */
export function sampleValueAtLeast(row, minValue) {
  const s = scaleOf(row);
  const a = Math.round(Number(row.min) * s);
  const b = Math.round(Number(row.max) * s);
  const t = Math.max(a, Math.ceil(Number(minValue) * s - 1e-9));
  if (t > b) return Number(row.max); // 도달 불가 — 호출 전에 걸러지는 케이스
  const i = t + Math.floor(Math.random() * (b - t + 1));
  return s === 1 ? i : Math.round(i) / 10;
}

// ============================================================
// 가중 추첨 샘플러
//   누적합 + 이분탐색으로 O(log N). 200만 회 MC 를 견디기 위한 최적화.
// ============================================================

export function createSampler(rows) {
  const n = rows.length;
  const cum = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += Number(rows[i].prob || 0);
    cum[i] = acc;
  }
  const keys = new Array(n);
  for (let i = 0; i < n; i++) keys[i] = dedupeKey(rows[i]);
  return { rows, cum, total: acc, keys, size: n };
}

function pickIndex(sampler) {
  const r = Math.random() * sampler.total;
  const cum = sampler.cum;
  let lo = 0;
  let hi = sampler.size - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r <= cum[mid]) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** prob 를 가중치로 한 줄 추첨. 세트당 prob 합계가 100 이라 사실상 확률 그대로. */
export function pickByWeight(rows) {
  return rows[pickIndex(createSampler(rows))];
}

// ============================================================
// 등급 판정 — 결과 하이라이트용
// ============================================================

/** 3등급에서 값이 커야 의미 있는 주력 딜 옵션 (퍼센트 아닌 형태) */
const MAJOR_OPTIONS_PLAIN = new Set(['무기 공격력/속성력']);

/** 3등급 주력 옵션 중 퍼센트 형태로만 인정하는 것들 */
const MAJOR_OPTIONS_PCT = new Set([
  '물리/마법 최소대미지',
  '물리/마법 최대대미지',
  '최소/최대 대미지',
  '물리/마법 크리티컬 대미지',
  '최대 HP',
  '대미지 감소',
]);

/**
 * 유효옵 — 등급/수치와 무관하게 "이 옵션 자체가 값어치 있는가"만 보는 축.
 * 출발점은 각성석 시뮬(awakeningData.js GLOW_BASES)이지만 아이템 각성에만 있는
 * 옵션이 있어 그대로 옮기지는 않았다.
 *
 * ⚠ 각성석의 '일반/보스 몬스터 지배력' 은 여기 대응물이 없다. 아이템 각성의
 * '일반/보스 몬스터 추가 대미지' 는 이름만 비슷할 뿐 지배력만큼 값어치가 없어
 * 유효옵으로 치지 않는다.
 * 아이템 전용 '최소/최대 대미지' 는 최소·최대대미지와 같은 계열로 본다.
 * 방어구/파츠 계열은 딜 %옵션이 아예 없어서 스킬 레벨·대미지 감소%·최대 HP%
 * 를 그 자리의 유효옵으로 함께 본다.
 */
const VITAL_ANY_UNIT = new Set(['무기 공격력/속성력']);

/** 퍼센트 형태일 때만 유효옵으로 인정 (플랫은 수치가 작아 의미가 옅다) */
const VITAL_PCT_ONLY = new Set([
  '물리/마법 최소대미지',
  '물리/마법 최대대미지',
  '최소/최대 대미지',
  '물리/마법 크리티컬 대미지',
  '근력/마법력',
  '올스탯',
  '대미지 감소',
  '최대 HP',
]);

/**
 * 스킬 레벨 옵션인지.
 * 이 데이터에서는 S등급 ↔ 스킬 옵션이 정확히 1:1 이다 (206행, 반례 0).
 * 스킬명이 계속 늘어나는 자유 문자열이라 이름 매칭보다 등급 판정이 안전하다.
 */
export function isSkillOption(row) {
  return String(row.tier) === 'S';
}

/** 이 줄이 유효옵인지 — grade(대박/S) 와 독립적인 축이다. */
export function isVitalOption(row) {
  if (isSkillOption(row)) return true;
  const base = baseName(row.name);
  if (VITAL_ANY_UNIT.has(base)) return true;
  return isPercentName(row.name) && VITAL_PCT_ONLY.has(base);
}

/**
 * 범례에 쓸 유효옵 라벨.
 * 스킬은 한 세트에 37~64종이 들어 있어 그대로 나열하면 범례가 터진다 — 한 항목으로 묶는다.
 */
export function vitalLabel(row) {
  if (isSkillOption(row)) return '스킬 레벨';
  return baseName(row.name) + (isPercentName(row.name) ? '%' : '');
}

/** 3등급 주력 딜 옵션이면서 값이 범위 상위 20% 구간이면 "대박". */
export function isMajorGood(row, val) {
  if (String(row.tier) !== '3') return false;
  const base = baseName(row.name);
  const allowed =
    MAJOR_OPTIONS_PLAIN.has(base) || (isPercentName(row.name) && MAJOR_OPTIONS_PCT.has(base));
  if (!allowed) return false;
  const top =
    Number(row.min) + ITEM_AWAKENING_SIM.MAJOR_TOP_RATIO * (Number(row.max) - Number(row.min));
  return Number(val) >= Math.ceil(top);
}

/**
 * 줄 등급 — '' | 'good' | 's' | 's-strong'
 *   s-strong : S등급(스킬 옵션) 중 값 18 이상 (최상급 스킬 레벨)
 *   s        : 그 외 S등급, 그리고 3등급 대미지 감소% (방어 핵심)
 *   good     : 3등급 주력 딜옵션 상위 20% 구간
 */
export function gradeOf(row, val) {
  if (String(row.tier) === 'S') {
    return Number(val) >= ITEM_AWAKENING_SIM.S_STRONG_MIN ? 's-strong' : 's';
  }
  if (isMajorGood(row, val)) return 'good';
  if (String(row.tier) === '3' && baseName(row.name) === '대미지 감소' && isPercentName(row.name)) {
    return 's';
  }
  return '';
}

/** 확정된 row + 값으로 표시용 줄 객체를 만든다. */
function makeLine(row, rowIndex, val) {
  return {
    rowIndex,
    tier: row.tier,
    name: row.name,
    value: val,
    text: `[${row.tier}] ${formatOption(row.name, val)}`,
    grade: gradeOf(row, val),
    vital: isVitalOption(row),
    isS: String(row.tier) === 'S',
  };
}

// ============================================================
// 줄 구성 추첨 (값 제외) — 목표 "등장 확률" MC 의 핵심 루프
// ============================================================

/** 이번 카드에 붙을 줄 수 추첨: 2 (50%) / 3 (35%) / 4 (15%) */
function pickLineCount() {
  if (Math.random() >= THIRD_LINE_CHANCE) return 2;
  return Math.random() < FOURTH_LINE_CHANCE ? 4 : 3;
}

/**
 * 한 카드의 줄 구성(row 인덱스 배열)만 추첨한다. 값은 뽑지 않는다.
 * out 배열을 재사용해 MC 루프에서 GC 부담을 없앤다.
 */
function drawRowIndices(sampler, out, usedKeys) {
  const k = pickLineCount();
  usedKeys.clear();
  for (let i = 0; i < k; i++) {
    let idx;
    let tries = 0;
    do {
      idx = pickIndex(sampler);
      tries += 1;
      if (tries > ITEM_AWAKENING_SIM.DEDUPE_MAX_TRIES) break;
    } while (usedKeys.has(sampler.keys[idx]));
    usedKeys.add(sampler.keys[idx]);
    out[i] = idx;
  }
  return k;
}

// ============================================================
// 1회 각성 (값 포함) — "돌려보기" 용
// ============================================================

export function rollOnceWith(sampler) {
  const idxs = new Array(4);
  const used = new Set();
  const k = drawRowIndices(sampler, idxs, used);

  const lines = [];
  for (let i = 0; i < k; i++) {
    const row = sampler.rows[idxs[i]];
    lines.push(makeLine(row, idxs[i], drawValue(Number(row.min), Number(row.max))));
  }
  const sLines = lines.filter((l) => l.isS).length;
  return {
    lines,
    count: lines.length,
    sLines,
    hasGood: lines.some((l) => l.grade === 'good'),
    hasS: sLines > 0,
  };
}

/** rows 를 직접 받는 편의 래퍼 (단발 호출용). */
export function rollOnce(rows) {
  return rollOnceWith(createSampler(rows));
}

// ============================================================
// 목표 시뮬
//
// 목표 종류 2가지:
//   { mode: 'row', rowIndex, minValue }  — 특정 등급의 특정 옵션이 그 수치 이상
//   { mode: 'sum', name,     minValue }  — 같은 옵션의 등급 무관 합계가 그 수치 이상
//
// 합계 목표가 필요한 이유:
//   중복 판정 키가 (등급 + 옵션명) 이라 같은 옵션이라도 등급이 다르면 한 카드에
//   같이 붙는다. 예) [3] 무기 공격력/속성력 +8% 와 [2] 같은 옵션 +5% 가 동시 등장 →
//   실질 13%. 특정 등급 하나만 지정해서는 이런 목표를 표현할 수 없다.
// ============================================================

/** 같은 옵션명이 여러 등급에 걸쳐 있는 그룹 — 합계 목표 후보. */
export function sumGroups(rows) {
  const map = new Map();
  rows.forEach((row, i) => {
    if (!map.has(row.name)) map.set(row.name, []);
    map.get(row.name).push(i);
  });
  const out = [];
  for (const [name, idxs] of map) {
    if (idxs.length < 2) continue; // 등급이 하나뿐이면 일반 목표와 동일
    out.push({
      name,
      rowIndexes: idxs,
      tiers: idxs.map((i) => rows[i].tier),
      // 한 카드 최대 줄 수까지만 동시 등장 가능
      maxSum: idxs
        .map((i) => Number(rows[i].max))
        .sort((a, b) => b - a)
        .slice(0, ITEM_AWAKENING_SIM.MAX_TARGETS)
        .reduce((a, b) => a + b, 0),
    });
  }
  return out;
}

/** C(n, k) — k ≤ 4 라 곱셈 누적으로 충분. */
function comb(n, k) {
  if (n < 0 || k < 0 || n < k) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * P(Σ Xᵢ ≥ target) — 각 Xᵢ 는 자기 [min,max] 격자 위 균등분포, 서로 독립.
 *
 * 각 Xᵢ 를 0부터 시작하는 정수 Yᵢ (0 ≤ Yᵢ < nᵢ) 로 옮기면
 *   P(ΣY ≤ s) = (1/Πnᵢ) · Σ_{S⊆[k]} (-1)^|S| · C(s - Σ_{i∈S} nᵢ + k, k)
 * 라는 포함배제 공식이 성립한다 (상한 없는 조합수에서 초과분을 빼는 표준 전개).
 * k ≤ 4 라 항이 최대 16개 — MC 없이 정확값을 즉시 얻는다.
 *
 * 격자 간격이 서로 다르면(정수 + 0.1 혼재) 이 전개가 성립하지 않아 null 을
 * 반환한다. 호출자는 MC 로 폴백할 것. (현재 데이터엔 소수 범위가 없다)
 */
export function sumTailProb(subsetRows, target) {
  if (subsetRows.length === 0) return target <= 0 ? 1 : 0;

  const scales = subsetRows.map(scaleOf);
  const s = scales[0];
  if (scales.some((x) => x !== s)) return null; // 격자 간격 혼재 — 폴백 필요

  const ns = [];
  let aSum = 0;
  let total = 1;
  for (const row of subsetRows) {
    const a = Math.round(Number(row.min) * s);
    const b = Math.round(Number(row.max) * s);
    ns.push(b - a + 1);
    aSum += a;
    total *= b - a + 1;
  }

  const t = Math.ceil(Number(target) * s - 1e-9) - aSum; // ΣY ≥ t 로 환산
  if (t <= 0) return 1;
  const s0 = t - 1; // P(ΣY ≤ s0) 를 구해 1에서 뺀다
  if (s0 < 0) return 1;

  const k = ns.length;
  let count = 0;
  for (let mask = 0; mask < 1 << k; mask++) {
    let rest = s0;
    let bits = 0;
    for (let i = 0; i < k; i++) {
      if (mask & (1 << i)) {
        rest -= ns[i];
        bits += 1;
      }
    }
    if (rest < 0) continue;
    count += (bits % 2 ? -1 : 1) * comb(rest + k, k);
  }
  const p = 1 - count / total;
  return Math.min(1, Math.max(0, p));
}

/** sumTailProb 이 격자 혼재로 못 푸는 경우의 폴백 (현재 데이터에선 미사용). */
function sumTailProbByMC(subsetRows, target, n = 200_000) {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (const row of subsetRows) acc += drawValue(Number(row.min), Number(row.max));
    if (acc >= target) hit += 1;
  }
  return hit / n;
}

/** 합계 목표의 이론상 최대치 (한 카드 최대 줄 수 제약 반영). */
export function maxPossibleSum(rows, name) {
  const g = sumGroups(rows).find((x) => x.name === name);
  if (g) return g.maxSum;
  const row = rows.find((r) => r.name === name);
  return row ? Number(row.max) : 0;
}

/** 목표가 점유하는 "옵션 자리" — 겹치면 한 카드에 동시 성립 불가. */
function occupancyOf(rows, t) {
  if (t.mode === 'sum') return { name: t.name, key: null };
  const row = rows[t.rowIndex];
  return { name: row.name, key: dedupeKey(row) };
}

/**
 * 목표 조합이 애초에 불가능한지 판정.
 *   - 목표가 최대 줄 수(4)를 넘음
 *   - 두 목표가 같은 옵션을 가리킴 (같은 중복키 / 같은 합계 옵션 / 지정+합계 중복)
 *   - 목표 수치가 도달 가능 최대치 초과
 * 반환: { ok, reason, overMax:[목표 인덱스], conflicts:[목표 인덱스] }
 */
export function checkTargets(rows, targets) {
  const MAX = ITEM_AWAKENING_SIM.MAX_TARGETS;
  if (!targets || targets.length === 0) return { ok: false, reason: 'empty', overMax: [], conflicts: [] };
  if (targets.length > MAX) return { ok: false, reason: 'too-many', overMax: [], conflicts: [] };

  const overMax = [];
  targets.forEach((t, i) => {
    if (t.mode === 'sum') {
      if (Number(t.minValue) > maxPossibleSum(rows, t.name) + 1e-9) overMax.push(i);
    } else {
      const row = rows[t.rowIndex];
      if (!row || valuePassProb(row, t.minValue) <= 0) overMax.push(i);
    }
  });
  if (overMax.length > 0) return { ok: false, reason: 'over-max', overMax, conflicts: [] };

  // 겹침 판정 — 같은 옵션명을 두 목표가 동시에 잡으면 서로 간섭한다.
  //   지정 ↔ 지정은 등급이 다르면 공존 가능하므로 중복키로만 판정한다.
  const conflicts = new Set();
  const occ = targets.map((t) => occupancyOf(rows, t));
  for (let i = 0; i < occ.length; i++) {
    for (let j = i + 1; j < occ.length; j++) {
      const a = occ[i];
      const b = occ[j];
      const clash = a.key && b.key ? a.key === b.key : a.name === b.name;
      if (clash) {
        conflicts.add(i);
        conflicts.add(j);
      }
    }
  }
  if (conflicts.size > 0) {
    return { ok: false, reason: 'conflict', overMax: [], conflicts: [...conflicts] };
  }

  return { ok: true, overMax: [], conflicts: [] };
}

// ============================================================
// 확률 추정 — 줄 구성만 MC, 값 조건은 구성마다 정확히 계산
//
//   p = E_구성[ P(값 조건 전부 만족 | 구성) ]
//
// 값은 줄이 확정된 뒤 독립 추첨이므로, 구성이 주어지면 조건부 확률을 닫힌 수식으로
// 계산할 수 있다 (지정 목표 = 균등분포 꼬리확률, 합계 목표 = 위 포함배제 공식).
// 값 조건까지 MC 로 판정하는 것보다 분산이 훨씬 작다 (Rao-Blackwell 화).
//
// 겹치는 목표는 checkTargets 가 막으므로 목표별 조건부 확률은 서로 독립 → 단순 곱.
// ============================================================

/**
 * 반환:
 *   successRate     — 한 카드 성공 확률
 *   compositionRate — 목표 옵션들이 등장할 확률 (값 조건 제외)
 *   valueProb       — 등장했을 때 값 조건을 통과할 평균 확률
 *   composition     — 성공 카드 조립용 줄 구성 (성공 확률로 가중한 저수지 표본)
 */
export function estimateTargetProb(rows, targets) {
  const { PRESENCE_PHASE1, PRESENCE_PHASE2, PRESENCE_PHASE2_THRESHOLD } = ITEM_AWAKENING_SIM;
  const sampler = createSampler(rows);

  const rowTargets = targets.filter((t) => t.mode !== 'sum');
  const sumTargets = targets.filter((t) => t.mode === 'sum');

  // 지정 목표의 통과 확률은 구성과 무관하게 고정 — 미리 곱해둔다.
  let rowFixed = 1;
  for (const t of rowTargets) rowFixed *= valuePassProb(rows[t.rowIndex], t.minValue);
  const wantedRows = rowTargets.map((t) => t.rowIndex);

  // 합계 목표별로 기여 가능한 row 인덱스
  const sumMembers = sumTargets.map((t) => {
    const set = new Set();
    rows.forEach((r, i) => {
      if (r.name === t.name) set.add(i);
    });
    return set;
  });

  // 등장한 기여 줄 조합별 꼬리확률 캐시 — 조합 수가 적어(등급 ≤ 3) 재계산이 없다.
  const tailCache = new Map();
  const tailFor = (si, members) => {
    const key = si + ':' + members.join(',');
    let v = tailCache.get(key);
    if (v === undefined) {
      const subset = members.map((i) => rows[i]);
      const target = Number(sumTargets[si].minValue);
      v = sumTailProb(subset, target);
      if (v === null) v = sumTailProbByMC(subset, target);
      tailCache.set(key, v);
    }
    return v;
  };

  const idxs = new Array(ITEM_AWAKENING_SIM.MAX_TARGETS);
  const used = new Set();
  let condSum = 0;
  let hits = 0;
  let samples = 0;
  // 성공 확률로 가중한 저수지 표본 — 성공 카드의 조건부 분포에서 구성 1개를 뽑는다.
  let wsum = 0;
  let reservoir = null;

  const runBatch = (n) => {
    for (let s = 0; s < n; s++) {
      const k = drawRowIndices(sampler, idxs, used);

      let cond = rowFixed;
      for (let w = 0; w < wantedRows.length && cond > 0; w++) {
        let found = false;
        for (let j = 0; j < k; j++) {
          if (idxs[j] === wantedRows[w]) {
            found = true;
            break;
          }
        }
        if (!found) cond = 0;
      }
      for (let si = 0; si < sumMembers.length && cond > 0; si++) {
        const members = [];
        for (let j = 0; j < k; j++) if (sumMembers[si].has(idxs[j])) members.push(idxs[j]);
        if (members.length === 0) {
          cond = 0;
          break;
        }
        members.sort((a, b) => a - b);
        cond *= tailFor(si, members);
      }

      samples += 1;
      if (cond > 0) {
        hits += 1;
        condSum += cond;
        wsum += cond;
        if (Math.random() * wsum < cond) reservoir = idxs.slice(0, k);
      }
    }
  };

  runBatch(PRESENCE_PHASE1);
  if (hits < PRESENCE_PHASE2_THRESHOLD) runBatch(PRESENCE_PHASE2 - PRESENCE_PHASE1);

  const successRate = condSum / samples;
  const compositionRate = hits / samples;
  return {
    successRate,
    compositionRate,
    valueProb: compositionRate > 0 ? successRate / compositionRate : 0,
    samples,
    hits,
    composition: reservoir,
  };
}

/**
 * 기하분포 통계. composition 을 함께 실어 보내 성공 카드 조립에 재사용한다.
 */
export function computeStatistics(rows, targets) {
  const zero = {
    successRate: 0,
    compositionRate: 0,
    valueProb: 0,
    mean: Infinity,
    p25: Infinity,
    p50: Infinity,
    p75: Infinity,
    p90: Infinity,
    p99: Infinity,
    p999: Infinity,
    composition: null,
    samples: 0,
  };
  if (!targets || targets.length === 0) return { ...zero, mean: 0 };

  const est = estimateTargetProb(rows, targets);
  if (est.successRate <= 0) return { ...zero, samples: est.samples };

  const p = est.successRate;
  const log1mp = Math.log(1 - p);
  const quantile = (q) => Math.ceil(Math.log(1 - q) / log1mp);
  return {
    successRate: p,
    compositionRate: est.compositionRate,
    valueProb: est.valueProb,
    mean: 1 / p,
    p25: quantile(0.25),
    p50: quantile(0.5),
    p75: quantile(0.75),
    p90: quantile(0.9),
    p99: quantile(0.99),
    p999: quantile(0.999),
    composition: est.composition,
    samples: est.samples,
  };
}

/**
 * 첫 성공까지의 시도 횟수를 기하분포에서 1개 추첨 (역 CDF).
 *   X = ⌈ln(U) / ln(1-p)⌉,  U ~ Uniform(0,1)
 * brute-force 로 1/p 회를 실제로 돌리지 않고도 실측과 동일한 분포를 얻는다.
 */
export function sampleGeometricTries(p) {
  if (!(p > 0)) return Infinity;
  if (p >= 1) return 1;
  const u = Math.random() || Number.MIN_VALUE;
  return Math.max(1, Math.ceil(Math.log(u) / Math.log(1 - p)));
}

/**
 * 합계 목표를 만족하는 값 조합을 조건부 분포에서 직접 추첨.
 *
 * 앞 줄부터 순차적으로, 후보값 x 의 가중치를 "나머지 줄들이 남은 목표치를 채울
 * 확률" 로 두고 뽑는다. 이러면 재추첨 없이 P(값 | Σ ≥ 목표) 를 정확히 따른다.
 */
function sampleSumValues(memberRows, target) {
  const out = [];
  let remaining = Number(target);
  for (let i = 0; i < memberRows.length; i++) {
    const row = memberRows[i];
    const rest = memberRows.slice(i + 1);
    const s = scaleOf(row);
    const a = Math.round(Number(row.min) * s);
    const b = Math.round(Number(row.max) * s);

    const weights = new Array(b - a + 1);
    let total = 0;
    for (let x = a; x <= b; x++) {
      const tail = sumTailProb(rest, remaining - x / s);
      const w = tail === null ? 1 : tail;
      weights[x - a] = w;
      total += w;
    }

    let pick = b; // total 이 0 인 이상 케이스 방어 — 최대치로
    if (total > 0) {
      let r = Math.random() * total;
      for (let x = a; x <= b; x++) {
        r -= weights[x - a];
        if (r <= 1e-12) {
          pick = x;
          break;
        }
      }
    }
    const val = s === 1 ? pick : pick / 10;
    out.push(val);
    remaining -= val;
  }
  return out;
}

/**
 * 저수지 표본으로 뽑은 줄 구성에 값을 채워 "성공 카드" 1장을 완성한다.
 *
 * 구성은 이미 성공 확률로 가중 추첨된 것이고 값도 목표 조건부 분포에서 직접
 * 뽑으므로, 재추첨 없이 실제 성공 카드와 같은 분포가 나온다.
 */
export function buildSuccessCard(rows, targets, composition) {
  if (!composition || composition.length === 0) return null;

  const minByRow = new Map();
  for (const t of targets) {
    if (t.mode !== 'sum') minByRow.set(t.rowIndex, Number(t.minValue));
  }

  // 합계 목표별로 이번 구성에서 기여하는 줄에 값 배분
  const sumValues = new Map(); // rowIndex → value
  for (const t of targets) {
    if (t.mode !== 'sum') continue;
    const members = composition.filter((i) => rows[i].name === t.name);
    if (members.length === 0) return null;
    const vals = sampleSumValues(
      members.map((i) => rows[i]),
      Number(t.minValue),
    );
    members.forEach((i, mi) => sumValues.set(i, vals[mi]));
  }

  const lines = composition.map((idx) => {
    const row = rows[idx];
    let val;
    if (sumValues.has(idx)) val = sumValues.get(idx);
    else if (minByRow.has(idx)) val = sampleValueAtLeast(row, minByRow.get(idx));
    else val = drawValue(Number(row.min), Number(row.max));
    return makeLine(row, idx, val);
  });

  const sLines = lines.filter((l) => l.isS).length;
  return {
    lines,
    count: lines.length,
    sLines,
    hasGood: lines.some((l) => l.grade === 'good'),
    hasS: sLines > 0,
  };
}
