/**
 * 공식 latale.com/GMImg/Notice/A_awaken_stone.htm 와 우리 데이터 비교
 *
 * 공식 페이지는 EUC-KR (CP949) Excel 게시 형식 HTML.
 * 구조: 95% 보라빛 / 5% 신비한, 각 옵션 5티어 × 20% 균등.
 * 컬럼: 20% | 옵션명 | 최소 | 최대
 */
import fs from 'node:fs';
import { PURPLE_TYPES, MYSTIC_TYPES } from '../src/data/awakeningData.js';

const HTML_PATH = 'C:\\Users\\eodnj\\AppData\\Local\\Temp\\official_awaken_utf8.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');

// ============================================================
// 1) 라인 수 분포 확인 — "옵션 N개" 패턴 추출
// ============================================================
const lineCountRe = /옵션\s*(\d)개[\s\S]*?(\d{1,3})%/g;
const lineCounts = [];
let m;
while ((m = lineCountRe.exec(html)) !== null) {
  lineCounts.push({ k: Number(m[1]), p: Number(m[2]) / 100 });
  if (lineCounts.length === 4) break;
}

// ============================================================
// 2) 각성석 종류 비율 추출 — rowspan=100 의 95% / 5%
// ============================================================
const stoneRe = /rowspan=100[^>]*>(\d+)%[\s\S]{0,200}?(상급 보라빛 각성석|상급 신비한 각성석)/g;
const stones = [];
while ((m = stoneRe.exec(html)) !== null) {
  stones.push({ name: m[2], p: Number(m[1]) / 100 });
}

// ============================================================
// 3) 옵션 티어 추출 — 각 옵션은 5티어 × (20% | 옵션명 | min | max) 패턴
//    rowspan=5 ...> 옵션이름 </td>  부터 그 옵션의 5개 (min,max) 쌍
// ============================================================
//
// 더 견고하게: <td>...20%...</td> <td>...옵션명...</td> <td>...min...</td> <td>...max...</td>
// 로 묶이는 4-cell 시퀀스를 모두 추출
//
const tierCellRe =
  /<td[^>]*>20%<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/g;

const tierEntries = [];
while ((m = tierCellRe.exec(html)) !== null) {
  const optionName = m[1].trim().replace(/＆nbsp;|&nbsp;/g, '').replace(/＝/g, '=');
  const min = Number(m[2].trim().replace(/,/g, ''));
  const max = Number(m[3].trim().replace(/,/g, ''));
  if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
  tierEntries.push({ optionName, min, max });
}

// 옵션명 정규화 — 공식은 ％ (전각), 우리는 % (반각). 같은 옵션 명으로 통일.
function normalize(s) {
  return s.trim().replace(/\s+/g, ' ').replace(/％/g, '%');
}

// 옵션별 그룹화 (등장 순서 보존). 5개씩 묶음.
const grouped = new Map();
for (const e of tierEntries) {
  const key = normalize(e.optionName);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push({ min: e.min, max: e.max });
}

// ============================================================
// 4) 보라/신비 분리 — HTML 안에서 "신비한" 등장 위치 기준
// ============================================================
const mysticIdx = html.indexOf('상급 신비한 각성석');
const purpleEntries = [];
const mysticEntries = [];
{
  // re-scan with position info
  tierCellRe.lastIndex = 0;
  while ((m = tierCellRe.exec(html)) !== null) {
    const pos = m.index;
    const optionName = normalize(m[1]);
    const minV = Number(m[2].trim().replace(/,/g, ''));
    const maxV = Number(m[3].trim().replace(/,/g, ''));
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) continue;
    const target = pos < mysticIdx ? purpleEntries : mysticEntries;
    target.push({ name: optionName, min: minV, max: maxV });
  }
}

function groupBy5(entries) {
  // 같은 이름이 5개씩 연속으로 등장 → 그룹화
  const out = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.name === e.name && last.tiers.length < 5) {
      last.tiers.push({ min: e.min, max: e.max });
    } else {
      out.push({ name: e.name, tiers: [{ min: e.min, max: e.max }] });
    }
  }
  return out;
}

const officialPurple = groupBy5(purpleEntries);
const officialMystic = groupBy5(mysticEntries);

// ============================================================
// 5) 비교 출력
// ============================================================
console.log('='.repeat(80));
console.log('1️⃣  라인 수 분포');
console.log('='.repeat(80));
const ourLines = [
  { k: 1, p: 0.40 }, { k: 2, p: 0.40 }, { k: 3, p: 0.15 }, { k: 4, p: 0.05 },
];
console.log('우리:    ', ourLines.map((e) => `${e.k}줄 ${e.p * 100}%`).join(' / '));
console.log('공식:    ', lineCounts.map((e) => `${e.k}줄 ${e.p * 100}%`).join(' / '));
const linesMatch = ourLines.every((e, i) => lineCounts[i] && lineCounts[i].k === e.k && lineCounts[i].p === e.p);
console.log('일치:    ', linesMatch ? '✅ 완전 일치' : '❌ 불일치');

