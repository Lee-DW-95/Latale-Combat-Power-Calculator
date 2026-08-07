<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ADVENTURE_BOARDS,
  ADVENTURE_MAPS,
  LUCKY_CARD_MAX,
} from '../data/adventureData.js';

// ============================================================
// 어드벤처 빠른보기
//
// 게임 창을 띄워둔 채 모니터 한쪽에서 쓰는 화면이다. 그래서 설계 기준이 하나다 —
// **휠만 굴려서 다음 맵으로 넘어갈 수 있어야 한다.**
// 버튼을 누르러 웹으로 돌아오는 순간 게임 흐름이 끊기기 때문에, 판단에 필요한 건
// 전부 스크롤 위에 미리 깔아 둔다. 내부 스크롤 영역도 쓰지 않는다 —
// 커서를 그 영역에 올려야만 굴러가면 그것도 흐름을 끊는다.
//
// 숫자는 맵의 몇 번째 칸인지를 그대로 쓴다. 이전 맵 마지막 칸에서 +K 를 쓰면
// 다음 맵 K번 칸에 서므로, 그 숫자가 곧 눌러야 할 카드 번호이기도 하다.
// ============================================================

const STAGES = Object.keys(ADVENTURE_BOARDS)
  .map(Number)
  .sort((a, b) => a - b);
const SLOTS = Array.from({ length: LUCKY_CARD_MAX }, (_, i) => i + 1);

const POS_KEY = 'latale.adventure.quickPos';

// 앱 헤더가 sticky top-0 이라 그 아래에 툴바를 붙여야 겹치지 않는다.
// 헤더 높이는 창 폭에 따라 달라지므로(줄바꿈) 고정값 대신 실측한다.
const headerH = ref(0);
const barEl = ref(null);
const barH = ref(0);
let ro = null;

function measure() {
  headerH.value = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
  barH.value = barEl.value?.getBoundingClientRect().height ?? 0;
}

/** 지도 블록을 이 여백만큼 띄워서 보여 줘야 툴바에 안 가린다. */
function stickyOffset() {
  return headerH.value + barH.value + 8;
}

const showImages = ref(false);
const jump = ref('');

// 표시할 종류 — 행운카드만 보고 싶을 때가 있어서 개별로 끌 수 있게 한다.
const KIND_KEY = 'latale.adventure.quickKinds';
const show = ref(loadKinds());

function loadKinds() {
  const base = { card: true, warp: true, ladder: true };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KIND_KEY) ?? '{}') };
  } catch (e) {
    return base;
  }
}

watch(
  show,
  (v) => {
    try {
      localStorage.setItem(KIND_KEY, JSON.stringify(v));
    } catch (e) {
      // 저장 실패는 무시 — 화면 동작에는 지장 없다
    }
  },
  { deep: true },
);

const KINDS = [
  { key: 'card', label: '행운카드', dot: 'bg-amber-400' },
  { key: 'warp', label: '워프', dot: 'bg-sky-500' },
  { key: 'ladder', label: '사다리', dot: 'bg-emerald-500' },
];

// 카드 번호에는 '+' 를 붙이지만 이동 칸수에는 안 붙인다.
// 둘 다 '+' 면 "+6 → +10칸" 처럼 읽혀서 뭐가 카드고 뭐가 거리인지 헷갈린다.
function distLabel(n) {
  return n < 0 ? `−${Math.abs(n)}칸` : `${n}칸`;
}

const rows = computed(() =>
  STAGES.map((stage) => {
    const b = ADVENTURE_BOARDS[stage];
    // 꺼 둔 종류는 아예 없는 것처럼 다뤄서 눈금 띠·상세 줄에서 한 번에 빠지게 한다
    const cells = SLOTS.map((sq) => ({
      sq,
      valid: sq <= b.squares,
      isCard: show.value.card && b.q.includes(sq),
      warp: (show.value.warp && b.portals.find((p) => p[0] === sq)) || null,
      ladder: (show.value.ladder && b.bridges.find((p) => p[0] === sq)) || null,
    }));
    return {
      stage,
      squares: b.squares,
      cells,
      cards: cells.filter((c) => c.isCard),
      warps: cells.filter((c) => c.warp),
      ladders: cells.filter((c) => c.ladder),
      empty: !cells.some((c) => c.isCard || c.warp || c.ladder),
      src: ADVENTURE_MAPS.find((m) => m.stage === stage)?.src ?? '',
    };
  }),
);

