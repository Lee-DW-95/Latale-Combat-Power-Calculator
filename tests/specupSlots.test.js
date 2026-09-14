/**
 * 스펙업 방향 분석 — 설명자 경로 동일성 검증
 *
 * 실행: node tests/specupSlots.test.js (순수 Node, 러너 의존성 없음)
 *
 * SpecupAdvisorPanel 은 워커로 보내기 위해 rollFn/normalize 함수 대신 직렬화 가능한 "설명자"
 * (kind/memorialKey/lines …)를 만들고, 계산 쪽이 specupSlots.resolveSlot 으로 함수를 복원한다.
 * 이 테스트는 설명자 → resolveSlot → analyzeSlots 경로가 기존 방식(함수 슬롯을 analyzeSlots 에
 * 직접 넘김)과 같은 입력에서 같은 결과를 내는지 확인한다.
 *
 * 표본 평균·개선 확률은 난수라 실행마다 달라지므로 비교 대상은 결정적인 값만:
 *   슬롯 수 / id·group 순서 / current(현재 카드 환산) / costEly / conv.lines 수 / empty
 * 추가로 설명자가 JSON 왕복(postMessage 직렬화 대용)을 거쳐도 같은 결과가 나오는지 본다.
 */

import { createSampleStats } from '../src/data/sampleStats.js';
import { ALL_MEMORIALS } from '../src/data/memorialProbabilities.js';
import { rollOnce as rollAwakening } from '../src/utils/awakeningSim.js';
import { rollOnce as rollMemorial } from '../src/utils/memorialSim.js';
import { rollRuneWord } from '../src/utils/runeWordSim.js';
import {
  normalizeAwakeningCard,
  normalizeAwakStoneLoadout,
  normalizeMemorialCard,
  normalizeRuneWordCard,
} from '../src/utils/rollEquiv.js';
import { runewordRows } from '../src/utils/runewordLoadout.js';
import { analyzeSlots } from '../src/utils/specupAdvisor.js';
import { pickLines, resolveSlot, analyzeSlotDescriptors, runeScoreSamples } from '../src/utils/specupSlots.js';

