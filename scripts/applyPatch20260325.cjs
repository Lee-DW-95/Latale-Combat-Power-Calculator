/**
 * 라테일 2026-03-25 밸런스 패치 적용 — 직타 스킬 계수 22개 변경.
 *
 * 패치 노트: https://www.latale.com/news/notice/view/3663
 *
 * 공식: Lv5 = baseCoef + 5 × perLevel
 * 기존 ratio(perLevel/baseCoef) 유지하면서 새 Lv5 에 맞춰 환산:
 *   new_baseCoef = new_Lv5 / (1 + 5 × ratio)
 *   new_perLevel = new_baseCoef × ratio
 *
 * 슬라이딩 킥/참영권은 기존 데이터의 ratio 가 비정상(~9)이라 표준 0.2 강제 적용.
 *
 * 멱등 (재실행해도 결과 동일).
 */

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../src/data/directHitSkills.js');

// 직업명 매핑 (패치 노트 형식 → 우리 데이터 형식)
const jobMap = {
  '히어로 - 양손검': '히어로 (검)',
  '히어로 - 창': '히어로 (창)',
  '세피로트': '세피로트',
  '파픈스타': '파픈스타',
  '윈드스토커 - 활': '윈드스토커 (활)',
  '윈드스토커 - 석궁': '윈드스토커 (석궁)',
  '윈드스토커 - 단검': '윈드스토커 (단검)',
  '소울리스 원': '소울리스 원',
  '아그니': '아그니',
  '테러나이트': '테러나이트',
  '마에스트로': '마에스트로',
  '로그마스터': '로그마스터',
  '저지먼트': '저지먼트',
  '윈디아': '윈디아',
};

// 스킬명 alias (패치 표기 → 우리 데이터의 실제 표기)
const skillAlias = {
  '에네르기파': '에네르기 파',
  '일렉트릭 쇼크': '일렉트릭쇼크',
  '크레이지 스로우': '크레이지스로우',
  '소울 마스터 I 블루': '소울 마스터 1',
  '소울 마스터 II 블루': '소울 마스터 2',
  '소울 마스터 III 블루': '소울 마스터 3',
  '소울 마스터 IV 블루': '소울 마스터 4',
  '스톰 샷': '스톰 샷 : 릴리즈',
  '윈드 블레이드': '윈드 블레이드 : 차지',
  '인법_경(絅)': '인법_경',
  '애로우 샷': '에로우 샷',  // 스프레드시트 오타 — 우리 데이터는 '에로우 샷'
};

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeSkillName(s) {
  return s.replace(/\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
}
function dataSkillName(patchSkill) {
  return skillAlias[patchSkill] ?? normalizeSkillName(patchSkill);
}

// 2026-03-25 패치 변경 + 표준 ratio 강제 케이스
//   force_ratio: 기존 데이터의 ratio 가 비정상이라 0.2 로 재설정
const PATCH_CHANGES = [
  { job: '히어로 - 양손검', skill: '광풍참', newLv5: 11000 },
  { job: '세피로트', skill: '돌려차기', newLv5: 10000 },
  { job: '세피로트', skill: '에네르기파', newLv5: 13000 },
  { job: '세피로트', skill: '슬라이딩 킥', newLv5: 8000, force_ratio: 0.2 },
  { job: '세피로트', skill: '참영권', newLv5: 8000, force_ratio: 0.2 },
  { job: '세피로트', skill: '승룡권', newLv5: 6000 },
  { job: '파픈스타', skill: '일렉트릭 쇼크', newLv5: 13000 },
  { job: '윈드스토커 - 활', skill: '애로우 샷', newLv5: 10000 },
  { job: '윈드스토커 - 석궁', skill: '프레임 샤워', newLv5: 8000 },
  { job: '윈드스토커 - 단검', skill: '블리츠', newLv5: 11500 },
  { job: '윈드스토커 - 단검', skill: '크레이지 스로우', newLv5: 11000 },
  { job: '소울리스 원', skill: '소울 마스터 I 블루', newLv5: 14500 },
  { job: '소울리스 원', skill: '소울 마스터 III 블루', newLv5: 13500 },
  { job: '소울리스 원', skill: '소울 마스터 IV 블루', newLv5: 13000 },
  { job: '아그니', skill: '기간틱 스트라이크', newLv5: 15000 },
  { job: '테러나이트', skill: '일렉트릭 드레인', newLv5: 10000 },
  { job: '마에스트로', skill: '비르투오소', newLv5: 14000 },
  { job: '마에스트로', skill: '프레스티시모', newLv5: 10000 },
  { job: '로그마스터', skill: '인법_경(絅)', newLv5: 10000 },
  { job: '저지먼트', skill: '크루얼건', newLv5: 12000 },
  { job: '윈디아', skill: '스톰 샷', newLv5: 11000 },
  { job: '윈디아', skill: '윈드 블레이드', newLv5: 12000 },
];

function applyPatch() {
  let src = fs.readFileSync(FILE, 'utf8');
  const log = [];

  for (const ch of PATCH_CHANGES) {
    const dataJob = jobMap[ch.job];
    if (!dataJob) {
      log.push(`✗ 직업 매핑 없음: ${ch.job}`);
      continue;
    }
    const dataSkill = dataSkillName(ch.skill);

    // 직업 블록 (괄호 escape 필수)
    const jobBlockRe = new RegExp(
      `("${reEscape(dataJob)}":\\s*\\[)([\\s\\S]*?)(\\n\\s*\\],)`,
    );
    const jobMatch = src.match(jobBlockRe);
    if (!jobMatch) {
      log.push(`✗ 직업 블록 못 찾음: ${dataJob}`);
      continue;
    }
    const jobBody = jobMatch[2];

    const lineRe = /\{ idx: (\d+), name: "([^"]+)", baseCoef: (\d+(?:\.\d+)?), perLevel: (\d+(?:\.\d+)?) \}/g;
    let lineMatch;
    let updated = false;
    let newBody = jobBody;

    while ((lineMatch = lineRe.exec(jobBody)) !== null) {
      if (lineMatch[2] !== dataSkill) continue;

      const oldBase = Number(lineMatch[3]);
      const oldPer = Number(lineMatch[4]);
      const ratio = ch.force_ratio ?? oldPer / oldBase;

      const newBase = Math.round(ch.newLv5 / (1 + 5 * ratio));
      const newPer = Math.round(newBase * ratio);

      const oldStr = lineMatch[0];
      const newStr = `{ idx: ${lineMatch[1]}, name: "${lineMatch[2]}", baseCoef: ${newBase}, perLevel: ${newPer} }`;
      newBody = newBody.replace(oldStr, newStr);
      log.push(
        `✓ ${dataJob} / ${lineMatch[2]}: ` +
          `${oldBase}/${oldPer} → ${newBase}/${newPer} ` +
          `(Lv5: ${oldBase + 5 * oldPer} → ${ch.newLv5})`,
      );
      updated = true;
      break;
    }
    if (!updated) {
      log.push(`✗ 스킬 못 찾음: ${dataJob} / ${dataSkill}`);
      continue;
    }

    src = src.replace(jobMatch[0], jobMatch[1] + newBody + jobMatch[3]);
  }

  fs.writeFileSync(FILE, src, 'utf8');
  console.log(log.join('\n'));
  const ok = log.filter((l) => l.startsWith('✓')).length;
  console.log(`\n총 ${PATCH_CHANGES.length}개 시도 / ${ok}개 적용`);
}

applyPatch();
