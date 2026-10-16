<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import InfoNote from './InfoNote.vue';
import { ADVENTURE_BOARDS } from '../data/adventureData.js';
import {
  CARDS,
  DICE_LIMIT,
  DECK_SIZE,
  FULL_DECK,
  HAND_LIMIT,
  LAST_MAP,
  BOARD_SIZE,
  addToHand,
  applyCard,
  applyRoll,
  cardKey,
  describePosition,
  evaluate,
  isTerminal,
  newState,
  positionOf,
} from '../utils/adventureAi.js';

// ============================================================
// 어드벤처 AI — 현재 상태(위치·주사위·손패·덱)를 넣으면 행동마다 끝까지 시뮬레이션해
// 평균 최종 칸이 가장 높은 행동을 추천한다. 게임 조작은 하지 않는다.
// 진행 중에는 "결과 반영" 으로 실제 주사위 합·사용한 카드를 넣어 상태를 이어간다.
// ============================================================

const SAMPLES = 3000;
const STATE_KEY = 'latale.adventure.ai.state.v1';
const MAPS = Object.keys(ADVENTURE_BOARDS).map(Number).sort((a, b) => a - b);
// 같은 효과 카드는 한 버튼으로 — [key, label, 장수]
const CARD_TYPES = [...new Map(CARDS.map((c) => [cardKey(c.id), c])).values()].map((c) => ({
  key: cardKey(c.id),
  label: c.label,
  count: CARDS.filter((x) => cardKey(x.id) === cardKey(c.id)).length,
}));

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (s && Number.isInteger(s.pos) && s.pos >= 1 && s.pos <= BOARD_SIZE && Array.isArray(s.hand)) return s;
  } catch {
    /* 손상된 저장값은 무시 */
  }
  return newState();
}
const state = ref(loadState());
const history = ref([]);
const notice = ref('');

watch(
  state,
  (s) => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch {
      /* 저장 불가 환경 */
    }
  },
  { deep: true },
);

// 바꾸기 전 상태를 되돌리기 목록에 쌓고 수정한다.
function mutate(fn) {
  const before = JSON.parse(JSON.stringify(state.value));
  const next = JSON.parse(JSON.stringify(state.value));
  const msg = fn(next);
  if (msg === false) return;
  history.value = [...history.value.slice(-49), before];
  state.value = next;
  notice.value = typeof msg === 'string' ? msg : '';
}
function undo() {
  if (!history.value.length) return;
  state.value = history.value[history.value.length - 1];
  history.value = history.value.slice(0, -1);
  notice.value = '';
}
function resetGame() {
  mutate(() => {});
  state.value = newState();
}

// ─────────────── 위치 ───────────────
const place = computed(() => describePosition(state.value.pos));
const mapSquares = computed(() => ADVENTURE_BOARDS[place.value.map].squares);
function setPlace(map, ordinal) {
  const squares = ADVENTURE_BOARDS[map].squares;
  const o = Math.min(Math.max(1, ordinal | 0), squares);
  mutate((s) => {
    s.pos = positionOf(map, o);
  });
}

// ─────────────── 주사위 ───────────────
const remaining = computed(() => DICE_LIMIT - state.value.diceUsed);
function setDiceUsed(n) {
  mutate((s) => {
    s.diceUsed = Math.min(DICE_LIMIT, Math.max(0, n | 0));
  });
}

// ─────────────── 손패 · 덱 ───────────────
const handFull = computed(() => state.value.hand.length >= HAND_LIMIT);
function addCard(key) {
  mutate((s) => (addToHand(s, key) ? '' : false));
}
function discard(slot) {
  mutate((s) => {
    s.hand.splice(slot - 1, 1);
  });
}
const inDeck = (s, id) => !!(s.deck & (2 ** (id - 1)));
// 덱에서 이미 나온 카드(손패 제외) 토글 — 덱이 비면 게임처럼 30장으로 다시 채운다.
function toggleDrawn(id) {
  if (state.value.hand.includes(id)) return;
  mutate((s) => {
    s.deck ^= 2 ** (id - 1);
    if (s.deck === 0) s.deck = FULL_DECK;
  });
}
const deckLeft = computed(() => {
  let n = 0;
  for (let i = 1; i <= DECK_SIZE; i++) if (inDeck(state.value, i)) n++;
  return n;
});

