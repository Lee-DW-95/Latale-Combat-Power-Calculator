// 물리 소환 계수 재적합 — 소환 BP = floor(ab_s × M_s), ab_s = a·α_s·근력 + b·β_s·무공 + c·(γ_s·고댐 + γ_s/2·추가)
import { readFileSync } from 'node:fs';
import { calculateSummonBP, calculateDirectBP, createEmptyStats } from '../src/utils/battlePower.js';
import { PHYS } from './_phys5.mjs';
const legacy = JSON.parse(readFileSync('SAMPLE_DATA.json', 'utf8')).filter((d) => ['기존4', '기존5', 'img15_로그깜슬'].includes(d.name))
  .map((d) => ({ ...createEmptyStats('P'), ...d, 직접: d.직접타격, 소환: d.소환타격 }));
const DATA = [...PHYS, ...legacy];
// 모델 내부 재현
const K0 = 1.4776987, K1 = 187.1796, K2 = 1.1689487, UR = 0.373001, VR = 0.692369, WR = 0.193495, base = 1.078e-8;
const M_s = (s) => (1 + Math.floor(s.크댐) * 0.0148) * (Math.min(s.최소뎀, s.최대뎀) + s.최대뎀) * (1 + (s.일몬지 + s.보몬지) / 200) * (1 + Math.floor(s.관통 / 25 * 100) / 100) * base;
const terms = (s) => [K0 * (1 + UR) * s.주스탯, K1 * (1 - VR) * s.공격력, K2 * (1 + WR) * (s.고댐 + (s.일몬추 + s.보몬추) / 2)];
const pred = (s, k) => Math.floor(terms(s).reduce((a, t, i) => a + Math.floor(k[i] * t), 0) * M_s(s));
// 선형 최소제곱 (상대오차 가중): target = 소환/M_s ≈ Σ k_i t_i
function fit(rows) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  for (const s of rows) { const t = terms(s); const y = s.소환 / M_s(s); const w = 1 / (y * y);
    for (let i = 0; i < 3; i++) { b[i] += w * t[i] * y; for (let j = 0; j < 3; j++) A[i][j] += w * t[i] * t[j]; } }
  // 3x3 가우스 소거
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) { let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c]; } }
  return M.map((r, i) => r[3] / r[i]);
}
const e = (p, y) => ((p / y - 1) * 100);
console.log('현재 모델 재현 확인:', DATA.map((s) => pred(s, [1, 1, 1]) === calculateSummonBP(s) ? 'ok' : `${pred(s, [1, 1, 1])}≠${calculateSummonBP(s)}`).join(' '));
const k = fit(DATA);
console.log('전체 적합 배율 [근력, 무공, 고댐·추가]', k.map((v) => v.toFixed(5)).join(', '));
let before = 0, after = 0, loo = 0;
for (let i = 0; i < DATA.length; i++) {
  const s = DATA[i]; const kl = fit(DATA.filter((_, j) => j !== i));
  const e0 = e(calculateSummonBP(s), s.소환), e1 = e(pred(s, k), s.소환), e2 = e(pred(s, kl), s.소환);
  before += e0 ** 2; after += e1 ** 2; loo += e2 ** 2;
  console.log(s.name.padEnd(14), '현재', e0.toFixed(3).padStart(7), '| 재적합', e1.toFixed(3).padStart(7), '| 빼고 학습→예측', e2.toFixed(3).padStart(7));
}
const r = (x) => Math.sqrt(x / DATA.length).toFixed(4) + '%';
console.log('소환 RMSE  현재', r(before), ' 재적합', r(after), ' LOO', r(loo));
