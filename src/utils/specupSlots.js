/**
 * 스펙업 방향 분석 — 슬롯 "설명자" ↔ 분석 엔진 입력 변환.
 *
 * SpecupAdvisorPanel 은 저장된 내실을 분석 엔진(specupAdvisor.analyzeSlots) 입력으로 만드는데,
 * 엔진 슬롯은 rollFn / normalize 같은 함수를 담고 있어 Web Worker 로 보낼 수 없다.
 * 그래서 패널은 직렬화 가능한 설명자만 만들고, 계산하는 쪽(워커 또는 메인 스레드 폴백)이
 * resolveSlot() 으로 kind 에 맞는 함수를 복원한다. 두 경로가 같은 함수를 쓰므로 계산은 하나다.
 *
 * 설명자:
 *   { id, label, system, group,      // 표시·분포 공유 키 (specupAdvisor 슬롯과 같음)
 *     kind,                          // 'awakening' | 'memorial' | 'runeword'
 *     memorialKey?,                  // kind === 'memorial' 일 때 ALL_MEMORIALS 키
 *     lines,                         // 현재 카드의 정규화 줄 배열 — key/text/value/equip/final 만
 *     cost, costEly }
 */

import { rollOnce as rollAwakening } from './awakeningSim.js';
import { rollOnce as rollMemorial } from './memorialSim.js';
import { rollRuneWord } from './runeWordSim.js';
import { normalizeAwakeningCard, normalizeMemorialCard, normalizeRuneWordCard } from './rollEquiv.js';
import { memorialOf } from './memorialLoadout.js';
import { analyzeSlots, slotOutlook, BUDGETS } from './specupAdvisor.js';

/** 정규화 줄 배열에서 직렬화에 필요한 필드만 남긴다 (반응형 프록시·부가 필드 제거). */
export function pickLines(lines) {
  return (lines || []).map((l) => ({
    key: l.key,
    text: l.text,
    value: l.value,
    equip: l.equip ? { ...l.equip } : null,
    final: l.final ? { kind: l.final.kind, pct: l.final.pct } : null,
  }));
}

/**
 * 설명자 → analyzeSlots 슬롯. kind 에 따라 rollFn / normalize 를 붙인다.
 * 모르는 kind 나 없는 메모리얼 키면 null.
 */
export function resolveSlot(desc) {
  const base = {
    id: desc.id,
    label: desc.label,
    group: desc.group,
    lines: desc.lines || [],
    cost: desc.cost,
    costEly: desc.costEly,
  };
  if (desc.kind === 'awakening') {
    return { ...base, rollFn: rollAwakening, normalize: normalizeAwakeningCard };
  }
  if (desc.kind === 'memorial') {
    const m = memorialOf({ key: desc.memorialKey });
    if (!m) return null;
    return { ...base, rollFn: () => rollMemorial(m), normalize: normalizeMemorialCard };
  }
  if (desc.kind === 'runeword') {
    return { ...base, rollFn: rollRuneWord, normalize: (r) => normalizeRuneWordCard(r.rows) };
  }
  return null;
}

/**
 * 룬워드 점수(info 사이트 점수) 분포 — n 회 굴린 total 을 오름차순 Float64Array 로.
 * 점수는 BP 계산이 없어 빠르므로 청크 분할 없이 한 번에 만든다.
 */
export function runeScoreSamples(n) {
  const scores = new Float64Array(n);
  for (let i = 0; i < n; i += 1) scores[i] = rollRuneWord().total;
  scores.sort();
  return scores;
}

/**
 * 설명자 목록 일괄 분석 — 워커와 메인 스레드 폴백이 공유하는 단일 계산 경로.
 *
 * @param {object} p
 * @param {object} p.stats                 평범한 객체(반응형 아님)
 * @param {Array}  p.slots                 설명자 배열
 * @param {number} p.samples
 * @param {number[]} [p.budgets]
 * @param {number|null} [p.runeScoreCurrent]  지금 장착 룬워드의 점수 — 룬워드 슬롯이 있으면 점수 분포도 낸다
 * @param {(p:object)=>void} [p.onProgress]
 * @param {()=>boolean} [p.shouldCancel]
 * @returns {Promise<null|object>}  analyzeSlots 결과 + runeScore ({ sorted, current, ...slotOutlook })
 */
export async function analyzeSlotDescriptors({
  stats,
  slots,
  samples,
  budgets = BUDGETS,
  runeScoreCurrent = null,
  onProgress,
  shouldCancel,
}) {
  const resolved = slots.map(resolveSlot).filter(Boolean);
  const r = await analyzeSlots({ stats, slots: resolved, samples, budgets, onProgress, shouldCancel });
  if (!r || r.cancelled) return r;
  if (runeScoreCurrent !== null && r.slots.some((s) => s.group === 'runeword')) {
    const sorted = runeScoreSamples(r.samples);
    const current = Number(runeScoreCurrent) || 0;
    r.runeScore = { sorted, current, ...slotOutlook(sorted, current, r.budgets) };
  }
  return r;
}
