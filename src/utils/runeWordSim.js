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
 * 목표 조건:
 *   룬 하나 = 옵션 하나다. 헌신(최소 +50%) / 파괴(최대 +50%) / 헌신 & 파괴(둘 다) 는
 *   서로 다른 옵션이므로 목표도 룬 id 로 그대로 지정한다.
 *   "여러 룬 중 아무거나" 는 그 룬들을 고르고 mode='atLeast' 로 표현한다.
 */

import {
  RUNES,
  RUNE_SLOTS,
  ELY_PER_ROLL,
  MAX_TOTAL,
  scoreOf,
  kingScoreOf,
  gradeOf,
  isMidRune,
  isMajorRune,
  displayDesc,
} from '../data/runeWordData.js';

// 목표 도달 시뮬 1회 실행의 안전 상한 (p 가 극히 작을 때 무한루프 방지)
const SAMPLE_MAX_TRIES = 2_000_000;

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
//   {
//     runeIds: number[],   // 원하는 룬(=옵션). 룬 하나가 곧 옵션 하나다.
//     mode: 'all' | 'atLeast',
//     atLeast: number,     // mode === 'atLeast' 일 때만
//     kingId: number|null, // 왕룬 지정 (null = 상관없음)
//     minTotal: number,    // 최소 총점 (0 = 조건 없음)
//   }
//
// "크리티컬 대미지만 붙으면 된다" 처럼 여러 룬 중 아무거나를 원하는 경우는
// 파멸 + 파멸 & 폭주 를 고르고 mode='atLeast', atLeast=1 로 표현한다.
// ============================================================
export function normalizeTarget(raw) {
  const runeIds = [...new Set((raw?.runeIds || []).map(Number))].filter(
    (id) => Number.isInteger(id) && id >= 0 && id < N
  );

  // 선택이 없으면 'N개 이상' 은 의미가 없다 — 'all'(=조건 없음) 으로 눕힌다
  const mode = runeIds.length > 0 && raw?.mode === 'atLeast' ? 'atLeast' : 'all';
  const atLeast =
    mode === 'atLeast'
      ? Math.max(1, Math.min(runeIds.length, Number(raw?.atLeast) || 1))
      : runeIds.length;

  const kingIdRaw = raw?.kingId;
  const kingId =
    kingIdRaw === null || kingIdRaw === undefined || kingIdRaw === '' ? null : Number(kingIdRaw);
  const minTotal = Math.max(0, Math.min(MAX_TOTAL, Math.floor(Number(raw?.minTotal) || 0)));

  return { runeIds, mode, atLeast, need: atLeast, kingId, minTotal };
}

export function hasAnyCondition(t) {
  return t.runeIds.length > 0 || t.kingId !== null || t.minTotal > 0;
}

// ============================================================
// 판정 — 뽑힌 결과가 목표를 만족하는가
// ============================================================
export function matchesTarget(result, t) {
  if (t.minTotal > 0 && result.total < t.minTotal) return false;

  const kingRow = result.rows[K - 1];
  if (t.kingId !== null && kingRow.runeId !== t.kingId) return false;

  if (t.runeIds.length > 0) {
    let hit = 0;
    for (const row of result.rows) {
      if (t.runeIds.includes(row.runeId)) hit++;
    }
    if (hit < t.need) return false;
  }
  return true;
}

// 결과에서 목표로 지정한 룬 중 실제로 뜬 것들 (UI 하이라이트용)
export function contributingRuneIds(result, t) {
  const out = new Set();
  if (!t || t.runeIds.length === 0) return out;
  for (const row of result.rows) {
    if (t.runeIds.includes(row.runeId)) out.add(row.runeId);
  }
  return out;
}

