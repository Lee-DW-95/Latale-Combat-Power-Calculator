/**
 * 굴림 기록 — 각성석 / 아이템 각성 / 메모리얼 시뮬 공용.
 *
 * "1회씩 여러 번 굴리다 보면 좋은 카드를 놓친다" 는 문제를 위해,
 * 사용자가 정한 조건을 넘는 카드만 회차 번호와 함께 누적 기록한다.
 *
 * 기록 조건 두 가지:
 *   equiv  — 카드 전체를 크댐으로 환산한 합 ≥ 기준치   (T창 정보 필요)
 *   option — 특정 옵션의 카드 내 합 ≥ 기준치           (T창 정보 불필요)
 *            예) 메모리얼 "최종 크리티컬 대미지 ≥ 30"
 *
 * 상태(조건 + 기록 + 누적 회차)는 localStorage 에 저장돼 탭을 옮겨도 유지된다.
 */

import { ref, computed, watch } from 'vue';
import { evaluateLines, createLineEvaluator } from '../utils/rollEquiv.js';

const LOG_MAX = 300;          // 기록 상한 — 넘으면 오래된 것부터 버린다
const BULK_MAX = 1000000;     // 한 번에 돌릴 수 있는 최대 회수
const BULK_CHUNK = 2000;      // 청크마다 이벤트 루프를 놔줘 진행률 갱신 + 취소가 먹히게 한다
const BULK_INDEX_MAX = 100;   // 요약에 담는 적중 회차 번호 개수 상한 (넘으면 "…외 N건")

/**
 * @param {string} storageKey  localStorage 키
 * @param {object} [opt]
 * @param {(lineKey:string, optionKey:string)=>boolean} [opt.matcher]
 *        "특정 옵션" 조건에서 줄이 그 옵션에 기여하는지 판정 (기본: 완전 일치)
 * @param {number} [opt.defaultThreshold]
 */
