// 어드벤처 AI 추천 엔진 — 지도 데이터(ADVENTURE_BOARDS) 위에 게임 규칙을 구현하고,
// 현재 상태에서 가능한 행동(주사위 / 손패 카드)마다 끝까지 시뮬레이션해 평균 최종 칸을 비교한다.
//
// 규칙 요약
//   · 주사위 100회. 더블이 나오면 다음 굴림 1회는 횟수를 쓰지 않는 보너스 굴림.
//     보너스 굴림에서 다시 더블이 나와도 보너스는 이어지지 않는다.
//   · 남은 주사위가 0 이고 보너스도 없으면 종료 — 손에 남은 카드는 쓸 수 없다.
//   · 워프·사다리 칸에 서면 연결된 칸으로 이동, 최종 도착 칸이 ? 칸이면 카드 1장 획득(손패 5장 한도).
//   · 덱 30장은 비복원 추출, 다 뽑으면 30장 전체로 다시 채운다.
//   · 카드: 이동(+1~+12, -1~-3) / 주사위 배수(×2~×10, 주사위 1회 소모) / 다음 스테이지.
//
// 롤아웃 정책은 "행동 뒤 상태의 근사 가치"가 가장 큰 행동을 고르는 1-step 탐욕 정책이다.
//   가치 ≈ 현재 칸 + 남은 주사위 × 주사위당 기대 전진(PARAMS.die) + 보너스 + 손패 카드 가치.
//   맨 위 행동만 롤아웃 평균으로 비교하므로 정책의 근사 오차는 상당 부분 상쇄된다.

import { ADVENTURE_BOARDS, ADVENTURE_MAP_START, ADVENTURE_MAP_END } from '../data/adventureData.js';

export const DICE_LIMIT = 100;
export const HAND_LIMIT = 5;
export const DECK_SIZE = 30;
export const FULL_DECK = 2 ** DECK_SIZE - 1;

// ─────────────────── 카드 ───────────────────
// type 1: 이동 v칸 / 2: 주사위 × v / 3: 다음 스테이지
const CARD_DEFS = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 4], [1, 5], [1, 5], [1, 6], [1, 6], [1, 7],
  [1, 7], [1, 8], [1, 8], [1, 9], [1, 9], [1, 10], [1, 10], [1, 11], [1, 12], [1, -1],
  [1, -2], [1, -3], [2, 2], [2, 3], [2, 5], [2, 7], [2, 8], [2, 10], [3, 1], [3, 1],
];
export const CARDS = CARD_DEFS.map(([type, value], i) => ({
  id: i + 1,
  type,
  value,
  label: type === 3 ? '다음 스테이지' : type === 2 ? `주사위 ×${value}` : value > 0 ? `+${value}` : `${value}`,
}));
// 같은 효과의 카드(예: +4 두 장)는 같은 행동으로 묶는다.
export const cardKey = (id) => `${CARDS[id - 1].type}:${CARDS[id - 1].value}`;

// ─────────────────── 보드 ───────────────────
const MAPS = [];
for (let m = ADVENTURE_MAP_START; m <= ADVENTURE_MAP_END; m++) MAPS.push(m);
export const MAP_START = new Map(); // 지도 번호 → 절대 칸 번호(1부터)
const tileMap = [0], tileOrdinal = [0], jumpTo = [0], isQ = [0];
let total = 0;
for (const m of MAPS) {
  const b = ADVENTURE_BOARDS[m];
  MAP_START.set(m, total + 1);
  const q = new Set(b.q);
  const jumps = new Map([...b.portals, ...b.bridges].map(([from, , to]) => [from, to]));
  for (let i = 1; i <= b.squares; i++) {
    tileMap.push(m);
    tileOrdinal.push(i);
    jumpTo.push(jumps.has(i) ? total + jumps.get(i) : 0);
    isQ.push(q.has(i) ? 1 : 0);
  }
  total += b.squares;
}
export const BOARD_SIZE = total;
export const LAST_MAP = MAPS[MAPS.length - 1];

