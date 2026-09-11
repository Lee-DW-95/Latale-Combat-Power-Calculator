/**
 * 스펙업 방향 분석 — "지금 어느 내실을 굴리는 게 기대 이득이 가장 큰가".
 *
 * 원리:
 *   내실 슬롯(각성석 1개, 메모리얼 카드 1장 …)마다
 *     1. 현재 카드의 크댐환산 (rollEquiv.evaluateLines 와 같은 계산)
 *     2. 그 슬롯을 굴렸을 때 나오는 카드의 크댐환산 분포 — rollOnce 를 N 회 돌린 표본
 *   을 구하고, 둘을 비교해 "굴릴 가치" 를 수치화한다.
 *
 *   굴린 결과가 현재보다 나쁘면 이전 카드를 그대로 쓴다는 전제(최선 선택)라서
 *   N 회 굴린 뒤의 기대 환산은 E[max(현재, X₁ … X_N)] 이다.
 *   표본을 오름차순 정렬해 두면 이 값은 경험분포에서 닫힌 수식으로 나온다:
 *     P(max_N ≤ x_(i)) = (i/n)^N  →  E[max_N] = Σ x_(i)·[(i/n)^N − ((i−1)/n)^N]
 *   현재값 이하 구간은 전부 "현재 유지" 이므로 그 확률 질량을 현재값에 몰아준다.
 *
 * 시스템 간 비교는 엘리로 통일한 1회 비용(costEly)으로 한다 — 각성석은 재료+망치,
 * 메모리얼은 파편+결정, 룬워드는 스크롤이라 재화가 달라서, 호출부(usePrices)가
 * 재화 시세로 엘리 환산한 값을 슬롯에 실어 준다. "예산 N 엘리" 를 주면 슬롯마다
 * 굴릴 수 있는 횟수 floor(N / costEly) 로 기대 이득을 내 순위를 매긴다.
 */

import { createLineEvaluator } from './rollEquiv.js';

export const DEFAULT_SAMPLES = 20000;
export const MAX_SAMPLES = 200000;
export const BUDGETS = Object.freeze([1, 10, 30, 100, 300, 1000]);
export const DEFAULT_BUDGET = 100;

/** 엘리 예산 후보 (억 단위) */
export const ELY_BUDGETS = Object.freeze([1e9, 3e9, 1e10, 3e10, 1e11, 3e11]);
export const DEFAULT_ELY_BUDGET = 1e10;

const CHUNK = 1000; // 청크마다 이벤트 루프를 놔줘 진행률 갱신 + 취소가 먹히게 한다

/**
 * 굴림 표본 분포 — rollFn 을 samples 회 돌려 크댐환산 합을 오름차순 Float64Array 로 돌려준다.
 * 같은 stats 기준으로 여러 슬롯이 분포를 공유할 수 있게 evaluate 는 밖에서 만들어 넘긴다.
 *
 * @param {object} p
 * @param {(lines:Array)=>object} p.evaluate   createLineEvaluator(stats) 결과
 * @param {()=>any} p.rollFn                   굴림 1회
 * @param {(card:any)=>Array} p.normalize      굴림 결과 → 정규화 줄 배열
 * @param {number} p.samples
 * @param {(done:number)=>void} [p.onProgress]
 * @param {()=>boolean} [p.shouldCancel]
 * @returns {Promise<null|Float64Array>}       취소되면 null
 */
export async function sampleEquivDistribution({
  evaluate,
  rollFn,
  normalize,
  samples = DEFAULT_SAMPLES,
  onProgress,
  shouldCancel,
}) {
  const n = Math.max(100, Math.min(MAX_SAMPLES, Math.floor(Number(samples) || 0)));
  const out = new Float64Array(n);
  let done = 0;
  while (done < n) {
    if (shouldCancel && shouldCancel()) return null;
    const end = Math.min(n, done + CHUNK);
    for (; done < end; done += 1) {
      out[done] = evaluate(normalize(rollFn())).total;
    }
    if (onProgress) onProgress(done);
    await new Promise((r) => setTimeout(r, 0));
  }
  out.sort();
  return out;
}

