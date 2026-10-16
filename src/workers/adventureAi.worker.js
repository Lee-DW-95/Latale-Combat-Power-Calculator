/**
 * 어드벤처 AI 추천 워커 — 행동별 롤아웃(수천 판)을 메인 스레드 밖에서 돌린다.
 *
 * 메시지 (메인 → 워커): { id, state, samples }
 * 메시지 (워커 → 메인): { id, result } | { id, error }
 */

import { evaluate } from '../utils/adventureAi.js';

self.onmessage = (e) => {
  const { id, state, samples } = e.data || {};
  try {
    self.postMessage({ id, result: evaluate(state, { samples }) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
