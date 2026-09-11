/**
 * 굴림 카드 → "크댐 환산" 변환 — 각성석 / 아이템 각성 / 메모리얼 공통.
 *
 * 각 시뮬은 카드 구조가 달라서, 시뮬별 어댑터가 카드를 아래 "정규화 줄" 배열로 바꾼다:
 *
 *   { key,   // 옵션 식별자 — 기록 조건이 "특정 옵션" 일 때 매칭에 쓴다
 *     text,  // 표시 문자열 ("크댐 +112%")
 *     value, // 수치 (같은 옵션이 여러 줄 나오면 합산 대상)
 *     equip, // { equipKey: amount } — BP 영향이 없는 옵션이면 null
 *     final } // { kind: 'crit'|'min'|'max', pct } — "최종 ~~ 대미지" 계열이면 지정 (equip 대신)
 *
 * 그 다음 evaluateLines() 가 줄마다 단독 ΔBP → 크댐 환산량을 구해 합산한다.
 * (= EfficiencyPanel 의 "각성석 종합 환산" 과 같은 계산)
 */

import { convertEquip, convertFinalOption, bpFor } from './statEquivalence.js';
import { baseLabelOf, ALLSTAT_BASE } from '../data/memorialProbabilities.js';
import { uniqueDisplayLabels } from '../data/awakeningData.js';
import { RUNES, displayDesc } from '../data/runeWordData.js';

// ============================================================
// 공통 — 정규화 줄 배열 환산
// ============================================================

/**
 * 반응형 프록시를 벗겨낸 스탯 스냅샷.
 *
 * BP 계산은 스탯 프로퍼티를 수십 번 읽는데, Vue reactive 객체를 그대로 넘기면
 * 읽을 때마다 Proxy 트랩을 타서 대량 굴림(수십만 회 BP 계산)이 10 배 이상 느려진다.
 * 굴림 중에는 스탯이 바뀌지 않으므로 시작할 때 한 번만 평범한 객체로 복사해 쓴다.
 */
function plainStats(stats) {
  return { ...stats };
}

/**
 * 정규화 줄 1개 → { delta, refAmount }. 환산 대상이 아니면 null.
 *
 *   equip 줄 : 옵션을 스탯에 적용한 ΔBP 를 측정해 역산 (기존 경로)
 *   final 줄 : "최종 ~~ 대미지" — BP 가 안 움직이므로 대미지 배율을 BP 비율로 부여해 역산
 */
function convertLine(stats, line, refKey, mode, baseBP) {
  if (line.final) {
    const r = convertFinalOption(stats, line.final.kind, line.final.pct, refKey, mode, baseBP);
    return r.refAmount || r.delta ? r : null;
  }
  if (!line.equip) return null;
  return convertEquip(stats, line.equip, refKey, mode, baseBP);
}

/**
 * @returns {null | { total, totalDelta, convertibleCount, lines }}
 *          stats 가 비어 BP 가 0 이면 null (환산 불가).
 */
export function evaluateLines(normLines, reactiveStats, opt = {}) {
  const refKey = opt.refKey ?? '크댐';
  const mode = opt.mode ?? 'avg';
  if (!Array.isArray(normLines) || !reactiveStats) return null;

  const stats = plainStats(reactiveStats);
  const baseBP = bpFor(stats, mode);
  if (!(baseBP > 0)) return null;

  let total = 0;
  let totalDelta = 0;
  let convertibleCount = 0;

  const lines = normLines.map((l) => {
    const conv = convertLine(stats, l, refKey, mode, baseBP);
    if (!conv) return { ...l, refAmount: 0, delta: 0, convertible: false };
    total += conv.refAmount;
    totalDelta += conv.delta;
    convertibleCount++;
    return { ...l, ...conv, convertible: true };
  });

  return { total, totalDelta, convertibleCount, lines, refKey, mode, baseBP };
}

/**
 * 대량 굴림용 — 같은 stats 기준으로 줄 환산을 캐시하는 평가기.
 *
 * 옵션 값은 굴림마다 같은 수치가 반복해서 나오므로 (equip 조합 가짓수는 수백 수준),
 * 이분법 역산 결과를 equip 시그니처로 캐싱하면 1만 회 굴림도 순식간에 끝난다.
 * evaluateLines() 와 결과가 동일해야 하므로 계산식은 공유한다.
 *
 * @returns {null | (normLines:Array)=>object}  stats 가 없거나 BP 가 0 이면 null
 */