const clamp = (p) => (p < 1 ? 1 : p > BOARD_SIZE ? BOARD_SIZE : p);
// 도착 칸 확정: 워프·사다리를 끝까지 따라간다.
const landing = new Int32Array(BOARD_SIZE + 1);
for (let p = 1; p <= BOARD_SIZE; p++) {
  let at = p;
  for (let hop = 0; jumpTo[at] && hop < 64; hop++) at = jumpTo[at];
  landing[p] = at;
}
const land = (p) => landing[clamp(p)];
const nextMapStart = new Int32Array(BOARD_SIZE + 1);
for (let p = 1; p <= BOARD_SIZE; p++) {
  const next = MAP_START.get(tileMap[p] + 1);
  nextMapStart[p] = next ?? BOARD_SIZE;
}

export function positionOf(map, ordinal) {
  return MAP_START.get(map) + ordinal - 1;
}
export function describePosition(p) {
  return { map: tileMap[p], ordinal: tileOrdinal[p], q: !!isQ[p], jump: jumpTo[p] || null };
}
export function isQuestion(p) {
  return !!isQ[p];
}
export function resolveLanding(p) {
  return land(p);
}

// 두 주사위 합 2~12 의 확률(36 분의 n)과 더블 확률
const SUM_WAYS = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

// ─────────────────── 상태 ───────────────────
// { pos, diceUsed, bonus, hand: [cardId...], deck: 남은 덱 비트마스크(bit i = 카드 i+1) }
export function newState() {
  return { pos: 1, diceUsed: 0, bonus: false, hand: [], deck: FULL_DECK };
}
export const isTerminal = (s) => s.diceUsed >= DICE_LIMIT && !s.bonus;
const popcount = (x) => {
  let n = 0;
  while (x) { x &= x - 1; n++; }
  return n;
};

// ─────────────────── 탐욕 정책의 근사 가치 ───────────────────
// die: 주사위 1회가 최종 칸에 기여하는 평균 전진량(카드·워프 포함) / draw: ? 칸에서 카드 1장을 얻는 가치.
//   값은 자가 대국으로 평균 최종 칸이 가장 높게 나오도록 맞췄다.
//   자가 대국 1,500판 평균 1,793칸 (주사위만 굴리면 972칸).
export const PARAMS = { die: 0, draw: 60, neg: 12, nextStage: 16, multScale: 1, moveScale: 3 };
function cardWorth(id, P) {
  const c = CARDS[id - 1];
  if (c.type === 1) return c.value > 0 ? c.value * P.moveScale : P.neg;
  if (c.type === 2) return (7 * c.value - P.die * (5 / 6)) * P.multScale;
  return P.nextStage;
}
let CARD_WORTH = [];
export function setParams(next) {
  Object.assign(PARAMS, next);
  CARD_WORTH = CARDS.map((c) => cardWorth(c.id, PARAMS));
}
setParams({});
// 남은 주사위가 적으면 손패를 다 못 쓰므로 카드 가치를 깎는다.
const handFactor = (remaining) => (remaining >= 3 ? 1 : remaining <= 0 ? 0 : remaining / 3);

// 굴림 결과 기대값 미리 계산: rollPos[mult][p] = E[도착 칸], rollQ[mult][p] = P(? 칸 도착)
const MULTS = [1, 2, 3, 5, 7, 8, 10];
const rollPos = {}, rollQ = {};
for (const k of MULTS) {
  const ep = new Float64Array(BOARD_SIZE + 1), eq = new Float64Array(BOARD_SIZE + 1);
  for (let p = 1; p <= BOARD_SIZE; p++) {
    let a = 0, b = 0;
    for (let s = 2; s <= 12; s++) {
      const to = land(p + s * k);
      a += SUM_WAYS[s] * to;
      b += SUM_WAYS[s] * isQ[to];
    }
    ep[p] = a / 36;
    eq[p] = b / 36;
  }
  rollPos[k] = ep;
  rollQ[k] = eq;
}