// ──── 위치 기억 · 점프 ────
const rowRefs = ref({});
function setRowRef(el, stage) {
  if (el) rowRefs.value[stage] = el;
  else delete rowRefs.value[stage];
}

function scrollToStage(stage, smooth = false) {
  const el = rowRefs.value[stage];
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
  window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
}

function doJump() {
  const n = parseInt(String(jump.value).trim(), 10);
  if (rowRefs.value[n]) scrollToStage(n, true);
}

/** 화면 맨 위에 걸린 지도 번호 — 다시 열었을 때 그 자리로 돌아가려고 저장해 둔다. */
function topStage() {
  const line = stickyOffset() + 8;
  let best = STAGES[0];
  for (const st of STAGES) {
    const el = rowRefs.value[st];
    if (!el) continue;
    if (el.getBoundingClientRect().top <= line) best = st;
    else break;
  }
  return best;
}

let saveTimer = null;
function onScroll() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(POS_KEY, String(topStage()));
    } catch (e) {
      // 저장 실패는 무시 — 화면 동작에는 지장 없다
    }
  }, 300);
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  measure();
  const hdr = document.querySelector('header');
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure);
    if (hdr) ro.observe(hdr);
    if (barEl.value) ro.observe(barEl.value);
  }
  window.addEventListener('resize', measure);

  let saved = NaN;
  try {
    saved = parseInt(localStorage.getItem(POS_KEY) ?? '', 10);
  } catch (e) {
    // 못 읽으면 맨 위에서 시작하면 된다
  }
  if (Number.isFinite(saved) && rowRefs.value[saved]) {
    // 레이아웃이 잡힌 뒤라야 좌표가 맞는다
    requestAnimationFrame(() => scrollToStage(saved));
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', measure);
  ro?.disconnect();
  if (saveTimer) clearTimeout(saveTimer);
});

// 이미지나 표시 종류를 켜고 끄면 줄 높이가 바뀌어 보던 자리를 잃는다. 보정해 준다.
watch([showImages, show], () => {
  const st = topStage();
  requestAnimationFrame(() => scrollToStage(st));
}, { deep: true });
</script>