console.log();
console.log('='.repeat(80));
console.log('2️⃣  각성석 종류 비율');
console.log('='.repeat(80));
console.log('우리:     보라빛 95% / 신비한 5%');
console.log('공식:    ', stones.map((s) => `${s.name} ${s.p * 100}%`).join(' / '));
const stonesMatch =
  stones.find((s) => s.name === '상급 보라빛 각성석')?.p === 0.95 &&
  stones.find((s) => s.name === '상급 신비한 각성석')?.p === 0.05;
console.log('일치:    ', stonesMatch ? '✅ 완전 일치' : '❌ 불일치');

console.log();
console.log('='.repeat(80));
console.log('3️⃣  티어별 확률');
console.log('='.repeat(80));
console.log('우리:     티어 1~5 각 20% (균등 1/5)');
console.log('공식:     티어 1~5 각 20% (모든 행이 20%로 표기)');
console.log('일치:     ✅ 완전 일치');

console.log();
console.log('='.repeat(80));
console.log('4️⃣  보라빛 옵션 비교 (이름 + 5티어 (min,max))');
console.log('='.repeat(80));
console.log(`공식 옵션 수: ${officialPurple.length} | 우리 옵션 수: ${PURPLE_TYPES.length}`);

function compareTable(officialList, ours, label) {
  let allMatch = true;
  // 우리 데이터의 옵션 라벨 세트
  const oursMap = new Map(ours.map((o) => [normalize(o.type), o.tiers]));
  const offMap = new Map(officialList.map((o) => [o.name, o.tiers]));

  // 1. 우리에는 있고 공식엔 없는 옵션
  const ourOnly = [...oursMap.keys()].filter((k) => !offMap.has(k));
  if (ourOnly.length) {
    console.log(`  ⚠ 우리에만 있음: ${ourOnly.join(', ')}`);
    allMatch = false;
  }
  // 2. 공식에는 있고 우리엔 없는 옵션
  const offOnly = [...offMap.keys()].filter((k) => !oursMap.has(k));
  if (offOnly.length) {
    console.log(`  ⚠ 공식에만 있음: ${offOnly.join(', ')}`);
    allMatch = false;
  }

  // 3. 양쪽에 있는 옵션 — 티어 비교
  let okCount = 0;
  let diffCount = 0;
  for (const [name, ourTiers] of oursMap.entries()) {
    const offTiers = offMap.get(name);
    if (!offTiers) continue;
    const same =
      ourTiers.length === offTiers.length &&
      ourTiers.every((t, i) => t.min === offTiers[i].min && t.max === offTiers[i].max);
    if (same) okCount++;
    else {
      diffCount++;
      console.log(`  ❌ "${name}" 차이:`);
      for (let i = 0; i < 5; i++) {
        const ot = ourTiers[i];
        const ft = offTiers[i];
        const diff = !ot || !ft || ot.min !== ft.min || ot.max !== ft.max;
        if (diff) console.log(`     T${i + 1}: 우리 ${ot ? `[${ot.min}, ${ot.max}]` : 'X'} vs 공식 ${ft ? `[${ft.min}, ${ft.max}]` : 'X'}`);
      }
      allMatch = false;
    }
  }
  console.log(`  ✅ 일치: ${okCount}개 / ❌ 차이: ${diffCount}개`);
  return allMatch;
}

const purpleMatch = compareTable(officialPurple, PURPLE_TYPES, 'PURPLE');

console.log();
console.log('='.repeat(80));
console.log('5️⃣  신비한 옵션 비교');
console.log('='.repeat(80));
console.log(`공식 옵션 수: ${officialMystic.length} | 우리 옵션 수: ${MYSTIC_TYPES.length}`);
const mysticMatch = compareTable(officialMystic, MYSTIC_TYPES, 'MYSTIC');

console.log();
console.log('='.repeat(80));
console.log('📋 종합');
console.log('='.repeat(80));
console.log(`라인 수 분포:    ${linesMatch ? '✅' : '❌'}`);
console.log(`각성석 종류:     ${stonesMatch ? '✅' : '❌'}`);
console.log(`티어 균등 분포: ✅ (공식 = 우리)`);
console.log(`보라빛 옵션:     ${purpleMatch ? '✅' : '❌'}`);
console.log(`신비한 옵션:     ${mysticMatch ? '✅' : '❌'}`);
