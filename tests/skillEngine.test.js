/**
 * 스킬 엔진 테스트.
 *
 * GOLDEN 은 원본 계산기(alfm201/damage-test v9.18, 게임 데이터 2026-10-23)의 SkillEngine 을 그대로 실행해 뽑은 값이다.
 *   (전 직업·스킬·변형·특화석 73,920개 설정 / 116,552타 대조에서 전부 일치한 뒤 대표 18건을 남김 —
 *    앞 14건은 v9.17 때와 같은 설정, 뒤 4건은 v9.18 에서 계수가 바뀐 스킬.
 *    재생성 방법은 docs/DAMAGE_FORMULA.md §10)
 *   행 형식: [종류, 채널, 계수, 비크리 min, 비크리 max, 크리 min, 크리 max]
 */
import { readFileSync } from 'node:fs';
import { createSkillEngine, migrateSkillState, scaled, statText, hitLabel, TOZ_COEF_BONUS } from '../src/utils/skillEngine.js';
import { engineInputFromStats } from '../src/utils/damageInputs.js';

const data = JSON.parse(readFileSync(new URL('../src/data/skillData.json', import.meta.url), 'utf8'));
const E = createSkillEngine(data);

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

// ── 데이터 형태 ──
check('직업 33개', data.classes.length === 33);
check('모든 직업 스킬이 데이터에 있음', data.classes.every((c) => c.skills.every((id) => data.skills[id])));

// ── 누적% 규칙 ──
check('scaled: 가산·추가 없으면 그대로', scaled(12345, 300) === 12345);
check('scaled: 기본 1000·누적 100% 에 +100·+10%', scaled(2000, 100, 100, 10) === 2310);
check('scaled: knownBase 우선', scaled(2000, 100, 0, 10, 1000) === 2100);
check('statText: 지배력은 /10 %p', statText(574, 25) === '보스 지배력 +2.5%p');
check('hitLabel', hitLabel({ kind: 'summon', channel: 'magic', summonIndex: 2, conditions: [1] }) === '조건부 마법 소환 2');

