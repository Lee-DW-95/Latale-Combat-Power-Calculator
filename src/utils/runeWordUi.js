// 룬워드 화면 공용 표시 헬퍼 — RuneWordSimulator / RuneWordOptionTable 이 같이 쓴다.
import { isMidRune, isMajorRune } from '../data/runeWordData.js';

export const INSIGHT_ID = 19;   // 통찰 — 왕룬 점수 예외
export const FIRST_COMBO_ID = 20; // 20번부터 복합 룬
export const GRADE_TEXT = {
  bad:   'text-stone-500 dark:text-stone-400',
  temp:  'text-cyan-600 dark:text-cyan-400',
  final: 'text-amber-600 dark:text-amber-400',
  god:   'text-rose-600 dark:text-rose-400',
};
export const GRADE_CHIP = {
  bad:   'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300',
  temp:  'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300',
  final: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  god:   'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
};
// 룬 등급 — 이름을 색칠하는 대신 좌측 액센트 바와 칩으로 표현한다
export function runeTier(rune) {
  if (isMajorRune(rune)) return 'major';
  if (isMidRune(rune)) return 'mid';
  if (rune.score > 0) return 'minor';
  return 'none';
}
export const TIER_BAR = {
  major: 'before:bg-rose-500',
  mid:   'before:bg-amber-500',
  minor: 'before:bg-stone-300 dark:before:bg-stone-600',
  none:  'before:bg-transparent',
};
export const TIER_CHIP = {
  major: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
  mid:   'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  minor: '',
  none:  '',
};
export const TIER_LABEL = { major: '주요', mid: '준주요', minor: '', none: '' };
// 왕룬 자리 점수 (통찰만 120 고정)
export function scoreAsKing(rune) {
  return rune.id === INSIGHT_ID ? 120 : rune.score * 2;
}
