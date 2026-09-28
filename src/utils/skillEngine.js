// @ts-check
/**
 * 스킬 엔진 — 직업 · 스킬 · 레벨 · 각성 · 특화석 → 타격별 대미지.
 *
 * 근거: alfm201/damage-test v9.17 의 SkillEngine 동작을 읽고 우리 코드로 다시 썼다 (docs/DAMAGE_FORMULA.md §6 · §9-2).
 *   데이터는 src/data/skillData.json (게임 데이터 테이블, 추출일 2026-09-16).
 *   대미지 수식 자체는 damageFormula.js 를 그대로 쓴다 — 여기서는 "어떤 계수·배율로 몇 번 치는가" 만 정한다.
 *
 * 흐름
 *   1) 특화석 3칸(유니크 1개까지) → 스탯 ID 합계 (statsOf)
 *   2) 스킬 레벨 = 설정 레벨 + 특화석의 등급별 레벨 증가(643~646)
 *   3) 각성 페이지·특화석 커스텀 키에 맞는 변형(variant) 선택
 *   4) 변형의 버프 + 특화석 스탯을 캐릭터 입력에 반영 (applyStoneStats — 누적% 규칙 scaled)
 *   5) 변형의 타격 파트마다: 직타는 C = base + step×레벨 + 특화석 보너스,
 *      소환은 소환체 프로필(summons[stat + statStep×레벨]) × 소환 몹(mobs[mob]) 로 대미지 범위
 *
 * 원본과 같게 **1회 적중 기준**이다 — 타수·쿨타임·DPS 합산은 하지 않는다.
 */

import { damageRange } from './damageFormula.js';

/** 토즈 버프 — 직타 스킬 계수 +1000 (buffs.toz) */
export const TOZ_COEF_BONUS = 1000;

/** 특화석 스탯 ID 표시 이름 */
const STAT_NAMES = {
  196: '마법 백어택 대미지',
  456: '올스탯(%)',
  594: '근력·마법력',
  595: '근력·마법력(%)',
  586: '무기공격력·속성력',
  587: '무기공격력·속성력(%)',
  659: '스킬 계수',
  660: '스킬 레벨당 계수',
  461: '최대 대미지',
  464: '크리티컬 대미지',
  590: '최종 최소 대미지',
  591: '최종 최대 대미지',
  592: '최종 크리티컬 대미지',
  573: '일반 지배력',
  574: '보스 지배력',
  567: '일반 추가 대미지(%)',
  571: '보스 추가 대미지(%)',
  643: '초급 스킬 레벨',
  644: '중급 스킬 레벨',
  645: '상급 스킬 레벨',
  646: '최상급 스킬 레벨',
  614: '타겟 수',
  86: '받는 대미지 감소',
};
const PERCENT_STATS = new Set([456, 595, 587, 590, 591, 592, 573, 574, 567, 571, 86]);
/** 지배력은 ×10 정수로 저장된다 (값/10 = %) */
const TENTHS_STATS = new Set([573, 574]);

/** 스킬 등급 표시 — 특화석의 레벨 증가 스탯 642 + grade 와 짝 */
export const SKILL_GRADE_LABEL = ['', '초급', '중급', '상급', '최상급'];

/**
 * 누적% 규칙 — 표시값에서 기본값을 역산해 가산·추가%를 적용한다.
 *   기본값   = ceil(표시값 × 100 / (100 + 누적%))    (knownBase 가 있으면 그 값)
 *   새 표시값 = floor((기본값 + 가산) × (100 + 누적% + 추가%) / 100)
 * 가산·추가%가 모두 0 이면 원래 값을 그대로 돌려준다.
 */
export function scaled(value, percent, flat = 0, extra = 0, knownBase = 0) {
  if (!flat && !extra) return value;
  const raw = knownBase > 0 ? knownBase : Math.ceil((value * 100) / (100 + percent) - 1e-8);
  return Math.floor(((raw + flat) * (100 + percent + extra)) / 100);
}

