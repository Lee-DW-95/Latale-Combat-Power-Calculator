// 잔차 패턴 진단 — 어떤 변수와 잔차가 상관관계 있는지 확인
import { readFileSync } from 'node:fs';
import {
  calculateBattlePower, calculateDirectBP, calculateSummonBP,
} from '../src/utils/battlePower.js';

const sample = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));

// 수련의방 제외 + 직타/소타 보유 케이스만
const cases = sample.filter((d) => d.직접타격 && d.소환타격 && d.최소뎀 <= d.최대뎀);

const rows = cases.map((d) => {
  const tot = calculateBattlePower(d, 'base');
  const dir = calculateDirectBP(d, 'base');
  const sum = calculateSummonBP(d);
  return {
    name: d.name,
    type: d.type,
    근마: d.근마효율,
    관통: d.관통,
    근력: d.주스탯,
    공격력: d.공격력,
    e_tot: (tot - d.전투력) / d.전투력 * 100,
    e_dir: (dir - d.직접타격) / d.직접타격 * 100,
    e_sum: (sum - d.소환타격) / d.소환타격 * 100,
    d: d,
  };
});

// 종합 잔차 절대값 큰 순으로 정렬
const byAbs = [...rows].sort((a, b) => Math.abs(b.e_tot) - Math.abs(a.e_tot));

console.log('━ 종합 BP 잔차 큰 순 ━');
console.log('case               근마 관통    근력      공격력   |  e_종합     e_직     e_소  ');
for (const r of byAbs) {
  const sign = (v) => (v >= 0 ? '+' : '') + v.toFixed(3) + '%';
  console.log(
    `${r.name.padEnd(20)} ${String(r.근마).padStart(2)}  ${String(r.관통).padStart(2)}  ${r.근력.toLocaleString().padStart(10)} ${r.공격력.toString().padStart(7)} | ${sign(r.e_tot).padStart(8)} ${sign(r.e_dir).padStart(8)} ${sign(r.e_sum).padStart(8)}`
  );
}

// 잔차 vs 특정 변수 상관관계
function correl(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const numericVars = ['근마효율', '관통', '주스탯', '공격력', '크댐', '최소뎀', '최대뎀', '고댐', '일몬추', '보몬추', '일몬지', '보몬지'];
console.log('\n━ 잔차 vs 변수 피어슨 상관계수 (|r| > 0.4 면 의심) ━');
for (const v of numericVars) {
  const xs = rows.map((r) => Number(r.d[v] || 0));
  const yt = rows.map((r) => r.e_tot);
  const yd = rows.map((r) => r.e_dir);
  const ys = rows.map((r) => r.e_sum);
  const rt = correl(xs, yt);
  const rd = correl(xs, yd);
  const rs = correl(xs, ys);
  const mark = (v) => Math.abs(v) > 0.4 ? '⚠' : ' ';
  console.log(`  ${v.padEnd(8)}  e_tot=${rt.toFixed(2)}${mark(rt)}  e_dir=${rd.toFixed(2)}${mark(rd)}  e_sum=${rs.toFixed(2)}${mark(rs)}`);
}

// 누적% 도 — display/base 가 둘 다 있는 케이스 한정
const withBase = rows.filter((r) => r.d.기본_주스탯);
if (withBase.length > 0) {
  console.log(`\n━ 누적% (base 보유 케이스 ${withBase.length}건) vs 잔차 ━`);
  const cumKeys = ['주스탯', '공격력', '크댐', '최소뎀', '최대뎀', '고댐', '일몬추', '보몬추'];
  for (const k of cumKeys) {
    const cum = withBase.map((r) => (r.d[k] - r.d[`기본_${k}`]) / r.d[`기본_${k}`] * 100);
    const yt = withBase.map((r) => r.e_tot);
    const yd = withBase.map((r) => r.e_dir);
    console.log(`  누적% ${k.padEnd(6)} mean ${(cum.reduce((a, b) => a + b, 0) / cum.length).toFixed(1)}%   범위 [${Math.min(...cum).toFixed(0)}, ${Math.max(...cum).toFixed(0)}]   r(e_tot)=${correl(cum, yt).toFixed(2)}`);
  }
}
