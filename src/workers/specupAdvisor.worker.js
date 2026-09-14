/**
 * 스펙업 방향 분석 워커 — 몬테카를로 표본 추출(수만 회 BP 계산)을 메인 스레드 밖에서 돌린다.
 *
 * 메시지 (메인 → 워커):
 *   { type: 'analyze', id, stats, slots, samples, runeScoreCurrent }   slots 는 specupSlots 설명자 배열
 *   { type: 'cancel', id }
 * 메시지 (워커 → 메인):
 *   { type: 'progress', id, progress }
 *   { type: 'result', id, result }   dist / cards Map 은 [group, value] 배열로 직렬화, Float64Array 버퍼는 transfer
 *   { type: 'error', id, message }
 *
 * 계산 자체는 specupSlots.analyzeSlotDescriptors — 메인 스레드 폴백과 같은 함수.
 */

import { analyzeSlotDescriptors } from '../utils/specupSlots.js';

// 실행 중인 분석의 취소 플래그 — analyzeSlots 가 청크마다 이벤트 루프를 놔주므로 cancel 메시지가 사이에 들어온다.
const cancelled = new Set();

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'cancel') {
    cancelled.add(msg.id);
    return;
  }
  if (msg.type !== 'analyze') return;
  const { id } = msg;
  try {
    const r = await analyzeSlotDescriptors({
      stats: msg.stats,
      slots: msg.slots,
      samples: msg.samples,
      runeScoreCurrent: msg.runeScoreCurrent ?? null,
      onProgress: (progress) => self.postMessage({ type: 'progress', id, progress }),
      shouldCancel: () => cancelled.has(id),
    });
    cancelled.delete(id);
    if (!r) {
      self.postMessage({ type: 'result', id, result: null });
      return;
    }
    const transfer = [];
    const dist = Array.from(r.dist.entries());
    for (const [, arr] of dist) transfer.push(arr.buffer);
    const runeScore = r.runeScore || null;
    if (runeScore) transfer.push(runeScore.sorted.buffer);
    self.postMessage(
      {
        type: 'result',
        id,
        result: { ...r, dist, cards: Array.from(r.cards.entries()), runeScore },
      },
      transfer,
    );
  } catch (err) {
    cancelled.delete(id);
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
};
