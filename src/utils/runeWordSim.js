/**
 * 룬 워드 시뮬레이션
 *
 * 뽑기 모델 (latale.info/35 와 동일 가정):
 *   룬 30종에서 중복 없이 8개를 균등 추첨하고, 마지막 8번째가 왕룬이 된다.
 *   → 왕룬은 2배 점수 (통찰만 120점 고정).
 *   ⚠ 게임사 공개 확률이 아니라 "전 룬 균등" 가정이다. 기대 소모 Ely 는 이 가정 하의 값.
 *
 * 목표 시뮬:
 *   메모리얼/각성석 시뮬은 값 범위가 연속이라 Monte Carlo 로 p 를 추정하지만,
 *   룬워드는 "30종 중 8종 비복원 추첨" 이라 경우의 수가 유한하다.
 *   → 조합론 DP 로 1회 성공확률 p 를 **정확히** 계산한다 (표본오차 0).
 *   각 스크롤 시도는 독립이므로 첫 성공까지 시도 횟수는 기하분포:
 *     E[X] = 1/p,  P(X ≤ k) = 1 - (1-p)^k,  분위수 k_q = ⌈ln(1-q)/ln(1-p)⌉
 *
 * 목표 조건의 일반형 — "룬 그룹" 배열:
 *   목표 하나 = 룬 id 집합(그룹). 그 그룹의 룬이 1개라도 뽑히면 그 목표는 충족.
 *     · 룬으로 선택  → 그룹이 전부 싱글톤 (예: [[19]] = 통찰)
 *     · 옵션으로 선택 → 그룹이 여러 룬 (예: 크리티컬 대미지 = [10, 29] = 파멸 | 파멸&폭주)
 *   그룹끼리 겹칠 수 있다 (파멸&폭주는 "크댐" 과 "크리티컬 확률" 양쪽에 속함)
 *   → 단순 카운트로는 중복 집계되므로 비트마스크로 "충족된 그룹 집합" 을 추적한다.
 */

import {
  RUNES,
  RUNE_SLOTS,
  ELY_PER_ROLL,
  MAX_TOTAL,
  RUNE_OPTION_BY_KEY,
  scoreOf,
  kingScoreOf,
  gradeOf,
  isMidRune,
  isMajorRune,
  displayDesc,
} from '../data/runeWordData.js';

// 목표 도달 시뮬 1회 실행의 안전 상한 (p 가 극히 작을 때 무한루프 방지)
const SAMPLE_MAX_TRIES = 2_000_000;

// 비트마스크 DP 크기 상한 — 옵션 목표는 최대 6개 (2^6 = 64 상태)
export const MAX_OPTION_TARGETS = 6;

const N = RUNES.length;      // 30
const K = RUNE_SLOTS;        // 8
const REST = RUNE_SLOTS - 1; // 왕룬 제외 나머지 7칸

// ============================================================
// 조합 수 C(n, r)
// ============================================================
function comb(n, r) {
  if (r < 0 || r > n) return 0;
  const k = Math.min(r, n - r);
  let out = 1;
  for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
  return out;
}

// 왕룬 자리를 뺀 나머지 7칸의 전체 경우의 수 — C(29, 7)
const REST_TOTAL_WAYS = comb(N - 1, REST);

function popcount(x) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

// ============================================================
// 결과 객체 만들기 — indexes[0..7], 마지막이 왕룬
// ============================================================
export function buildResult(indexes) {
  let total = 0;
  const rows = indexes.map((runeId, i) => {
    const rune = RUNES[runeId];
    const isKing = i === K - 1;
    const add = scoreOf(rune, isKing);
    total += add;
    return {
      order: i + 1,
      runeId,
      isKing,
      name: rune.name,
      base: rune.score,
      add,
      desc: displayDesc(rune, isKing),
      isMid: isMidRune(rune),
      isMajor: isMajorRune(rune),
    };
  });
  const grade = gradeOf(total);
  return { total, grade: grade.key, gradeLabel: grade.label, judgeText: grade.text, rows };
}

// ============================================================
// 무작위 1회 뽑기 — 부분 Fisher-Yates (30종 중 8개 비복원)
// ============================================================
const scratchPool = new Int32Array(N);