// ─────────────── 결과 반영 ───────────────
// pending: null(주사위) | 손패 슬롯 번호(배수 카드 — 합을 받아야 한다)
const pendingSlot = ref(null);
const wasDouble = ref(false);
const pendingCard = computed(() =>
  pendingSlot.value ? CARDS[state.value.hand[pendingSlot.value - 1] - 1] : null,
);
function landedMsg(q) {
  return q ? '? 칸 도착 — 뽑은 카드를 아래 카드 목록에서 눌러 손패에 넣으세요.' : '';
}
function applySum(sum) {
  const slot = pendingSlot.value, dbl = wasDouble.value;
  mutate((s) => landedMsg(slot ? applyCard(s, slot, sum, dbl) : applyRoll(s, sum, dbl)));
  pendingSlot.value = null;
  wasDouble.value = false;
}
function useCard(slot) {
  const card = CARDS[state.value.hand[slot - 1] - 1];
  if (card.type === 2) {
    pendingSlot.value = pendingSlot.value === slot ? null : slot;
    return;
  }
  mutate((s) => landedMsg(applyCard(s, slot)));
}
watch(
  () => state.value.hand.length,
  () => {
    if (pendingSlot.value && pendingSlot.value > state.value.hand.length) pendingSlot.value = null;
  },
);

// ─────────────── 추천 계산 (워커) ───────────────
const result = ref(null);
const running = ref(false);
const error = ref('');
let worker = null, seq = 0, timer = null;
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('../workers/adventureAi.worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = false; // 워커를 못 쓰는 환경 — 메인 스레드로 계산
  }
  return worker;
}
function recalc() {
  const id = ++seq, snapshot = JSON.parse(JSON.stringify(state.value));
  running.value = true;
  error.value = '';
  const done = (r, err) => {
    if (id !== seq) return;
    running.value = false;
    if (err) error.value = err;
    else result.value = r;
  };
  const w = getWorker();
  if (!w) {
    setTimeout(() => {
      try {
        done(evaluate(snapshot, { samples: SAMPLES }));
      } catch (e) {
        done(null, String(e.message || e));
      }
    });
    return;
  }
  w.onmessage = (e) => {
    if (e.data.id === seq) done(e.data.result, e.data.error);
  };
  w.postMessage({ id, state: snapshot, samples: SAMPLES });
}
watch(
  state,
  () => {
    clearTimeout(timer);
    timer = setTimeout(recalc, 200);
  },
  { deep: true, immediate: true },
);
onBeforeUnmount(() => {
  clearTimeout(timer);
  if (worker) worker.terminate();
});

const ranked = computed(() => (result.value?.actions ?? []).slice().sort((a, b) => b.mean - a.mean));
const best = computed(() => ranked.value[0] ?? null);
const fmtPos = (p) => {
  const d = describePosition(Math.min(BOARD_SIZE, Math.round(p)));
  return `${d.map}맵 ${d.ordinal}칸`;
};
const terminal = computed(() => isTerminal(state.value));

const chip =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition disabled:opacity-40 disabled:cursor-not-allowed';
const chipIdle = 'bg-white dark:bg-stone-800 ring-stone-200 dark:ring-stone-700 text-stone-700 dark:text-stone-200 hover:ring-cyan-400';
const input =
  'w-full rounded-lg bg-white dark:bg-stone-800 ring-1 ring-stone-200 dark:ring-stone-700 px-2 py-1.5 text-sm text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-cyan-500';
