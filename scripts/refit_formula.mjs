/**
 * 라테일 전투력 공식 재학습 스크립트 (Node.js)
 *
 * Python(numpy/scipy) 의존성 없이 순수 Node.js로 V_RICH 모델의
 * 7개 파라미터를 Nelder-Mead 시뮬렉스 방법으로 최적화한다.
 *
 * 실행: node scripts/refit_formula.mjs
 * 옵션: --starts=N (기본 500), --seed=N
 *
 * 설계 노트:
 *   - 모든 파라미터에 양수 제약이 있어 log-space에서 최적화 (exp로 보장)
 *   - 다중 시작점으로 local minima 회피
 *   - D_crit이 너무 작아지면 (1 + 크댐/D_crit) ≈ 크댐/D_crit 으로 degenerate
 *     → 학습 모델 그대로 두되 다중 시작점이 합리적 영역에서 시작하도록 초기화
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, '../SAMPLE_DATA.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

// CLI 옵션
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a, true];
  })
);
const N_STARTS = Number(args.starts ?? 500);
const SEED = Number(args.seed ?? 42);

// ============================================================
// V_BIG2 모델 (8 파라미터 + D_pen 고정 상수)
// 게임 메커니즘: 사용자 도메인 지식 기반
//   - 근력/공격력/고댐 → attackBase (가산형)
//   - 크댐, 최소+최대뎀, 지배력, 근마, 관통 → 곱셈 항
//
// D_pen은 case2/case3/case4 페어 데이터(관통 ±1 → +0.812~0.818%) 세 독립
// 측정의 평균에서 25.0으로 도출되어 고정값으로 사용. 옵티마이저는 1차원
// 자유도로 degenerate solution(D_pen → 0)에 빠지기 쉬워 학습 매개변수에서 제외.
// 수련의방 버프로 최소뎀이 최대뎀을 초과하면 cap (calculateBattlePower와 동일 처리)
// ============================================================
const D_PEN_FIXED = 25.0;

// V_BIG3: K_mon × (일몬추+보몬추) 항 추가
function modelBig(d, p) {
  const [K0, K1, K2, Kmon, Dcrit, Ddmg, Ddom, Kgeunma, base] = p;
  const maxDmg = d.최대뎀;
  const minDmg = Math.min(d.최소뎀, maxDmg);
  const aBase =
    d.주스탯 * K0 +
    d.공격력 * K1 +
    d.고댐 * K2 +
    ((d.일몬추 || 0) + (d.보몬추 || 0)) * Kmon;
  if (aBase <= 0) return 0;
  return (
    aBase *
    (1 + d.크댐 / Dcrit) *
    (1 + (minDmg + maxDmg) / Ddmg) *
    (1 + (d.일몬지 + d.보몬지) / Ddom) *
    (1 + d.근마효율 * Kgeunma) *
    (1 + d.관통 / D_PEN_FIXED) *
    base
  );
}

// log-space loss: y = log(p) → p = exp(y) (양수 보장)
function lossLog(yvec, dataset) {
  const p = yvec.map(Math.exp);
  let err = 0;
  for (const d of dataset) {
    const pred = modelBig(d, p);
    if (!Number.isFinite(pred) || pred <= 0) return 1e10;
    const r = (pred - d.전투력) / d.전투력;
    err += r * r;
  }
  return err;
}

// ============================================================
// Nelder-Mead 시뮬렉스
// ============================================================
function nelderMead(f, x0, opts = {}) {
  const {
    alpha = 1,
    gamma = 2,
    rho = 0.5,
    sigma = 0.5,
    maxIter = 20000,
    tolFun = 1e-14,
    tolX = 1e-12,
    initStep = 0.1,
  } = opts;

  const n = x0.length;

  // 초기 simplex 생성
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i] = v[i] + (v[i] === 0 ? initStep : v[i] * initStep);
    simplex.push(v);
  }
  let scores = simplex.map(f);

  for (let iter = 0; iter < maxIter; iter++) {
    // 점수 오름차순 정렬
    const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
    simplex = idx.map((i) => simplex[i]);
    scores = idx.map((i) => scores[i]);

    // 수렴 검사
    const fSpread = Math.abs(scores[n] - scores[0]);
    if (fSpread < tolFun) break;
    let xSpread = 0;
    for (let j = 0; j < n; j++) {
      let mn = simplex[0][j];
      let mx = simplex[0][j];
      for (let i = 1; i <= n; i++) {
        if (simplex[i][j] < mn) mn = simplex[i][j];
        if (simplex[i][j] > mx) mx = simplex[i][j];
      }
      xSpread = Math.max(xSpread, mx - mn);
    }
    if (xSpread < tolX) break;

    // centroid (worst 제외)
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    // reflection
    const xr = centroid.map((c, j) => c + alpha * (c - simplex[n][j]));
    const fr = f(xr);

    if (fr < scores[0]) {
      // expansion
      const xe = centroid.map((c, j) => c + gamma * (xr[j] - c));
      const fe = f(xe);
      if (fe < fr) {
        simplex[n] = xe;
        scores[n] = fe;
      } else {
        simplex[n] = xr;
        scores[n] = fr;
      }
    } else if (fr < scores[n - 1]) {
      simplex[n] = xr;
      scores[n] = fr;
    } else {
      // contraction (외부 또는 내부)
      const useOuter = fr < scores[n];
      const target = useOuter ? xr : simplex[n];
      const xc = centroid.map((c, j) => c + rho * (target[j] - c));
      const fc = f(xc);
      if (fc < (useOuter ? fr : scores[n])) {
        simplex[n] = xc;
        scores[n] = fc;
      } else {
        // shrink
        for (let i = 1; i <= n; i++) {
          for (let j = 0; j < n; j++) {
            simplex[i][j] = simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]);
          }
          scores[i] = f(simplex[i]);
        }
      }
    }
  }

  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  return { x: simplex[idx[0]], fun: scores[idx[0]] };
}

// ============================================================
// 시드 가능한 PRNG
// ============================================================
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// 다중 시작점 최적화
// ============================================================
function optimize(dataset, nStarts) {
  // V_BIG3 초기 분포 (log-space)
  // K0 (주스탯), K1 (공격력), K2 (고댐), K_mon (일몬추+보몬추),
  // D_crit, D_dmg, D_dom, K_geunma, base (D_pen은 고정 상수 25)
  const ranges = [
    [0.5, 3],         // K0 (주스탯)
    [80, 200],        // K1 (공격력)
    [0.01, 5],        // K2 (고댐)
    [0.005, 1.5],     // K_mon (일몬추+보몬추, K2의 ~1/3 추정)
    [20, 200],        // D_crit (크댐 분모)
    [10, 100000],     // D_dmg (최소+최대뎀 분모, 광범위 탐색)
    [30, 500],        // D_dom (지배력 분모)
    [0.0001, 0.05],   // K_geunma (~0.0011 추정)
    [1e-7, 1e-3],     // base
  ];

  let bestLoss = Infinity;
  let bestParams = null;
  const rng = mulberry32(SEED);

  for (let s = 0; s < nStarts; s++) {
    const x0 = ranges.map(([lo, hi]) => Math.log(lo + (hi - lo) * rng()));
    const r = nelderMead((y) => lossLog(y, dataset), x0, {
      maxIter: 10000,
      initStep: 0.05,
    });
    if (r.fun < bestLoss) {
      bestLoss = r.fun;
      bestParams = r.x.map(Math.exp);
    }
  }
  return { params: bestParams, loss: bestLoss };
}

// ============================================================
// 결과 출력
// ============================================================
function printReport(label, params, dataset) {
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const rmse = Math.sqrt(
    dataset.reduce((acc, d) => {
      const r = (modelBig(d, params) - d.전투력) / d.전투력;
      return acc + r * r;
    }, 0) / dataset.length
  ) * 100;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`${label} | n=${dataset.length} | RMSE=${rmse.toFixed(4)}%`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`export const PHYSICAL_PARAMS = Object.freeze({`);
  console.log(`  K0: ${params[0].toExponential(8)},`);
  console.log(`  K1: ${params[1].toExponential(8)},`);
  console.log(`  K2: ${params[2].toExponential(8)},`);
  console.log(`  K_mon: ${params[3].toExponential(8)},  // V_BIG3 신규 (일몬추+보몬추)`);
  console.log(`  D_crit: ${params[4].toExponential(8)},`);
  console.log(`  D_dmg: ${params[5].toExponential(8)},`);
  console.log(`  D_dom: ${params[6].toExponential(8)},`);
  console.log(`  K_geunma: ${params[7].toExponential(8)},`);
  console.log(`  D_pen: ${D_PEN_FIXED},  // 고정 상수 (case2/case3 페어 데이터로 도출)`);
  console.log(`  base: ${params[8].toExponential(8)},`);
  console.log(`});\n`);

  let over5 = 0;
  for (const d of dataset) {
    const pred = modelBig(d, params);
    const err = ((pred - d.전투력) / d.전투력) * 100;
    const mark = Math.abs(err) < 2 ? '✓' : Math.abs(err) < 5 ? '⚠' : '✗';
    if (Math.abs(err) >= 5) over5++;
    console.log(
      `  ${mark} ${d.name.padEnd(22)}  예상 ${fmt(d.전투력).padStart(10)}  ` +
        `예측 ${fmt(pred).padStart(10)}  오차 ${err >= 0 ? '+' : ''}${err.toFixed(2)}%`
    );
  }
  console.log(`\n5% 초과: ${over5}/${dataset.length}`);
}

// ============================================================
// main
// ============================================================
function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  라테일 전투력 공식 재학습 (Node.js / Nelder-Mead)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`총 데이터: ${data.length}개`);

  const physical = data.filter((d) => d.type === 'P');
  const magic = data.filter((d) => d.type === 'M');
  console.log(`  - 물리: ${physical.length}개`);
  console.log(`  - 마법: ${magic.length}개`);
  console.log(`다중 시작점 횟수: ${N_STARTS}, 시드: ${SEED}`);
  console.log('학습 시작...');

  const t0 = Date.now();
  const physResult = optimize(physical, N_STARTS);
  console.log(`물리 학습 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  printReport('물리(P)', physResult.params, physical);

  if (magic.length >= 5) {
    const t1 = Date.now();
    const magResult = optimize(magic, N_STARTS);
    console.log(`\n마법 학습 완료 (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
    printReport('마법(M)', magResult.params, magic);
  } else {
    console.log(
      `\n📌 마법 데이터가 ${magic.length}개로 부족합니다 (5개 이상 권장).` +
        ` MAGIC_PARAMS는 PHYSICAL_PARAMS와 동일하게 유지합니다.`
    );
  }

  console.log('\n위 파라미터를 src/utils/battlePower.js의 PHYSICAL_PARAMS에 복사하세요.');
}

main();