// 행동 a(0 = 주사위, i = 손패 i번째 카드)를 한 뒤의 근사 가치.
function heuristic(s, a) {
  const remaining = DICE_LIMIT - s.diceUsed;
  let handSum = 0;
  for (let i = 0; i < s.hand.length; i++) if (i !== a - 1) handSum += CARD_WORTH[s.hand[i] - 1];
  const handAfter = a === 0 ? s.hand.length : s.hand.length - 1;
  const canDraw = handAfter < HAND_LIMIT ? PARAMS.draw : 0, DIE_VALUE = PARAMS.die;
  const card = a === 0 ? null : CARDS[s.hand[a - 1] - 1];
  if (a === 0 || card.type === 2) {
    const k = a === 0 ? 1 : card.value;
    // 굴림: 보너스 중이면 횟수를 안 쓰고 보너스가 사라진다. 아니면 1회 소모 + 1/6 확률로 보너스.
    const left = s.bonus ? remaining : remaining - 1;
    const bonusValue = s.bonus ? 0 : DIE_VALUE / 6;
    return rollPos[k][s.pos] + canDraw * rollQ[k][s.pos] + left * DIE_VALUE + bonusValue +
      handSum * handFactor(left);
  }
  const to = card.type === 3 ? land(nextMapStart[s.pos]) : land(s.pos + card.value);
  return to + canDraw * isQ[to] + remaining * DIE_VALUE + (s.bonus ? DIE_VALUE : 0) +
    handSum * handFactor(remaining);
}

export function greedyAction(s) {
  let best = 0, bestValue = -Infinity;
  for (let a = 0; a <= s.hand.length; a++) {
    const v = heuristic(s, a);
    if (v > bestValue) { bestValue = v; best = a; }
  }
  return best;
}

// ─────────────────── 진행 ───────────────────
function rollDice(s, rand) {
  const a = (rand() * 6 + 1) | 0, b = (rand() * 6 + 1) | 0;
  if (s.bonus) s.bonus = false;
  else { s.bonus = a === b; s.diceUsed++; }
  return a + b;
}
function draw(s, rand) {
  if (s.hand.length >= HAND_LIMIT) return;
  let k = (rand() * popcount(s.deck)) | 0;
  for (let i = 0; i < DECK_SIZE; i++) {
    if (!(s.deck & (2 ** i))) continue;
    if (k-- === 0) {
      s.deck -= 2 ** i;
      s.hand.push(i + 1);
      break;
    }
  }
  if (s.deck === 0) s.deck = FULL_DECK;
}
function arrive(s, p, rand) {
  s.pos = land(p);
  if (isQ[s.pos]) draw(s, rand);
}
// 행동 적용(상태를 직접 바꾼다). a: 0 = 주사위, i = 손패 i번째.
export function step(s, a, rand) {
  if (isTerminal(s)) return;
  if (a === 0) { arrive(s, s.pos + rollDice(s, rand), rand); return; }
  const [id] = s.hand.splice(a - 1, 1);
  const card = CARDS[id - 1];
  if (card.type === 1) arrive(s, s.pos + card.value, rand);
  else if (card.type === 2) arrive(s, s.pos + rollDice(s, rand) * card.value, rand);
  else arrive(s, nextMapStart[s.pos], rand);
}

const clone = (s) => ({ pos: s.pos, diceUsed: s.diceUsed, bonus: s.bonus, hand: s.hand.slice(), deck: s.deck });

export function playout(s, rand, policy = greedyAction) {
  const t = clone(s);
  while (!isTerminal(t)) step(t, policy(t), rand);
  return t.pos;
}

