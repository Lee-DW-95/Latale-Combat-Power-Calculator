// 직접·소환 분리 계수 재적합 — 직접/소환 전투력 = floor(ab × M), ab 는 계수에 대해 선형
//   직접 ab = a_d·주스탯 + b_d·공격력 + c_d·(고댐 + 추가/2) + k·주스탯·효율/100
//   소환 ab = a_s·주스탯 + b_s·공격력 + c_s·(고댐 + 추가/2)
// 대상: 직접·소환 실측이 있고 입력이 믿을 만한 캐릭터 (마법 24 + 오늘 마법 3 + 물리 8)
import { readFileSync } from 'node:fs';
import { calculateDirectBP, calculateSummonBP, createEmptyStats } from '../src/utils/battlePower.js';
import { PHYS } from './_phys5.mjs';

const base = 1.078e-8;
const M = (s, mode) => {
  const crit = mode === 'summon' ? 1 + Math.floor(s.크댐) * 0.0148 : 1 + Math.floor(s.크댐) / 100;
  return crit * (Math.min(s.최소뎀, s.최대뎀) + s.최대뎀) * (1 + (s.일몬지 + s.보몬지) / 200) * (1 + Math.floor(s.관통 / 25 * 100) / 100) * base;
};
const sample = JSON.parse(readFileSync('SAMPLE_DATA.json', 'utf8'));
const DATA = [];
for (const d of sample) {
  if (!d.직접타격 || !d.소환타격) continue;
  if (d.type === 'P' && !['기존4', '기존5', 'img15_로그깜슬'].includes(d.name)) continue; // 무기공 max 기록 물리 제외
  DATA.push({ ...createEmptyStats(d.type), ...d, 직접: d.직접타격, 소환: d.소환타격, src: 'SAMPLE' });
}
for (const c of PHYS) DATA.push({ ...c, src: '오늘' });
const shared = (c) => ({ 일몬추: c.일몬추, 보몬추: c.보몬추, 일몬지: c.일몬지, 보몬지: c.보몬지, 근마효율: c.근마효율 });
const find = (n) => PHYS.find((p) => p.name === n);
for (const [n, m] of Object.entries({
  캡처3: { 주스탯: 6689243, 공격력: 74603, 관통: 99, 크댐: 9681, 최소뎀: 7784, 최대뎀: 7935, 고댐: 966854, 직접: 4592593, 소환: 4300821 },
  캡처4: { 주스탯: 7113559, 공격력: 69291, 관통: 98, 크댐: 9817, 최소뎀: 8040, 최대뎀: 8087, 고댐: 976373, 직접: 4591387, 소환: 4559077 },
  '캡처5(기존1)': { 주스탯: 4525193, 공격력: 55556, 관통: 97, 크댐: 8441, 최소뎀: 7852, 최대뎀: 7424, 고댐: 802634, 직접: 2524266, 소환: 2313733 },
})) DATA.push({ ...createEmptyStats('M'), ...shared(find(n)), ...m, type: 'M', name: n + '(마법)', src: '오늘' });

