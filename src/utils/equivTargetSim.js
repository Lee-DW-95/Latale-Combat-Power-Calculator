/**
 * "크댐환산 합 ≥ X" 목표 시뮬 — 몬테카를로.
 *
 * 옵션 조건(크리 ≥ 120 · 보몬지 ≥ 5 …)은 한 옵션이 뜰 확률 × 값 통과 확률로
 * 닫힌 수식이 나오지만, 크댐환산 합은 여러 옵션의 연속값이 각각 BP 식을 거쳐
 * 더해진 값이라 수식이 없다. 그래서 N 장을 실제로 굴려 단일 카드 성공률 p 를
 * 추정하고, 그 다음 통계(평균 시도·분위수)는 기존과 같은 기하분포 수식으로 낸다.
 *
 * 즉 정확도는 표본 수에 달려 있다 — 표본이 적거나 조건이 빡세면 적중이 0 이 나와
 * "N 회 중 0회" 로만 말할 수 있다. 95% 신뢰구간(Wilson)을 같이 돌려주는 이유다.
 */

import { createLineEvaluator } from './rollEquiv.js';

const MAX_RUNS = 1000000;
const CHUNK = 2000; // 청크마다 이벤트 루프를 놔줘 진행률 갱신 + 취소가 먹히게 한다

/** 기하분포 통계 — 성공률 p 일 때 몇 회차에 성공하나. */
export function geometricStats(p) {
  if (!(p > 0)) {
    return {
      mean: Infinity,
      p25: Infinity, p50: Infinity, p75: Infinity,
      p90: Infinity, p99: Infinity, p999: Infinity,
    };
  }
  const log1mp = Math.log(1 - p);
  const q = (x) => Math.ceil(Math.log(1 - x) / log1mp);
  return {
    mean: 1 / p,
    p25: q(0.25), p50: q(0.5), p75: q(0.75),
    p90: q(0.9), p99: q(0.99), p999: q(0.999),
  };
}

/** 시도 횟수 1회 추첨 — X ~ Geom(p) 의 역 CDF (awakeningSim 과 같은 방식). */
function sampleGeometricTries(p) {
  if (p <= 0) return Infinity;
  if (p >= 1) return 1;
  const u = 1 - Math.random(); // (0, 1]
  return Math.max(1, Math.ceil(Math.log(u) / Math.log(1 - p)));
}

/**
 * 이항비율 95% 신뢰구간 (Wilson) — 적중이 0 이어도 상한이 나와서 쓸모가 있다.
 * ("20만 회 중 0회" → 성공률은 최대 1.8e-5 쯤 = 평균 5.4만 회보다는 드묾)
 */
export function wilsonInterval(hits, n, z = 1.96) {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

/**
 * @param {object} p
 * @param {number} p.threshold  크댐환산 합 기준치
 * @param {number} p.runs       표본 수 (굴릴 카드 장수)
 * @param {()=>any} p.rollFn    굴림 1회
 * @param {(card:any)=>Array} p.normalize  굴림 결과 → 정규화 줄 배열
 * @param {object} p.stats      본 캐릭터 스탯 — 없으면 환산이 불가해 null 반환
 * @param {(done:number)=>void} [p.onProgress]
 * @param {()=>boolean} [p.shouldCancel]
 * @returns {Promise<null|object>}
 */
export async function simulateEquivTarget({
  threshold,
  runs,
  rollFn,
  normalize,
  stats,
  onProgress,
  shouldCancel,
}) {
  const evaluate = createLineEvaluator(stats);
  if (!evaluate) return null;

  const th = Number(threshold);
  const n = Math.max(1, Math.min(MAX_RUNS, Math.floor(Number(runs) || 0)));

  let hits = 0;
  let done = 0;
  let cancelled = false;
  // 성공 카드 1장을 균등하게 뽑는다 (reservoir) — 첫 성공만 쓰면 표본이 치우친다
  let sampleCard = null;
  let sampleConv = null;
  // 표본 내 최고 카드 — 기준치가 너무 높아 적중이 0 일 때 "어디까지 나왔나" 를 보여준다
  let bestCard = null;
  let bestConv = null;

  while (done < n) {
    if (shouldCancel && shouldCancel()) {
      cancelled = true;
      break;
    }
    const end = Math.min(n, done + CHUNK);
    for (; done < end; done += 1) {
      const card = rollFn();
      const conv = evaluate(normalize(card));
      if (!bestConv || conv.total > bestConv.total) {
        bestCard = card;
        bestConv = conv;
      }
      if (conv.total >= th) {
        hits += 1;
        if (Math.random() * hits < 1) {
          sampleCard = card;
          sampleConv = conv;
        }
      }
    }
    if (onProgress) onProgress(done);
    await new Promise((r) => setTimeout(r, 0));
  }

  const p = done > 0 ? hits / done : 0;
  return {
    threshold: th,
    requested: n,
    runs: done,
    cancelled,
    hits,
    successRate: p,
    ci: wilsonInterval(hits, done),
    ...geometricStats(p),
    tries: p > 0 ? sampleGeometricTries(p) : null,
    sampleCard,
    sampleConv,
    bestCard,
    bestConv,
  };
}
