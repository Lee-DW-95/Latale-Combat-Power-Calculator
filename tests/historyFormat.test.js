// 변경 이력 표시 (utils/historyFormat.js) — 원문 JSON·단위 코드·빈 값·화면 상태값이 화면에 새지 않는지.
import assert from 'node:assert/strict';
import { describeChanges, summarize } from '../src/utils/historyFormat.js';

const flat = (groups) => groups.flatMap((g) => g.lines.map((l) => `${g.title}|${l.label}|${l.before}|${l.after}`));
let n = 0;
const t = (name, fn) => { fn(); n++; };

t('각성석은 단위 코드 없이, 빈 옵션은 빼고 한 문장', () => {
  const stone = (opts) => ({ options: opts.map(([stat, unit, value]) => ({ stat, unit, value })) });
  const r = { action: 'update', changes: { awak_stones: [
    [stone([['주스탯', 'pct', 5], ['공격력', 'raw', '']])],
    [stone([['크댐', 'raw', 119], ['고댐', 'pct', 11], ['공격력', 'pct', '']])],
  ] } };
  assert.deepEqual(flat(describeChanges(r)), ['각성석|1번|주스탯 5%|크댐 119 · 고댐 11%']);
});

t('새로 생긴 설정 묶음은 끝까지 펼치고 빈 값은 버리며 처음 저장으로 표시', () => {
  const empty = { lines: [{ option: '', value: 0 }] };
  const r = { action: 'update', changes: {
    'relics.current': [null, {
      maat: { level: 10, enchantValue: 3.1, stones: [{ lines: [{ option: '올스탯', value: 1033 }, { option: '', value: 0 }] }, empty] },
      fox: { level: 1, enchantValue: 0, stones: [empty, empty] },
      wind: { level: 2, enchantValue: 0, stones: [] },
      cloud: { level: 3, enchantValue: 0, stones: [] },
    }],
    'relics.previewOn': [null, false],
    'relics.editTarget': [null, 'current'],
  } };
  const g = describeChanges(r, { relicName: (k) => ({ maat: '마아트의 눈' })[k] });
  assert.equal(g.length, 1);
  assert.equal(g[0].initial, true);
  const lines = flat(g);
  assert.ok(lines.includes('성물|마아트의 눈 · 전용석 1|—|올스탯 1,033'), lines.join('\n'));
  assert.ok(!lines.some((l) => l.includes('{') || l.includes('editTarget') || l.includes('previewOn')));
  assert.equal(summarize(r), '성물 처음 저장');
});

t('스킬 설정은 스킬·특화석 이름으로, 선택 중인 스킬 같은 화면 상태는 숨김', () => {
  const r = { action: 'update', changes: {
    'skill_configs.skillId': [1, 2],
    'skill_configs.configs.30:1000029.level': [13, 14],
    'skill_configs.configs.30:1000029.aw2': [false, true],
    'skill_configs.configs.30:1000029.stones': [[null], [{ type: 2, number: 8, level: 4 }]],
  } };
  const ctx = { skillName: () => '인법_경', stoneName: () => '쾌속' };
  assert.deepEqual(flat(describeChanges(r, ctx)), [
    '스킬 설정|인법_경 · 레벨|13|14',
    '스킬 설정|인법_경 · 2차 각성|—|켜짐',
    '스킬 설정|인법_경 · 특화석 1|—|쾌속 Lv4',
  ]);
});

t('화면 상태만 바뀌면 그룹 없음', () => {
  const r = { action: 'update', changes: { 'damage_settings.deltaMode': ['base', 'final'] } };
  assert.deepEqual(describeChanges(r), []);
  assert.equal(summarize(r), '화면 설정만 바뀜');
});

t('생성 스냅샷은 값만, 스탯 이름 정리', () => {
  const r = { action: 'create', changes: { name: 'a', type: 'M', stats: { 크댐: 150.5, 기본_주스탯: 1000, 관통: 0 }, runeword: [10, null, null, null, null, null, null, 28] } };
  const lines = flat(describeChanges(r, { runeName: (id) => `룬${id}` }));
  assert.deepEqual(lines, [
    '유형|유형|—|마법',
    '스탯|크댐|—|150.5',
    '스탯|기본 주스탯|—|1,000',
    '룬워드|1번 칸|—|룬10',
    '룬워드|왕룬|—|룬28',
  ]);
});

console.log(`✓ 변경 이력 표시 전부 통과 (${n})`);