// ============================================================
// [정확 계산] 1회 성공확률
//
// 왕룬 후보 k 를 고정하면 나머지 7칸은 남은 29종에서의 균등 조합이다.
//   P(왕룬 = k) = 1/30,  그 조건 하에서 나머지 7개는 C(29,7) 중 균등.
// 각 k 마다 "목표 룬을 need 개 이상 포함 & 합이 thr 이상" 인 7개 조합의 수를
// 배낭 DP 로 세고 확률을 더한다.
//   dp[j][c][s] : j개 고름 / 목표 룬 c개 포함(need 에서 클램프) / 합 s(thr 에서 클램프)
// 클램프 덕분에 "이상" 조건이 마지막 칸 하나로 모인다.
// 룬은 중복해서 뽑히지 않으므로 카운트만으로 정확하다.
// ============================================================
// 왕룬을 king 으로 고정했을 때 나머지 7칸이 만족해야 하는 조건
//   pool     : 남은 29종 (id / score / 목표 룬 여부)
//   needRest : 나머지 7칸에서 채워야 할 목표 룬 개수
//   thr      : 나머지 7칸 점수 합의 하한
// 애초에 불가능하면 null.
function buildKingContext(t, king, wanted) {
  const thr = Math.max(0, t.minTotal - kingScoreOf(king));
  const needRest = Math.max(0, t.need - (wanted.has(king) ? 1 : 0));

  const pool = [];
  let poolWantedCount = 0;
  for (let i = 0; i < N; i++) {
    if (i === king) continue;
    const isWanted = wanted.has(i);
    if (isWanted) poolWantedCount++;
    pool.push({ id: i, score: RUNES[i].score, isWanted });
  }
  if (needRest > Math.min(REST, poolWantedCount)) return null;

  return { pool, needRest, thr };
}

// 왕룬 후보별 경우의 수 — 확률 계산과 조합 추출이 같은 표를 쓴다
function waysByKing(t) {
  const wanted = new Set(t.runeIds);
  const out = [];

  for (let king = 0; king < N; king++) {
    if (t.kingId !== null && king !== t.kingId) continue;
    const ctx = buildKingContext(t, king, wanted);
    if (!ctx) continue;
    const ways = countWays(ctx.pool, REST, ctx.needRest, ctx.thr);
    if (ways > 0) out.push({ king, ctx, ways });
  }
  return out;
}

export function successProbability(t) {
  if (!hasAnyCondition(t)) return 1;
  if (t.need > K) return 0;

  let p = 0;
  for (const { ways } of waysByKing(t)) {
    p += (1 / N) * (ways / REST_TOTAL_WAYS);
  }
  return p;
}

// ============================================================
// 목표를 만족하는 조합 하나를 균등 추출
//
// 확률이 낮으면(예: 평균 4천만 회) 실제로 굴려서는 만날 수 없다.
// 그래도 "그래서 어떤 룬워드가 나오는데?" 는 보여줘야 하므로,
// 조건을 만족하는 전체 경우 중에서 하나를 정확히 균등 추출한다.
//   ① 왕룬을 경우의 수에 비례해 고른다
//   ② 나머지 7칸은 DP 를 역방향으로 세워 조건부 균등 추출한다
// ============================================================
export function sampleSatisfyingResult(t) {
  if (!hasAnyCondition(t)) return rollRuneWord();
  if (t.need > K) return null;

  const candidates = waysByKing(t);
  const totalWays = candidates.reduce((s, c) => s + c.ways, 0);
  if (totalWays <= 0) return null;

  let r = Math.random() * totalWays;
  let chosen = candidates[candidates.length - 1];
  for (const c of candidates) {
    r -= c.ways;
    if (r <= 0) {
      chosen = c;
      break;
    }
  }

  const restIds = sampleRest(chosen.ctx, REST);
  if (restIds.length !== REST) return null;

  // 앞 7칸의 순서는 점수에 영향이 없지만 실제 뽑기처럼 섞어서 보여준다
  for (let i = restIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [restIds[i], restIds[j]] = [restIds[j], restIds[i]];
  }
  return buildResult([...restIds, chosen.king]);
}