// ── 원본 골든 ──
function input(boss, t) {
  return {
    STR: 9315101, STR_PCT: 1200, MAG: 8120334, MAG_PCT: 1100, L: 235,
    WPN_MIN: 86931, WPN_MAX: 89042, WPN_MIN_PCT: 300, WPN_MAX_PCT: 300, ELE: 61234, ELE_PCT: 250,
    EFF_P: 7, EFF_M: 12, FD_P: 1038824, FD_M: 912003, BD_P: 30, BD_M: 25,
    rawMIN_P: 9156, rawMAX_P: 9833, rawMIN_M: 8700, rawMAX_M: 9400,
    FMIN_P: 3, FMAX_P: 4, FMIN_M: 2, FMAX_M: 5, rawCD_P: 11838, rawCD_M: 10500, FCD_P: 6, FCD_M: 5,
    PEN_P: 99, PEN_M: 95, ADD_normal: 1193460, ADD_boss: 1058835, ADD_normal_PCT: 40, ADD_boss_PCT: 35,
    Dom_normal: 1, Dom_boss: 3, MD: 15, SD: 10, isBack: t % 2 === 1, isMelee: true, isStatus: false,
    targetType: boss ? 'boss' : 'normal',
    ...(boss
      ? { ARMOR: 4374342, RES: 4374342, F_P: 4374342, F_M: 4374342, Guard: 90, ELASTICITY: 700 }
      : { ARMOR: 0, RES: 0, F_P: 0, F_M: 0, Guard: 0, ELASTICITY: 0 }),
  };
}
const GOLDEN = [{"cls":24,"id":1000023,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":6,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":0,"buffs":{"noblesse":true,"title":true},"level":5,"rows":[["summon","physical",2000,178734635,195046714,9147638620,9982490281]]},{"cls":24,"id":1001023,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":3,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":1,"buffs":{},"level":5,"rows":[["direct","physical",7500,3576825179,3926804049,327711217416,359776493565]]},{"cls":24,"id":1013023,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":5,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":2,"buffs":{},"level":5,"rows":[["direct","physical",10000,284358511,313475161,9591536605,10573654041]]},{"cls":24,"id":1003023,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":4,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":3,"buffs":{"noblesse":true,"title":true},"level":5,"rows":[["summon","physical",2000,2458623600,2679476698,333696653165,363671934493],["direct","physical",12000,4702746159,5176079246,441960871514,486444345662]]},{"cls":24,"id":1011023,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":3,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":4,"buffs":{},"level":5,"rows":[["summon","physical",3000,198932066,217531353,10382263509,11352961753]]},{"cls":24,"id":1805024,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":1,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":5,"buffs":{},"level":5,"rows":[["summon","physical",2000,6153474428,6696369338,1391146659450,1513881664557],["direct","physical",35000,10179782956,11261004910,932678743151,1031741091671]]},{"cls":24,"id":3802404,"cfg":{"level":1,"aw1":true,"aw2":true,"stones":[],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":6,"buffs":{"noblesse":true,"title":true},"level":1,"rows":[["direct","physical",30000,669972233,741786614,23181038773,25665817270],["summon","physical",2000,173709054,189605895,8956439793,9776079727]]},{"cls":24,"id":3802407,"cfg":{"level":1,"aw1":true,"aw2":true,"stones":[],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":7,"buffs":{},"level":1,"rows":[["direct","physical",40000,11313084272,12521582283,990323982552,1096113406585]]},{"cls":24,"id":3812404,"cfg":{"level":1,"aw1":true,"aw2":true,"stones":[],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":8,"buffs":{},"level":1,"rows":[["summon","physical",2000,172050477,187825173,8647256515,9440093263],["direct","physical",30000,663499053,734745202,22380112036,24783278900]]},{"cls":24,"id":3812407,"cfg":{"level":1,"aw1":true,"aw2":true,"stones":[],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":9,"buffs":{"noblesse":true,"title":true},"level":1,"rows":[["direct","physical",40000,11423455717,12641581922,1026141450937,1135562778973]]},{"cls":25,"id":3812504,"cfg":{"level":1,"aw1":true,"aw2":true,"stones":[],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":10,"buffs":{},"level":1,"rows":[["summon","physical",2000,172050477,187825173,8647256515,9440093263]]},{"cls":28,"id":1000027,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":3,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":11,"buffs":{},"level":5,"rows":[["summon","magic",2000,2224439068,2474021531,280242227014,311685452652],["summon","physical",2000,2782677135,3032230474,398502526777,434240650256],["direct","magic",9000,2862817662,3184134680,239045296832,265875270669],["direct","physical",9000,3936986596,4326851387,360709442242,396429095684]]},{"cls":28,"id":2402801,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":5,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":12,"buffs":{"noblesse":true,"title":true},"level":5,"rows":[["direct","physical",8000,248305128,273359166,8591357774,9458227021],["direct","magic",8000,170979675,190117341,5229004200,5814283938]]},{"cls":28,"id":2402803,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[{"type":2,"number":6,"level":5},{"type":1,"number":1,"level":5},{"type":1,"number":2,"level":5}],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":13,"buffs":{},"level":5,"rows":[["direct","physical",12000,4657309100,5126945731,407691200696,448802156244],["direct","magic",12000,3323830220,3696890348,265075488417,294827011179]]},{"cls":30,"id":1805030,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[null,null,null],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":13375,"buffs":{},"level":5,"rows":[["direct","physical",4500,2789266154,3053797275,244166580555,267323092806]]},{"cls":38,"id":1211006,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[null,null,null],"variant":"","overrides":{},"localBuffs":{}},"boss":false,"t":25862,"buffs":{},"level":5,"rows":[["summon","physical",2000,2075689377,2262694860,324783144671,354043877037],["direct","physical",9000,3069111969,3373813632,337949252079,371500900212]]},{"cls":31,"id":1004030,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[null,null,null],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":14877,"buffs":{"noblesse":true,"title":true},"level":5,"rows":[["direct","physical",16000,502051903,554714021,13880868137,15336885802]]},{"cls":75,"id":1803705,"cfg":{"level":5,"aw1":true,"aw2":true,"stones":[null,null,null],"variant":"","overrides":{},"localBuffs":{}},"boss":true,"t":65292,"buffs":{},"level":5,"rows":[["direct","magic",12000,213542014,237509555,6354268703,7067458939]]}];
for (const g of GOLDEN) {
  const r = E.calculate(g.cls, g.id, structuredClone(g.cfg), input(g.boss, g.t), g.buffs);
  const got = r.rows.map((x) => [x.kind, x.channel, x.C, x.noncrit.min, x.noncrit.max, x.crit.min, x.crit.max]);
  const name = `${E.byClass.get(g.cls).name} · ${data.skills[g.id].name.replace(/\n/g, ' ')}`;
  check(`골든 ${name}`, r.level === g.level && JSON.stringify(got) === JSON.stringify(g.rows), `${got.length}타`);
}

// ── 데이터 갱신 마이그레이션: 예전 판으로 저장된 변형 키 → 지금 판 키 ──
{
  const legacy = data.legacyVariants;
  const [legacyId, map] = Object.entries(legacy.keys).find(([, m]) => Object.keys(m).length);
  const [oldKey, newKey] = Object.entries(map)[0];
  const cls = data.classes.find((c) => c.skills.includes(Number(legacyId))).id;
  const saved = { cls, skillId: Number(legacyId), configs: { [`${cls}:${legacyId}`]: { level: 5, variant: oldKey, aw1: true } } };
  const fromNone = migrateSkillState(saved, data);
  check(
    '마이그레이션: dataSource 없는 저장분은 legacyVariants 로 키 변환',
    fromNone.configs[`${cls}:${legacyId}`].variant === newKey && fromNone.configs[`${cls}:${legacyId}`].level === 5 && fromNone.dataSource === data.source,
    `${oldKey} → ${newKey}`,
  );
  check('마이그레이션: 직전 판 저장분도 변환', migrateSkillState({ ...saved, dataSource: legacy.source }, data).configs[`${cls}:${legacyId}`].variant === newKey);
  check('마이그레이션: 알 수 없는 판이면 변형만 비움', migrateSkillState({ ...saved, dataSource: '2000-01-01' }, data).configs[`${cls}:${legacyId}`].variant === '');
  const current = { ...saved, dataSource: data.source };
  check('마이그레이션: 지금 판이면 그대로', migrateSkillState(current, data) === current);
  const missing = migrateSkillState({ ...saved, configs: { [`${cls}:${legacyId}`]: { variant: 'SKILL_USE_1:없는키' } } }, data);
  check('마이그레이션: 표에 없는 키는 비움', missing.configs[`${cls}:${legacyId}`].variant === '');
}

// ── 채널 거르기: 물리 캐릭터로 팬텀메이지 혼합 스킬 ──
const mixed = GOLDEN.find((g) => g.rows.some((x) => x[1] === 'magic') && g.rows.some((x) => x[1] === 'physical'));
const onlyP = E.calculate(mixed.cls, mixed.id, structuredClone(mixed.cfg), input(mixed.boss, mixed.t), mixed.buffs, { channels: new Set(['physical']) });
check('반대 채널 타격은 unavailable', onlyP.rows.every((x) => (x.channel === 'magic') === (x.unavailable === 'channel')));

// ── 토즈 버프: 직타 계수만 +1000, 소환은 그대로 ──
const gt = GOLDEN.find((g) => g.rows.some((x) => x[0] === 'direct') && g.rows.some((x) => x[0] === 'summon'));
const tozOff = E.calculate(gt.cls, gt.id, structuredClone(gt.cfg), input(gt.boss, gt.t), gt.buffs);
const tozOn = E.calculate(gt.cls, gt.id, structuredClone(gt.cfg), input(gt.boss, gt.t), { ...gt.buffs, toz: true });
check(
  '토즈: 직타 계수 +1000 · 소환 계수 불변',
  tozOn.rows.length === tozOff.rows.length &&
    tozOn.rows.every((x, i) => x.C === tozOff.rows[i].C + (x.kind === 'direct' ? TOZ_COEF_BONUS : 0)),
);
check(
  '토즈: 직타 대미지 증가',
  tozOn.rows.filter((x) => x.kind === 'direct').every((x, i) => {
    const off = tozOff.rows.filter((y) => y.kind === 'direct')[i];
    return x.noncrit.min > off.noncrit.min && x.crit.max > off.crit.max;
  }),
);

// ── 특화석 규칙 ──
const cls = 24;
const sid = GOLDEN[0].id;
const opts = E.optionsFor(cls, sid);
const uniques = opts.filter((o) => o.type === 2);
if (uniques.length >= 2) {
  const cfg = { ...E.defaultConfig(sid), aw1: true, aw2: true, stones: uniques.slice(0, 2).map((o) => ({ type: 2, number: o.number, level: o.levels[0] })) };
  check('유니크 특화석은 1개만 적용', E.optionRows(cls, sid, cfg).length === uniques[0].groups.length);
}
const one = opts.find((o) => o.type === 1);
const dup = { ...E.defaultConfig(sid), aw1: true, aw2: true, stones: [0, 1].map(() => ({ type: 1, number: one.number, level: one.levels[0] })) };
check('같은 특화석 중복 불가', E.optionRows(cls, sid, dup).length === one.groups.length);

// ── 어댑터 ──
const st = {
  type: 'P', 주스탯: 3000, 기본_주스탯: 1000, 공격력: 5000, 기본_공격력: 2500, 무기공표시min: 4900, 무기공표시max: 5100,
  근마효율: 7, 최소뎀: 100, 최대뎀: 200, 크댐: 312, 기본_크댐: 300, 고댐: 50, 관통: 60, 일몬추: 400, 보몬추: 600, 기본_보몬추: 300,
  일몬지: 1, 보몬지: 2, 백어택: 10, 근거리: 5, 상태대미지: 3,
};
const s = engineInputFromStats(st, { targetStats: { ARMOR: 7 }, targetType: 'boss', level: 235, conditions: { backAttack: true } });
check('어댑터: 누적% 역산', s.STR_PCT === 200 && s.STR_BASE === 1000 && s.WPN_MIN_PCT === 100 && s.ADD_boss_PCT === 100);
check('어댑터: 보스 대상 추가·지배력', s.ADD === 600 && s.Dom === 2 && s.targetType === 'boss');
check('어댑터: 채널 필드', s.WPN_MIN === 4900 && s.WPN_MAX === 5100 && s.rawCD_M === 0 && s.MAG === 0);
check('어댑터: 크댐 = 기본 300 × (1 + 최종 4%)', s.rawCD_P === 300 && s.FCD_P === 4);
check('어댑터: 기본값 없으면 표시값·최종 0%', s.rawMIN_P === 100 && s.FMIN_P === 0);
check('어댑터: 조건·대상', s.isBack && !s.isMelee && s.ARMOR === 7 && s.L === 235);
const boosted = E.applyStoneStats(s, { 595: 10, 594: 100 });
check('어댑터+특화석: 기본값 기준으로 % 적용', boosted.STR === Math.floor((1000 + 100) * 310 / 100));

console.log('───────────────────────────────────────────────────');
console.log(fail ? `✗ ${fail}개 항목 실패 (통과 ${pass})` : `✓ 스킬 엔진 전부 통과 (${pass})`);
if (fail) process.exit(1);
