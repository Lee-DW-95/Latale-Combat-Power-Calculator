/**
 * 룬 워드 데이터
 *
 * 출처: latale.info/35 "룬 워드 계산기" 의 공개 로직/점수표를 그대로 채택.
 *   - 점수(score)는 게임 내부 수치가 아니라 해당 사이트에서 밸런스 기준으로 매긴 "가치 가중치"다.
 *     0~90점 스케일이며, 옵션 문구(desc)만이 게임 실제 수치다.
 *   - 우리 BP 모델(battlePower.js)로 환산하지 않고 info 사이트와 동일한 점수 체계를 쓴다.
 *     → 같은 룬워드를 두 사이트에서 계산했을 때 점수가 어긋나지 않게 하기 위함.
 *
 * ⚠ 뽑기 확률 가정: info 사이트와 동일하게 "30종 균등 · 중복 없음 · 8개 추첨" 을 쓴다.
 *   게임사 공개 확률이 아니므로 기대 소모 Ely 등은 어디까지나 이 가정 하의 값이다.
 */

// ============================================================
// 룬 30종 — index 가 곧 rune id (뽑기/DP 에서 인덱스로 다룬다)
// ============================================================
export const RUNES = Object.freeze([
  { id: 0,  name: '혈통',        score: 5,  desc: '근력/마법력 +1500' },
  { id: 1,  name: '강철',        score: 0,  desc: '체력 +1500' },
  { id: 2,  name: '행운',        score: 0,  desc: '행운 +1500' },
  { id: 3,  name: '서약',        score: 0,  desc: '퀘스트 보상 +20%, 옵션 발생 확률 +500%' },
  { id: 4,  name: '분노',        score: 20, desc: '공격력/속성력 +70' },
  { id: 5,  name: '축복',        score: 5,  desc: '이동 속도 +50%' },
  { id: 6,  name: '헌신',        score: 25, desc: '최소 대미지 +50%' },
  { id: 7,  name: '풍요',        score: 0,  desc: '아이템 발생 확률 +20%' },
  { id: 8,  name: '파괴',        score: 30, desc: '최대 대미지 +50%' },
  { id: 9,  name: '지혜',        score: 0,  desc: '조합 성공확률 +5%' },
  { id: 10, name: '파멸',        score: 50, desc: '크리티컬 대미지 +50%' },
  { id: 11, name: '신뢰',        score: 5,  desc: '명중률 +20%' },
  { id: 12, name: '열정',        score: 1,  desc: '고정 대미지 +1500' },
  { id: 13, name: '인내',        score: 0,  desc: '경험치 획득량 +10%' },
  { id: 14, name: '격노',        score: 30, desc: '공격력/속성력 +5%' },
  { id: 15, name: '열광',        score: 10, desc: '고정 대미지 +8%' },
  { id: 16, name: '생명',        score: 3,  desc: '최대 HP +5%' },
  { id: 17, name: '평화',        score: 5,  desc: '올스탯 +1500' },
  { id: 18, name: '조화',        score: 25, desc: '올스탯 +5%' },
  { id: 19, name: '통찰',        score: 80, desc: '물리/마법 관통력 +10%, 타격 시 0.1% 확률로 쿨타임 1초 감소' },
  { id: 20, name: '평화 & 조화', score: 26, desc: '올스탯 +1500, 올스탯 +5%' },
  { id: 21, name: '열정 & 분노', score: 26, desc: '고정 대미지 +1500, 공격력/속성력 +70' },
  { id: 22, name: '강철 & 생명', score: 3,  desc: '체력 +1500, 최대 HP +5%' },
  { id: 23, name: '인내 & 서약', score: 0,  desc: '경험치 획득량 +10%, 퀘스트 보상률 +30%' },
  { id: 24, name: '열광 & 격노', score: 40, desc: '고정 대미지 +8%, 공격력/속성력 +5%' },
  { id: 25, name: '헌신 & 파괴', score: 55, desc: '최소 대미지 +50%, 최대 대미지 +50%' },
  { id: 26, name: '축복 & 풍요', score: 5,  desc: '이동 속도 +50%, 아이템 발생 확률 +20%' },
  { id: 27, name: '야성 & 지배', score: 45, desc: '일반 몬스터 대미지 +6000, 일반 몬스터 지배력 +3%' },
  { id: 28, name: '악몽 & 죽음', score: 90, desc: '보스 몬스터 대미지 +10000, 보스 몬스터 지배력 +5%' },
  { id: 29, name: '파멸 & 폭주', score: 50, desc: '크리티컬 대미지 +50%, 크리티컬 확률 +1%' },
]);

// 한 룬워드에 박히는 룬 개수 (마지막 1개가 왕룬)
export const RUNE_SLOTS = 8;

// 룬 워드 스크롤 1개 = 1회 시도
export const ELY_PER_ROLL = 150_000_000;

// 통찰 왕룬 예외 — 80 × 2 = 160 이 아니라 120 으로 고정 (info 사이트 규칙)
const INSIGHT_ID = 19;
const INSIGHT_KING_SCORE = 120;

