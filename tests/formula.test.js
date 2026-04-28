/**
 * 공식 정확도 검증 테스트
 *
 * SAMPLE_DATA.json의 15개 케이스에 대해 calculateBattlePower의 결과가
 * 실제 T창 전투력과 얼마나 일치하는지 측정한다.
 *
 * 실행: node tests/formula.test.js
 *   - 외부 테스트 러너 의존성 없이 순수 Node로 동작
 *   - 물리 직업(P): 5% 초과 시 FAIL → exit 1
 *   - 마법 직업(M): 데이터 부족이 알려져 있어 통계만 출력하고 게이트하지 않음
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { calculateBattlePower } from '../src/utils/battlePower.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, '../SAMPLE_DATA.json');
const samples = JSON.parse(readFileSync(dataPath, 'utf-8'));

const PHYS_FAIL_THRESHOLD = 5;   // 물리: 5% 초과 시 빌드 실패
const PASS_THRESHOLD = 2.5;      // 2.5% 이내면 ✓PASS, 초과는 ⚠WARN

const fmt = (n) => n.toLocaleString('ko-KR');
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const stats = {
  P: { count: 0, sumSq: 0, max: 0, fail: 0, warn: 0, pass: 0 },
  M: { count: 0, sumSq: 0, max: 0, fail: 0, warn: 0, pass: 0 },
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('  라테일 전투력 공식 정확도 검증');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

for (const s of samples) {
  const expected = s.전투력;
  const actual = calculateBattlePower(s);
  const diff = actual - expected;
  const errorPercent = (diff / expected) * 100;
  const absErrorPct = Math.abs(errorPercent);

  const grp = stats[s.type];
  grp.count++;
  grp.sumSq += errorPercent ** 2;
  if (absErrorPct > grp.max) grp.max = absErrorPct;

  const isPhys = s.type === 'P';
  let status;
  if (isPhys && absErrorPct > PHYS_FAIL_THRESHOLD) {
    status = '✗ FAIL';
    grp.fail++;
  } else if (absErrorPct > PASS_THRESHOLD) {
    status = '⚠ WARN';
    grp.warn++;
  } else {
    status = '✓ PASS';
    grp.pass++;
  }

  console.log(
    `${status}  [${s.type}] ${s.name.padEnd(22)} ` +
      `예상=${fmt(expected).padStart(10)}  ` +
      `계산=${fmt(actual).padStart(10)}  ` +
      `오차=${pct(errorPercent).padStart(8)}`
  );
}

const rmse = (g) => (g.count > 0 ? Math.sqrt(g.sumSq / g.count) : 0);

console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log(`물리(P) ${stats.P.count}건  RMSE=${rmse(stats.P).toFixed(3)}%  최대=${stats.P.max.toFixed(3)}%  PASS=${stats.P.pass}  WARN=${stats.P.warn}  FAIL=${stats.P.fail}`);
console.log(`마법(M) ${stats.M.count}건  RMSE=${rmse(stats.M).toFixed(3)}%  최대=${stats.M.max.toFixed(3)}%  PASS=${stats.M.pass}  WARN=${stats.M.warn}  (마법은 게이트 제외)`);
console.log('═══════════════════════════════════════════════════════════════');

if (stats.P.fail > 0) {
  console.error(`\n❌ 물리 직업에서 ${stats.P.fail}건이 허용 오차(${PHYS_FAIL_THRESHOLD}%)를 초과했습니다.`);
  process.exit(1);
} else {
  console.log('\n✅ 물리 직업은 모두 허용 오차 이내. 마법 직업은 데이터 부족으로 알려진 한계입니다.');
  process.exit(0);
}
