/**
 * 라테일 전투력 계산 모듈
 *
 * 56개의 실제 T창 데이터로 회귀분석하여 도출한 V_BIG3 모델
 * (관통 + 일몬추/보몬추 포함, K_mon 항 페어 제약 학습)
 * 검증 정확도: 물리 RMSE 0.28%, 마법 RMSE 0.13%, 모든 케이스 오차 1% 이내
 *
 * @see FORMULA_RESEARCH.md - 공식 도출 과정과 한계
 * @see SAMPLE_DATA.json - 검증용 데이터셋
 */

// ============================================================
// V_BIG2 모델 - 9 파라미터 (사용자 도메인 지식 기반)
//
// 게임 메커니즘:
//   - 근력/공격력/고댐 → attackBase (가산형 베이스 스탯)
//   - 크댐, 최소+최대뎀, 지배력, 근마, 관통 → 곱셈 항
//
// 검증된 페어 데이터 분석:
//   - 표시 (최소뎀+최대뎀) 변화율 ≈ 전투력 변화율 → 곱셈 항 확정
//   - 표시 크댐 변화율 ≈ 전투력 변화율 → 곱셈 항 확정
//   - 관통 98→99: 전투력 +0.81% (case2 페어로 측정)
//
// 입력 규칙:
//   - 무기공격력/속성력은 T창 표시값의 max값 사용
// ============================================================

// V_BIG3 학습 결과 (52건, 페어 비율 제약, RMSE 0.28%)
// 누적 정정 이력:
//   - case3/case4 공격력 OCR 정정(76025/76695 → 69242)으로 RMSE 0.94% → 0.32%
//   - 기존1 공격력 avg(73044.5) → max(73740) 정정으로 RMSE 0.32% → 0.29%
//   - 일몬추/보몬추 항 추가 (V_BIG3) — case2 페어 -100당 -12 BP, 고댐 -150당 -57 BP
//   - K_mon/K2 비율을 0.316(페어 비율)로 제약하여 학습 (페어 충실도 우선)
//   - 검호 데이터 1건 추가 (img27, BP 4,142,389) → 52건
//
// D_pen은 case2/case3/case4 세 독립 페어에서 일관되게 ≈25로 도출됨 (게임 메커니즘:
// 관통은 모든 곱셈 항 이후 마지막에 적용되는 방어력 관통 옵션 → 곱셈 항으로 모델링).
// 옵티마이저는 1차원 자유도로 degenerate(D_pen → 0)에 빠지므로 고정 상수 사용.
//
// K_mon: 일몬추+보몬추 가중치, K2 × 0.316 = 고댐의 약 1/3 효과
//   (case2 페어 측정: 일몬추 -100=-12 BP, 고댐 -150=-57 BP → 비율 0.316)
export const PHYSICAL_PARAMS = Object.freeze({
  K0: 1.48838356e+0,       // 주스탯 가중치
  K1: 1.46221296e+2,       // 공격력 가중치
  K2: 1.28057007e+0,       // 고댐 가중치
  K_mon: 4.04390549e-1,    // 일몬추+보몬추 가중치 (= K2 × 0.316, 페어 제약)
  D_crit: 2.26209973e+2,   // 크댐 분모
  D_dmg: 1.94551489e-34,   // (최소뎀+최대뎀) 분모
  D_dom: 1.88920615e+2,    // 지배력 분모
  K_geunma: 1.01531112e-3, // 근마효율 계수
  D_pen: 25.0,             // 관통 분모 (고정)
  base: 6.18437351e-42,    // 전체 보정 상수
});

// 마법 직업 파라미터 (V_BIG3 페어 제약, 5건 학습, RMSE 0.13%)
//
// PHYSICAL_PARAMS 대비 K1만 0.91% 상향 (146.221 → 147.549).
// 가설: 게임은 무기공격력에 avg(min+max 평균)를 쓰는데 우리는 max를 입력
//   → 물리 K1은 학습 과정에서 (avg/max ≈ 0.991) 비율을 흡수
//   → 마법 속성력은 단일값(=avg-effective)이라 K1을 max-input 비율만큼 역보정해야 정합
// 검증: 실측 캡처 avg/max 평균 0.987과 회귀 0.991이 0.4% 이내 일치.
//       데이터 추가에 따라 보정 비율은 안정적으로 1.009~1.012 범위에서 수렴.
export const MAGIC_PARAMS = Object.freeze({
  ...PHYSICAL_PARAMS,
  K1: 1.47548700e+2,       // 마법 속성력 전용 (K1_phys × 1.0091)
});

