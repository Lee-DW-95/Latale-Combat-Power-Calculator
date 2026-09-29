/**
 * T창 캡처 인식 — 순수 함수 테스트 (OCR 자체는 브라우저 Tesseract 라 여기선 창 찾기·형식·검증·매핑만).
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { planCells, parseValue, crossCheck, toStats, vote, cleanOcr, pctOf, spaceDigits, resolveCross, sanityFlags, confusions } from '../src/utils/tchangOcr.js';

const tpl = JSON.parse(readFileSync(new URL('../src/data/tchangTemplates.json', import.meta.url), 'utf8'));
const png = PNG.sync.read(readFileSync(new URL('./fixtures/tchang-sample.png', import.meta.url)));
const sample = { width: png.width, height: png.height, data: png.data };

let pass = 0;
let fail = 0;
function check(name, cond, note = '') {
  if (cond) {
    pass += 1;
    console.log(`✓ PASS  ${name}${note ? `  (${note})` : ''}`);
  } else {
    fail += 1;
    console.log(`✗ FAIL  ${name}${note ? `  (${note})` : ''}`);
  }
}

// ── 창 찾기 ──
const p1 = planCells(sample, tpl.patches, 'P');
check('샘플: 두 창 위치 (0,0)', p1.panels.L?.dx === 0 && p1.panels.L?.dy === 0 && p1.panels.R?.dx === 0 && p1.panels.R?.dy === 0);
check('물리 칸 28개 (백어택·효율 두 칸 + 직접·소환 전투력)', p1.cells.length === 28, `${p1.cells.length}`);
check('마법 칸 (속성력·마법력 쪽)', planCells(sample, tpl.patches, 'M').cells.some((c) => c.key === 'L.속성력#0'));

// 두 번째 캡처 (예시 캐릭터, 크기 688×577 · 창이 1px 어긋남)
const png2 = PNG.sync.read(readFileSync(new URL('./fixtures/tchang-sample2.png', import.meta.url)));
const p3 = planCells({ width: png2.width, height: png2.height, data: png2.data }, tpl.patches, 'P');
check('두 번째 캡처: 창 위치 (1,1)', p3.panels.L?.dx === 1 && p3.panels.L?.dy === 1 && p3.panels.R?.dx === 1 && p3.panels.R?.dy === 1);
check('짧은 정수 칸은 글자 떼기 표시', p3.cells.filter((c) => c.spaced).map((c) => c.row).sort().join() === '관통력,근거리,백어택,백어택,상태');

// 흐리고 1~2% 늘어난 캡처 3장 — 창 위치와 배율 (두 기준 라벨 간격으로 추정)
for (const [f, sL, sR] of [['p3', 1.017, 1.016], ['p4', 1.011, 1.013], ['p5', 1.011, 1.013]]) {
  const q = PNG.sync.read(readFileSync(new URL(`./fixtures/tchang-${f}.png`, import.meta.url)));
  const r = planCells({ width: q.width, height: q.height, data: q.data }, tpl.patches, 'P');
  check(`흐린 캡처 ${f}: 두 창 + 배율`, Math.abs(r.panels.L?.s - sL) < 0.002 && Math.abs(r.panels.R?.s - sR) < 0.002, `L ${r.panels.L?.s?.toFixed(3)} R ${r.panels.R?.s?.toFixed(3)}`);
}

// 전체 화면 캡처 흉내 — 1920×1080 배경 한가운데 (613, 257) 에 샘플을 붙임
const W = 1920;
const H = 1080;
const big = { width: W, height: H, data: new Uint8Array(W * H * 4) };
for (let i = 0; i < W * H; i++) big.data.set([30 + (i % 7), 40, 50 + (i % 5), 255], i * 4);
for (let y = 0; y < sample.height; y++) {
  big.data.set(sample.data.subarray(y * sample.width * 4, (y + 1) * sample.width * 4), ((y + 257) * W + 613) * 4);
}
const t0 = Date.now();
const p2 = planCells(big, tpl.patches, 'P');
const ms = Date.now() - t0;
check('전체 화면에서 창 찾기', p2.panels.L?.dx === 613 && p2.panels.L?.dy === 257 && p2.panels.R?.dx === 613 && p2.panels.R?.dy === 257, `${ms}ms`);
check('창이 없는 이미지 → 못 찾음', (() => {
  const blank = { width: 400, height: 300, data: new Uint8Array(400 * 300 * 4).fill(90) };
  const p = planCells(blank, tpl.patches, 'P');
  return !p.panels.L && !p.panels.R && p.cells.length === 0;
})());

// ── 붙은 숫자 떼기: 5px 글자 둘이 한 열을 공유 (k=1) ──
{
  const w = 13;
  const h = 7;
  const g = new Uint8ClampedArray(w * h * 4).fill(255);
  const dot = (x, y) => g.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
  for (let y = 1; y < 6; y++) for (const x of [1, 5, 9]) dot(x, y); // 두 글자 테두리 (가운데 열 공유)
  for (let x = 1; x <= 9; x++) {
    dot(x, 1);
    dot(x, 5);
  }
  const r = spaceDigits(g, w, h, 1);
  check('붙은 두 글자를 떼어 폭이 늘어남', r.w > 9 + 6, `${r.w}px`);
}

// ── 형식 ──
check('정수', parseValue('9,379,856', 'int') === 9379856);
check('정수: 쉼표를 마침표로 읽어도', parseValue('9.379.856', 'int') === 9379856);
check('정수: 다른 기호 섞이면 거절', parseValue('9,37/9', 'int') === null);
check('지배력 소수 1자리', parseValue('55.5', 'dec') === 55.5 && parseValue('100.0', 'dec') === 100);
check('+값', parseValue('+1,423,347', 'plus') === 1423347 && parseValue('1,423,347', 'plus') === null);
check('+값 / %', parseValue('+6,718 / 46%', 'plusPct') === 6718 && pctOf('+6,718 / 46%') === 46);
check('%', parseValue('29%', 'pct') === 29);
check('범위', JSON.stringify(parseValue('50,664 ~ 51,848', 'range')) === '[50664,51848]');
check('범위 + 기호 선택', JSON.stringify(parseValue('+10,908~+11,181', 'range')) === '[10908,11181]');
check('범위: 역순 표시 허용 (기본 폭 < 15)', JSON.stringify(parseValue('52,179~52,169', 'range')) === '[52179,52169]');
check('범위: 10% 넘게 벌어지면 오인식', parseValue('52,179~12,169', 'range') === null);

// ── 다수결 ──
const v = vote(['539', '599', '593', '593', '593', '593', '539'].map(cleanOcr), 'int');
check('다수결 + 비율', v.text === '593' && v.votes === 4 && v.total === 7);
check('형식 안 맞는 읽기는 표에서 제외', vote(['9/8', '98', '98'], 'int').total === 2);

// ── 교차 검증: 표시값 ≈ 기본 × (100+%)/100 ──
const texts = { 'L.크댐#0': '9808', 'R.크댐#0': '+6718/46%', 'L.최대#0': '8385', 'R.최대#0': '+6033/39%', 'L.최소#0': '7792', 'R.최소#0': '+5488/42%' };
const cc = crossCheck(texts, 'P');
check('교차 검증 통과', cc.크댐 && cc.최대 && cc.최소);
check('교차 검증 실패 감지 (9808 → 9308)', crossCheck({ ...texts, 'L.크댐#0': '9308' }, 'P').크댐 === false);

// ── 교차 검증 실패 → 후보 중 맞는 짝으로 보정 (실제 사례: +7,126 을 +1,126 으로 읽음) ──
{
  const t = { 'L.최대#0': '9833', 'R.최대#0': '+1126/38%' };
  const reads = { 'L.최대#0': ['9833', '9833'], 'R.최대#0': ['+1126/38%', '+1126/38%', '+7126/38%', '+71126/38%'] };
  const fixed = resolveCross(reads, t, 'P');
  check('교차 검증으로 보정', t['R.최대#0'] === '+7126/38%' && fixed.join() === 'R.최대#0');
}

// ── 비슷한 숫자 한 자리 바꾸기로 교차 검증 보정 (흐린 7 → 1: 7278/5731 을 1218/5131 로 읽음) ──
{
  const t = { 'L.최대#0': '1218', 'R.최대#0': '+5131/27%' };
  const reads = { 'L.최대#0': ['1218', '1278'], 'R.최대#0': ['+5131/27%'] };
  resolveCross(reads, t, 'P');
  check('헷갈리는 숫자 치환으로 보정 (7278 · +5731)', t['L.최대#0'] === '7278' && t['R.최대#0'] === '+5731/27%', JSON.stringify(t));
  check('confusions: 한 자리씩', confusions('17').join() === '77,11');
}

// ── 상식 검사 ──
check('최소/최대 비율 이상 → 둘 다 표시', sanityFlags({ 'L.최소#0': 7832, 'L.최대#0': 1345, 'L.백어택#0': 7, 'L.백어택#1': 7, 'R.효율#0': 15, 'R.효율#1': 15 }, 'P').join() === 'L.최소#0,L.최대#0');
check('정상 최소/최대는 통과', sanityFlags({ 'L.최소#0': 7605, 'L.최대#0': 7278, 'L.백어택#0': 826, 'L.백어택#1': 825, 'R.효율#0': 15, 'R.효율#1': 15 }, 'P').length === 0);
const ok2 = { 'R.효율#0': 15, 'R.효율#1': 15 };
check('백어택 물리·마법 차이 → 표시', sanityFlags({ 'L.백어택#0': 124, 'L.백어택#1': 723, ...ok2 }, 'P').join() === 'L.백어택#0');
check('근마효율 두 칸 다르면 표시', sanityFlags({ 'L.백어택#0': 7, 'L.백어택#1': 7, 'R.효율#0': 3, 'R.효율#1': 37 }, 'P').join() === 'R.효율#0');
check('백어택 1 차이는 통과', sanityFlags({ 'L.백어택#0': 724, 'L.백어택#1': 723, ...ok2 }, 'P').length === 0);

// ── 매핑 ──
const s = toStats({ 'L.근력#0': 9379856, 'L.무기공격력#0': [50664, 51848], 'L.크댐#0': 9808, 'L.추가#0': 1, 'L.추가#1': 2, 'L.지배력#1': 100, 'R.무기공격력#0': [10908, 11181], 'R.효율#0': 29 }, 'P');
check('물리 매핑', s.주스탯 === 9379856 && s.무기공표시min === 50664 && s.공격력 === 51256 && s.크댐 === 9808 && s.일몬추 === 1 && s.보몬추 === 2 && s.보몬지 === 100 && s.기본_공격력 === 11044.5 && s.근마효율 === 29);
const m = toStats({ 'L.마법력#0': 9274908, 'L.속성력#0': 37614, 'L.크댐#1': 9207, 'R.속성력#0': 8510 }, 'M');
check('마법 매핑', m.주스탯 === 9274908 && m.공격력 === 37614 && m.크댐 === 9207 && m.기본_공격력 === 8510 && m.무기공표시min === undefined);

console.log('───────────────────────────────────────────────────');
console.log(fail ? `✗ ${fail}개 항목 실패 (통과 ${pass})` : `✓ T창 인식 전부 통과 (${pass})`);
if (fail) process.exit(1);