export function createLineEvaluator(reactiveStats, opt = {}) {
  const refKey = opt.refKey ?? '크댐';
  const mode = opt.mode ?? 'avg';
  if (!reactiveStats) return null;

  const stats = plainStats(reactiveStats);
  const baseBP = bpFor(stats, mode);
  if (!(baseBP > 0)) return null;

  const cache = new Map();

  function convertCached(line) {
    const key = line.final
      ? `final:${line.final.kind}:${line.final.pct}`
      : Object.keys(line.equip).sort().map((k) => `${k}=${line.equip[k]}`).join('|');
    let hit = cache.get(key);
    if (!hit) {
      hit = convertLine(stats, line, refKey, mode, baseBP);
      cache.set(key, hit);
    }
    return hit;
  }

  return function evaluate(normLines) {
    let total = 0;
    let totalDelta = 0;
    let convertibleCount = 0;

    const lines = normLines.map((l) => {
      if (!l.equip && !l.final) return { ...l, refAmount: 0, delta: 0, convertible: false };
      const conv = convertCached(l);
      if (!conv) return { ...l, refAmount: 0, delta: 0, convertible: false };
      total += conv.refAmount;
      totalDelta += conv.delta;
      convertibleCount++;
      return { ...l, ...conv, convertible: true };
    });

    return { total, totalDelta, convertibleCount, lines, refKey, mode, baseBP };
  };
}

/** 수치 표기 — 소수면 1자리, 정수면 그대로. */
function fmtV(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1);
}

// ============================================================
// (1) 각성석 — data/awakeningData.js 의 displayLabel 기준
// ============================================================

const AWAK_MAP = {
  '근력/마법력': { 주스탯: 1 },
  '근력/마법력 %': { 주스탯_퍼: 1 },
  // 올스탯은 행운·체력도 올리지만 BP 식에 들어가는 건 주스탯뿐.
  '올스탯': { 올스탯: 1 },
  '올스탯 %': { 올스탯_퍼: 1 },
  '무기 공격력/속성력': { 공격력: 1 },
  '무기 공격력/속성력 %': { 공격력_퍼: 1 },
  '물리/마법 고정 대미지': { 고댐: 1 },
  '물리/마법 고정 대미지 %': { 고댐_퍼: 1 },
  // 게임 표기는 "%" 지만 내부적으론 raw 가산 한 종뿐인 옵션들
  '물리/마법 크리티컬 대미지 %': { 크댐: 1 },
  '물리/마법 최소대미지 %': { 최소뎀: 1 },
  '물리/마법 최대대미지 %': { 최대뎀: 1 },
  '일반 몬스터 지배력 %': { 일몬지: 1 },
  '보스 몬스터 지배력 %': { 보몬지: 1 },
};

/** 계수 테이블 × 수치 → equip 객체. 매핑이 없으면 null (BP 무관 옵션). */
function equipFrom(table, key, value) {
  const coef = table[key];
  if (!coef) return null;
  const v = Number(value);
  if (!Number.isFinite(v) || v === 0) return null;
  const out = {};
  for (const k of Object.keys(coef)) out[k] = coef[k] * v;
  return out;
}

/** 각성석 rollOnce() 카드 → 정규화 줄 배열 */
export function normalizeAwakeningCard(card) {
  return card.lines.map((line) => ({
    key: line.displayLabel,
    text: `${line.base} +${fmtV(line.value)}${line.unit}`,
    value: line.value,
    equip: equipFrom(AWAK_MAP, line.displayLabel, line.value),
  }));
}

/**
 * 저장된 각성석 1개 ({ options: [{ stat, unit, value }] }, EfficiencyPanel 입력 형식) → 정규화 줄 배열.
 * 값이 비어 있는 옵션은 줄에서 뺀다 — 빈 줄이 없으면 "빈 슬롯" 으로 취급된다.
 */
export function normalizeAwakStoneLoadout(stone) {
  const out = [];
  for (const opt of stone?.options || []) {
    const v = Number(opt.value);
    if (!Number.isFinite(v) || v === 0) continue;
    const equipKey = opt.unit === 'pct' ? `${opt.stat}_퍼` : opt.stat;
    out.push({
      key: `${opt.stat}__${opt.unit}`,
      text: `${opt.stat} +${fmtV(v)}${opt.unit === 'pct' ? '%' : ''}`,
      value: v,
      equip: { [equipKey]: v },
    });
  }
  return out;
}

