/**
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
 * 총 46개 / 39개 직업
 */
export const INSTALLER_SKILLS = Object.freeze({
  "검성": [
    { idx: 27, name: "납도 - 장대비", elementCoef: 62, baseGeunmaMult: 1.5, perLevelGeunmaMult: 0.02, baseTotalMult: 2.3, perLevelTotalMult: 0 },
  ],
  "검호": [
    { idx: 3, name: "케나인 블레이드", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.305, perLevelTotalMult: 0.0475 },
  ],
  "게이트키퍼": [
    { idx: 26, name: "트위스트 링", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.15, perLevelTotalMult: 0.052 },
  ],
  "다크체이서": [
    { idx: 24, name: "체인버스트", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.41, perLevelTotalMult: 0.05 },
  ],
  "데미갓(분노)": [
    { idx: 22, name: "글로리아", elementCoef: 42, baseGeunmaMult: 1.14, perLevelGeunmaMult: 0.02, baseTotalMult: 1.4675, perLevelTotalMult: 0.0525 },
  ],
  "데미갓(신성)": [
    { idx: 21, name: "글로리아", elementCoef: 82, baseGeunmaMult: 1.14, perLevelGeunmaMult: 0.02, baseTotalMult: 1.3175, perLevelTotalMult: 0.0475 },
  ],
  "도깨비": [
    { idx: 42, name: "요술 : 귀도", elementCoef: 42, baseGeunmaMult: 1.3, perLevelGeunmaMult: 0, baseTotalMult: 1.71, perLevelTotalMult: 0 },
    { idx: 43, name: "백귀야행", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.435, perLevelTotalMult: 0.055 },
  ],
  "레이니아": [
    { idx: 40, name: "워터봄", elementCoef: 42, baseGeunmaMult: 1.16, perLevelGeunmaMult: 0.02, baseTotalMult: 1.3, perLevelTotalMult: 0.05 },
  ],
  "로그마스터": [
    { idx: 35, name: "인법 난", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.255, perLevelTotalMult: 0.045 },
  ],
  "마에스트로": [
    { idx: 33, name: "파쇼나토", elementCoef: 62, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.255, perLevelTotalMult: 0.045 },
  ],
  "사이키커": [
    { idx: 31, name: "사이킥 아츠 크랙", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.4025, perLevelTotalMult: 0.0475 },
  ],
  "섀도우워커": [
    { idx: 25, name: "다크 스피릿", elementCoef: 42, baseGeunmaMult: 1.14, perLevelGeunmaMult: 0.02, baseTotalMult: 1.3, perLevelTotalMult: 0.05 },
  ],
  "세이버 (검)": [
    { idx: 4, name: "소드브레스", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.245, perLevelTotalMult: 0.0475 },
  ],
  "세이버 (둔기)": [
    { idx: 5, name: "해머타이푼", elementCoef: 42, baseGeunmaMult: 1.26, perLevelGeunmaMult: 0.02, baseTotalMult: 1.6225, perLevelTotalMult: 0.0525 },
  ],
  "세피로트": [
    { idx: 6, name: "대지파열", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.415, perLevelTotalMult: 0.045 },
  ],
  "소드댄서": [
    { idx: 29, name: "화령검무", elementCoef: 62, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.4475, perLevelTotalMult: 0.0525 },
  ],
  "소디언": [
    { idx: 13, name: "하이퍼캐논", elementCoef: 82, baseGeunmaMult: 1.24, perLevelGeunmaMult: 0.02, baseTotalMult: 1.5, perLevelTotalMult: 0.05 },
  ],
  "소울리스 원": [
    { idx: 14, name: "소울 마스터4 (다크)", elementCoef: 162, baseGeunmaMult: 1.26, perLevelGeunmaMult: 0.02, baseTotalMult: 1.6, perLevelTotalMult: 0.0525 },
  ],
  "스타시커": [
    { idx: 36, name: "엘메이", elementCoef: 42, baseGeunmaMult: 1.16, perLevelGeunmaMult: 0.02, baseTotalMult: 1.325, perLevelTotalMult: 0.045 },
    { idx: 37, name: "터렛", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.24, perLevelTotalMult: 0.0475 },
  ],
  "아그니": [
    { idx: 23, name: "인페르노", elementCoef: 42, baseGeunmaMult: 1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.02, perLevelTotalMult: 0.045 },
  ],
  "아크마스터": [
    { idx: 15, name: "봉인해제", elementCoef: 42, baseGeunmaMult: 1.6, perLevelGeunmaMult: 0, baseTotalMult: 2.47, perLevelTotalMult: 0 },
    { idx: 16, name: "버스트 카드", elementCoef: 42, baseGeunmaMult: 1.14, perLevelGeunmaMult: 0.02, baseTotalMult: 1.2675, perLevelTotalMult: 0.0475 },
  ],
  "아크메이지": [
    { idx: 7, name: "아이스 플랭크", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.2, perLevelTotalMult: 0.05 },
    { idx: 41, name: "천룡아", elementCoef: 82, baseGeunmaMult: 1.3, perLevelGeunmaMult: 0.02, baseTotalMult: 1.62, perLevelTotalMult: 0.06 },
  ],
  "윈드스토커 (단검)": [
    { idx: 9, name: "펜 오브 나이프", elementCoef: 42, baseGeunmaMult: 1.14, perLevelGeunmaMult: 0.02, baseTotalMult: 1.315, perLevelTotalMult: 0.0475 },
  ],
  "윈드스토커 (석궁)": [
    { idx: 11, name: "와이드 샷", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.2575, perLevelTotalMult: 0.0425 },
  ],
  "윈드스토커 (활)": [
    { idx: 10, name: "에로우 트랩", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.415, perLevelTotalMult: 0.0475 },
  ],
  "윈디아": [
    { idx: 39, name: "윈드스톰", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.4, perLevelTotalMult: 0.0475 },
  ],
  "저지먼트": [
    { idx: 34, name: "트위스터", elementCoef: 62, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.4675, perLevelTotalMult: 0.0525 },
  ],
  "쥬얼스타": [
    { idx: 38, name: "매직스퀘어", elementCoef: 42, baseGeunmaMult: 1.14, perLevelGeunmaMult: 0.02, baseTotalMult: 1.42, perLevelTotalMult: 0.055 },
  ],
  "직업 공용": [
    { idx: 44, name: "설치형 코어", elementCoef: 42, baseGeunmaMult: 1.3, perLevelGeunmaMult: 0, baseTotalMult: 1.7, perLevelTotalMult: 0 },
    { idx: 45, name: "무기 타격효과", elementCoef: 202, baseGeunmaMult: 1, perLevelGeunmaMult: 0, baseTotalMult: 1.01, perLevelTotalMult: 0 },
  ],
  "테러나이트": [
    { idx: 30, name: "카오스존", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.47, perLevelTotalMult: 0.05 },
  ],
  "파픈스타": [
    { idx: 8, name: "일렉트릭 웨이브", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.19, perLevelTotalMult: 0.045 },
  ],
  "팬텀메이지": [
    { idx: 32, name: "사신의 기운", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.1925, perLevelTotalMult: 0.0525 },
    { idx: 46, name: "데빌사이드[립]", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.42, perLevelTotalMult: 0.055 },
  ],
  "포스마스터": [
    { idx: 17, name: "봉인몬스터", elementCoef: 62, baseGeunmaMult: 1.26, perLevelGeunmaMult: 0.02, baseTotalMult: 1.545, perLevelTotalMult: 0.055 },
    { idx: 18, name: "스페셜 킥", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.3825, perLevelTotalMult: 0.0525 },
  ],
  "프라이쉬츠": [
    { idx: 12, name: "디스트로이 홀", elementCoef: 42, baseGeunmaMult: 1.22, perLevelGeunmaMult: 0.02, baseTotalMult: 1.51, perLevelTotalMult: 0.05 },
  ],
  "하이랜더": [
    { idx: 28, name: "스파이럴 서먼", elementCoef: 62, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.22, perLevelTotalMult: 0.0475 },
  ],
  "흑영(도)": [
    { idx: 20, name: "그림자 칼날", elementCoef: 42, baseGeunmaMult: 1.22, perLevelGeunmaMult: 0.02, baseTotalMult: 1.5025, perLevelTotalMult: 0.0525 },
  ],
  "흑영(옥)": [
    { idx: 19, name: "파괴의 그림자", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.405, perLevelTotalMult: 0.0475 },
  ],
  "히어로 (검)": [
    { idx: 1, name: "십자베기", elementCoef: 42, baseGeunmaMult: 1.1, perLevelGeunmaMult: 0.02, baseTotalMult: 1.2575, perLevelTotalMult: 0.0425 },
  ],
  "히어로 (창)": [
    { idx: 2, name: "라이트닝 랜스", elementCoef: 42, baseGeunmaMult: 1.2, perLevelGeunmaMult: 0.02, baseTotalMult: 1.4, perLevelTotalMult: 0.05 },
  ],
});

export const INSTALLER_JOBS = Object.freeze(["검성","검호","게이트키퍼","다크체이서","데미갓(분노)","데미갓(신성)","도깨비","레이니아","로그마스터","마에스트로","사이키커","섀도우워커","세이버 (검)","세이버 (둔기)","세피로트","소드댄서","소디언","소울리스 원","스타시커","아그니","아크마스터","아크메이지","윈드스토커 (단검)","윈드스토커 (석궁)","윈드스토커 (활)","윈디아","저지먼트","쥬얼스타","직업 공용","테러나이트","파픈스타","팬텀메이지","포스마스터","프라이쉬츠","하이랜더","흑영(도)","흑영(옥)","히어로 (검)","히어로 (창)"]);

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
