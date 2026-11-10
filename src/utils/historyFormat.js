// ============================================================
// 캐릭터 변경 이력(character_history) → 사람이 읽는 줄 목록.
//   서버 changes 는 {"stats.크댐": [전, 후], "relics.current": [null, {...}]} 처럼 경로별 전/후 값이다.
//   여기서 객체는 끝까지 펼치고, 각성석·전용석·특화석·메모리얼은 한 덩어리 문장으로 만들고,
//   빈 값끼리의 변화와 화면 상태값(미리보기 토글 등)은 버린다. 원문 JSON 은 보여 주지 않는다.
//
//   ctx (선택): { skillName(key), stoneName(key, stone), presetName(id), runeName(id), relicName(key), memorialName(key) }
// ============================================================

const FIELD_LABEL = {
  name: '이름',
  type: '유형',
  stats: '스탯',
  awak_stones: '각성석',
  memorials: '메모리얼',
  runeword: '룬워드',
  skill_configs: '스킬 설정',
  relics: '성물',
  damage_settings: '대미지 설정',
};
export const FIELD_ORDER = Object.keys(FIELD_LABEL);

// 저장은 되지만 사용자 데이터가 아닌 화면 상태 — 이력에서 숨긴다.
const HIDDEN = [
  /^relics\.(previewOn|editTarget|activeKey|candidate)(\.|$)/,
  /^damage_settings\.deltaMode$/,
  /^skill_configs\.(cls|skillId)$/,
  /^skill_configs\.configs\.[^.]+\.variant$/,
];

const SUB_LABEL = {
  level: '레벨',
  enchantValue: '인챈트',
  backAtkUptime: '백어택 가동률',
  aw1: '1차 각성',
  aw2: '2차 각성',
  noblesse: '노블레스',
  title: '칭호',
  overrides: '직접 수정',
  localBuffs: '개별 버프',
};
const INPUT_LABEL = {
  presetId: '몬스터',
  difficulty: '난이도',
  level: '몬스터 레벨',
  inputMode: '입력 방식',
  skillMode: '스킬 방식',
  skillCoef: '스킬 계수',
  summonS: '소환 S',
  summonSc: '소환 계수',
  critRate: '치명타 확률',
  backAttack: '백어택',
  melee: '근거리',
  status: '상태이상',
  toz: '토즈',
  survival: '서바이벌',
};

// 코드값 → 이름 (대미지 탭 입력)
const ENUM_TEXT = {
  inputMode: { skill: '스킬 선택', manual: '계수 직접 입력' },
  skillMode: { direct: '직타', summon: '소환' },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isAwakStone = (v) => isObj(v) && Array.isArray(v.options);
const isLineStone = (v) => isObj(v) && Array.isArray(v.lines); // 성물 전용석 · 메모리얼
const isSkillStone = (v) => isObj(v) && 'number' in v && 'type' in v;
const isAtom = (v) => isAwakStone(v) || isLineStone(v) || isSkillStone(v);
const filled = (x) => x !== '' && x !== null && x !== undefined && x !== 0;

function isEmpty(v) {
  if (v === null || v === undefined || v === '' || v === 0 || v === false) return true;
  if (Array.isArray(v)) return v.every(isEmpty);
  if (isAwakStone(v)) return !v.options.some((o) => o?.stat && filled(o.value));
  if (isLineStone(v)) return !v.lines.some((l) => (l?.option || l?.label) && filled(l.value));
  if (isObj(v)) return Object.values(v).every(isEmpty);
  return false;
}

const num = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : String(n));

/** 경로 조각 [필드, ...] → 사람이 읽는 라벨 (첫 조각인 필드명은 그룹 제목이라 뺀다) */
function labelFor(segs, ctx) {
  const [field, ...rest] = segs;
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    const s = rest[i];
    const prev = rest[i - 1];
    if (typeof s === 'number') {
      if (field === 'awak_stones' || field === 'memorials') out.push(`${s + 1}번`);
      else if (field === 'runeword') out.push(s === 7 ? '왕룬' : `${s + 1}번 칸`);
      else if (prev === 'stones') out[out.length - 1] = `${field === 'relics' ? '전용석' : '특화석'} ${s + 1}`;
      else out.push(`${s + 1}번`);
      continue;
    }
    if (field === 'stats') out.push(s.replace(/^기본_/, '기본 ').replace(/_퍼$/, ' %'));
    else if (field === 'relics' && prev === 'current') out.push(ctx.relicName?.(s) || s);
    else if (field === 'relics' && s === 'current') continue;
    else if (field === 'skill_configs' && prev === 'configs') out.push(ctx.skillName?.(s) || `스킬 ${s}`);
    else if (field === 'skill_configs' && s === 'configs') continue;
    else if (field === 'damage_settings' && prev === 'inputs') out.push(INPUT_LABEL[s] || s);
    else if (field === 'damage_settings' && s === 'inputs') out.push('입력');
    else if (field === 'damage_settings' && s === 'deltas') out.push('가감');
    else out.push(SUB_LABEL[s] || s);
  }
  return out.join(' · ');
}

