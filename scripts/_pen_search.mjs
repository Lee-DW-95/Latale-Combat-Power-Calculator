// ⚠ 패치 이전 데이터 분석 — 2026-08~09 패치 뒤 전투력은 관통 99 고정이라 현재 공식엔 관통 기울기가 쓰이지 않는다.
// 관통 배수를 직접·소환 따로 — 배수 ∝ (c + 관통). 현재는 둘 다 c = 25 (= 1 + 4·관통/100 의 비례형)
//   c 를 직접·소환 각각 격자 탐색하고, 그때마다 선형 계수를 다시 맞춰 빼고학습 오차를 본다.
import { readFileSync } from 'node:fs';
import { createEmptyStats } from '../src/utils/battlePower.js';
import { PHYS } from './_phys5.mjs';
const base = 1.078e-8;
const sample = JSON.parse(readFileSync('SAMPLE_DATA.json', 'utf8'));
const DATA = [];
for (const d of sample) { if (!d.직접타격 || !d.소환타격) continue; if (d.type === 'P' && !['기존4', '기존5', 'img15_로그깜슬'].includes(d.name)) continue; DATA.push({ ...createEmptyStats(d.type), ...d, 직접: d.직접타격, 소환: d.소환타격 }); }
for (const c of PHYS) DATA.push({ ...c });
const find = (n) => PHYS.find((p) => p.name === n);
const shared = (c) => ({ 일몬추: c.일몬추, 보몬추: c.보몬추, 일몬지: c.일몬지, 보몬지: c.보몬지, 근마효율: c.근마효율 });
for (const [n, m] of Object.entries({
  캡처3: { 주스탯: 6689243, 공격력: 74603, 관통: 99, 크댐: 9681, 최소뎀: 7784, 최대뎀: 7935, 고댐: 966854, 직접: 4592593, 소환: 4300821 },
  캡처4: { 주스탯: 7113559, 공격력: 69291, 관통: 98, 크댐: 9817, 최소뎀: 8040, 최대뎀: 8087, 고댐: 976373, 직접: 4591387, 소환: 4559077 },
  '캡처5(기존1)': { 주스탯: 4525193, 공격력: 55556, 관통: 97, 크댐: 8441, 최소뎀: 7852, 최대뎀: 7424, 고댐: 802634, 직접: 2524266, 소환: 2313733 },
})) DATA.push({ ...createEmptyStats('M'), ...shared(find(n)), ...m, type: 'M', name: n + '(마법)' });

const Mx = (s, mode, c) => {
  const crit = mode === 'summon' ? 1 + Math.floor(s.크댐) * 0.0148 : 1 + Math.floor(s.크댐) / 100;
  return crit * (Math.min(s.최소뎀, s.최대뎀) + s.최대뎀) * (1 + (s.일몬지 + s.보몬지) / 200) * ((c + s.관통) / (c + 98)) * base;
};
const feats = (s, mode) => { const add = s.고댐 + (s.일몬추 + s.보몬추) / 2; const f = [s.주스탯, s.공격력, add]; if (mode === 'direct') f.push(s.주스탯 * (s.근마효율 || 0) / 100); return f; };
function solve(rows, mode, c) {
  const n = mode === 'direct' ? 4 : 3; const A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (const s of rows) { const y = (mode === 'direct' ? s.직접 : s.소환) / Mx(s, mode, c); const f = feats(s, mode), w = 1 / (y * y);
    for (let i = 0; i < n; i++) { b[i] += w * f[i] * y; for (let j = 0; j < n; j++) A[i][j] += w * f[i] * f[j]; } }
  const G = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(G[r][i]) > Math.abs(G[p][i])) p = r; [G[i], G[p]] = [G[p], G[i]];
    for (let r = 0; r < n; r++) if (r !== i) { const f = G[r][i] / G[i][i]; for (let q = i; q <= n; q++) G[r][q] -= f * G[i][q]; } }
  return G.map((r, i) => r[n] / r[i]);
}
const pred = (s, mode, k, c) => Math.floor(feats(s, mode).reduce((a, f, i) => a + Math.floor(k[i] * f), 0) * Mx(s, mode, c));
const err = (p, y) => (p / y - 1) * 100;
function score(mode, c, loo = false) {
  let ss = 0, mx = 0;
  DATA.forEach((s, i) => { const k = solve(loo ? DATA.filter((_, j) => j !== i) : DATA, mode, c); const e = err(pred(s, mode, k, c), mode === 'direct' ? s.직접 : s.소환); ss += e * e; mx = Math.max(mx, Math.abs(e)); });
  return { rmse: Math.sqrt(ss / DATA.length), max: mx };
}
for (const mode of ['direct', 'summon']) {
  let best = null;
  for (let c = -40; c <= 200; c += 1) { const r = score(mode, c); if (!best || r.rmse < best.rmse) best = { c, ...r }; }
  let fine = best;
  for (let c = best.c - 1; c <= best.c + 1; c += 0.05) { const r = score(mode, c); if (r.rmse < fine.rmse) fine = { c, ...r }; }
  const cur = score(mode, 25, true), bl = score(mode, fine.c, true);
  console.log(`${mode === 'direct' ? '직접' : '소환'}: 현재 c=25 빼고학습 RMSE ${cur.rmse.toFixed(4)}% (최대 ${cur.max.toFixed(3)}%)  →  최적 c=${fine.c.toFixed(2)} 빼고학습 RMSE ${bl.rmse.toFixed(4)}% (최대 ${bl.max.toFixed(3)}%)`);
}