let failures = 0;
function check(name, cond, note = '') {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}${note ? `  (${note})` : ''}`);
  if (!cond) failures++;
}

console.log('═══════════════════════════════════════════════════');
console.log('  스펙업 방향 — 설명자(resolveSlot) 경로 동일성');
console.log('═══════════════════════════════════════════════════');

const stats = createSampleStats();
const SAMPLES = 300; // 분포 자체는 비교하지 않으므로 최소치 근처로

// ── 입력: 각성석 2개(하나는 빈 슬롯) · 세트 메모리얼 1장 · 일반 메모리얼 슬롯 1개 · 룬워드 ──
const stones = [
  { options: [{ stat: '크댐', unit: 'raw', value: 112 }, { stat: '주스탯', unit: 'pct', value: 3 }] },
  { options: [{ stat: '크댐', unit: 'raw', value: 0 }] },
];
const setCard = { key: 'CHOENPAM_SET', lines: [{ label: '최종 크리티컬 대미지', value: 12 }, { label: '올스탯%', value: 4 }] };
const normalLine = { label: '근력/마법력', value: 700 };
const runeword = [10, 19, null, null, null, null, null, 28];

// ── 기존 방식: 함수 슬롯 ──
function legacySlots() {
  const setM = ALL_MEMORIALS.CHOENPAM_SET;
  const normM = ALL_MEMORIALS.MUWEN_NORMAL;
  return [
    ...stones.map((stone, i) => ({
      id: `awak-${i}`, label: `각성석 ${i + 1}`, group: 'awakening',
      lines: normalizeAwakStoneLoadout(stone),
      rollFn: rollAwakening, normalize: normalizeAwakeningCard,
      cost: '재료 14 (2종×7) · 망치 1', costEly: 185_000_000,
    })),
    {
      id: 'memo-0', label: '초엔팜 #1', group: 'memorial:CHOENPAM_SET',
      lines: normalizeMemorialCard(setCard.lines),
      rollFn: () => rollMemorial(setM), normalize: normalizeMemorialCard,
      cost: '파편 40 · 결정 3', costEly: 2_120_000_000,
    },
    {
      id: 'memo-1-0', label: '무웬 일반 슬롯 1', group: 'memorial:MUWEN_NORMAL',
      lines: normalizeMemorialCard([normalLine]),
      rollFn: () => rollMemorial(normM), normalize: normalizeMemorialCard,
      cost: '파편 0.5 · 결정 0.5', costEly: 45_000_000,
    },
    {
      id: 'runeword', label: '룬워드', group: 'runeword',
      lines: normalizeRuneWordCard(runewordRows(runeword)),
      rollFn: rollRuneWord, normalize: (r) => normalizeRuneWordCard(r.rows),
      cost: '스크롤 1', costEly: 150_000_000,
    },
  ];
}

// ── 새 방식: 설명자 (패널 buildSlots 와 같은 모양) ──
function descriptors() {
  return [
    ...stones.map((stone, i) => ({
      id: `awak-${i}`, label: `각성석 ${i + 1}`, system: '각성석', group: 'awakening', kind: 'awakening',
      lines: pickLines(normalizeAwakStoneLoadout(stone)),
      cost: '재료 14 (2종×7) · 망치 1', costEly: 185_000_000,
    })),
    {
      id: 'memo-0', label: '초엔팜 #1', system: '메모리얼', group: 'memorial:CHOENPAM_SET', kind: 'memorial', memorialKey: 'CHOENPAM_SET',
      lines: pickLines(normalizeMemorialCard(setCard.lines)),
      cost: '파편 40 · 결정 3', costEly: 2_120_000_000,
    },
    {
      id: 'memo-1-0', label: '무웬 일반 슬롯 1', system: '메모리얼', group: 'memorial:MUWEN_NORMAL', kind: 'memorial', memorialKey: 'MUWEN_NORMAL',
      lines: pickLines(normalizeMemorialCard([normalLine])),
      cost: '파편 0.5 · 결정 0.5', costEly: 45_000_000,
    },
    {
      id: 'runeword', label: '룬워드', system: '룬워드', group: 'runeword', kind: 'runeword',
      lines: pickLines(normalizeRuneWordCard(runewordRows(runeword))),
      cost: '스크롤 1', costEly: 150_000_000,
    },
  ];
}

function summary(r) {
  return r.slots.map((s) => ({
    id: s.id, group: s.group, current: s.current, costEly: s.costEly, lineCount: s.conv.lines.length, empty: s.empty, cost: s.cost,
  }));
}

// 1) resolveSlot — kind 별 함수 복원
for (const d of descriptors()) {
  const s = resolveSlot(d);
  check(`resolveSlot(${d.kind}) 이 rollFn/normalize 를 붙인다 — ${d.id}`, !!s && typeof s.rollFn === 'function' && typeof s.normalize === 'function');
  if (s) {
    const lines = s.normalize(s.rollFn());
    check(`  굴림 → normalize 결과가 정규화 줄 배열 — ${d.id}`, Array.isArray(lines) && lines.every((l) => 'key' in l && 'text' in l));
  }
}
check('resolveSlot — 모르는 kind 는 null', resolveSlot({ id: 'x', kind: 'nope', group: 'x' }) === null);
check('resolveSlot — 없는 메모리얼 키는 null', resolveSlot({ id: 'x', kind: 'memorial', memorialKey: 'NOPE', group: 'x' }) === null);

// 2) 설명자가 JSON 왕복(구조적 복제 대용)에도 손실이 없다
const descs = descriptors();
const roundTripped = JSON.parse(JSON.stringify(descs));
check('설명자 JSON 왕복 동일', JSON.stringify(roundTripped) === JSON.stringify(descs));

// 3) 기존 경로 vs 설명자 경로 — 결정적 값 비교
const legacy = await analyzeSlots({ stats, slots: legacySlots(), samples: SAMPLES });
const viaDesc = await analyzeSlotDescriptors({ stats: JSON.parse(JSON.stringify(stats)), slots: roundTripped, samples: SAMPLES, runeScoreCurrent: 0 });

check('두 경로 모두 결과를 낸다', !!legacy && !!viaDesc && !legacy.cancelled && !viaDesc.cancelled);
if (legacy && viaDesc) {
  const a = summary(legacy);
  const b = summary(viaDesc);
  check(`슬롯 수 동일 (${a.length})`, a.length === b.length);
  check('id/group 순서·current·costEly·줄 수·empty·cost 동일', JSON.stringify(a) === JSON.stringify(b), JSON.stringify(b));
  check('분포 그룹 키 동일', JSON.stringify([...legacy.dist.keys()]) === JSON.stringify([...viaDesc.dist.keys()]));
  check('분포 표본 크기 동일', [...viaDesc.dist.values()].every((arr) => arr instanceof Float64Array && arr.length === SAMPLES));
  check('빈 각성석 슬롯은 current 0 · empty', b[1].current === 0 && b[1].empty === true);
  check('채워진 슬롯은 current > 0', b[0].current > 0 && b[2].current > 0 && b[3].current > 0 && b[4].current > 0);
  check('룬워드 점수 분포가 붙는다', !!viaDesc.runeScore && viaDesc.runeScore.sorted.length === SAMPLES && viaDesc.runeScore.current === 0);
  check('룬워드 점수 분포는 오름차순', (() => { const s = viaDesc.runeScore.sorted; for (let i = 1; i < s.length; i += 1) if (s[i] < s[i - 1]) return false; return true; })());
  check('legacy 결과에는 runeScore 가 없다 (엔진 자체는 그대로)', !('runeScore' in legacy));
}

// 4) 룬워드 점수 표본 도우미
const rs = runeScoreSamples(200);
check('runeScoreSamples — 길이·정렬', rs.length === 200 && rs[0] <= rs[199]);

// 5) 취소 — shouldCancel 이 true 면 cancelled:true 로 즉시 끝난다
const cancelled = await analyzeSlotDescriptors({ stats, slots: descs, samples: SAMPLES, shouldCancel: () => true });
check('취소 시 cancelled:true', !!cancelled && cancelled.cancelled === true && cancelled.slots.length === 0);

console.log('═══════════════════════════════════════════════════');
if (failures) {
  console.log(`✗ ${failures}개 실패`);
  process.exit(1);
}
console.log('✓ 전부 통과');