/**
 * @typedef {Object} CharacterStats
 * @property {'P'|'M'} type
 * @property {number} 주스탯
 * @property {number} 공격력
 * @property {number} 관통
 * @property {number} 크댐
 * @property {number} 최소뎀
 * @property {number} 최대뎀
 * @property {number} 고댐
 * @property {number} 일몬추
 * @property {number} 보몬추
 * @property {number} 일몬지
 * @property {number} 보몬지
 * @property {number} 근마효율
 */

/**
 * 게임 메커니즘: 수련의방 등의 버프로 최소뎀이 최대뎀을 넘는 경우,
 * 초과분은 실제 전투력에 반영되지 않으므로 cap 처리한다.
 *
 * @param {number} minDmg
 * @param {number} maxDmg
 * @returns {number} effective 최소뎀 (= min(minDmg, maxDmg))
 */
export function effectiveMinDmg(minDmg, maxDmg) {
  const mn = Number(minDmg || 0);
  const mx = Number(maxDmg || 0);
  return Math.min(mn, mx);
}

/**
 * 직접/소환 타격 BP 분리 — 22건 제약 4-param 선형 회귀 (P 20건 + M 2건).
 *
 *   모델: ab = α·근력 + β·공격력 + γ·고댐 + δ·추가댐
 *
 *   제약(constraint): 평균 BP = (ab_d + ab_s) / 2 = K0·근력 + K1·공격력 + K2·고댐 + K_mon·추가댐
 *     → 4쌍 모두 합이 2·K{0,1,2,mon}
 *     → 59건 평균 BP RMSE(0.315%) 무손실 보존
 *
 *   직/소 차이만 OLS 로 학습 (4-param):
 *     ab_d - ab_s = -2u·근력 + 2v·공격력 - 2w·고댐 - 2x·추가댐
 *     u = 0.62744 / v = 84.3042 / w = 0.88663 / x = 0.15750
 *
 *   가중치:
 *     α_d = K0 - u,  α_s = K0 + u       (근력은 소환 비중 ↑)
 *     β_d = K1 + v,  β_s = K1 - v       (공격력은 직접 비중 ↑)
 *     γ_d = K2 - w,  γ_s = K2 + w       (고댐은 소환 비중 ↑)
 *     δ_d = K_mon - x, δ_s = K_mon + x  (추가댐은 소환 비중 ↑)
 *
 *   2-param(u,v) → 4-param(u,v,w,x) 확장 효과 (22건 split 데이터):
 *     직 RMSE 1.014% → 0.814% (-0.20pp, 약 -20% 상대 개선)
 *     소 RMSE 0.598% → 0.659% (+0.06pp 미세 악화)
 *     평 RMSE 0.462% 그대로 (평균 제약 보장)
 *
 *   해석: 고댐·추가댐은 소환물 대미지에도 반영되므로 직접 BP 에서는 가중치 ↓.
 *     특히 고댐: K2-w = 0.394 (직), K2+w = 2.168 (소) — 소환 가중 5.5배.
 *
 *   설계 결정 — 비선형 cross-term은 여전히 배제:
 *     자유 cross-term 회귀는 split RMSE 살짝 좋지만(직 0.81%/소 0.47%)
 *     평균 BP RMSE 0.315% → 0.466% 로 악화 → 일반화 손실 큼.
 *     자료6/자료7 처럼 직≈소 또는 부호 뒤집힌 outlier 는 outlier 제거를 해도
 *     OLS 결과가 거의 변하지 않음 (양쪽 잔차 상쇄) → 데이터 자체 한계, 모델 문제 아님.
 *
 *   22건 정확도 (4-param):
 *     직 RMSE 0.81%, 소 0.66%, 평 0.46%
 *     순서(직≷소) 21/22 정확 (자료7 부호 뒤집힘은 잔존 — 선형 표현 불가)
 *
 *   조건부 환산(백/근/상)만 직접 BP 에 곱 (직접타격 전용 옵션).
 *   근마효율 가설 A: 직접/소환 양쪽에 동일 곱셈 (실측 ΔBP -6,742 와 부합).
 *
 *   마법 직업: K1_M (147.549) 사용 → β_d/β_s 자동 보정 (params.K1 ± v).
 */