// pool 에서 pick 개를 (목표 룬 needC개 이상, 합 thr 이상) 조건 하에 균등 추출.
//   g[i][j][c][s] = pool[i..] 에서 j개를 골라 최종적으로 (needC, thr) 에 도달하는 경우의 수
//   이 표를 앞에서부터 훑으며 "포함/제외" 를 경우의 수 비율대로 뽑으면 균등 추출이 된다.
function sampleRest(ctx, pick) {
  const { pool, needRest: needC, thr } = ctx;
  const n = pool.length;
  const C = needC + 1;
  const S = thr + 1;
  const stride = C * S;
  const layer = (pick + 1) * stride;
  const g = new Float64Array((n + 1) * layer);

  // 마지막 지점: 더 고를 것이 없고 (c, s) 가 목표에 도달해 있어야 한다
  g[n * layer + needC * S + thr] = 1;

  for (let i = n - 1; i >= 0; i--) {
    const it = pool[i];
    const nc0 = it.isWanted ? 1 : 0;
    for (let j = 0; j <= pick; j++) {
      for (let c = 0; c < C; c++) {
        const nc = Math.min(needC, c + nc0);
        for (let s = 0; s < S; s++) {
          let v = g[(i + 1) * layer + j * stride + c * S + s]; // 제외
          if (j > 0) {
            const ns = Math.min(thr, s + it.score);
            v += g[(i + 1) * layer + (j - 1) * stride + nc * S + ns]; // 포함
          }
          g[i * layer + j * stride + c * S + s] = v;
        }
      }
    }
  }

  const out = [];
  let j = pick;
  let c = 0;
  let s = 0;
  for (let i = 0; i < n && j > 0; i++) {
    const it = pool[i];
    const nc = it.isWanted ? Math.min(needC, c + 1) : c;
    const ns = Math.min(thr, s + it.score);
    const inc = g[(i + 1) * layer + (j - 1) * stride + nc * S + ns];
    const exc = g[(i + 1) * layer + j * stride + c * S + s];
    const tot = inc + exc;
    if (tot <= 0) break;
    if (Math.random() * tot < inc) {
      out.push(it.id);
      j--;
      c = nc;
      s = ns;
    }
  }
  return out;
}

// pool 에서 정확히 pick 개를 골라, 목표 룬을 needC 개 이상 포함하고 합이 thr 이상인 경우의 수
function countWays(pool, pick, needC, thr) {
  const C = needC + 1; // c 는 needC 에서 클램프 ("이상" 조건)
  const S = thr + 1;   // s 도 thr 에서 클램프
  const stride = C * S;
  const dp = new Float64Array((pick + 1) * stride);
  dp[0] = 1;

  let filled = 0;
  for (const item of pool) {
    filled++;
    const jHi = Math.min(pick - 1, filled - 1);
    for (let j = jHi; j >= 0; j--) {
      const baseJ = j * stride;
      const baseJ1 = (j + 1) * stride;
      for (let c = 0; c < C; c++) {
        const rowC = baseJ + c * S;
        const nc = item.isWanted ? Math.min(needC, c + 1) : c;
        const rowNc = baseJ1 + nc * S;
        for (let s = 0; s < S; s++) {
          const v = dp[rowC + s];
          if (v === 0) continue;
          dp[rowNc + Math.min(thr, s + item.score)] += v;
        }
      }
    }
  }

  return dp[pick * stride + needC * S + thr];
}

// ============================================================
// 달성 가능한 최대 총점 (UI 경고용)
//   목표 조건을 지킨 상태에서 나올 수 있는 최고 점수.
//   minTotal 이 이 값을 넘으면 아무리 돌려도 못 나온다.
// ============================================================
export function maxAchievableTotal(t) {
  if (t.need > K) return null;

  const wanted = new Set(t.runeIds);
  const NEG = -Infinity;
  let best = null;

  for (let king = 0; king < N; king++) {
    if (t.kingId !== null && king !== t.kingId) continue;

    const needRest = Math.max(0, t.need - (wanted.has(king) ? 1 : 0));
    const C = needRest + 1;

    // cur[j][c] — j개 골랐고 목표 룬을 c개(needRest 클램프) 포함했을 때의 최대 합
    const cur = Array.from({ length: REST + 1 }, () => new Float64Array(C).fill(NEG));
    cur[0][0] = 0;

    for (let i = 0; i < N; i++) {
      if (i === king) continue;
      const isWanted = wanted.has(i);
      const score = RUNES[i].score;
      for (let j = REST - 1; j >= 0; j--) {
        for (let c = 0; c < C; c++) {
          const v = cur[j][c];
          if (v === NEG) continue;
          const nc = isWanted ? Math.min(needRest, c + 1) : c;
          if (v + score > cur[j + 1][nc]) cur[j + 1][nc] = v + score;
        }
      }
    }

    const restBest = cur[REST][needRest];
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