/** 각성석 카드에 등장 가능한 전체 옵션 라벨 (보라 ∪ 신비) — 기록 조건 셀렉트용 */
export function awakeningOptionKeys() {
  const seen = new Set();
  const out = [];
  for (const k of ['PURPLE', 'MYSTIC']) {
    for (const lb of uniqueDisplayLabels(k)) {
      if (seen.has(lb)) continue;
      seen.add(lb);
      out.push({ key: lb, label: lb });
    }
  }
  return out;
}

// ============================================================
// (2) 아이템 각성 — data/itemAwakeningData.js 의 row.name 기준
// ============================================================

const ITEM_MAP = {
  '근력/마법력 +n': { 주스탯: 1 },
  '올스탯 +n': { 올스탯: 1 },
  '올스탯 +n%': { 올스탯_퍼: 1 },
  '무기 공격력/속성력 +n': { 공격력: 1 },
  '무기 공격력/속성력 +n%': { 공격력_퍼: 1 },
  '물리/마법 고정 대미지 +n': { 고댐: 1 },
  '보스 몬스터 추가 대미지 +n': { 보몬추: 1 },
  '보스 몬스터 추가 대미지 +n%': { 보몬추_퍼: 1 },
  '일반 몬스터 추가 대미지 +n': { 일몬추: 1 },
  '일반 몬스터 추가 대미지 +n%': { 일몬추_퍼: 1 },
  '물리/마법 최소대미지 +n%': { 최소뎀: 1 },
  '물리/마법 최대대미지 +n%': { 최대뎀: 1 },
  // 한 줄이 최소·최대를 동시에 올린다 → equip 하나에 두 키를 같이 넣어 한 번에 측정.
  '최소/최대 대미지 +n%': { 최소뎀: 1, 최대뎀: 1 },
  '물리/마법 크리티컬 대미지 +n%': { 크댐: 1 },
  // 백어택은 조건부라 T창 BP 에 안 들어감 → 환산 제외 (DamagePredict 의 가동률 영역).
};

/** 아이템 각성 rollOnceWith() 카드 → 정규화 줄 배열 */
export function normalizeItemAwakeningCard(roll) {
  return roll.lines.map((line) => ({
    key: line.name,
    text: `[${line.tier}] ${line.body}`,
    value: line.value,
    equip: equipFrom(ITEM_MAP, line.name, line.value),
  }));
}

/** 옵션명의 플레이스홀더를 걷어낸 표시용 라벨 — "근력/마법력 +n" → "근력/마법력" */
function cleanOptionName(name) {
  return String(name)
    .replace(/\s*\+n%/g, ' %')
    .replace(/\s*\+n/g, '')
    .replace(/Lv\.\s*1\s*~\s*Lv\.\s*n/g, 'Lv')
    .replace(/Lv\.\s*n/g, 'Lv')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 아이템 각성 세트의 "옵션" 목록 (등급 통합) — 기록 조건 셀렉트용 */
export function itemAwakeningOptionKeys(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    out.push({ key: r.name, label: cleanOptionName(r.name) });
  }
  return out;
}

// ============================================================
// (3) 메모리얼 — data/memorialProbabilities.js 의 베이스 라벨 기준
// ============================================================

const MEMO_MAP = {
  '근력/마법력': { 주스탯: 1 },
  '올스탯': { 올스탯: 1 },
  '무기 공격력/속성력': { 공격력: 1 },
  '무기 공격력/속성력%': { 공격력_퍼: 1 },
  '고정 대미지': { 고댐: 1 },
  '고정 대미지%': { 고댐_퍼: 1 },
  '최소 대미지%': { 최소뎀: 1 },
  '최대 대미지%': { 최대뎀: 1 },
  '최소/최대 대미지%': { 최소뎀: 1, 최대뎀: 1 },
  '크리티컬 대미지%': { 크댐: 1 },
  '일반 몬스터 지배력%': { 일몬지: 1 },
  '보스 몬스터 지배력%': { 보몬지: 1 },
  // 방어력/체력/행운/저항력/명중률%/크리티컬 확률%/스킬 쿨타임 감소% → BP 무관.
};

/**
 * "최종 ~~ 대미지" 계열 — 값 1 = +1% (사용자 확인).
 * T창 BP 식 밖의 최종 곱연산이라 equip 이 아니라 대미지 배율로 환산한다
 * (statEquivalence.convertFinalOption). 세트 메모리얼의 주력 옵션이 여기 몰려 있다.
 */
