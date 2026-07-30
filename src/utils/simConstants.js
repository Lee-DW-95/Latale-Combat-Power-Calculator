/**
 * 시뮬레이션 매직 넘버 모음.
 *
 * 이전엔 enchantSim.js / memorialSim.js / EnchantSimulator.vue 곳곳에 흩어져 있던
 * 시도/표본/안전 상한 값을 한 곳에서 관리.
 */

// ============================================================
// 인챈트 시뮬
// ============================================================
export const ENCHANT_SIM = Object.freeze({
  // 풀강 1회 시뮬 안에서 한 번의 풀강까지 시도할 수 있는 최대 횟수
  FULL_MAX_ATTEMPTS: 100_000,
  // 풀강 평균 분석 (computeNormalStats) Monte Carlo 횟수 + 내부 안전 상한
  FULL_MC_RUNS: 2000,
  FULL_MC_INNER_CAP: 50_000,
  // 목표 옵션 시뮬 maxAttempts
  TARGET_MAX_ATTEMPTS: 200_000,
  // 목표 옵션 통계 (computeTargetStats) Monte Carlo 횟수 + 내부 안전 상한
  TARGET_MC_RUNS: 1000,
  TARGET_MC_INNER_CAP: 100_000,
  // UI 풀강까지 자동 클릭 시 안전 상한 (무한루프 방지)
  AUTO_RUN_SAFETY_CAP: 5000,
});

// ============================================================
// 메모리얼 시뮬
// ============================================================
export const MEMORIAL_SIM = Object.freeze({
  // 1번 실행 캡처 안전 상한 (simulateUntilSingleCardReaches)
  SAMPLE_MAX_TRIES: 100_000,
  // 단일 카드 성공률 추정 1차/2차 표본
  ESTIMATE_PHASE1: 200_000,
  ESTIMATE_PHASE2: 1_000_000,
  // 1차에서 success 가 이 수치 미만이면 2차 확장
  ESTIMATE_PHASE2_THRESHOLD: 30,
});

// ============================================================
// 각성석 시뮬
//   메모리얼 대비 옵션 풀이 넓어(20종) 한 카드에 특정 옵션이 등장할 확률 자체가 낮음.
//   특히 신비 전용 + 다중 조건 + 고티어/고값 조합은 p ~ 1e-6 수준까지 떨어지므로
//   1번 실행 캡처는 100만회까지 허용. (대략 4~6초, UI는 spinner 로 처리)
// ============================================================
export const AWAKENING_SIM = Object.freeze({
  SAMPLE_MAX_TRIES: 1_000_000,
  ESTIMATE_PHASE1: 200_000,
  ESTIMATE_PHASE2: 2_000_000,
  ESTIMATE_PHASE2_THRESHOLD: 30,
});

// ============================================================
// 아이템 각성 시뮬 (장비/파츠 종류별 옵션 뽑기)
// ============================================================
export const ITEM_AWAKENING_SIM = Object.freeze({
  // 한 카드 내 (등급 + 옵션명) 중복 회피 재추첨 상한.
  //   아틀라스 부츠처럼 옵션이 98종인 세트도 있고, 반대로 후보가 4줄보다 적을 수도 있어
  //   무한루프를 막는 안전장치. 상한 도달 시 중복을 허용한다.
  DEDUPE_MAX_TRIES: 500,
  // 3등급 주력 딜옵션을 "대박"으로 볼 범위 하한 비율 (상위 20% 구간).
  MAJOR_TOP_RATIO: 0.8,
  // S등급 스킬 옵션을 최상급으로 볼 값 하한.
  S_STRONG_MIN: 18,

  // ── 목표 시뮬 ──
  // 줄 구성(어떤 옵션이 떴는지) MC 표본 수.
  //   수치 조건은 구성이 정해지면 닫힌 수식으로 계산해 곱하므로 MC 는 구성만 추첨한다
  //   → 추정 대상 확률이 훨씬 커서 같은 표본으로도 정밀도가 높다.
  PRESENCE_PHASE1: 200_000,
  PRESENCE_PHASE2: 2_000_000,
  // 1차 표본에서 목표 구성이 이만큼도 안 잡히면 2차까지 확장.
  PRESENCE_PHASE2_THRESHOLD: 30,
  // 목표 옵션 최대 개수 = 한 카드 최대 줄 수.
  MAX_TARGETS: 4,
});