export function useRollLog(storageKey, opt = {}) {
  const matcher = opt.matcher ?? ((lineKey, optionKey) => lineKey === optionKey);

  const criterion = ref({
    type: 'equiv',              // 'equiv' | 'option'
    option: '',                 // type==='option' 일 때 옵션 key
    threshold: opt.defaultThreshold ?? 120,
  });
  const records = ref([]);
  // 누적 굴림 회차 — 기록이 회차 번호로 식별되므로 카운터도 같이 들고 저장한다.
  const count = ref(0);
  // 대량 굴림 — 사용자가 입력한 회수 + 진행 상태 + 직전 결과 요약
  const bulkTimes = ref(10000);
  const bulkRunning = ref(false);
  const bulkProgress = ref(0);
  const bulkSummary = ref(null);
  let bulkCancelled = false;

  const thresholdNum = computed(() => {
    const v = Number(criterion.value.threshold);
    return Number.isFinite(v) && v > 0 ? v : null;
  });

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.criterion && typeof parsed.criterion === 'object') {
        criterion.value = { ...criterion.value, ...parsed.criterion };
      }
      if (Number.isFinite(Number(parsed.count))) count.value = Number(parsed.count);
      if (Number.isFinite(Number(parsed.bulkTimes))) bulkTimes.value = Number(parsed.bulkTimes);
      if (Array.isArray(parsed.records)) records.value = parsed.records.slice(0, LOG_MAX);
    } catch {
      /* localStorage 불가 환경(시크릿 모드 등) — 복원만 생략 */
    }
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        criterion: criterion.value,
        count: count.value,
        bulkTimes: bulkTimes.value,
        records: records.value,
      }));
    } catch {
      /* 저장 실패는 무시 — 기능 자체는 메모리에서 정상 동작 */
    }
  }

  load();
  watch(criterion, save, { deep: true });
  watch(bulkTimes, save);

  /** 조건 충족 여부 + 표시용 실측값. evaluated 가 null 이면 equiv 조건은 판정 불가. */
  function measure(normLines, evaluated) {
    const th = thresholdNum.value;
    if (th == null) return { hit: false, amount: null };

    if (criterion.value.type === 'option') {
      const key = criterion.value.option;
      if (!key) return { hit: false, amount: null };
      const sum = normLines
        .filter((l) => matcher(l.key, key))
        .reduce((s, l) => s + (Number(l.value) || 0), 0);
      return { hit: sum >= th, amount: sum };
    }

    if (!evaluated) return { hit: false, amount: null };
    return { hit: evaluated.total >= th, amount: evaluated.total };
  }

  /** 기록 1건 객체 — 굴림 카드 + 평가 결과를 저장 형태로 압축한다. */
  function makeRecord({ lines, evaluated, index, tag, tagKey, amount }) {
    return {
      n: index,
      tag,
      tagKey,
      criterionType: criterion.value.type,
      amount,
      total: evaluated ? evaluated.total : null,
      lines: (evaluated ? evaluated.lines : lines).map((l) => ({
        key: l.key,
        text: l.text,
        refAmount: l.refAmount ?? null,
        convertible: l.convertible ?? false,
      })),
    };
  }

  /**
   * 카드 1장을 평가하고, 조건을 넘으면 기록한다.
   *
   * @param {object} p
   * @param {Array}  p.lines   정규화 줄 배열 (utils/rollEquiv.js 의 normalize*)
   * @param {object} p.stats   본 캐릭터 스탯 (없으면 equiv 환산 생략)
   * @param {number} p.index   회차 번호
   * @param {string} [p.tag]   카드 종류 표시 (각성석 이름 / 세트명 등)
   * @param {string} [p.tagKey] 태그 색 구분용 키
   * @returns {{ evaluated, hit, amount }}
   */
  function record({ lines, stats, index, tag = '', tagKey = '' }) {
    const evaluated = stats ? evaluateLines(lines, stats) : null;
    const { hit, amount } = measure(lines, evaluated);

    if (hit) {
      records.value.unshift(makeRecord({ lines, evaluated, index, tag, tagKey, amount }));
      if (records.value.length > LOG_MAX) records.value.length = LOG_MAX;
      save();
    }
    return { evaluated, hit, amount };
  }

  /** 다음 회차 번호 — 굴리기 직전에 호출. */
  function nextIndex() {
    count.value += 1;
    save();
    return count.value;
  }

  /** 기록만 비우기 (회차 카운터는 유지) */
  function clear() {
    records.value = [];
    save();
  }

  /** 누적 회차 + 기록 전체 초기화 — 회차 번호가 어긋나면 기록이 무의미해서 같이 비운다. */
  function resetAll() {
    count.value = 0;
    records.value = [];
    bulkSummary.value = null;
    save();
  }

  /** 진행 중인 대량 굴림 중단 요청. */
  function bulkCancel() {
    bulkCancelled = true;
  }

  /**
   * 대량 굴림 — N 회를 한 번에 돌리고, 조건을 넘은 굴림만 회차와 함께 기록한다.
   *
   * 1회씩 누르는 게 번거로울 때 "1만 회 돌려서 몇 번이나 나오나" 를 보기 위한 것.
   * 환산은 equip 조합 단위로 캐시되므로 (createLineEvaluator) 10만 회도 수 초면 끝난다.
   *
   * @param {object} p
   * @param {number} p.times      돌릴 회수
   * @param {()=>any} p.rollFn    굴림 1회 — 시뮬별 rollOnce
   * @param {(card:any)=>Array} p.normalize  굴림 결과 → 정규화 줄 배열
   * @param {object} p.stats      본 캐릭터 스탯 (없으면 환산 생략)
   * @param {(card:any)=>{tag:string,tagKey:string}} [p.tagOf]
   *        굴림마다 태그가 다를 때 (각성석 = 뽑힌 돌 종류). 없으면 p.tag/p.tagKey 고정.
   * @param {string} [p.tag] @param {string} [p.tagKey]
   * @returns {Promise<object>} 요약 (bulkSummary 와 동일)
   */
  async function bulkRun({ times, rollFn, normalize, stats, tagOf = null, tag = '', tagKey = '' }) {
    const n = Math.max(1, Math.min(BULK_MAX, Math.floor(Number(times) || 0)));
    if (bulkRunning.value) return null;

    bulkRunning.value = true;
    bulkCancelled = false;
    bulkProgress.value = 0;
    bulkSummary.value = null;

    const evaluate = createLineEvaluator(stats);
    const from = count.value + 1;
    const fresh = [];        // 이번 배치의 기록 (오름차순, LOG_MAX 로 상한)
    const indexes = [];
    let hits = 0;
    let best = null;
    let bestIndex = 0;
    // 이번 배치 최고 카드 — 다 돌린 뒤 미리보기에 띄워 준다
    let bestCard = null;
    let bestEvaluated = null;
    let bestHit = false;
    let done = 0;
    let cursor = count.value;

    try {
      while (done < n && !bulkCancelled) {
        const end = Math.min(n, done + BULK_CHUNK);
        for (; done < end; done += 1) {
          cursor += 1;
          const card = rollFn();
          const lines = normalize(card);
          const evaluated = evaluate ? evaluate(lines) : null;
          const { hit, amount } = measure(lines, evaluated);
          const t = tagOf ? tagOf(card) : null;

          if (amount != null && (best == null || amount > best)) {
            best = amount;
            bestIndex = cursor;
            bestCard = card;
            bestEvaluated = evaluated;
            bestHit = hit;
          }
          if (hit) {
            hits += 1;
            if (indexes.length < BULK_INDEX_MAX) indexes.push(cursor);
            fresh.push(makeRecord({
              lines,
              evaluated,
              index: cursor,
              tag: t ? t.tag : tag,
              tagKey: t ? t.tagKey : tagKey,
              amount,
            }));
            // 상한을 넘으면 오래된 것부터 버린다 (수만 건 누적으로 메모리가 터지지 않게)
            if (fresh.length > LOG_MAX) fresh.shift();
          }
        }
        count.value = cursor;
        bulkProgress.value = done;
        // 브라우저에 프레임을 넘겨 진행률 표시 + 중단 버튼이 동작하게 한다
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      count.value = cursor;
      bulkProgress.value = done;
      // 최신이 위로 오도록 뒤집어 기존 기록 앞에 붙인다
      records.value = [...fresh.reverse(), ...records.value].slice(0, LOG_MAX);
      save();
      bulkRunning.value = false;
    }

    bulkSummary.value = {
      requested: n,
      times: done,                       // 중단됐다면 실제 돌린 회수
      cancelled: bulkCancelled,
      from,
      to: cursor,
      hits,
      // 적중률 / 평균 몇 회당 1회
      rate: done > 0 ? hits / done : 0,
      gap: hits > 0 ? done / hits : null,
      indexes,
      indexesTruncated: hits > indexes.length,
      recordsTruncated: hits > fresh.length,
      best,
      bestIndex,
      bestCard,
      bestEvaluated,
      bestHit,
      criterionType: criterion.value.type,
      option: criterion.value.option,
      threshold: thresholdNum.value,
      evaluable: !!evaluate,
      tag,
    };
    return bulkSummary.value;
  }

  return {
    criterion, thresholdNum, records, count, nextIndex, record, measure, clear, resetAll,
    bulkTimes, bulkRunning, bulkProgress, bulkSummary, bulkRun, bulkCancel,
  };
}