const MEMO_FINAL_MAP = {
  '최종 크리티컬 대미지': 'crit',
  '최종 최소 대미지': 'min',
  '최종 최대 대미지': 'max',
};

/** 메모리얼 rollOnce() 카드(줄 배열) → 정규화 줄 배열 */
export function normalizeMemorialCard(lines) {
  return lines.map((line) => {
    const base = baseLabelOf(line.label);
    const finalKind = MEMO_FINAL_MAP[base];
    const v = Number(line.value);
    return {
      key: base,
      text: `${line.label} +${fmtV(line.value)}`,
      value: line.value,
      equip: finalKind ? null : equipFrom(MEMO_MAP, base, line.value),
      final: finalKind && Number.isFinite(v) && v !== 0 ? { kind: finalKind, pct: v } : null,
    };
  });
}

// ============================================================
// (4) 룬워드 — data/runeWordData.js 의 룬 id 기준
// ============================================================

/**
 * 룬 1개의 BP 효과 (일반 룬 기준 수치, 왕룬은 ×2).
 * 한 룬이 여러 스탯을 올리면 equip 여러 개로 나눠 줄을 만든다 — 일몬지/보몬지는
 * BP 식 floor plateau 때문에 단독 측정(배수 환산)이 필요해서 반드시 분리한다.
 * 최소/최대뎀 조합(헌신 & 파괴)은 cap 상호작용이 있어 한 equip 에 같이 둔다.
 * 체력/행운/명중률/이속/드랍 등 BP 무관 룬은 매핑이 없다 (환산 0).
 */
const RUNE_EQUIPS = {
  0: [{ 주스탯: 1500 }],
  4: [{ 공격력: 70 }],
  6: [{ 최소뎀: 50 }],
  8: [{ 최대뎀: 50 }],
  10: [{ 크댐: 50 }],
  12: [{ 고댐: 1500 }],
  14: [{ 공격력_퍼: 5 }],
  15: [{ 고댐_퍼: 8 }],
  17: [{ 올스탯: 1500 }],
  18: [{ 올스탯_퍼: 5 }],
  19: [{ 관통: 10 }],
  20: [{ 올스탯: 1500 }, { 올스탯_퍼: 5 }],
  21: [{ 고댐: 1500 }, { 공격력: 70 }],
  24: [{ 고댐_퍼: 8 }, { 공격력_퍼: 5 }],
  25: [{ 최소뎀: 50, 최대뎀: 50 }],
  27: [{ 일몬추: 6000 }, { 일몬지: 3 }],
  28: [{ 보몬추: 10000 }, { 보몬지: 5 }],
  29: [{ 크댐: 50 }], // 크리티컬 확률 +1% 는 BP 무관
};

/**
 * 룬워드 rows ([{ runeId, isKing }], runeWordSim.buildResult().rows 또는 runewordLoadout.runewordRows())
 * → 정규화 줄 배열. 왕룬은 수치 2배.
 */
export function normalizeRuneWordCard(rows) {
  const out = [];
  for (const row of rows || []) {
    const rune = RUNES[row.runeId];
    if (!rune) continue;
    const mult = row.isKing ? 2 : 1;
    const equips = RUNE_EQUIPS[row.runeId];
    const text = `${row.isKing ? '👑 ' : ''}${rune.name} (${displayDesc(rune, !!row.isKing)})`;
    if (!equips) {
      out.push({ key: `rune:${rune.id}`, text, value: 0, equip: null });
      continue;
    }
    equips.forEach((eq, i) => {
      const scaled = {};
      for (const k of Object.keys(eq)) scaled[k] = eq[k] * mult;
      out.push({
        key: `rune:${rune.id}`,
        // 같은 룬에서 나온 두 번째 줄부터는 표시 문자열을 비워 카드에 한 번만 보이게 한다
        text: i === 0 ? text : `  └ ${rune.name} (추가 효과)`,
        value: mult,
        equip: scaled,
      });
    });
  }
  return out;
}

/**
 * 메모리얼 "특정 옵션" 매칭 — 올스탯 줄은 다른 스탯 목표에도 기여한다
 * (게임 내 올스탯 = 전 스탯 상승). 목표 시뮬의 lineContributesTo 와 같은 규칙.
 */
export function memorialOptionMatcher(lineKey, optionKey) {
  if (lineKey === optionKey) return true;
  return lineKey === ALLSTAT_BASE && optionKey !== ALLSTAT_BASE;
}
