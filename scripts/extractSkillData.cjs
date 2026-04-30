/**
 * 라테일 스펙 분석기 3.4.1 (구글 스프레드시트) 에서 추출한 CSV를
 * src/data/ 의 JS 데이터 파일로 변환하는 1회용 스크립트.
 *
 * 입력: _skill_dh.csv, _skill_inst.csv, _relic_preset.csv, _relic2.csv
 * 출력:
 *   src/data/directHitSkills.js
 *   src/data/installerSkills.js
 *   src/data/relics.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 큰따옴표로 둘러싼 CSV 라인을 컬럼 배열로 파싱
function parseCsvLine(line) {
  if (!line.startsWith('"')) return null;
  const stripped = line.slice(1, -1);
  return stripped.split('","').map((s) => s.trim());
}

// "1,000" → 1000, " 1.5 " → 1.5
function parseNum(s) {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[, ]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// 동일 객체 → 안정적 직렬화 (ESLint 친화적 출력)
function serializeJob(jobName, items, indent = '    ') {
  const lines = items
    .map((it) => {
      const parts = [`name: ${JSON.stringify(it.name)}`];
      if (it.idx != null) parts.unshift(`idx: ${it.idx}`);
      parts.push(`baseCoef: ${it.baseCoef}`);
      parts.push(`perLevel: ${it.perLevel}`);
      return `${indent}{ ${parts.join(', ')} }`;
    })
    .join(',\n');
  return `  ${JSON.stringify(jobName)}: [\n${lines},\n  ],`;
}

// ============================================================
// 1) 직타 스킬 (832줄)
// ============================================================
function extractDirectHit() {
  const csv = fs.readFileSync(path.join(ROOT, '_skill_dh.csv'), 'utf8');
  const lines = csv.split('\n').filter((l) => l.trim().length > 0);

  const byJob = {};
  let total = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols || cols.length < 6) continue;
    const job = cols[1];
    const idx = parseInt(cols[2], 10);
    const name = cols[3];
    const baseCoef = parseNum(cols[4]);
    const perLevel = parseNum(cols[5]);

    if (!job || !name || baseCoef <= 0) continue;

    if (!byJob[job]) byJob[job] = [];
    byJob[job].push({ idx, name, baseCoef, perLevel });
    total++;
  }

  // 출력
  const jobs = Object.keys(byJob).sort();
  const body = jobs.map((j) => serializeJob(j, byJob[j])).join('\n');

  const out = `/**
 * 직타(직접타격) 스킬 계수 데이터베이스
 *
 * 출처: 라테일 스펙 분석기 3.4.1 배포본 (유저 제작)
 * 마지막 동기화: 2026-04-30
 *
 * 구조: { 직업명: [{ idx, name, baseCoef, perLevel }] }
 * 사용:
 *   스킬 계수 = baseCoef + 스킬레벨 × perLevel
 *   (인게임 툴팁 기준 — Lv1 = baseCoef + 1×perLevel, Lv5 = baseCoef + 5×perLevel)
 *
 * 검증 (라테일 공홈 2025-04-16 밸런스 패치):
 *   인법_무 Lv5 9000 = 4500 + 5×900, 인법_뢰 Lv5 7600 = 3800 + 5×760
 *
 * 총 ${total}개 스킬 / ${jobs.length}개 직업
 */
export const DIRECT_HIT_SKILLS = Object.freeze({
${body}
});

export const DIRECT_HIT_JOBS = Object.freeze(${JSON.stringify(jobs)});

/**
 * 스킬 계수 계산. level 은 1 이상 정수 가정.
 *   directHitSkillCoef('로그마스터', '인법_무', 5)  // → 9000
 *
 * 인게임 툴팁 기준 공식: Lv1 = baseCoef + 1×perLevel, Lv5 = baseCoef + 5×perLevel
 *
 * @param {string} job
 * @param {string} skillName
 * @param {number} level - 스킬 레벨 (1+)
 * @returns {number} 계수 (없으면 0)
 */