/** 값 하나 → 문장 */
function valueText(v, segs, ctx) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '켜짐' : '꺼짐';
  const field = segs[0];
  const last = segs[segs.length - 1];
  if (field === 'type' && (v === 'P' || v === 'M')) return v === 'P' ? '물리' : '마법';
  if (field === 'runeword' && typeof v === 'number') return ctx.runeName?.(v) || `룬 #${v}`;
  if (field === 'damage_settings' && last === 'presetId') return ctx.presetName?.(v) || String(v);
  if (ENUM_TEXT[last]?.[v]) return ENUM_TEXT[last][v];
  if (isAwakStone(v)) {
    const parts = v.options
      .filter((o) => o?.stat && filled(o.value))
      .map((o) => `${o.stat} ${num(o.value)}${o.unit === 'pct' ? '%' : ''}`);
    return parts.length ? parts.join(' · ') : '비어 있음';
  }
  if (isLineStone(v)) {
    const parts = v.lines
      .filter((l) => (l?.option || l?.label) && filled(l.value))
      .map((l) => `${l.option || l.label} ${num(l.value)}`);
    const head = v.key ? `${ctx.memorialName?.(v.key) || v.key}: ` : '';
    return head + (parts.length ? parts.join(' · ') : '비어 있음');
  }
  if (isSkillStone(v)) {
    const skillKey = segs[2];
    const name = ctx.stoneName?.(skillKey, v) || `${v.type === 2 ? '유니크' : '일반'} #${v.number}`;
    return `${name} Lv${v.level}`;
  }
  if (typeof v === 'number') return num(v);
  if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).map((x) => valueText(x, segs, ctx)).join(', ') || '—';
  if (isObj(v)) {
    const parts = Object.entries(v).filter(([, x]) => !isEmpty(x)).map(([k, x]) => `${k} ${valueText(x, segs, ctx)}`);
    return parts.join(' · ') || '—';
  }
  return String(v);
}

function walk(segs, before, after, out) {
  const path = segs.join('.');
  if (HIDDEN.some((re) => re.test(path))) return;
  const recurseObj = (isObj(before) || isObj(after)) && !isAtom(before) && !isAtom(after);
  if (recurseObj) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    for (const k of [...Object.keys(b), ...Object.keys(a).filter((k) => !(k in b))]) walk([...segs, k], b[k], a[k], out);
    return;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const b = Array.isArray(before) ? before : [];
    const a = Array.isArray(after) ? after : [];
    for (let i = 0; i < Math.max(b.length, a.length); i++) walk([...segs, i], b[i], a[i], out);
    return;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (isEmpty(before) && isEmpty(after)) return;
  out.push({ segs, before, after });
}

/**
 * 변경 기록 하나 → 필드별 그룹 [{ field, title, lines: [{label, before, after}], initial }]
 *   update: changes 는 경로별 [전, 후]. create/delete: changes 는 스냅샷 → mode 'snapshot' 으로 값만 보여 준다.
 *   initial = 그룹의 모든 줄이 빈 값에서 시작 (설정을 처음 저장한 경우) — 화면에서 접어 둔다.
 */
export function describeChanges(record, ctx = {}) {
  const leaves = [];
  if (record.action === 'update') {
    for (const [path, pair] of Object.entries(record.changes || {})) {
      const [before, after] = Array.isArray(pair) ? pair : [undefined, pair];
      walk(path.split('.'), before, after, leaves);
    }
  } else {
    for (const [field, value] of Object.entries(record.changes || {})) {
      if (field === 'name') continue;
      walk([field], undefined, value, leaves);
    }
  }

  const groups = new Map();
  for (const { segs, before, after } of leaves) {
    const field = segs[0];
    if (!groups.has(field)) groups.set(field, { field, title: FIELD_LABEL[field] || field, lines: [] });
    groups.get(field).lines.push({
      label: labelFor(segs, ctx) || FIELD_LABEL[field] || field,
      before: isEmpty(before) && record.action === 'update' ? '—' : valueText(before, segs, ctx),
      after: valueText(after, segs, ctx),
      wasEmpty: isEmpty(before),
    });
  }
  const order = (f) => (FIELD_ORDER.includes(f) ? FIELD_ORDER.indexOf(f) : 99);
  return [...groups.values()]
    .sort((a, b) => order(a.field) - order(b.field))
    .map((g) => ({ ...g, initial: record.action === 'update' && g.lines.length > 4 && g.lines.every((l) => l.wasEmpty) }));
}

/** 목록 한 줄 요약 — "각성석 3, 성물 처음 저장" */
export function summarize(record, ctx = {}) {
  if (record.action !== 'update') return record.action === 'create' ? '새 캐릭터' : '캐릭터 삭제';
  const groups = describeChanges(record, ctx);
  if (!groups.length) return '화면 설정만 바뀜';
  return groups.map((g) => (g.initial ? `${g.title} 처음 저장` : `${g.title} ${g.lines.length}`)).join(', ');
}