function drawIndexes() {
  for (let i = 0; i < N; i++) scratchPool[i] = i;
  const out = new Array(K);
  for (let i = 0; i < K; i++) {
    const j = i + Math.floor(Math.random() * (N - i));
    const t = scratchPool[i];
    scratchPool[i] = scratchPool[j];
    scratchPool[j] = t;
    out[i] = scratchPool[i];
  }
  return out;
}

export function rollRuneWord() {
  return buildResult(drawIndexes());
}

// ============================================================
// 목표 정의
//   입력 (UI 그대로):
//   {
//     selectMode: 'rune' | 'option',
//     runeIds: number[],            // selectMode === 'rune'
//     optionKeys: string[],         // selectMode === 'option'
//     mode: 'all' | 'atLeast',
//     atLeast: number,
//     kingId: number | null,        // 왕룬 지정 (null = 상관없음)
//     minTotal: number,             // 최소 총점 (0 = 조건 없음)
//   }
//   출력에 groups(룬 id 배열의 배열) / need(충족해야 할 그룹 수) 가 붙는다.
// ============================================================
export function normalizeTarget(raw) {
  const selectMode = raw?.selectMode === 'option' ? 'option' : 'rune';

  const runeIds = [...new Set((raw?.runeIds || []).map(Number))].filter(
    (id) => Number.isInteger(id) && id >= 0 && id < N
  );
  const optionKeys = [...new Set(raw?.optionKeys || [])]
    .filter((k) => RUNE_OPTION_BY_KEY[k])
    .slice(0, MAX_OPTION_TARGETS);

  // 선택한 목표를 "룬 그룹" 으로 환원한다
  const groups =
    selectMode === 'option'
      ? optionKeys.map((k) => [...RUNE_OPTION_BY_KEY[k].runeIds])
      : runeIds.map((id) => [id]);

  // 선택이 없으면 'N개 이상' 은 의미가 없다 — 'all'(=조건 없음) 으로 눕힌다
  const mode = groups.length > 0 && raw?.mode === 'atLeast' ? 'atLeast' : 'all';
  const atLeast =
    mode === 'atLeast' ? Math.max(1, Math.min(groups.length, Number(raw?.atLeast) || 1)) : groups.length;

  const kingIdRaw = raw?.kingId;
  const kingId =
    kingIdRaw === null || kingIdRaw === undefined || kingIdRaw === '' ? null : Number(kingIdRaw);
  const minTotal = Math.max(0, Math.min(MAX_TOTAL, Math.floor(Number(raw?.minTotal) || 0)));

  return {
    selectMode,
    runeIds,
    optionKeys,
    groups,
    need: atLeast,
    mode,
    atLeast,
    kingId,
    minTotal,
  };
}

export function hasAnyCondition(t) {
  return t.groups.length > 0 || t.kingId !== null || t.minTotal > 0;
}

// 그룹이 전부 싱글톤이면(=룬 직접 지정) 마스크 없이 카운트만으로 셀 수 있다
function allSingleton(groups) {
  return groups.every((g) => g.length === 1);
}

// 최소 몇 개의 룬 자리를 써야 목표 그룹을 need 개 충족할 수 있는지 — 명백한 불가 판정용
function minRunesNeeded(groups, need) {
  if (need <= 0) return 0;
  // 그룹이 겹칠 수 있으므로 하한은 need 개 그룹을 고르는 최소 룬 수. 안전하게 need 로 본다.
  return Math.min(need, groups.length);
}

// ============================================================
// 판정 — 뽑힌 결과가 목표를 만족하는가
// ============================================================
export function matchesTarget(result, t) {
  if (t.minTotal > 0 && result.total < t.minTotal) return false;

  const kingRow = result.rows[K - 1];
  if (t.kingId !== null && kingRow.runeId !== t.kingId) return false;

  if (t.groups.length > 0) {
    const drawn = new Set(result.rows.map((r) => r.runeId));
    let hit = 0;
    for (const g of t.groups) {
      if (g.some((id) => drawn.has(id))) hit++;
    }
    if (hit < t.need) return false;
  }
  return true;
}

// 이 결과에서 각 목표 그룹을 충족시킨 룬 id 집합 (UI 하이라이트용)
export function contributingRuneIds(result, t) {
  const out = new Set();
  if (!t || t.groups.length === 0) return out;
  const drawn = new Set(result.rows.map((r) => r.runeId));
  for (const g of t.groups) {
    for (const id of g) if (drawn.has(id)) out.add(id);
  }
  return out;
}