/** 오름차순 배열에서 value 이하인 원소 개수 (upper bound). */
function countAtMost(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * N 회 굴린 뒤(이전 카드 유지 포함)의 기대 환산 E[max(current, X₁ … X_N)].
 * N = 0 이면 current 그대로. 정렬된 표본에서 닫힌 수식으로 계산한다 (파일 머리 설명).
 */
export function expectedAfterRolls(sorted, current, N) {
  const n = sorted.length;
  const cur = Number(current) || 0;
  if (!(N > 0) || !n) return cur;
  const below = countAtMost(sorted, cur);
  let e = cur * Math.pow(below / n, N);
  let prevCdf = Math.pow(below / n, N);
  for (let i = below; i < n; i += 1) {
    const cdf = Math.pow((i + 1) / n, N);
    e += sorted[i] * (cdf - prevCdf);
    prevCdf = cdf;
  }
  return e;
}

/**
 * 현재값 current 와 표본 분포를 비교한 슬롯 전망.
 *
 * @param {Float64Array} sorted   오름차순 표본
 * @param {number} current        현재 카드의 크댐환산 합
 * @param {number[]} budgets      "N 회 굴리면" 의 N 목록
 * @returns {{
 *   current, percentile, pImprove, gainPerRoll, meanIfImprove,
 *   expectedRollsToImprove, sampleMax, sampleMean, sampleMedian,
 *   expectedAfter: Record<number, number>, gainAfter: Record<number, number>
 * }}
 */
export function slotOutlook(sorted, current, budgets = BUDGETS) {
  const n = sorted.length;
  const cur = Number(current) || 0;
  const below = countAtMost(sorted, cur); // 현재 이하인 표본 수
  const pImprove = (n - below) / n;

  let gainSum = 0;
  let aboveSum = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) total += sorted[i];
  for (let i = below; i < n; i += 1) {
    gainSum += sorted[i] - cur;
    aboveSum += sorted[i];
  }

  const expectedAfter = {};
  const gainAfter = {};
  for (const N of budgets) {
    const e = expectedAfterRolls(sorted, cur, N);
    expectedAfter[N] = e;
    gainAfter[N] = e - cur;
  }

  return {
    current: cur,
    percentile: below / n, // 현재 카드가 분포에서 차지하는 누적 위치 (0.9 = 상위 10%)
    pImprove,
    gainPerRoll: gainSum / n,
    meanIfImprove: pImprove > 0 ? aboveSum / (n - below) : 0,
    expectedRollsToImprove: pImprove > 0 ? 1 / pImprove : Infinity,
    sampleMax: n ? sorted[n - 1] : 0,
    sampleMean: n ? total / n : 0,
    sampleMedian: n ? sorted[Math.floor(n / 2)] : 0,
    expectedAfter,
    gainAfter,
  };
}

/**
 * 슬롯 목록 일괄 분석.
 *
 * 슬롯 정의:
 *   { id, label, group,        // 표시용 — group 은 분포를 공유하는 단위 키 ("awakening", "memorial:CHOENPAM_SET")
 *     lines,                   // 현재 카드의 정규화 줄 배열 (빈 배열 = 빈 슬롯)
 *     rollFn, normalize,       // 분포 표본용
 *     cost,                    // 표시용 1회 비용 문자열 (그대로 결과에 실어 준다)
 *     costEly }                // 1회 비용 (엘리) — 예산 기준 비교용. 0/미지정이면 비용 비교 불가
 *
 * 같은 group 의 슬롯은 표본 분포를 한 번만 만든다.
 *
 * @returns {Promise<null|{ slots:Array, dist:Map<string,Float64Array>, budgets:number[], samples:number, cancelled:boolean }>}
 *          stats 가 비어 BP 가 0 이면 null. dist 는 group → 정렬 표본 (예산별 재계산용).
 */
export async function analyzeSlots({
  stats,
  slots,
  samples = DEFAULT_SAMPLES,
  budgets = BUDGETS,
  onProgress,
  shouldCancel,
}) {
  const evaluate = createLineEvaluator(stats);
  if (!evaluate) return null;

  // 분포는 group 단위로 1회
  const groups = new Map();
  for (const s of slots) {
    if (!groups.has(s.group)) groups.set(s.group, { rollFn: s.rollFn, normalize: s.normalize });
  }
  const groupKeys = Array.from(groups.keys());
  const dist = new Map();
  let cancelled = false;

  for (let gi = 0; gi < groupKeys.length; gi += 1) {
    const g = groupKeys[gi];
    const { rollFn, normalize } = groups.get(g);
    const sorted = await sampleEquivDistribution({
      evaluate,
      rollFn,
      normalize,
      samples,
      shouldCancel,
      onProgress: onProgress
        ? (done) => onProgress({ group: g, groupIndex: gi, groupCount: groupKeys.length, done, total: samples })
        : undefined,
    });
    if (!sorted) {
      cancelled = true;
      break;
    }
    dist.set(g, sorted);
  }
  if (cancelled) return { slots: [], dist, budgets, samples, cancelled: true };

  const out = slots.map((s) => {
    const conv = evaluate(s.lines || []);
    const sorted = dist.get(s.group);
    const outlook = slotOutlook(sorted, conv.total, budgets);
    return {
      id: s.id,
      label: s.label,
      group: s.group,
      cost: s.cost || null,
      costEly: Number(s.costEly) || 0,
      empty: !(s.lines && s.lines.length),
      conv,
      ...outlook,
      // 엘리 1억당 기대 이득 (1회 기준 한계 효율) — 비용을 모르면 null
      gainPer100M: Number(s.costEly) > 0 ? (outlook.gainPerRoll / Number(s.costEly)) * 1e8 : null,
    };
  });

  return { slots: out, dist, budgets, samples, cancelled: false };
}