const SPLIT_U = 0.62744;  // 근력 split    (직접 = K0    - u, 소환 = K0    + u)
const SPLIT_V = 84.3042;  // 공격력 split  (직접 = K1    + v, 소환 = K1    - v)
const SPLIT_W = 0.88663;  // 고댐 split    (직접 = K2    - w, 소환 = K2    + w)
const SPLIT_X = 0.15750;  // 추가댐 split  (직접 = K_mon - x, 소환 = K_mon + x)

// 곱셈 항 M = critMult × dmgMult × dominanceMult × geunmaMult × penMult × base
//   기존 V_BIG3 공식 그대로. 직접/소환 공통.
function multiplierFor(stats) {
  if (!stats) return 0;
  const params = stats.type === 'M' ? MAGIC_PARAMS : PHYSICAL_PARAMS;
  const maxDmg = Number(stats.최대뎀 || 0);
  const minDmg = effectiveMinDmg(stats.최소뎀, stats.최대뎀);
  const critMultiplier = 1 + Number(stats.크댐 || 0) / params.D_crit;
  const dmgMultiplier = 1 + (minDmg + maxDmg) / params.D_dmg;
  const dominanceMultiplier =
    1 + (Number(stats.일몬지 || 0) + Number(stats.보몬지 || 0)) / params.D_dom;
  const geunmaMultiplier = 1 + Number(stats.근마효율 || 0) * params.K_geunma;
  const penetrationMultiplier = 1 + Number(stats.관통 || 0) / params.D_pen;
  return (
    critMultiplier *
    dmgMultiplier *
    dominanceMultiplier *
    geunmaMultiplier *
    penetrationMultiplier *
    params.base
  );
}

// attackBase 계산 — mode: 'avg' | 'direct' | 'summon'
//   세 모드 모두 K0/K1/K2/K_mon 기반. direct/summon 은 (u, v, w, x) 만큼 4-param split 적용.
//   평균 = (direct + summon)/2 = avg (자동 보존, 별도 회귀 불필요).
function attackBaseFor(stats, mode = 'avg') {
  if (!stats) return 0;
  const params = stats.type === 'M' ? MAGIC_PARAMS : PHYSICAL_PARAMS;
  const 주스탯 = Number(stats.주스탯 || 0);
  const 공격력 = Number(stats.공격력 || 0);
  const 고댐 = Number(stats.고댐 || 0);
  const 추가댐 = Number(stats.일몬추 || 0) + Number(stats.보몬추 || 0);

  let alpha = params.K0;
  let beta = params.K1;
  let gamma = params.K2;
  let delta = params.K_mon;
  if (mode === 'direct') {
    alpha -= SPLIT_U;
    beta += SPLIT_V;
    gamma -= SPLIT_W;
    delta -= SPLIT_X;
  } else if (mode === 'summon') {
    alpha += SPLIT_U;
    beta -= SPLIT_V;
    gamma += SPLIT_W;
    delta += SPLIT_X;
  }
  return alpha * 주스탯 + beta * 공격력 + gamma * 고댐 + delta * 추가댐;
}

/**
 * 전투력(BP) 계산 — 표시 BP = (직접 BP + 소환 BP) / 2.
 *   target: 'base' (조건부 환산 미반영, 게임 T창 표시값과 일치) |
 *           'normal' (일반 인던 가동률 환산) |
 *           'boss' (보스 인던 가동률 환산, 디폴트)
 *
 *   조건부 환산(백/근/상)은 직접타격에만 적용되므로 직접 BP × cond_mult, 소환 BP는 그대로.
 *   가동률 0 이면 cond_mult = 1 → 'base' 와 동일.
 */
export function calculateBattlePower(stats, target = 'boss') {
  if (!stats) return 0;
  const ab_d = attackBaseFor(stats, 'direct');
  const ab_s = attackBaseFor(stats, 'summon');
  if (ab_d <= 0 && ab_s <= 0) return 0;
  const M = multiplierFor(stats);
  const cond = target === 'base' ? 1 : expectedConditionalMultiplier(stats, target);
  const bp_direct = ab_d * M * cond;
  const bp_summon = ab_s * M;
  return Math.round((bp_direct + bp_summon) / 2);
}