// ============================================================
// [정확 계산] 1회 성공확률
//
// 왕룬 후보 k 를 고정하면 나머지 7칸은 남은 29종에서의 균등 조합이다.
//   P(왕룬 = k) = 1/30,  그 조건 하에서 나머지 7개는 C(29,7) 중 균등.
// 각 k 마다 조건을 만족하는 7개 조합의 수를 배낭 DP 로 세고 확률을 더한다.
// ============================================================
export function successProbability(t) {
  if (!hasAnyCondition(t)) return 1;
  if (minRunesNeeded(t.groups, t.need) > K) return 0;

  const singleton = allSingleton(t.groups);
  // 룬 직접 지정인데 전부 등장시키기엔 자리가 모자란 경우
  if (singleton && t.need > K) return 0;

  let p = 0;

  for (let king = 0; king < N; king++) {
    if (t.kingId !== null && king !== t.kingId) continue;

    const kingSc = kingScoreOf(king);
    const thr = Math.max(0, t.minTotal - kingSc);

    // 왕룬이 이미 충족시킨 그룹
    let baseMask = 0;
    for (let gi = 0; gi < t.groups.length; gi++) {
      if (t.groups[gi].includes(king)) baseMask |= 1 << gi;
    }

    // 나머지 29종을 (점수, 소속 그룹 마스크) 로 환원
    const pool = [];
    for (let i = 0; i < N; i++) {
      if (i === king) continue;
      let mask = 0;
      for (let gi = 0; gi < t.groups.length; gi++) {
        if (t.groups[gi].includes(i)) mask |= 1 << gi;
      }
      pool.push({ score: RUNES[i].score, mask });
    }

    const ways = singleton
      ? countWaysSingleton(pool, thr, baseMask, t.need, t.groups.length)
      : countWaysMasked(pool, thr, baseMask, t.need, t.groups.length);

    if (ways > 0) p += (1 / N) * (ways / REST_TOTAL_WAYS);
  }

  return p;
}

// ── 고속 경로: 그룹이 전부 싱글톤이면 "몇 개 맞췄나" 카운트로 충분 ──
//    (한 룬이 두 번 뽑힐 수 없으므로 중복 집계가 발생하지 않는다)
function countWaysSingleton(pool, thr, baseMask, need, groupCount) {
  const already = popcount(baseMask);
  const needC = Math.max(0, need - already);
  const wantedCount = pool.reduce((s, it) => s + (it.mask ? 1 : 0), 0);
  if (needC > Math.min(REST, wantedCount)) return 0;

  const C = needC + 1; // c 는 needC 에서 클램프 ("이상" 조건)
  const S = thr + 1;   // s 도 thr 에서 클램프
  const stride = C * S;
  const dp = new Float64Array((REST + 1) * stride);
  dp[0] = 1;

  let filled = 0;
  for (const item of pool) {
    filled++;
    const jHi = Math.min(REST - 1, filled - 1);
    for (let j = jHi; j >= 0; j--) {
      const baseJ = j * stride;
      const baseJ1 = (j + 1) * stride;
      for (let c = 0; c < C; c++) {
        const rowC = baseJ + c * S;
        const nc = item.mask ? Math.min(needC, c + 1) : c;
        const rowNc = baseJ1 + nc * S;
        for (let s = 0; s < S; s++) {
          const v = dp[rowC + s];
          if (v === 0) continue;
          dp[rowNc + Math.min(thr, s + item.score)] += v;
        }
      }
    }
  }

  return dp[REST * stride + needC * S + thr];
}

// ── 일반 경로: 그룹이 겹칠 수 있으므로 충족된 그룹 집합을 비트마스크로 추적 ──
function countWaysMasked(pool, thr, baseMask, need, groupCount) {
  const M = 1 << groupCount;
  const S = thr + 1; // thr 에서 클램프
  const stride = M * S;
  const dp = new Float64Array((REST + 1) * stride);
  dp[baseMask * S] = 1; // j=0, mask=baseMask, s=0

  let filled = 0;
  for (const item of pool) {
    filled++;
    const jHi = Math.min(REST - 1, filled - 1);
    for (let j = jHi; j >= 0; j--) {
      const baseJ = j * stride;
      const baseJ1 = (j + 1) * stride;
      for (let m = 0; m < M; m++) {
        const rowM = baseJ + m * S;
        const rowNm = baseJ1 + (m | item.mask) * S;
        for (let s = 0; s < S; s++) {
          const v = dp[rowM + s];
          if (v === 0) continue;
          dp[rowNm + Math.min(thr, s + item.score)] += v;
        }
      }
    }
  }

  // 충족 그룹 수가 need 이상인 마스크만 합산
  let ways = 0;
  const baseJ = REST * stride;
  for (let m = 0; m < M; m++) {
    if (popcount(m) < need) continue;
    ways += dp[baseJ + m * S + thr];
  }
  return ways;
}

