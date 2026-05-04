/**
 * 직접/소환 split 회귀 잔차 분석.
 *
 * 1. 현재 박제된 (SPLIT_U=0.69167, SPLIT_V=73.951) 으로 직/소 BP 예측
 * 2. 실측 직접타격/소환타격 과 비교 → per-item residual + RMSE
 * 3. 잔차 큰 항목 top 5 (outlier 후보) 노출
 * 4. (u, v) 만 자유롭게 두고 OLS 재학습 → 개선 여지 측정
 * 5. K0, K1 까지 자유롭게 두는 4-param OLS — 평균 BP 정확도 손실 vs split RMSE 개선 trade-off
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(here, '..', 'SAMPLE_DATA.json'), 'utf8'));

// 현재 박제된 파라미터
const PHYSICAL = {
  K0: 1.48838356, K1: 146.221296, K2: 1.28057007, K_mon: 0.404390549,
  D_crit: 226.209973, D_dmg: 1.94551489e-34, D_dom: 188.920615,
  K_geunma: 1.01531112e-3, D_pen: 25.0, base: 6.18437351e-42,
};
const MAGIC = { ...PHYSICAL, K1: 147.5487 };
const SPLIT_U_FIXED = 0.69167;
const SPLIT_V_FIXED = 73.951;

function multiplierFor(s) {
  const p = s.type === 'M' ? MAGIC : PHYSICAL;
  const minDmg = Math.min(s.최소뎀, s.최대뎀);
  const crit = 1 + s.크댐 / p.D_crit;
  const dmg = 1 + (minDmg + s.최대뎀) / p.D_dmg;
  const dom = 1 + (s.일몬지 + s.보몬지) / p.D_dom;
  const geunma = 1 + s.근마효율 * p.K_geunma;
  const pen = 1 + s.관통 / p.D_pen;
  return crit * dmg * dom * geunma * pen * p.base;
}

function attackBase(s, alpha, beta) {
  const p = s.type === 'M' ? MAGIC : PHYSICAL;
  return alpha * s.주스탯 + beta * s.공격력 + p.K2 * s.고댐 + p.K_mon * (s.일몬추 + s.보몬추);
}

// split 데이터만 필터
const splitData = data.filter((d) => d.직접타격 != null && d.소환타격 != null);
console.log(`split 데이터: ${splitData.length}건 (P ${splitData.filter((d) => d.type === 'P').length} / M ${splitData.filter((d) => d.type === 'M').length})`);

function evalSplit(uVal, vVal, label) {
  let sumDir = 0, sumSum = 0, sumAvg = 0;
  let n = 0;
  const rows = [];
  for (const s of splitData) {
    const p = s.type === 'M' ? MAGIC : PHYSICAL;
    const M = multiplierFor(s);
    const ab_d = attackBase(s, p.K0 - uVal, p.K1 + vVal);
    const ab_s = attackBase(s, p.K0 + uVal, p.K1 - vVal);
    const pred_d = ab_d * M;
    const pred_s = ab_s * M;
    const pred_avg = (pred_d + pred_s) / 2;
    const errD = (pred_d - s.직접타격) / s.직접타격;
    const errS = (pred_s - s.소환타격) / s.소환타격;
    const errA = (pred_avg - s.전투력) / s.전투력;
    sumDir += errD * errD;
    sumSum += errS * errS;
    sumAvg += errA * errA;
    n++;
    rows.push({ name: s.name, type: s.type, errD, errS, errA });
  }
  const rmseD = Math.sqrt(sumDir / n) * 100;
  const rmseS = Math.sqrt(sumSum / n) * 100;
  const rmseA = Math.sqrt(sumAvg / n) * 100;
  console.log(`\n[${label}] u=${uVal.toFixed(5)}, v=${vVal.toFixed(4)}`);
  console.log(`   직접 RMSE: ${rmseD.toFixed(3)}%   소환 RMSE: ${rmseS.toFixed(3)}%   평균 RMSE: ${rmseA.toFixed(3)}%`);
  return { rows, rmseD, rmseS, rmseA };
}

// (1) 현재 박제 평가
const cur = evalSplit(SPLIT_U_FIXED, SPLIT_V_FIXED, '현재 박제 (origin/main)');

// (2) (u, v) 자유롭게 OLS 재학습 — 평균 제약 유지
// ab_d - ab_s = -2u·근력 + 2v·공격력
// y = (ab_d_actual - ab_s_actual) / M — 근력·공격력 으로 OLS
let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
// y = -2u·x1 + 2v·x2  → 표준 OLS
let m11 = 0, m12 = 0, m22 = 0;
let b1 = 0, b2 = 0;
for (const s of splitData) {
  const M = multiplierFor(s);
  const y = (s.직접타격 - s.소환타격) / M;
  const x1 = s.주스탯;  // 계수 = -2u
  const x2 = s.공격력;  // 계수 = +2v
  m11 += x1 * x1;
  m12 += x1 * x2;
  m22 += x2 * x2;
  b1 += x1 * y;
  b2 += x2 * y;
}
// 2x2 normal eq: [m11 m12; m12 m22] [a; b] = [b1; b2]
const det = m11 * m22 - m12 * m12;
const a = (m22 * b1 - m12 * b2) / det;
const b = (m11 * b2 - m12 * b1) / det;
const uOpt = -a / 2;
const vOpt = b / 2;
console.log(`\n[OLS 재학습] (u,v) 만 자유:  u=${uOpt.toFixed(5)}  v=${vOpt.toFixed(4)}`);
const refit = evalSplit(uOpt, vOpt, 'OLS 재학습');

// (3) 잔차 큰 항목 top 5
console.log('\n[현재 박제 기준 잔차 큰 top 8]');
const sorted = [...cur.rows].sort((a, b) => Math.max(Math.abs(b.errD), Math.abs(b.errS)) - Math.max(Math.abs(a.errD), Math.abs(a.errS)));
for (const r of sorted.slice(0, 8)) {
  console.log(`   ${r.name.padEnd(24)} (${r.type})  직 ${(r.errD * 100).toFixed(2).padStart(7)}%   소 ${(r.errS * 100).toFixed(2).padStart(7)}%   평 ${(r.errA * 100).toFixed(2).padStart(7)}%`);
}

// (4) 새 (u, v) 로 재학습 후 잔차 큰 항목
console.log('\n[OLS 재학습 후 잔차 큰 top 8]');
const sorted2 = [...refit.rows].sort((a, b) => Math.max(Math.abs(b.errD), Math.abs(b.errS)) - Math.max(Math.abs(a.errD), Math.abs(a.errS)));
for (const r of sorted2.slice(0, 8)) {
  console.log(`   ${r.name.padEnd(24)} (${r.type})  직 ${(r.errD * 100).toFixed(2).padStart(7)}%   소 ${(r.errS * 100).toFixed(2).padStart(7)}%   평 ${(r.errA * 100).toFixed(2).padStart(7)}%`);
}

// ============================================================
// (5) 4-param OLS — 평균 제약 유지하며 (근력·공격력·고댐·추가댐) 모두 split
//
// ab_d - ab_s = -2u·근력 + 2v·공격력 - 2w·고댐 - 2x·추가댐
//   즉 직접 BP 가중치: K0-u, K1+v, K2-w, K_mon-x
//      소환 BP 가중치: K0+u, K1-v, K2+w, K_mon+x
//   평균 제약: (직+소)/2 = K0·근력 + K1·공격력 + K2·고댐 + K_mon·추가댐 (불변)
// ============================================================
function evalSplit4(u, v, w, x, label) {
  let sumDir = 0, sumSum = 0, sumAvg = 0, n = 0;
  const rows = [];
  for (const s of splitData) {
    const p = s.type === 'M' ? MAGIC : PHYSICAL;
    const M = multiplierFor(s);
    const ab_d = (p.K0 - u) * s.주스탯 + (p.K1 + v) * s.공격력 + (p.K2 - w) * s.고댐 + (p.K_mon - x) * (s.일몬추 + s.보몬추);
    const ab_s = (p.K0 + u) * s.주스탯 + (p.K1 - v) * s.공격력 + (p.K2 + w) * s.고댐 + (p.K_mon + x) * (s.일몬추 + s.보몬추);
    const pred_d = ab_d * M;
    const pred_s = ab_s * M;
    const pred_avg = (pred_d + pred_s) / 2;
    const errD = (pred_d - s.직접타격) / s.직접타격;
    const errS = (pred_s - s.소환타격) / s.소환타격;
    const errA = (pred_avg - s.전투력) / s.전투력;
    sumDir += errD * errD;
    sumSum += errS * errS;
    sumAvg += errA * errA;
    n++;
    rows.push({ name: s.name, type: s.type, errD, errS, errA });
  }
  const rmseD = Math.sqrt(sumDir / n) * 100;
  const rmseS = Math.sqrt(sumSum / n) * 100;
  const rmseA = Math.sqrt(sumAvg / n) * 100;
  console.log(`\n[${label}] u=${u.toFixed(5)}, v=${v.toFixed(4)}, w=${w.toFixed(5)}, x=${x.toFixed(5)}`);
  console.log(`   직접 RMSE: ${rmseD.toFixed(3)}%   소환 RMSE: ${rmseS.toFixed(3)}%   평균 RMSE: ${rmseA.toFixed(3)}%`);
  return { rows, rmseD, rmseS, rmseA };
}

// 4x4 OLS — y = -2u·근력 + 2v·공격력 - 2w·고댐 - 2x·추가댐
//   양변 / 2 후 [-u, v, -w, -x] = inv(X'X) · X'·(y/2)
// 부호를 정리해 일관성 있게: y/2 = (-u)·근력 + v·공격력 + (-w)·고댐 + (-x)·추가댐
// 4개 변수 OLS 풀이
function solve4(splitData, multiplierFor) {
  const X = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const Y = [0,0,0,0];
  for (const s of splitData) {
    const M = multiplierFor(s);
    const y = (s.직접타격 - s.소환타격) / (2 * M);
    const xs = [s.주스탯, s.공격력, s.고댐, s.일몬추 + s.보몬추];
    for (let i = 0; i < 4; i++) {
      Y[i] += xs[i] * y;
      for (let j = 0; j < 4; j++) X[i][j] += xs[i] * xs[j];
    }
  }
  // 4x4 가우스 소거
  const A = X.map((row, i) => [...row, Y[i]]);
  for (let i = 0; i < 4; i++) {
    let pivot = i;
    for (let k = i + 1; k < 4; k++) if (Math.abs(A[k][i]) > Math.abs(A[pivot][i])) pivot = k;
    [A[i], A[pivot]] = [A[pivot], A[i]];
    for (let k = i + 1; k < 4; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < 5; j++) A[k][j] -= f * A[i][j];
    }
  }
  const c = [0,0,0,0];
  for (let i = 3; i >= 0; i--) {
    let sum = A[i][4];
    for (let j = i + 1; j < 4; j++) sum -= A[i][j] * c[j];
    c[i] = sum / A[i][i];
  }
  // c = [-u, v, -w, -x]
  return { u: -c[0], v: c[1], w: -c[2], x: -c[3] };
}
const sol = solve4(splitData, multiplierFor);
console.log(`\n[4-param OLS — full precision] u=${sol.u}  v=${sol.v}  w=${sol.w}  x=${sol.x}`);
console.log(`[4-param OLS — display]        u=${sol.u.toFixed(5)}  v=${sol.v.toFixed(4)}  w=${sol.w.toFixed(5)}  x=${sol.x.toFixed(5)}`);
const refit4 = evalSplit4(sol.u, sol.v, sol.w, sol.x, '4-param OLS');

console.log('\n[4-param 후 잔차 큰 top 8]');
const sorted4 = [...refit4.rows].sort((a, b) => Math.max(Math.abs(b.errD), Math.abs(b.errS)) - Math.max(Math.abs(a.errD), Math.abs(a.errS)));
for (const r of sorted4.slice(0, 8)) {
  console.log(`   ${r.name.padEnd(24)} (${r.type})  직 ${(r.errD * 100).toFixed(2).padStart(7)}%   소 ${(r.errS * 100).toFixed(2).padStart(7)}%   평 ${(r.errA * 100).toFixed(2).padStart(7)}%`);
}

// ============================================================
// (6) outlier 제거 — 자료6, 자료7 빼고 (u, v) 재학습
//   자료6: 직≈소 (선형 모델 표현 불가)
//   자료7: 부호 뒤집힘 (선형 모델 표현 불가)
//   순수 신호만으로 split 회귀가 얼마나 깨끗해지는지 측정
// ============================================================
const outlierNames = new Set(['자료6_세이버', '자료7_사용자캡쳐']);
const cleanData = splitData.filter((d) => !outlierNames.has(d.name));
function solve2(d, M) {
  let m11=0, m12=0, m22=0, b1=0, b2=0;
  for (const s of d) {
    const Mv = M(s);
    const y = (s.직접타격 - s.소환타격) / Mv;
    const x1 = s.주스탯, x2 = s.공격력;
    m11 += x1*x1; m12 += x1*x2; m22 += x2*x2;
    b1 += x1*y; b2 += x2*y;
  }
  const det = m11*m22 - m12*m12;
  return { u: -(m22*b1 - m12*b2)/det/2, v: (m11*b2 - m12*b1)/det/2 };
}
const cleanSol = solve2(cleanData, multiplierFor);
console.log(`\n[outlier 제거 (자료6/자료7) 후 (u,v) OLS] u=${cleanSol.u.toFixed(5)}  v=${cleanSol.v.toFixed(4)}`);
// clean fit 으로 전체 22건 평가
evalSplit(cleanSol.u, cleanSol.v, 'clean(u,v) → 전체 22건 평가');