/** 특화석 효과 한 줄 표시 */
export function statText(id, value) {
  const n = Number(id);
  const v = TENTHS_STATS.has(n) ? value / 10 : value;
  return `${STAT_NAMES[n] || '기타 효과'} ${v >= 0 ? '+' : ''}${v.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}${PERCENT_STATS.has(n) ? '%p' : ''}`;
}

/** 스킬·옵션 이름 정리 — "\n" 과 앞 번호("1. ")를 걷어낸다 */
export function cleanName(name) {
  return String(name || '')
    .replace(/\\n/g, ' ')
    .replace(/^\d+\s*\.\s*/, '')
    .trim();
}

/** 변형(타격 동작) 이름 — "이름 · 계수/계수 + 소환" */
export function variantLabel(v, level) {
  const name = cleanName(v.name).replace(/\s*[↑↓]\s*/g, ' ').trim();
  const direct = v.parts.filter((p) => p.kind === 'direct');
  const summon = v.parts.filter((p) => p.kind === 'summon' && p.attacks.length);
  const coefs = direct.map((p) => (p.base + p.step * level).toLocaleString('ko-KR')).join('/');
  const tail = coefs + (summon.length ? `${direct.length ? ' + ' : ''}소환` : '');
  return `${name} · ${tail || '지원 동작'}`;
}

/** 타격 행 이름 — "물리 직타", "조건부 마법 소환 2" */
export function hitLabel(row, index) {
  const ch = row.channel === 'physical' ? '물리' : '마법';
  const cond = row.conditions?.length ? '조건부 ' : '';
  return row.kind === 'summon' ? `${cond}${ch} 소환 ${row.summonIndex || index || 1}` : `${cond}${ch} 직타`;
}

/**
 * @param {any} data  skillData.json
 */