/**
 * 직접타격 BP — 백/근/상 가동률 환산 적용.
 */
export function calculateDirectBP(stats, target = 'boss') {
  if (!stats) return 0;
  const ab = attackBaseFor(stats, 'direct');
  if (ab <= 0) return 0;
  const M = multiplierFor(stats);
  const cond = target === 'base' ? 1 : expectedConditionalMultiplier(stats, target);
  return Math.round(ab * M * cond);
}

/**
 * 소환타격 BP — 백/근/상 영향 없음 (직접타격 전용 옵션).
 *   target 인자는 시그니처 호환만 (실제 사용 안 됨).
 */
export function calculateSummonBP(stats /* , target */) {
  if (!stats) return 0;
  const ab = attackBaseFor(stats, 'summon');
  if (ab <= 0) return 0;
  return Math.round(ab * multiplierFor(stats));
}

// ============================================================
// 조건부 대미지 환산 — 백어택/근거리/상태이상
//
// 출처: 라테일 스펙 분석기 3.4.1 엑셀의 B!P18 / B!P19 공식 그대로.
//   인던 일반:  대미지 ∝ (0.6 × (1 + 크댐%) + 백어택% + 근거리% + 상태이상%) × (1 + 일반지배력%)
//   인던 보스:  대미지 ∝ (0.3 × (1 + 크댐%) + 백어택% + 근거리% + 상태이상%) × (1 + 보스지배력%)
//
//   조건부 옵션 OFF 시 분자에서 해당 항이 빠지므로, ON/OFF 비교 시 곱셈 배율은:
//
//      multiplier = 1 + (활성 옵션들의 %합) / (D × (1 + 크댐/100))
//
//   D = 0.6 (일반) / 0.3 (보스).  지배력은 약분되어 영향 없음.
//
//   ⚠️ 단순 (1+x) 곱셈이 아닌 까닭: 분모가 크댐%에 비례하므로 endgame 캐릭(크댐 9000%+)일수록
//      백어택의 상대적 효과가 작아진다. 백어택 1000% 이라도 실제 곱셈 배율은 1.18~1.37배 수준.
//
//   단, 근거리/상태이상은 엑셀에 별도 공식이 없어 백어택과 동일한 메커니즘으로 가정 (사용자 확인).
// ============================================================
const TARGET_DENOM_BASE = Object.freeze({ normal: 0.6, boss: 0.3 });

function conditionalMultiplierCore(stats, activeMap, target) {
  const D = TARGET_DENOM_BASE[target] ?? TARGET_DENOM_BASE.normal;
  const crit = Number(stats?.크댐 || 0) / 100;
  const denom = D * (1 + crit);
  if (denom <= 0) return 1;

  let numerator = 0;
  if (activeMap.백어택) numerator += Number(stats?.백어택 || 0);
  if (activeMap.근거리) numerator += Number(stats?.근거리 || 0);
  if (activeMap.상태이상) numerator += Number(stats?.상태대미지 || 0);
  // numerator 도 % 값이라 100 으로 나눔
  return 1 + (numerator / 100) / denom;
}

// 활성 플래그 (stats.{옵션}활성) 기반 자동 multiplier — 시나리오 ON/OFF 보기용
//   target: 'normal' | 'boss' — 디폴트 'normal'
//   ⚠ 사용처: 사용자가 "지금 이 옵션이 적용되는 순간의 BP" 를 볼 때.
//   BP 자동 환산엔 expectedConditionalMultiplier (가동률 가중) 사용.
export function conditionalMultiplier(stats, target = 'normal') {
  return conditionalMultiplierCore(
    stats,
    {
      백어택: !!stats?.백어택활성,
      근거리: !!stats?.근거리활성,
      상태이상: !!stats?.상태대미지활성,
    },
    target,
  );
}

// 임의 활성 플래그 조합으로 multiplier 계산 (시나리오 매트릭스 best/worst 비교용)
//   activeMap = { 백어택: bool, 근거리: bool, 상태이상: bool }
export function conditionalMultiplierWith(stats, activeMap = {}, target = 'normal') {
  return conditionalMultiplierCore(stats, activeMap, target);
}

