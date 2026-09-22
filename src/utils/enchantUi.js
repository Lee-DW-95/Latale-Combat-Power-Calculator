// 인챈트 화면 공용 표시 헬퍼 — EnchantSimulator / EnchantLookup 이 같이 쓴다.

// 등급% → 진행바 색상
export function gradeBarColor(p) {
  if (p == null) return 'bg-stone-300 dark:bg-stone-600';
  if (p >= 90) return 'bg-rose-500';
  if (p >= 70) return 'bg-amber-500';
  if (p >= 30) return 'bg-cyan-500';
  return 'bg-stone-400 dark:bg-stone-500';
}