export function directHitSkillCoef(job, skillName, level) {
  const skills = DIRECT_HIT_SKILLS[job];
  if (!skills) return 0;
  const skill = skills.find((s) => s.name === skillName);
  if (!skill) return 0;
  const lv = Math.max(1, Number(level) || 1);
  return skill.baseCoef + lv * skill.perLevel;
}
`;

  fs.writeFileSync(path.join(ROOT, 'src/data/directHitSkills.js'), out, 'utf8');
  console.log(`✓ directHitSkills.js — ${jobs.length} jobs, ${total} skills`);
}

// ============================================================
// 2) 설치/소환형 스킬 (47줄)
//    컬럼: idx, 수식매칭용, 수식2, 직업명, 스킬명, 스킬레벨,
//          무속계수, 기본근마배율, 레벨당근마배율, 기본총배율, 레벨당총배율
// ============================================================
function extractInstaller() {
  const csv = fs.readFileSync(path.join(ROOT, '_skill_inst.csv'), 'utf8');
  const lines = csv.split('\n').filter((l) => l.trim().length > 0);

  const byJob = {};
  let total = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols || cols.length < 12) continue;
    const idx = parseInt(cols[1], 10);
    const job = cols[4];
    const name = cols[5];
    // cols[6] is 스킬레벨 - skip (per-user)
    const elementCoef = parseNum(cols[7]);
    const baseGeunmaMult = parseNum(cols[8]);
    const perLevelGeunmaMult = parseNum(cols[9]);
    const baseTotalMult = parseNum(cols[10]);
    const perLevelTotalMult = parseNum(cols[11]);

    if (!job || !name || elementCoef <= 0) continue;

    if (!byJob[job]) byJob[job] = [];
    byJob[job].push({
      idx,
      name,
      elementCoef,
      baseGeunmaMult,
      perLevelGeunmaMult,
      baseTotalMult,
      perLevelTotalMult,
    });
    total++;
  }

  const jobs = Object.keys(byJob).sort();
  const body = jobs
    .map((j) => {
      const items = byJob[j]
        .map(
          (it) =>
            `    { idx: ${it.idx}, name: ${JSON.stringify(it.name)}, ` +
            `elementCoef: ${it.elementCoef}, ` +
            `baseGeunmaMult: ${it.baseGeunmaMult}, perLevelGeunmaMult: ${it.perLevelGeunmaMult}, ` +
            `baseTotalMult: ${it.baseTotalMult}, perLevelTotalMult: ${it.perLevelTotalMult} }`,
        )
        .join(',\n');
      return `  ${JSON.stringify(j)}: [\n${items},\n  ],`;
    })
    .join('\n');

  const out = `/**
 * 설치/소환형 스킬 계수 + 배율 데이터베이스
 *
 * 출처: 라테일 스펙 분석기 3.4.1 배포본 (유저 제작)
 * 마지막 동기화: 2026-04-30
 *
 * 구조 (직업별 1개 대표 스킬 가정 — 시트 데이터 그대로):
 *   {
 *     직업명: [{
 *       idx, name,
 *       elementCoef         // 무속계수 (기본 42)
 *       baseGeunmaMult      // 기본 근/마 배율
 *       perLevelGeunmaMult  // 스킬레벨당 근/마 배율 증가
 *       baseTotalMult       // 기본 총배율
 *       perLevelTotalMult   // 스킬레벨당 총배율 증가
 *     }]
 *   }
 *
 * 총 ${total}개 / ${jobs.length}개 직업
 */
export const INSTALLER_SKILLS = Object.freeze({
${body}
});

export const INSTALLER_JOBS = Object.freeze(${JSON.stringify(jobs)});

/**
 * 스킬레벨에 따른 근/마 배율, 총배율 산출.
 *
 * @param {string} job
 * @param {string} skillName
 * @param {number} level - 스킬 레벨 (1+)
 * @returns {{elementCoef:number, geunmaMult:number, totalMult:number}|null}
 */
export function installerSkillStats(job, skillName, level) {
  const skills = INSTALLER_SKILLS[job];
  if (!skills) return null;
  const skill = skills.find((s) => s.name === skillName);
  if (!skill) return null;
  const lv = Math.max(1, Number(level) || 1);
  return {
    elementCoef: skill.elementCoef,
    geunmaMult: skill.baseGeunmaMult + lv * skill.perLevelGeunmaMult,
    totalMult: skill.baseTotalMult + lv * skill.perLevelTotalMult,
  };
}
`;

  fs.writeFileSync(path.join(ROOT, 'src/data/installerSkills.js'), out, 'utf8');
  console.log(`✓ installerSkills.js — ${jobs.length} jobs, ${total} skills`);
}

extractDirectHit();
extractInstaller();