// ============================================================
// 기댓값(가동률 가중) 환산 — BP 자동 반영용
//
//   백어택/근거리/상태이상은 항상 적용되는 게 아니라 조건이 충족돼야 들어간다 (직타·자세·상태이상 부여).
//   따라서 평균 BP 는 옵션 % × 가동률 (P(조건 충족)) 의 기댓값이 된다.
//   대미지 분자가 옵션들에 대해 선형이므로 기댓값도 깔끔히 분해됨:
//
//      E[mult] = 1 + Σ ( 옵션% × 가동률 ) / (D × (1 + 크댐%))
//
//   가동률 = stats.{옵션}가동률 (% 단위, 0~100). 0 이면 그 옵션은 BP 영향 없음.
//   소환타격 위주 캐릭은 0 입력 → 자연스레 환산 제외.
// ============================================================
export function expectedConditionalMultiplier(stats, target = 'normal') {
  const D = TARGET_DENOM_BASE[target] ?? TARGET_DENOM_BASE.normal;
  const crit = Number(stats?.크댐 || 0) / 100;
  const denom = D * (1 + crit);
  if (denom <= 0) return 1;

  const weighted = (val, up) =>
    (Number(val || 0) * Math.max(0, Math.min(100, Number(up || 0)))) / 100;

  const back = weighted(stats?.백어택, stats?.백어택가동률);
  const close = weighted(stats?.근거리, stats?.근거리가동률);
  const status = weighted(stats?.상태대미지, stats?.상태대미지가동률);

  const numerator = (back + close + status) / 100; // % → 소수
  return 1 + numerator / denom;
}

export const STAT_KEYS = Object.freeze([
  '주스탯', '공격력', '관통', '크댐', '최소뎀', '최대뎀',
  '고댐', '일몬추', '보몬추', '일몬지', '보몬지', '근마효율',
]);

/**
 * 장비 옵션 키 (총 18개)
 * - 가산형 12개: 표시값 그대로 합산
 * - % 옵션 6개: 캐릭터의 기본값(기본_*)에 비율을 곱해서 절대값으로 변환
 *
 * 게임 메커니즘 (사용자 도메인 지식):
 *   최종 스탯 = 기본값 × (1 + 모든_%옵션_합 / 100)
 *   부적 % 옵션 1개의 효과 = 기본값 × (해당% / 100)  ← 가산형 (multiplicative pool 아님)
 *   올스탯 = 모든 스탯에 더해짐 → 전투력 계산상 주스탯에 합산
 */
export const EQUIP_KEYS = Object.freeze([
  // 가산형 (절대값)
  '주스탯', '올스탯', '공격력', '관통',
  '크댐', '최소뎀', '최대뎀', '고댐',
  '일몬추', '보몬추', '일몬지', '보몬지',
  // % 옵션 (기본값 필요)
  '주스탯_퍼', '올스탯_퍼', '공격력_퍼',
  '크댐_퍼', '최소뎀_퍼', '최대뎀_퍼',
  '고댐_퍼', '일몬추_퍼', '보몬추_퍼',
]);

/**
 * 캐릭터의 누적%를 기본값과 표시값으로부터 자동 계산.
 *
 * 게임 메커니즘:
 *   표시값 = 기본값 × (1 + 누적%)
 *   누적% = (표시값 - 기본값) / 기본값
 *
 * @returns {number} 비율(소수). 예: 506% → 5.06
 */
export function pctPool(stats, displayKey, baseKey) {
  const display = Number(stats?.[displayKey] || 0);
  const base = Number(stats?.[baseKey] || 0);
  if (base <= 0) return 0;
  return (display - base) / base;
}

/**
 * 한 스탯에 대한 변화량 계산 (A 메커니즘).
 *
 * 공식:
 *   새 표시값 = (기본값 + 부적_가산) × (1 + 누적% + 부적%)
 *   변화량   = 새 표시값 - 표시값
 *
 * 폴백: 기본값이 0이면 (사용자가 기본값 미입력) 단순 가산만 적용.
 */