// 시드 고정 난수 — 행동끼리 같은 난수열을 써서(공통 난수) 비교 분산을 줄인다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 행동 후보 — 같은 효과 카드는 첫 슬롯만 대표로.
export function actionChoices(s) {
  const seen = new Set(), list = [{ action: 0, key: 'roll', label: s.bonus ? '주사위 (보너스)' : '주사위' }];
  s.hand.forEach((id, i) => {
    const key = cardKey(id);
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ action: i + 1, key, cardId: id, label: CARDS[id - 1].label });
  });
  return list;
}

// 행동별 평균 최종 칸. samples: 행동당 롤아웃 수.
//   표본이 적으면 잡음 때문에 오히려 탐욕 정책보다 못하다 — 같은 난수 60판 비교에서
//   150회는 1,710 < 탐욕 1,772, 1,000회(30판)는 1,819 > 1,767. 화면은 3,000회를 쓴다.
export function evaluate(state, { samples = 4000, seed = 12345 } = {}) {
  const s = clone(state);
  if (isTerminal(s)) return { terminal: true, finalPos: s.pos, actions: [] };
  const actions = actionChoices(s).map((c) => {
    let sum = 0, sumSq = 0;
    for (let i = 0; i < samples; i++) {
      // 첫 행동과 이후 진행에 서로 다른 난수열을 쓴다 — 행동마다 첫 행동이 소비하는 난수 수가 달라도
      // 이후 진행은 같은 난수열로 맞춰져 행동 간 비교 분산이 줄어든다.
      const t = clone(s);
      step(t, c.action, mulberry32(seed + i * 7919));
      const v = playout(t, mulberry32(seed + 1e6 + i * 7919));
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / samples;
    const se = Math.sqrt(Math.max(0, sumSq / samples - mean * mean) / samples);
    return { ...c, mean, se };
  });
  const best = actions.reduce((a, b) => (b.mean > a.mean ? b : a));
  return { terminal: false, best: best.action, actions: actions.map((a) => ({ ...a, gap: best.mean - a.mean })) };
}

// ─────────────────── 실제 결과 반영 (수동 진행용) ───────────────────
// 게임에서 나온 주사위 합·더블 여부를 받아 상태를 갱신한다. 반환: 도착 칸이 ? 칸인지.
//   카드 획득은 무엇을 뽑았는지 알 수 없으므로 호출 측에서 손패에 직접 추가한다.
function useDie(s, isDouble) {
  if (s.bonus) s.bonus = false;
  else { s.bonus = !!isDouble; s.diceUsed++; }
}
export function applyRoll(s, sum, isDouble) {
  useDie(s, isDouble);
  s.pos = land(s.pos + sum);
  return !!isQ[s.pos];
}
// slot: 손패 1부터. 주사위 배수 카드는 sum·isDouble 이 필요하다.
export function applyCard(s, slot, sum = 0, isDouble = false) {
  const [id] = s.hand.splice(slot - 1, 1);
  const card = CARDS[id - 1];
  if (card.type === 1) s.pos = land(s.pos + card.value);
  else if (card.type === 2) { useDie(s, isDouble); s.pos = land(s.pos + sum * card.value); }
  else s.pos = land(nextMapStart[s.pos]);
  return !!isQ[s.pos];
}
// 손패에 카드 추가 — 같은 효과 카드 중 아직 덱에 남은 것을 고른다. 덱이 비면 30장으로 다시 채운다.
export function addToHand(s, key) {
  if (s.hand.length >= HAND_LIMIT) return false;
  const candidates = CARDS.filter((c) => cardKey(c.id) === key && !s.hand.includes(c.id));
  const pick = candidates.find((c) => s.deck & (2 ** (c.id - 1))) ?? candidates[0];
  if (!pick) return false;
  s.hand.push(pick.id);
  if (s.deck & (2 ** (pick.id - 1))) s.deck -= 2 ** (pick.id - 1);
  if (s.deck === 0) s.deck = FULL_DECK;
  return true;
}
