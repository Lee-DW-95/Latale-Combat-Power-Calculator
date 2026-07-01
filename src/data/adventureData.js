/**
 * 라테일 어드벤처 지도 데이터
 *
 * 출처: lataleinfo.tistory.com/415 ("라테일 어드벤처 지도 1 ~ 56")
 * - 지도 이미지는 원본을 내려받아 public/assets/adventure/ 에 WebP 로 최적화 저장.
 * - 지도 1(z2U0Y)은 직접 CDN 이 404 라 daum 썸네일 프록시로 확보 → 1~56 전량 제공.
 */

// ============================================================
// 5단계 단위 진입 보상 버프 테이블
//   stage    : 어드벤처 스테이지(정도)
//   squares  : 진입에 필요한 누적 칸 수
//   buff      : 버프 종류
//   value    : 버프 수치(표시용 문자열)
//   kind     : 스타일 구분용 카테고리
// ============================================================
export const ADVENTURE_BUFFS = [
  { stage: 30, squares: 975,  buff: '소환수 경험치 획득',   value: '+25%',    kind: 'exp' },
  { stage: 35, squares: 1153, buff: '아이템 발생 확률',     value: '+10%',    kind: 'drop' },
  { stage: 40, squares: 1360, buff: '올스탯',              value: '+1,000',  kind: 'stat' },
  { stage: 45, squares: 1556, buff: '물리/마법 최대 대미지', value: '+20%',    kind: 'dmg' },
  { stage: 50, squares: 1759, buff: '소환수 경험치 획득',   value: '+25%',    kind: 'exp' },
  { stage: 55, squares: 1961, buff: '아이템 발생 확률',     value: '+10%',    kind: 'drop' },
  { stage: 60, squares: 2153, buff: '올스탯',              value: '+1,000',  kind: 'stat' },
  { stage: 65, squares: 2350, buff: '물리/마법 최대 대미지', value: '+20%',    kind: 'dmg' },
];

// 버프 카테고리별 배지 색상 (light / dark 겸용 Tailwind 클래스)
export const BUFF_KIND_STYLE = {
  exp:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  drop: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  stat: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  dmg:  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

// ============================================================
// 지도 이미지 목록 (1~56 전량)
// ============================================================
export const ADVENTURE_MAP_START = 1;
export const ADVENTURE_MAP_END = 56;

export const ADVENTURE_MAPS = Array.from(
  { length: ADVENTURE_MAP_END - ADVENTURE_MAP_START + 1 },
  (_, i) => {
    const stage = ADVENTURE_MAP_START + i;
    const nn = String(stage).padStart(2, '0');
    return {
      stage,
      title: `지도 ${stage}`,
      src: `/assets/adventure/map-${nn}.webp`,
    };
  },
);

export const ADVENTURE_SOURCE_URL = 'https://lataleinfo.tistory.com/415';