function applyEquipDelta(stats, displayKey, baseKey, addedFromEquip, addedPctFromEquip) {
  const base = Number(stats?.[baseKey] || 0);
  const display = Number(stats?.[displayKey] || 0);

  if (base <= 0) {
    // 기본값 미입력 시 폴백: 단순 가산
    return addedFromEquip;
  }

  const currentPct = (display - base) / base;
  const newBase = base + addedFromEquip;
  const newPct = currentPct + addedPctFromEquip / 100;
  const newDisplay = newBase * (1 + newPct);
  return newDisplay - display;
}

/**
 * 장비 옵션을 STAT_KEYS 기준 절대 변화량으로 변환.
 *
 * 게임 메커니즘 (사용자 도메인 지식, 검증된 패턴):
 *   - 표시값 = 기본값 × (1 + 누적%)
 *   - 부적 가산은 기본값에 합쳐지고, 부적 %는 누적%에 합쳐진 후 곱셈 적용
 *   - 따라서 같은 +500 부적이라도 누적 120%인 사람은 +600, 누적 110%인 사람은 +550
 *
 * @param {Object} stats - 캐릭터 스탯 (표시값 + 기본_* 필드)
 * @param {Object} equip - 장비 옵션 (EQUIP_KEYS)
 * @returns {Object} STAT_KEYS 각 키별 절대 변화량
 */
export function equipDelta(stats, equip) {
  const v = (k) => Number(equip?.[k] || 0);

  // 주스탯: 가산 = 주스탯+올스탯, % = 주스탯_퍼+올스탯_퍼
  const 주스탯_가산 = v('주스탯') + v('올스탯');
  const 주스탯_퍼총 = v('주스탯_퍼') + v('올스탯_퍼');

  return {
    주스탯: applyEquipDelta(stats, '주스탯', '기본_주스탯', 주스탯_가산, 주스탯_퍼총),
    공격력: applyEquipDelta(stats, '공격력', '기본_공격력', v('공격력'), v('공격력_퍼')),
    크댐:   applyEquipDelta(stats, '크댐',   '기본_크댐',   v('크댐'),   v('크댐_퍼')),
    최소뎀: applyEquipDelta(stats, '최소뎀', '기본_최소뎀', v('최소뎀'), v('최소뎀_퍼')),
    최대뎀: applyEquipDelta(stats, '최대뎀', '기본_최대뎀', v('최대뎀'), v('최대뎀_퍼')),
    고댐:   applyEquipDelta(stats, '고댐',   '기본_고댐',   v('고댐'),   v('고댐_퍼')),
    일몬추: applyEquipDelta(stats, '일몬추', '기본_일몬추', v('일몬추'), v('일몬추_퍼')),
    보몬추: applyEquipDelta(stats, '보몬추', '기본_보몬추', v('보몬추'), v('보몬추_퍼')),
    관통:   v('관통'),
    일몬지: v('일몬지'),
    보몬지: v('보몬지'),
    근마효율: 0,
  };
}

export function compareEquipment(currentStats, oldEquip, newEquip) {
  const oldDelta = equipDelta(currentStats, oldEquip);
  const newDelta = equipDelta(currentStats, newEquip);

  const newStats = { ...currentStats };
  for (const key of STAT_KEYS) {
    newStats[key] =
      (Number(currentStats[key]) || 0) - (oldDelta[key] || 0) + (newDelta[key] || 0);
  }

  const currentBP = calculateBattlePower(currentStats);
  const newBP = calculateBattlePower(newStats);
  const change = newBP - currentBP;

  const contributions = STAT_KEYS.map((key) => {
    const diff = (newDelta[key] || 0) - (oldDelta[key] || 0);

    if (diff === 0 || !Number.isFinite(diff)) {
      return { stat: key, diff: 0, impact: 0 };
    }

    const partialStats = {
      ...currentStats,
      [key]: (Number(currentStats[key]) || 0) + diff,
    };
    const partialBP = calculateBattlePower(partialStats);
    const impact = partialBP - currentBP;

    return { stat: key, diff, impact };
  }).filter((c) => c.diff !== 0);

  return {
    currentBP,
    newBP,
    change,
    changePercent: currentBP > 0 ? (change / currentBP) * 100 : 0,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
    contributions,
    newStats,
  };
}

