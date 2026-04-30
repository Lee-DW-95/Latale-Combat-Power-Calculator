/**
 * 대미지 예측 유틸
 *
 * 라테일 대미지 공식은 BP 회귀 공식과 같은 곱셈 구조를 공유한다.
 * 고정 타겟(허수아비 등) 기준으로:
 *
 *   대미지 ≈ attackBase × 곱셈항들 × 스킬계수 × 타겟계수
 *   BP     ≈ attackBase × 곱셈항들 × base_constant
 *
 * 따라서: 대미지 ≈ BP × (스킬계수 / 100) × (타겟계수 / base_constant) = BP × (스킬계수/100) × C
 *
 * - 직타 스킬: 스킬계수 = directHitSkillCoef(직업, 스킬, 레벨)  (스프레드시트 직타 DB)
 * - 설치/소환 스킬: 스킬계수 = installerSkillStats(...).totalMult × 100   (대략)
 *
 * C 는 사용자 캘리브레이션. 첫 사용 시 인게임 측정값(value/skillCoef)으로 도출,
 * 캐릭별로 localStorage 에 저장.
 */

import { calculateBattlePower } from './battlePower.js';
import { directHitSkillCoef } from '../data/directHitSkills.js';
import { installerSkillStats } from '../data/installerSkills.js';

// ============================================================
// 스킬 계수 통합 조회
// ============================================================
export function getSkillCoef(mode, job, skillName, level) {
  if (!job || !skillName) return 0;
  const lv = Math.max(1, Number(level) || 1);
  if (mode === 'direct') {
    return directHitSkillCoef(job, skillName, lv);
  }
  if (mode === 'installer') {
    const s = installerSkillStats(job, skillName, lv);
    if (!s) return 0;
    // 설치/소환 직업의 효과적 "스킬계수" 환산:
    //   직타에서 baseCoef 1000(=10x) 이 표준이라면,
    //   설치형은 totalMult 1.2575 같은 배율 단위 → 1.2575 × 100 = 125.75 형태로 정규화.
    //   실제 게임 대미지는 무속계수×속성력 × 근마배율×근마 등 별도 곱셈으로 들어가므로
    //   여기서는 "스킬계수" 단일 숫자로 합치는 근사치.
    return s.totalMult * 100;
  }
  return 0;
}

// ============================================================
// 대미지 예측 (캘리브레이션 C 필요)
// ============================================================
export function predictDamage(stats, mode, job, skillName, level, calibrationC) {
  const bp = calculateBattlePower(stats);
  const coef = getSkillCoef(mode, job, skillName, level);
  if (!Number.isFinite(calibrationC) || calibrationC <= 0) return 0;
  return calibrationC * bp * (coef / 100);
}

/**
 * 사용자 측정값으로부터 캘리브레이션 상수 C 역산.
 *   measured = C × BP × (coef / 100)
 *   ⇒ C = measured × 100 / (BP × coef)
 */
export function calibrateC(stats, mode, job, skillName, level, measuredDamage) {
  const bp = calculateBattlePower(stats);
  const coef = getSkillCoef(mode, job, skillName, level);
  if (bp <= 0 || coef <= 0) return null;
  const m = Number(measuredDamage);
  if (!Number.isFinite(m) || m <= 0) return null;
  return (m * 100) / (bp * coef);
}