// ============================================================
// 달성 가능한 최대 총점 (UI 경고용)
//   목표 조건을 지킨 상태에서 나올 수 있는 최고 점수.
//   minTotal 이 이 값을 넘으면 아무리 돌려도 못 나온다.
// ============================================================
export function maxAchievableTotal(t) {
  if (minRunesNeeded(t.groups, t.need) > K) return null;

  const groupCount = t.groups.length;
  const M = 1 << groupCount;
  const NEG = -Infinity;
  let best = null;

  for (let king = 0; king < N; king++) {
    if (t.kingId !== null && king !== t.kingId) continue;

    let baseMask = 0;
    for (let gi = 0; gi < groupCount; gi++) {
      if (t.groups[gi].includes(king)) baseMask |= 1 << gi;
    }

    // maxSum[j][mask] — j개 골랐고 충족 그룹 집합이 mask 일 때의 최대 합
    const cur = Array.from({ length: REST + 1 }, () => new Float64Array(M).fill(NEG));
    cur[0][baseMask] = 0;

    for (let i = 0; i < N; i++) {
      if (i === king) continue;
      let mask = 0;
      for (let gi = 0; gi < groupCount; gi++) {
        if (t.groups[gi].includes(i)) mask |= 1 << gi;
      }
      const score = RUNES[i].score;
      for (let j = REST - 1; j >= 0; j--) {
        for (let m = 0; m < M; m++) {
          const v = cur[j][m];
          if (v === NEG) continue;
          const nm = m | mask;
          if (v + score > cur[j + 1][nm]) cur[j + 1][nm] = v + score;
        }
      }
    }

    let restBest = NEG;
    for (let m = 0; m < M; m++) {
      if (popcount(m) < t.need) continue;
      if (cur[REST][m] > restBest) restBest = cur[REST][m];
    }
    if (restBest === NEG) continue;

    const total = kingScoreOf(king) + restBest;
    if (best === null || total > best) best = total;
  }

  return best;
}

// ============================================================
// 목표 통계 — 정확 p + 기하분포 분위수 + 기대 비용
// ============================================================
export function computeTargetStats(t) {
  const p = successProbability(t);

  if (p <= 0) {
    return {
      p: 0,
      mean: Infinity,
      p50: Infinity, p90: Infinity, p99: Infinity, p999: Infinity,
      meanEly: Infinity,
    };
  }

  const log1mp = Math.log(1 - p);
  // p 가 1 이면 log1mp = -Infinity → 분위수 0회(=이미 달성) 로 떨어진다. 1회로 보정.
  const quantile = (q) =>
    Number.isFinite(log1mp) && log1mp < 0 ? Math.ceil(Math.log(1 - q) / log1mp) : 1;

  const mean = 1 / p;
  return {
    p,
    mean,
    p50: quantile(0.5),
    p90: quantile(0.9),
    p99: quantile(0.99),
    p999: quantile(0.999),
    meanEly: mean * ELY_PER_ROLL,
  };
}

// ============================================================
// 목표 도달까지 실제로 굴려보기 (1회 실행 캡처)
// ============================================================
export function simulateUntilTarget(t, maxTries = SAMPLE_MAX_TRIES) {
  let tries = 0;
  while (tries < maxTries) {
    const idx = drawIndexes();
    tries++;
    const result = buildResult(idx);
    if (matchesTarget(result, t)) {
      return { success: true, tries, result, ely: tries * ELY_PER_ROLL };
    }
  }
  return { success: false, tries: maxTries, result: null, ely: maxTries * ELY_PER_ROLL };
}

export { ELY_PER_ROLL, MAX_TOTAL, SAMPLE_MAX_TRIES };