export function statMarginalEffect(stats, statKey, delta = 1) {
  const baseBP = calculateBattlePower(stats);
  const modifiedStats = {
    ...stats,
    [statKey]: (Number(stats[statKey]) || 0) + delta,
  };
  const newBP = calculateBattlePower(modifiedStats);
  return newBP - baseBP;
}

export const STAT_LABELS = {
  P: {
    주스탯: '근력',
    공격력: '무기공격력',
    크댐: '크리티컬 데미지 (물리)',
    최소뎀: '최소 데미지 (물리)',
    최대뎀: '최대 데미지 (물리)',
    고댐: '고정 데미지 증가 (물리)',
  },
  M: {
    주스탯: '마법력',
    공격력: '속성력',
    크댐: '크리티컬 데미지 (마법)',
    최소뎀: '최소 데미지 (마법)',
    최대뎀: '최대 데미지 (마법)',
    고댐: '고정 데미지 증가 (마법)',
  },
  공통: {
    관통: '관통력',
    올스탯: '올스탯',
    일몬추: '일반 몬스터 추가 데미지',
    보몬추: '보스 몬스터 추가 데미지',
    일몬지: '일반 몬스터 지배력 (%)',
    보몬지: '보스 몬스터 지배력 (%)',
    근마효율: '근력/마법력 효율 (%)',
  },
};

/**
 * 스탯 키의 한국어 라벨을 반환.
 * "_퍼" 접미사가 붙은 % 옵션은 자동으로 "{기본 라벨} %" 형태로 반환.
 */
export function getStatLabel(type, statKey) {
  if (typeof statKey === 'string' && statKey.endsWith('_퍼')) {
    const baseKey = statKey.slice(0, -2);
    return `${getStatLabel(type, baseKey)} %`;
  }
  if (STAT_LABELS[type] && STAT_LABELS[type][statKey]) {
    return STAT_LABELS[type][statKey];
  }
  if (STAT_LABELS.공통[statKey]) {
    return STAT_LABELS.공통[statKey];
  }
  return statKey;
}

export function createEmptyStats(type = 'P') {
  return {
    type,
    // 표시값 (T창 능력치 세부정보)
    주스탯: 0,
    공격력: 0,
    관통: 0,
    크댐: 0,
    최소뎀: 0,
    최대뎀: 0,
    고댐: 0,
    일몬추: 0,
    보몬추: 0,
    일몬지: 0,
    보몬지: 0,
    근마효율: 0,
    // 기본값 (T창 추가 세부정보의 +값) — 장비 % 옵션 환산에 사용
    기본_주스탯: 0,
    기본_공격력: 0,
    기본_크댐: 0,
    기본_최소뎀: 0,
    기본_최대뎀: 0,
    기본_고댐: 0,
    기본_일몬추: 0,
    기본_보몬추: 0,
    // 조건부 대미지 환산 — 게임 T창 BP에는 미포함. 가동률 기반 기댓값으로 별도 환산.
    //   백어택/근거리/상태이상 % 값 + 가동률(0~100, 사용자가 직타비중 + 조건충족율 합산해 입력)
    //   가동률 0 = BP 영향 없음. 활성 플래그는 시나리오 매트릭스 'ON/OFF' 빠른 보기용.
    백어택: 0,           // %
    백어택활성: false,
    백어택가동률: 0,     // %  (0~100, BP 환산 기댓값에 사용)
    근거리: 0,
    근거리활성: false,
    근거리가동률: 0,
    상태대미지: 0,
    상태대미지활성: false,
    상태대미지가동률: 0,
  };
}

export function createEmptyEquipment() {
  return {
    // 가산형 12개
    주스탯: 0,
    올스탯: 0,
    공격력: 0,
    관통: 0,
    크댐: 0,
    최소뎀: 0,
    최대뎀: 0,
    고댐: 0,
    일몬추: 0,
    보몬추: 0,
    일몬지: 0,
    보몬지: 0,
    // % 옵션 9개 (백어택 등 조건부 옵션은 전투력 계산에 미반영이라 제외)
    주스탯_퍼: 0,
    올스탯_퍼: 0,
    공격력_퍼: 0,
    크댐_퍼: 0,
    최소뎀_퍼: 0,
    최대뎀_퍼: 0,
    고댐_퍼: 0,
    일몬추_퍼: 0,
    보몬추_퍼: 0,
  };
}
