/**
 * 스펙업 방향 분석 실행기 — Web Worker 로 돌리고, 워커를 못 만드는 환경이면 메인 스레드로 폴백.
 *
 * 두 경로 모두 specupSlots.analyzeSlotDescriptors 를 호출하므로 결과 모양이 같다:
 *   { slots, dist: Map<group, Float64Array>, cards: Map<group, {reservoir, top}>, budgets, samples, cancelled, runeScore? }
 *
 * 취소는 기존 엔진과 같이 shouldCancel() 폴링이다 — 워커 경로에서는 진행률 메시지가 올 때마다
 * 확인해 'cancel' 메시지를 보낸다 (청크 1개 지연, 메인 스레드 경로와 같은 입도).
 */

import { analyzeSlotDescriptors } from './specupSlots.js';

let worker = null;
let workerBroken = false; // 생성/로드 실패를 한 번 겪으면 이후 실행은 바로 메인 스레드로
let seq = 0;

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    if (typeof Worker === 'undefined') throw new Error('Worker unsupported');
    worker = new Worker(new URL('../workers/specupAdvisor.worker.js', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** 워커에서 온 결과 — 배열로 직렬화된 Map 을 복원 */
function reviveResult(r) {
  if (!r) return r;
  return { ...r, dist: new Map(r.dist), cards: new Map(r.cards) };
}

function runInWorker(w, args) {
  const { onProgress, shouldCancel, ...payload } = args;
  const id = (seq += 1);
  return new Promise((resolve, reject) => {
    let cancelSent = false;
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e) => {
      const msg = e.data || {};
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        if (onProgress) onProgress(msg.progress);
        if (!cancelSent && shouldCancel && shouldCancel()) {
          cancelSent = true;
          w.postMessage({ type: 'cancel', id });
        }
        return;
      }
      cleanup();
      if (msg.type === 'result') resolve(reviveResult(msg.result));
      else if (msg.type === 'error') reject(new Error(msg.message || 'worker error'));
    };
    // 모듈 로드 실패(구형 브라우저·웹뷰)도 여기로 온다 — 이 워커는 버리고 폴백
    const onError = (e) => {
      cleanup();
      workerBroken = true;
      try { w.terminate(); } catch { /* 무시 */ }
      worker = null;
      reject(new Error(e?.message || 'worker load failed'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ type: 'analyze', id, ...payload });
  });
}

/**
 * @param {object} args  analyzeSlotDescriptors 와 같은 인자. stats 는 평범한 객체여야 한다 (반응형 X).
 * @returns {Promise<null|object>}
 */
export async function runSpecupAnalysis(args) {
  const w = getWorker();
  if (w) {
    try {
      return await runInWorker(w, args);
    } catch (err) {
      // 워커가 깨진 경우에만 폴백. 계산 자체의 예외는 그대로 올린다.
      if (!workerBroken) throw err;
      console.warn('[specupAdvisor] worker unavailable — falling back to main thread', err);
    }
  }
  return analyzeSlotDescriptors(args);
}