// ── 깔끔한 상수 후보: 배수 = 1 + 관통·k/100  (c = 100/k) ──
console.log('\n후보 (빼고학습 RMSE / 최대)');
for (const [mode, ks] of [['direct', [4, 4.25, 4.4, 4.5, 4.4444]], ['summon', [2.5, 3, 3.0303, 3.1, 3.2, 4]]]) {
  for (const k of ks) { const r = score(mode, 100 / k, true); console.log(`${mode === 'direct' ? '직접' : '소환'} k=${k} (c=${(100 / k).toFixed(2)})  ${r.rmse.toFixed(4)}% / ${r.max.toFixed(3)}%`); }
}
// 관통 분포
const cnt = {}; for (const s of DATA) cnt[s.관통] = (cnt[s.관통] || 0) + 1; console.log('관통 분포', JSON.stringify(cnt));

// ── 관통 보정(직접 k=4.4, 소환 k=3) 후 남은 잔차의 상관 ──
{
  const cD = 100 / 4.4, cS = 100 / 3;
  const kD = solve(DATA, 'direct', cD), kS = solve(DATA, 'summon', cS);
  const uniq = DATA.filter((s) => !/자료2[0-3]_/.test(s.name) || /기준|깡크댐-10$/.test(s.name));
  const ed = uniq.map((s) => err(pred(s, 'direct', kD, cD), s.직접)), es = uniq.map((s) => err(pred(s, 'summon', kS, cS), s.소환));
  const cand = { 크댐: (s) => s.크댐, 관통: (s) => s.관통, '최소/최대': (s) => s.최소뎀 / s.최대뎀, 지배력평균: (s) => (s.일몬지 + s.보몬지) / 2,
    '일몬추-보몬추': (s) => s.일몬추 - s.보몬추, 효율: (s) => s.근마효율 || 0, '주스탯/공격력': (s) => s.주스탯 / s.공격력, 공격력: (s) => s.공격력, 최대뎀: (s) => s.최대뎀, '고댐/주스탯': (s) => s.고댐 / s.주스탯, 타입M: (s) => (s.type === 'M' ? 1 : 0) };
  const corr = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };
  console.log(`\n관통 보정 후 잔차 상관 (${uniq.length}건) [직접 / 소환]`);
  for (const [k, f] of Object.entries(cand)) { const x = uniq.map(f); console.log(k.padEnd(12), corr(x, ed).toFixed(2).padStart(6), corr(x, es).toFixed(2).padStart(6)); }
  uniq.forEach((s, i) => console.log('  ', s.type, String(s.name).padEnd(22), '관통', s.관통, '직접', ed[i].toFixed(3).padStart(7), '소환', es[i].toFixed(3).padStart(7)));
}

// ── 부작용 점검: 새 공식(관통 분리 + 재적합 계수)으로 종합 전투력 ──
{
  const cD = 100 / 4.4, cS = 100 / 3;
  const kD = solve(DATA, 'direct', cD), kS = solve(DATA, 'summon', cS);
  console.log('\n새 계수 직접', kD.map((v) => v.toPrecision(7)).join(' / '), '| 소환', kS.map((v) => v.toPrecision(7)).join(' / '));
  const { calculateBattlePower } = await import('../src/utils/battlePower.js');
  const newBP = (s) => Math.floor((pred(s, 'direct', kD, cD) + pred(s, 'summon', kS, cS)) / 2);
  const all = sample.map((d) => ({ ...createEmptyStats(d.type), ...d }));
  const rm = (arr) => Math.sqrt(arr.reduce((a, e) => a + e * e, 0) / arr.length).toFixed(4) + '%';
  for (const [label, rows] of [['마법 전체', all.filter((s) => s.type === 'M')], ['물리 중간값 기록(무공범위/기존4·5·img15)', all.filter((s) => s.type === 'P' && (['기존4', '기존5', 'img15_로그깜슬'].includes(s.name) || s.무기공표시min))], ['물리 max 기록(레거시)', all.filter((s) => s.type === 'P' && !['기존4', '기존5', 'img15_로그깜슬'].includes(s.name) && !s.무기공표시min)]]) {
    const e0 = rows.map((s) => err(calculateBattlePower(s, 'base'), s.전투력)), e1 = rows.map((s) => err(newBP(s), s.전투력));
    console.log(`${label} ${rows.length}건  종합 RMSE 현재 ${rm(e0)} → 새 공식 ${rm(e1)}`);
  }
  // DB 덤프(서버 characters 표를 JSON 으로 받은 것)가 있으면 실측 캐릭터도 비교 — DB_DUMP=경로
  const db = process.env.DB_DUMP ? JSON.parse(readFileSync(process.env.DB_DUMP, 'utf8')) : { chars: [] };
  if (db.chars.length) console.log('DB 실측 캐릭터');
  for (const c of db.chars) { const st = c.stats; if (!Number(st.실측전투력) || !Number(st.주스탯)) continue; const s = { ...createEmptyStats(c.type), ...st, type: c.type };
    console.log('  ', c.owner, c.name, '현재', err(calculateBattlePower(s, 'base'), st.실측전투력).toFixed(3) + '%', '→ 새', err(newBP(s), st.실측전투력).toFixed(3) + '%'); }
  for (const c of PHYS) console.log('  캡처', c.name, '직접', err(pred(c, 'direct', kD, cD), c.직접).toFixed(3), '소환', err(pred(c, 'summon', kS, cS), c.소환).toFixed(3));
}
