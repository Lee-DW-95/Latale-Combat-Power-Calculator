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