export function createSkillEngine(data) {
  const byClass = new Map(data.classes.map((c) => [c.id, c]));

  /** 특화석 옵션 — 그룹 ID → 레벨 오름차순 행 */
  const optionGroups = new Map();
  for (const o of Object.values(data.options)) {
    if (!optionGroups.has(o.Option_Groupid)) optionGroups.set(o.Option_Groupid, []);
    optionGroups.get(o.Option_Groupid).push(o);
  }
  for (const rows of optionGroups.values()) rows.sort((a, b) => a.Level - b.Level);

  const skillOf = (id) => data.skills[id];

  /** 직업의 스킬 목록 (데이터에 있는 것만) */
  function skillsOf(cls) {
    const c = byClass.get(cls);
    if (!c) return [];
    return c.skills.map((id) => data.skills[id]).filter(Boolean);
  }

  function defaultConfig(id) {
    return {
      level: data.skills[id]?.defaultLevel ?? 1,
      aw1: false,
      aw2: false,
      stones: [null, null, null],
      variant: '',
      overrides: {},
      localBuffs: {},
    };
  }

  const awakenings = (cls, id) => data.awakening[`${cls}:${id}`] || [];

  /** 이 스킬의 특화석이 요구하는 각성 페이지 (0 이면 없음) */
  function requiredPage(cls, id) {
    const need = data.custom[`${cls}:${id}`]?.awaken;
    return awakenings(cls, id).find((a) => a.id === need)?.page || 0;
  }

  /** 스킬에 꽂을 수 있는 특화석 목록 — type 1 일반, 2 유니크 */
  function optionsFor(cls, id) {
    const meta = data.custom[`${cls}:${id}`];
    if (!meta || !byClass.get(cls)?.skills.includes(Number(id))) return [];
    const allowed = data.allowedUnique[meta.group] || [];
    return data.stoneGroups
      .filter((r) => r[0] === cls && (r[1] === 1 || allowed.includes(r[2])))
      .map((r) => {
        const group = r[2 + meta.tab];
        const rows = optionGroups.get(group);
        return {
          type: r[1],
          number: r[2],
          groups: group ? [group] : [],
          name: rows?.[0]?.Name || '',
          levels: rows?.map((o) => o.Level) || [],
        };
      })
      .filter((r) => r.name);
  }

  /** 선택한 특화석 → 적용 옵션 행. 유니크는 1개까지, 같은 돌 중복 불가, 필요한 각성이 꺼져 있으면 없음 */
  function optionRows(cls, id, config) {
    const required = requiredPage(cls, id);
    if (required && !config[`aw${required}`]) return [];
    const available = optionsFor(cls, id);
    const chosen = [];
    const seen = new Set();
    let unique = false;
    for (const choice of (config.stones || []).slice(0, 3)) {
      if (!choice) continue;
      const stone = available.find((o) => o.type === choice.type && o.number === choice.number);
      const key = stone && `${stone.type}:${stone.number}`;
      if (!stone || seen.has(key) || (stone.type === 2 && unique)) continue;
      if (stone.type === 2) unique = true;
      seen.add(key);
      for (const g of stone.groups) {
        const row = optionGroups.get(g)?.find((r) => r.Level === choice.level);
        if (row) chosen.push(row);
      }
    }
    return chosen;
  }

  /** 옵션 행들의 스탯 ID 합계 */
  function statsOf(rows) {
    const out = {};
    for (const r of rows) {
      for (const i of [1, 2]) {
        const sid = r[`Stat${i}`];
        if (sid) out[sid] = (out[sid] || 0) + r[`Stat${i}_Value`];
      }
    }
    return out;
  }

  /** 타격 파트의 동일성 서명 — 같은 구성의 변형은 하나로 묶는다 */
  function signature(p) {
    return p.kind === 'direct'
      ? [p.kind, p.channel, p.base, p.step, p.conditions]
      : [p.kind, p.mob, p.stat, p.statStep, p.conditions, p.attacks.map(signature)];
  }

  /** 지금 설정(각성·특화석)에서 고를 수 있는 변형 목록 — 같은 구성은 aliases 로 묶음 */
  function variants(cls, id, config) {
    const skill = skillOf(id);
    const stoneRows = optionRows(cls, id, config);
    const customKey = stoneRows.find((r) => r.Custom_Key)?.Custom_Key;
    const pages = new Set(awakenings(cls, id).map((a) => a.page));
    const normal = skill.variants.filter((v) => !v.custom);
    const enabled = (v) => !v.page || (pages.has(v.page) && config[`aw${v.page}`]);
    const page = Math.max(0, ...normal.filter(enabled).map((v) => v.page));
    let source = normal.filter((v) => enabled(v) && v.page === page);
    if (customKey) {
      const custom = skill.variants.filter((v) => v.custom === customKey);
      if (custom.length) source = custom;
    }
    const grouped = new Map();
    for (const v of [...source].sort((a, b) => a.order - b.order)) {
      const k = JSON.stringify([v.parts.map(signature), v.buffs || []]);
      if (grouped.has(k)) grouped.get(k).aliases.push(v.key);
      else grouped.set(k, { ...v, aliases: [v.key] });
    }
    return [...grouped.values()];
  }

  /** 변형·특화석이 거는 버프 — 같은 버프는 비조건부를 우선 */
  function skillBuffs(variant, stoneRows, level, config) {
    const all = [...(variant.buffs || []), ...stoneRows.flatMap((o) => data.optionBuffs[o.Effect] || [])];
    const dedup = new Map();
    for (const b of all) {
      const row = {
        ...b,
        values: Object.fromEntries(b.stats.map(([sid, base, step]) => [sid, base + step * level])),
        active: config.localBuffs?.[b.id] ?? !b.conditional,
      };
      const old = dedup.get(b.id);
      if (!old || (old.conditional && !b.conditional)) dedup.set(b.id, row);
    }
    return [...dedup.values()];
  }

  /** 특화석 스탯 + 켜진 버프 (버프는 같은 그룹 안에서 최댓값만) */
  function combinedStats(stoneStats, buffs) {
    const out = { ...stoneStats };
    const groups = new Map();
    for (const b of buffs) {
      if (!b.active) continue;
      if (!groups.has(b.group)) groups.set(b.group, {});
      const g = groups.get(b.group);
      for (const [sid, v] of Object.entries(b.values)) g[sid] = Math.max(g[sid] || 0, v);
    }
    for (const g of groups.values()) for (const [sid, v] of Object.entries(g)) out[sid] = (out[sid] || 0) + v;
    return out;
  }

  /** 공용 버프 — 노블레스(최종 최소·최대·크리 +1%), 칭호(크리 +200) */
  function buffStats(input, buffs = {}) {
    const s = { ...input };
    for (const x of ['P', 'M']) {
      if (buffs.noblesse) {
        s[`FMIN_${x}`] += 1;
        s[`FMAX_${x}`] += 1;
        s[`FCD_${x}`] += 1;
      }
      if (buffs.title) s[`rawCD_${x}`] += 200;
    }
    return s;
  }

  /** 특화석·버프 스탯을 캐릭터 입력에 반영 */
  function applyStoneStats(input, stats) {
    const s = { ...input };
    const add = (key, n) => (s[key] = (s[key] || 0) + n);
    for (const x of ['P', 'M']) {
      const main = x === 'P' ? 'STR' : 'MAG';
      s[main] = scaled(s[main], s[`${main}_PCT`] || 0, stats[594] || 0, (stats[595] || 0) + (stats[456] || 0), s[`${main}_BASE`] || 0);
      s[`rawMAX_${x}`] += stats[461] || 0;
      s[`FMIN_${x}`] += stats[590] || 0;
      s[`FMAX_${x}`] += stats[591] || 0;
      add(`rawCD_${x}`, stats[464] || 0);
      add(`FCD_${x}`, stats[592] || 0);
    }
    for (const key of ['ELE', 'WPN_MIN', 'WPN_MAX']) {
      s[key] = scaled(s[key], s[`${key}_PCT`] || 0, stats[586] || 0, stats[587] || 0, s[`${key}_BASE`] || 0);
    }
    add('BD_M', stats[196] || 0);
    for (const [target, sid] of [['normal', 567], ['boss', 571]]) {
      s[`ADD_${target}`] = scaled(s[`ADD_${target}`], s[`ADD_${target}_PCT`] || 0, 0, stats[sid] || 0, s[`ADD_${target}_BASE`] || 0);
    }
    s.ADD = s[`ADD_${s.targetType}`];
    add('Dom_normal', (stats[573] || 0) / 10);
    add('Dom_boss', (stats[574] || 0) / 10);
    s.Dom = s[`Dom_${s.targetType}`];
    return s;
  }

  /** 직업·레벨 기본 스탯 (특화석·장비 없는 상태) */
  function defaults(cls, level) {
    const row = (data.defaults[cls] || []).find((r) => r[0] === level);
    if (!row) return null;
    const r = Object.fromEntries(data.statKeys.map((k, i) => [k, row[i]]));
    return {
      STR: r.Base_Atk,
      MAG: r.Base_Ele,
      WPN_MIN: r.BASE_NORMAL,
      WPN_MAX: r.BASE_NORMAL,
      ELE: r.BASE_WATER,
      rawMIN_P: r.Base_Atk_Min_Dam,
      rawMAX_P: r.Base_Atk_Max_Dam,
      rawMIN_M: r.Base_Ele_Min_Dam,
      rawMAX_M: r.Base_Ele_Max_Dam,
      rawCD_P: r.BASE_CRITICAL_DAMAGE,
      rawCD_M: r.BASE_ELE_CRITICAL_DAMAGE,
      BD_P: r.BASE_BACK_DAM,
      BD_M: r.BASE_ELE_BACK_DAM,
      FD_P: r.BASE_DAMAGE_ABSOLUTE,
      FD_M: r.BASE_ELE_DAMAGE_ABSOLUTE,
      PEN_P: r.BASE_DEF_PENETRATION,
      PEN_M: r.BASE_ELE_PENETRATION,
    };
  }

  /** 엔진 입력(s) → damageFormula 입력 (채널별) */
  function channelInputs(s, channel) {
    const physical = channel === 'physical';
    const x = physical ? 'P' : 'M';
    return {
      att: {
        type: physical ? 'P' : 'M',
        mainStat: physical ? s.STR : s.MAG,
        eff: s[`EFF_${x}`] || 0,
        weaponMin: physical ? s.WPN_MIN : s.ELE,
        weaponMax: physical ? s.WPN_MAX : s.ELE,
        rawMin: s[`rawMIN_${x}`],
        fMin: s[`FMIN_${x}`] || 0,
        rawMax: s[`rawMAX_${x}`],
        fMax: s[`FMAX_${x}`] || 0,
        rawCd: s[`rawCD_${x}`],
        fCd: s[`FCD_${x}`] || 0,
        fixedDamage: s[`FD_${x}`] || 0,
        addDamage: s.ADD || 0,
        pen: s[`PEN_${x}`] || 0,
        dominance: s.Dom || 0,
        level: s.L,
        backAttack: s[`BD_${x}`] || 0,
        meleeDamage: s.MD || 0,
        statusDamage: s.SD || 0,
      },
      tgt: { armor: s.ARMOR, res: s.RES, fP: s.F_P, fM: s.F_M, guard: s.Guard, elasticity: s.ELASTICITY },
      cond: { backAttack: !!s.isBack, melee: !!s.isMelee, status: !!s.isStatus },
    };
  }

  /**
   * 스킬 1개 계산.
   * @param {number} cls
   * @param {number|string} id    스킬 ID
   * @param {any} config          defaultConfig 형태
   * @param {any} input           엔진 입력 s (skillInputs.engineInputFromStats)
   * @param {{noblesse?:boolean,title?:boolean,toz?:boolean}} [buffs]
   * @param {{channels?: Set<string>}} [opt]  계산할 채널 — 캐릭터가 한쪽 스탯만 가질 때 다른 채널은 건너뛴다
   */
  function calculate(cls, id, config, input, buffs = {}, opt = {}) {
    const skill = skillOf(id);
    const stoneRows = optionRows(cls, id, config);
    const stats = statsOf(stoneRows);
    const baseLevel = Math.max(0, Math.round(Number(config.level) || 0));
    const level = baseLevel ? baseLevel + (stats[642 + skill.grade] || 0) : 0;
    const choices = variants(cls, id, config);
    const variant =
      choices.find((v) => v.aliases.includes(config.variant)) ||
      choices.find((v) => v.preferred) ||
      choices.find((v) => v.order === 0 && !v.condition) ||
      choices[0];
    if (!variant || !level) return { skill, level, variant, choices, rows: [], stats, stoneRows, localBuffs: [], summonObjects: [] };

    const localBuffs = skillBuffs(variant, stoneRows, level, config);
    const s = applyStoneStats(buffStats(input, buffs), combinedStats(stats, localBuffs));
    const rows = [];
    const dedup = new Set();
    const summonObjects = [];
    const summonIdentities = new Map();
    const firstSummon = new Map();
    const allowed = opt.channels || null;

    function visit(p, parent = null) {
      if (p.kind === 'summon') {
        const statId = p.stat + p.statStep * level;
        const profile = data.summons[statId];
        const mob = data.mobs[p.mob];
        const identity = `${p.effect}:${p.mob}:${statId}`;
        if (!summonIdentities.has(identity)) {
          const channel = p.attacks.find((a) => a.channel)?.channel || 'magic';
          summonIdentities.set(identity, summonObjects.length + 1);
          summonObjects.push({
            index: summonObjects.length + 1,
            name: p.name,
            effect: p.effect,
            mob: p.mob,
            statId,
            S: profile?.[channel === 'physical' ? 'Atk' : 'Ele'],
            supportOnly: !p.attacks.length,
          });
        }
        const summonIndex = summonIdentities.get(identity);
        for (const hit of p.attacks) visit(hit, { ...p, profile, mobData: mob, statId, summonIndex });
        return;
      }

      const coefficient = p.base + p.step * level + (parent ? 0 : (stats[659] || 0) + (stats[660] || 0) * level);
      let key = [
        parent?.mob || 0,
        parent?.statId || 0,
        p.channel,
        coefficient,
        JSON.stringify([...(parent?.conditions || []), ...(p.conditions || [])]),
      ].join(':');
      const legacyKey = key;
      if (parent) {
        if (!firstSummon.has(key)) firstSummon.set(key, parent.effect);
        else if (firstSummon.get(key) !== parent.effect) key += `:object:${parent.effect}`;
      }
      if (dedup.has(key)) return;
      dedup.add(key);

      const override = config.overrides?.[key] || config.overrides?.[legacyKey] || {};
      // 토즈는 key 계산 뒤에 더한다 — 토글해도 overrides/hitCounts 키가 유지되게. 직타에만 (특화석 659 와 동일 규칙).
      const C = override.C ?? (coefficient + (parent || !buffs.toz ? 0 : TOZ_COEF_BONUS));
      const base = {
        key,
        channel: p.channel,
        C,
        effect: p.effect,
        conditions: [...(parent?.conditions || []), ...(p.conditions || [])],
      };

      if (allowed && !allowed.has(p.channel)) {
        rows.push({ ...base, kind: parent ? 'summon' : 'direct', name: parent?.name || p.name, summonIndex: parent?.summonIndex, unavailable: 'channel' });
        return;
      }

      const { att, tgt, cond } = channelInputs(s, p.channel);

      if (!parent) {
        const skillIn = { mode: /** @type {'direct'} */ ('direct'), coef: C };
        rows.push({
          ...base,
          kind: 'direct',
          name: p.name,
          noncrit: damageRange(att, tgt, skillIn, { ...cond, crit: false }),
          crit: damageRange(att, tgt, skillIn, { ...cond, crit: true }),
        });
        return;
      }

      const profile = parent.profile;
      const mob = parent.mobData;
      if (!profile || !mob) {
        rows.push({ ...base, kind: 'summon', name: parent.name, summonIndex: parent.summonIndex, unavailable: 'data' });
        return;
      }
      const physical = p.channel === 'physical';
      const S = override.S ?? (physical ? profile.Atk : profile.Ele);
      const SC = override.SC ?? C;
      const skillIn = {
        mode: /** @type {'summon'} */ ('summon'),
        coef: C,
        summonS: S,
        summonSc: SC,
        profile: {
          statRatio: S,
          attackRatio: physical ? profile.Weapon_Dam : profile.Element,
          damageRatio: override.S ?? profile.All_Mix_Dam,
          critRatio: override.S ?? profile.Cri_Dam,
          fixedRatio: profile.Damage_Absolute,
          addRatio: s.targetType === 'boss' ? profile.Boss_Dam : profile.Mob_Dam,
        },
        mob: physical
          ? {
              statBase: mob.Base_Atk,
              attackBase: mob.BASE_NORMAL,
              minDamage: mob.Base_Atk_Min_Dam,
              maxDamage: mob.Base_Atk_Max_Dam,
              critDamage: mob.BASE_CRITICAL_DAMAGE,
              backAttack: mob.BASE_BACK_DAM,
              fixedDamage: mob.BASE_DAMAGE_ABSOLUTE,
            }
          : {
              statBase: mob.Base_Ele,
              attackBase: mob.Base_Water,
              minDamage: mob.Base_Ele_Min_Dam,
              maxDamage: mob.Base_Ele_Max_Dam,
              critDamage: mob.BASE_ELE_CRITICAL_DAMAGE,
              backAttack: mob.BASE_ELE_BACK_DAM,
              fixedDamage: mob.BASE_ELE_DAMAGE_ABSOLUTE,
            },
      };
      rows.push({
        ...base,
        kind: 'summon',
        name: parent.name,
        summonIndex: parent.summonIndex,
        S,
        SC,
        mob: parent.mob,
        statId: parent.statId,
        noncrit: damageRange(att, tgt, skillIn, { ...cond, crit: false }),
        crit: damageRange(att, tgt, skillIn, { ...cond, crit: true }),
      });
    }

    for (const p of variant.parts) visit(p);
    for (const row of stoneRows) for (const p of data.optionEffects[row.Effect] || []) visit(p);

    return { skill, level, variant, choices, rows, stats, input: s, stoneRows, localBuffs, summonObjects };
  }

  return {
    data,
    byClass,
    skillsOf,
    defaultConfig,
    awakenings,
    requiredPage,
    optionsFor,
    optionRows,
    statsOf,
    variants,
    buffStats,
    applyStoneStats,
    defaults,
    calculate,
  };
}