<template>
  <div>
    <!-- ═══════════ sticky 툴바 — 스크롤을 방해하지 않을 만큼만 ═══════════ -->
    <div
      ref="barEl"
      :style="{ top: headerH + 'px' }"
      class="sticky z-[9] -mx-1 px-1 py-2 bg-stone-50/95 dark:bg-stone-900/95 backdrop-blur border-b border-stone-200 dark:border-stone-700"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <!-- 지도 점프 -->
        <form class="flex items-center gap-1.5" @submit.prevent="doJump">
          <input
            v-model="jump"
            type="number"
            min="1"
            :max="STAGES[STAGES.length - 1]"
            placeholder="지도"
            class="w-20 px-2 py-1.5 rounded-lg text-sm font-bold tabular-nums bg-white dark:bg-stone-800 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            type="submit"
            class="px-3 py-1.5 rounded-lg text-sm font-bold bg-cyan-600 hover:bg-cyan-700 text-white transition"
          >
            이동
          </button>
        </form>

        <!-- 지도 이미지 -->
        <label
          class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer bg-white dark:bg-stone-800 ring-1 ring-stone-300 dark:ring-stone-600 text-stone-500 dark:text-stone-400"
        >
          <input v-model="showImages" type="checkbox" class="accent-cyan-600" />
          지도 이미지
        </label>

        <!-- 표시 종류 토글 — 범례가 곧 스위치다 -->
        <div class="ml-auto flex items-center gap-1.5">
          <button
            v-for="k in KINDS"
            :key="k.key"
            type="button"
            @click="show[k.key] = !show[k.key]"
            :aria-pressed="show[k.key]"
            :title="`${k.label} ${show[k.key] ? '숨기기' : '보기'}`"
            :class="[
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold ring-1 transition',
              show[k.key]
                ? 'bg-white dark:bg-stone-800 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300'
                : 'bg-transparent ring-stone-200 dark:ring-stone-700 text-stone-300 dark:text-stone-600 line-through',
            ]"
          >
            <i
              :class="[
                'w-3 h-3 rounded-sm not-italic transition',
                show[k.key] ? k.dot : 'bg-stone-200 dark:bg-stone-700',
              ]"
            ></i>
            {{ k.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════ 지도 스트림 — 휠만 굴리면 된다 ═══════════ -->
    <div class="mt-2 space-y-1.5">
      <section
        v-for="row in rows"
        :key="row.stage"
        :ref="(el) => setRowRef(el, row.stage)"
        class="scroll-mt-24 rounded-xl bg-white dark:bg-stone-800/70 ring-1 ring-stone-200 dark:ring-stone-700 px-3 py-2.5"
      >
        <div class="flex items-center gap-3">
          <!-- 지도 번호 -->
          <div class="shrink-0 w-14 text-center">
            <p class="text-2xl font-black tabular-nums leading-none text-stone-700 dark:text-stone-200">
              {{ row.stage }}
            </p>
            <p class="mt-0.5 text-[10px] tabular-nums text-stone-400 dark:text-stone-500">
              {{ row.squares }}칸
            </p>
          </div>

          <!-- 12칸 눈금 띠 — 숫자는 눌러야 할 카드 번호 -->
          <div class="flex-1 min-w-0 grid grid-cols-12 gap-1">
            <div
              v-for="c in row.cells"
              :key="c.sq"
              :title="c.valid ? `${c.sq}번 칸 — 행운카드 +${c.sq}` : '이 맵에 없는 칸'"
              :class="[
                'rounded-md py-1 text-center leading-tight',
                !c.valid
                  ? 'bg-stone-50 dark:bg-stone-700/30 text-stone-300 dark:text-stone-600'
                  : c.isCard
                    ? 'bg-amber-400 text-amber-950 ring-1 ring-amber-500/50'
                    : c.warp
                      ? 'bg-sky-500 text-white'
                      : c.ladder
                        ? (c.ladder[1] < 0 ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white')
                        : 'bg-stone-100 dark:bg-stone-700/60 text-stone-400 dark:text-stone-500',
              ]"
            >
              <span
                :class="[
                  'block text-sm tabular-nums',
                  c.isCard || c.warp || c.ladder ? 'font-black' : 'font-semibold',
                ]"
              >{{ c.sq }}</span>
              <span class="block text-[9px] opacity-80">
                {{ c.isCard ? '?' : c.warp ? '워프' : c.ladder ? '사다리' : '·' }}
              </span>
            </div>
          </div>
        </div>

        <!-- 워프 · 사다리 이동칸수 — 띠만으로는 알 수 없는 정보 -->
        <div
          v-if="row.warps.length || row.ladders.length"
          class="mt-1.5 pl-[4.25rem] flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold tabular-nums"
        >
          <span
            v-for="c in row.warps"
            :key="`w${c.sq}`"
            class="text-sky-600 dark:text-sky-400"
          >
            {{ c.sq }}번 → 워프 {{ distLabel(c.warp[1]) }} ({{ c.warp[2] }}번 칸)
          </span>
          <span
            v-for="c in row.ladders"
            :key="`l${c.sq}`"
            :class="c.ladder[1] < 0
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-emerald-600 dark:text-emerald-400'"
          >
            {{ c.sq }}번 → 사다리 {{ distLabel(c.ladder[1]) }} ({{ c.ladder[2] }}번 칸)
            <template v-if="c.ladder[1] < 0">· 후퇴 주의</template>
          </span>
        </div>

        <img
          v-if="showImages && row.src"
          :src="row.src"
          :alt="`지도 ${row.stage}`"
          loading="lazy"
          class="mt-2 w-full rounded-lg ring-1 ring-stone-200 dark:ring-stone-700"
        />
      </section>
    </div>

    <p class="mt-3 text-[11px] text-stone-400 dark:text-stone-500 leading-relaxed">
      숫자는 그 맵의 <strong>몇 번째 칸</strong>인지입니다. 이전 맵 마지막 칸에서 출발하면
      그 숫자가 곧 <strong>눌러야 할 행운카드 번호</strong>가 됩니다.
      보던 위치는 저장돼서 다시 열면 그 자리로 돌아옵니다.
    </p>
  </div>
</template>