const panel = 'rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 p-4';
const label = 'text-[11px] font-semibold text-stone-500 dark:text-stone-400';
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4 px-4 py-4">
    <InfoNote>
      <template #summary>
        현재 상태를 넣으면 주사위·카드 중 <b>평균 최종 칸이 가장 높은 행동</b>을 추천합니다. 게임 조작은 하지 않습니다.
      </template>
      <p>행동마다 {{ SAMPLES.toLocaleString() }}판을 끝까지 시뮬레이션해 평균을 비교합니다. 계산은 이 브라우저에서만 합니다.</p>
      <p>지도 데이터는 {{ LAST_MAP }}맵({{ BOARD_SIZE.toLocaleString() }}칸)까지라, 그 뒤로는 마지막 칸에서 멈춘 것으로 계산합니다.</p>
      <p>주사위 이동이 멈추는 칸 같은 일부 특수 칸은 아직 반영하지 않았습니다.</p>
    </InfoNote>

    <div class="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <!-- 추천 -->
      <section :class="panel" class="lg:order-2">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-stone-800 dark:text-stone-100">추천</h2>
          <span class="text-[11px] text-stone-400">{{ running ? '계산 중…' : '' }}</span>
        </div>
        <p v-if="error" class="mt-2 text-xs text-rose-600">{{ error }}</p>
        <p v-else-if="terminal" class="mt-3 text-sm text-stone-600 dark:text-stone-300">
          게임 종료 — 최종 {{ fmtPos(state.pos) }}
        </p>
        <template v-else-if="best">
          <div class="mt-3 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-200 dark:ring-cyan-500/30 px-3 py-2.5">
            <div class="text-lg font-bold text-cyan-700 dark:text-cyan-300">{{ best.label }}</div>
            <div class="text-xs text-stone-600 dark:text-stone-300">
              예상 최종 {{ fmtPos(best.mean) }} (평균 {{ best.mean.toFixed(0) }}칸)
            </div>
          </div>
          <ul class="mt-3 space-y-1">
            <li
              v-for="a in ranked"
              :key="a.key"
              class="flex items-center justify-between rounded-md px-2 py-1 text-xs"
              :class="a === best ? 'bg-stone-100 dark:bg-stone-700/50 font-semibold' : ''"
            >
              <span class="text-stone-700 dark:text-stone-200">{{ a.label }}</span>
              <span class="tabular-nums text-stone-500 dark:text-stone-400">
                {{ a.mean.toFixed(1) }}
                <span class="ml-1 inline-block w-14 text-right" :class="a.gap > 0 ? 'text-orange-600 dark:text-orange-400' : ''">
                  {{ a.gap > 0 ? `−${a.gap.toFixed(1)}` : '최선' }}
                </span>
              </span>
            </li>
          </ul>
          <p class="mt-2 text-[11px] text-stone-400">차이가 ±{{ (best.se * 2).toFixed(1) }}칸(표본 오차) 이내면 사실상 비슷한 선택입니다.</p>
        </template>
      </section>

      <!-- 상태 입력 -->
      <section :class="panel" class="space-y-4 lg:order-1">
        <div class="grid grid-cols-3 gap-2">
          <label class="space-y-1">
            <span :class="label">지도</span>
            <select :class="input" :value="place.map" @change="setPlace(+$event.target.value, 1)">
              <option v-for="m in MAPS" :key="m" :value="m">{{ m }}맵</option>
            </select>
          </label>
          <label class="space-y-1">
            <span :class="label">칸 (1~{{ mapSquares }})</span>
            <input :class="input" type="number" min="1" :max="mapSquares" :value="place.ordinal"
              @change="setPlace(place.map, +$event.target.value)" />
          </label>
          <label class="space-y-1">
            <span :class="label">사용한 주사위</span>
            <input :class="input" type="number" min="0" :max="DICE_LIMIT" :value="state.diceUsed"
              @change="setDiceUsed(+$event.target.value)" />
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300">
          <span>남은 주사위 <b class="text-stone-800 dark:text-stone-100">{{ remaining }}</b></span>
          <label class="inline-flex items-center gap-1.5">
            <input type="checkbox" class="accent-cyan-600" :checked="state.bonus"
              @change="mutate((s) => { s.bonus = $event.target.checked; })" />
            보너스 굴림(더블 직후)
          </label>
          <span v-if="place.q" class="rounded bg-orange-100 dark:bg-orange-500/15 px-1.5 py-0.5 text-orange-700 dark:text-orange-300">? 칸</span>
        </div>

        <!-- 결과 반영 -->
        <div class="space-y-2 rounded-lg bg-stone-50 dark:bg-stone-900/40 p-3">
          <div class="flex items-center justify-between">
            <span :class="label">
              {{ pendingCard ? `${pendingCard.label} — 나온 주사위 합` : '주사위 결과 반영 — 나온 합' }}
            </span>
            <label class="inline-flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
              <input type="checkbox" class="accent-cyan-600" v-model="wasDouble" />더블
            </label>
          </div>
          <div class="grid grid-cols-11 gap-1">
            <button v-for="n in 11" :key="n" type="button"
              :class="[chip, chipIdle, '!px-0']" :disabled="terminal || (wasDouble && (n + 1) % 2 === 1)" @click="applySum(n + 1)">{{ n + 1 }}</button>
          </div>
          <p v-if="wasDouble" class="text-[11px] text-stone-400">
            더블은 짝수 합에서만 나옵니다. 보너스 굴림 중의 더블은 보너스가 이어지지 않습니다.
          </p>
          <p v-if="notice" class="text-[11px] font-medium text-orange-600 dark:text-orange-400">{{ notice }}</p>
          <div class="flex gap-2">
            <button type="button" :class="[chip, chipIdle]" :disabled="!history.length" @click="undo">↶ 되돌리기</button>
            <button type="button" :class="[chip, chipIdle]" @click="resetGame">새 게임</button>
          </div>
        </div>

        <!-- 손패 -->
        <div class="space-y-2">
          <span :class="label">손패 {{ state.hand.length }}/{{ HAND_LIMIT }} — 카드를 눌러 사용, ×로 버리기 · 아래에서 눌러 손패에 추가</span>
          <div class="flex min-h-[2.25rem] flex-wrap gap-1.5">
            <span v-for="(id, i) in state.hand" :key="i + ':' + id" class="inline-flex items-center">
              <button type="button" :disabled="terminal" @click="useCard(i + 1)"
                :class="[chip, pendingSlot === i + 1 ? 'bg-cyan-600 text-white ring-cyan-600' : chipIdle, 'rounded-r-none']">
                {{ CARDS[id - 1].label }}
              </button>
              <button type="button" @click="discard(i + 1)"
                :class="[chip, chipIdle, 'rounded-l-none !px-1.5 text-stone-400']" aria-label="버리기">×</button>
            </span>
            <span v-if="!state.hand.length" class="self-center text-xs text-stone-400">비어 있음</span>
          </div>
          <div class="grid grid-cols-5 gap-1 sm:grid-cols-7">
            <button v-for="t in CARD_TYPES" :key="t.key" type="button" :disabled="handFull"
              :class="[chip, chipIdle, '!px-1 whitespace-nowrap text-[11px]']" @click="addCard(t.key)">{{ t.label.replace('주사위 ', '').replace('다음 스테이지', '다음 맵') }}</button>
          </div>
        </div>

        <!-- 덱 -->
        <details class="group">
          <summary class="cursor-pointer text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            덱 남은 카드 {{ deckLeft }}/{{ DECK_SIZE }} — 이미 나온 카드 표시
          </summary>
          <div class="mt-2 grid grid-cols-6 gap-1">
            <button v-for="c in CARDS" :key="c.id" type="button" :disabled="state.hand.includes(c.id)"
              @click="toggleDrawn(c.id)"
              :class="[chip, '!px-1', state.hand.includes(c.id)
                ? 'bg-cyan-50 dark:bg-cyan-500/10 ring-cyan-200 dark:ring-cyan-500/30 text-cyan-700 dark:text-cyan-300'
                : inDeck(state, c.id) ? chipIdle
                : 'bg-stone-200 dark:bg-stone-700 ring-stone-300 dark:ring-stone-600 text-stone-400 line-through']">
              {{ c.label }}
            </button>
          </div>
          <p class="mt-1 text-[11px] text-stone-400">취소선 = 이미 나옴, 하늘색 = 손패. 손패에 넣은 카드는 자동으로 덱에서 빠집니다.</p>
        </details>
      </section>
    </div>
  </div>
</template>