// 통찰 왕룬 옵션 문구 — 숫자 2배 규칙에서 "쿨타임 1초" 는 그대로 유지되므로 하드코딩
const INSIGHT_KING_DESC = '물리/마법 관통력 +20%, 타격 시 0.2% 확률로 쿨타임 1초 감소';

// ============================================================
// 점수 등급 (info 사이트 기준)
// ============================================================
export const GRADES = Object.freeze([
  { max: 240,      key: 'bad',   label: '교체 권장',   text: '룬 워드 변경을 권장드립니다.' },
  { max: 380,      key: 'temp',  label: '임시용',      text: '임시로 쓸만한 룬 워드입니다.' },
  { max: 470,      key: 'final', label: '최종용',      text: '최종용으로 볼만한 룬 워드입니다.' },
  { max: Infinity, key: 'god',   label: '무조건 획득', text: '무조건 가져가시는걸 권장드립니다.' },
]);

export function gradeOf(total) {
  return GRADES.find((g) => total <= g.max);
}

// 20~29점 = 준주요 옵션, 30점 이상 = 주요 옵션
export function isMidRune(rune) {
  return rune.score >= 20 && rune.score <= 29;
}

export function isMajorRune(rune) {
  return rune.score >= 30;
}

// ============================================================
// 점수 산출 — 왕룬은 2배, 통찰만 120 고정
// ============================================================
export function scoreOf(rune, isKing = false) {
  if (!isKing) return rune.score;
  if (rune.id === INSIGHT_ID) return INSIGHT_KING_SCORE;
  return rune.score * 2;
}

// 룬 하나가 왕룬 자리에 갔을 때의 점수 (id 로 조회)
export function kingScoreOf(runeId) {
  return scoreOf(RUNES[runeId], true);
}

// ============================================================
// 왕룬 옵션 문구 — desc 안의 숫자를 전부 2배로 치환
// ============================================================
export function displayDesc(rune, isKing = false) {
  if (!isKing) return rune.desc;
  if (rune.id === INSIGHT_ID) return INSIGHT_KING_DESC;
  // info 사이트 원본은 부호까지 통째로 Number() 에 넘겨서 "+1500" → "3000" 으로
  // + 가 사라진다. 여기서는 부호를 따로 캡처해 유지한다 (점수 계산에는 영향 없음).
  return rune.desc.replace(/([+-]?)(\d+(?:\.\d+)?)/g, (_m, sign, num) => {
    const doubled = Number((Number(num) * 2).toFixed(10));
    return `${sign}${doubled}`;
  });
}

// ============================================================
// 이론상 최대 총합
//   왕룬 후보 30종 각각에 대해 (왕룬 점수 + 나머지 상위 7개) 를 계산해 최댓값.
//   현재 데이터 기준 530점 = 악몽&죽음 왕룬(180) + 통찰80 + 헌신&파괴55 + 파멸50
//                            + 파멸&폭주50 + 야성&지배45 + 열광&격노40 + 격노30
// ============================================================
export const MAX_TOTAL = (() => {
  let max = 0;
  for (const king of RUNES) {
    const rest = RUNES.filter((r) => r.id !== king.id)
      .map((r) => r.score)
      .sort((a, b) => b - a);
    let sum = scoreOf(king, true);
    for (let i = 0; i < RUNE_SLOTS - 1; i++) sum += rest[i] || 0;
    if (sum > max) max = sum;
  }
  return max;
})();


// ============================================================
// 목표 시뮬 select 용 — 룬 하나 = 옵션 하나
//
// 게임에서 룬워드 한 칸에는 룬 하나가 박히고, 그 룬의 옵션 문구가 곧 그 칸의 옵션이다.
//   헌신(최소 +50%) / 파괴(최대 +50%) / 헌신 & 파괴(최소 +50%, 최대 +50%) 는
//   서로 완전히 다른 옵션이며, "최소 대미지를 가진 룬" 같은 묶음이 아니다.
// → 옵션 목록은 룬 30종과 1:1 이다. "A 또는 B" 식의 묶음 항목은 두지 않는다.
//   여러 룬 중 아무거나를 원하면 그 룬들을 고르고 "N개 이상" 조건을 쓰면 된다.
//   (예: 파멸 + 파멸 & 폭주 를 고르고 1개 이상 → 크리티컬 대미지가 붙기만 하면 성공)
//
// 단일 룬 / 복합 룬으로 나누고 각 그룹 안에서는 점수 높은 순으로 정렬한다.
// ============================================================
const FIRST_COMBO_ID = 20; // 20번부터 복합 룬 (A & B)

export const SINGLE_RUNES = Object.freeze(RUNES.filter((r) => r.id < FIRST_COMBO_ID));
export const COMBO_RUNES = Object.freeze(RUNES.filter((r) => r.id >= FIRST_COMBO_ID));

const byScoreDesc = (a, b) => b.score - a.score || a.id - b.id;

export const RUNE_SELECT_GROUPS = Object.freeze([
  { key: 'single', label: '단일 룬', runes: Object.freeze([...SINGLE_RUNES].sort(byScoreDesc)) },
  { key: 'combo', label: '복합 룬', runes: Object.freeze([...COMBO_RUNES].sort(byScoreDesc)) },
]);