const feats = (s, mode) => {
  const add = (s.고댐 || 0) + ((s.일몬추 || 0) + (s.보몬추 || 0)) / 2;
  const f = [s.주스탯, s.공격력, add];
  if (mode === 'direct') f.push(s.주스탯 * (s.근마효율 || 0) / 100);
  return f;
};
function solve(rows, mode) {
  const n = mode === 'direct' ? 4 : 3;
  const A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (const s of rows) {
    const y = (mode === 'direct' ? s.직접 : s.소환) / M(s, mode);
    const f = feats(s, mode), w = 1 / (y * y);
    for (let i = 0; i < n; i++) { b[i] += w * f[i] * y; for (let j = 0; j < n; j++) A[i][j] += w * f[i] * f[j]; }
  }
  const G = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(G[r][i]) > Math.abs(G[p][i])) p = r; [G[i], G[p]] = [G[p], G[i]];
    for (let r = 0; r < n; r++) if (r !== i) { const f = G[r][i] / G[i][i]; for (let c = i; c <= n; c++) G[r][c] -= f * G[i][c]; }
  }
  return G.map((r, i) => r[n] / r[i]);
}
const predict = (s, mode, k) => Math.floor(feats(s, mode).reduce((a, f, i) => a + Math.floor(k[i] * f), 0) * M(s, mode));
const err = (p, y) => (p / y - 1) * 100;
const kd = solve(DATA, 'direct'), ks = solve(DATA, 'summon');
// 현재 모델 계수 (비교용)
const K0 = 1.4776987, K1 = 187.1796, K2 = 1.1689487, UR = 0.373001, VR = 0.692369, WR = 0.193495, KC = 0.9255529;
console.log('직접 계수  현재', [K0 * (1 - UR), K1 * (1 + VR), K2 * (1 - WR), KC].map((v) => v.toFixed(5)).join(' / '));
console.log('직접 계수  적합', kd.map((v) => v.toFixed(5)).join(' / '));
console.log('소환 계수  현재', [K0 * (1 + UR), K1 * (1 - VR), K2 * (1 + WR)].map((v) => v.toFixed(5)).join(' / '));
console.log('소환 계수  적합', ks.map((v) => v.toFixed(5)).join(' / '));
let s0d = 0, s0s = 0, s1d = 0, s1s = 0, sld = 0, sls = 0, maxd = 0, maxs = 0;
const lines = [];
DATA.forEach((s, i) => {
  const rest = DATA.filter((_, j) => j !== i);
  const kdl = solve(rest, 'direct'), ksl = solve(rest, 'summon');
  const e0d = err(calculateDirectBP(s, 'base'), s.직접), e0s = err(calculateSummonBP(s), s.소환);
  const e1d = err(predict(s, 'direct', kd), s.직접), e1s = err(predict(s, 'summon', ks), s.소환);
  const eld = err(predict(s, 'direct', kdl), s.직접), els = err(predict(s, 'summon', ksl), s.소환);
  s0d += e0d ** 2; s0s += e0s ** 2; s1d += e1d ** 2; s1s += e1s ** 2; sld += eld ** 2; sls += els ** 2;
  maxd = Math.max(maxd, Math.abs(eld)); maxs = Math.max(maxs, Math.abs(els));
  lines.push(`${s.type} ${String(s.name).padEnd(24)} 현재 ${e0d.toFixed(3).padStart(7)} ${e0s.toFixed(3).padStart(7)} | 빼고학습 ${eld.toFixed(3).padStart(7)} ${els.toFixed(3).padStart(7)}`);
});
const r = (x) => Math.sqrt(x / DATA.length).toFixed(4) + '%';
console.log(lines.join('\n'));
console.log(`\n${DATA.length}건  직접 RMSE 현재 ${r(s0d)} → 적합 ${r(s1d)} → 빼고학습 ${r(sld)} (최대 ${maxd.toFixed(3)}%)`);
console.log(`       소환 RMSE 현재 ${r(s0s)} → 적합 ${r(s1s)} → 빼고학습 ${r(sls)} (최대 ${maxs.toFixed(3)}%)`);

// ── 잔차가 어떤 스탯과 같이 움직이는지 (통제 실험 중복은 1건만) ──
const uniq = DATA.filter((s, i) => !/자료2[0-3]_/.test(s.name) || /기준|깡크댐-10$/.test(s.name));
const cand = {
  크댐: (s) => s.크댐, 관통: (s) => s.관통, '최소/최대': (s) => s.최소뎀 / s.최대뎀, 지배력평균: (s) => (s.일몬지 + s.보몬지) / 2,
  '일몬지-보몬지': (s) => s.일몬지 - s.보몬지, '일몬추-보몬추': (s) => s.일몬추 - s.보몬추, 효율: (s) => s.근마효율 || 0,
  '주스탯/공격력': (s) => s.주스탯 / s.공격력, '고댐/주스탯': (s) => s.고댐 / s.주스탯, 최대뎀: (s) => s.최대뎀, 공격력: (s) => s.공격력, 주스탯: (s) => s.주스탯,
};
const corr = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const ed = uniq.map((s) => err(calculateDirectBP(s, 'base'), s.직접)), es = uniq.map((s) => err(calculateSummonBP(s), s.소환));
console.log(`\n잔차 상관 (${uniq.length}건)  [직접 / 소환]`);
for (const [k, f] of Object.entries(cand)) { const x = uniq.map(f); console.log(k.padEnd(12), corr(x, ed).toFixed(2).padStart(6), corr(x, es).toFixed(2).padStart(6)); }
console.log('직접·소환 잔차끼리', corr(ed, es).toFixed(2));
