<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ADVENTURE_BOARDS,
  ADVENTURE_MAPS,
  LUCKY_CARD_MAX,
  PORTAL_MIN_OPTIONS,
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

// 표시 설정 — 행운카드만 보고 싶거나, 짧은 워프는 밟을 가치가 없어서 빼고 싶을 때가 있다.
//   card   : true/false
//   warp   : OFF(-1) | ALL(0) | 5·10·15·20 — 이 칸수 이상 이동하는 것만
//   ladder : 같음
const OFF = -1;
const ALL = 0;
const RANGE_OPTIONS = [
  { v: OFF, t: '끄기' },
  { v: ALL, t: '전체' },
  ...PORTAL_MIN_OPTIONS.map((n) => ({ v: n, t: `${n}칸+` })),
];

const VIEW_KEY = 'latale.adventure.quickView';
const show = ref(loadView());

function loadView() {
  // 기본값은 기존 어드벤처 탭과 맞춘다 — 두 화면이 서로 다른 답을 주면 헷갈린다
  const base = { card: true, warp: 20, ladder: 5 };
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    return {
      card: typeof saved.card === 'boolean' ? saved.card : base.card,
      warp: typeof saved.warp === 'number' ? saved.warp : base.warp,
      ladder: typeof saved.ladder === 'number' ? saved.ladder : base.ladder,
    };
  } catch (e) {
    return base;
  }
}

watch(
  show,
  (v) => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch (e) {
      // 저장 실패는 무시 — 화면 동작에는 지장 없다
    }
  },
  { deep: true },
);

/** 이 이동칸수를 표시할지. mode 가 OFF 면 전부 숨기고, 그 외엔 |칸수| >= mode 만 남긴다. */
function passes(mode, n) {
  return mode !== OFF && Math.abs(n) >= mode;
}

/**
 * 칸 안에 붙는 보조 라벨. 게임하면서 "5번 → 워프 12칸 (17번 칸)" 같은 문장을 읽는 건
 * 부담이 크다. 그래서 도착 칸 번호는 버리고 **몇 칸 이동하는지**만 칸 안으로 넣었다.
 * 앞의 화살표가 방향이라 색과 함께 보면 문장을 안 읽어도 된다.
 */
function hopLabel(n) {
  return n < 0 ? `◂${Math.abs(n)}` : `▸${n}`;
}

/** 마우스를 올렸을 때만 읽는 전체 문장. 칸 안에는 안 들어가는 도착 칸 번호를 여기 담는다. */
function cellTitle(c) {
  if (!c.valid) return '이 맵에 없는 칸';
  const head = `${c.sq}번 칸 — 행운카드 +${c.sq}`;
  if (c.isCard) return `${head} · ? 행운카드`;
  if (c.chain) {
    const kind = c.chain.kind === 'warp' ? '워프' : '사다리';
    return `${head} · ${kind} ${Math.abs(c.chain.m[1])}칸 → ${c.chain.m[2]}번 칸의 ? 행운카드`;
  }
  if (c.warp) return `${head} · 워프 ${Math.abs(c.warp[1])}칸 → ${c.warp[2]}번 칸`;
  if (c.ladder) return `${head} · 사다리 ${Math.abs(c.ladder[1])}칸 → ${c.ladder[2]}번 칸`;
  return head;
}

const rows = computed(() =>
  STAGES.map((stage) => {
    const b = ADVENTURE_BOARDS[stage];
    const cells = SLOTS.map((sq) => {
      const warp = b.portals.find((p) => p[0] === sq) ?? null;
      const ladder = b.bridges.find((p) => p[0] === sq) ?? null;
      const isCard = show.value.card && b.q.includes(sq);

      // 워프·사다리를 타고 **도착한 칸**에 카드가 있으면, 눌러야 할 카드 번호는 '여기'다.
      // 앞쪽 12칸 밖으로 나가는 이동이라 지금까지는 화면에 드러나지 않았다.
      //
      // 이건 워프·사다리 칸수 필터를 타지 않는다. 필터는 "몇 칸이나 벌 수 있나"로 거르는
      // 건데, 이 칸을 밟는 이유는 이동량이 아니라 카드이기 때문이다. 그래서 색도 워프색이
      // 아니라 카드색(amber)으로 칠하고, 워프냐 사다리냐는 테두리 색으로만 남긴다.
      const chain = !isCard && show.value.card
        ? (warp && b.q.includes(warp[2]) ? { m: warp, kind: 'warp' }
          : ladder && b.q.includes(ladder[2]) ? { m: ladder, kind: 'ladder' }
            : null)
        : null;

      return {
        sq,
        valid: sq <= b.squares,
        isCard,
        chain,
        warp: warp && passes(show.value.warp, warp[1]) ? warp : null,
        ladder: ladder && passes(show.value.ladder, ladder[1]) ? ladder : null,
      };
    });
    return {
      stage,
      squares: b.squares,
      cells,
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

        <!-- 표시 설정 — 범례가 곧 스위치다 -->
        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <!-- 행운카드는 켜고 끄는 것뿐 (이동 개념이 없다) -->
          <button
            type="button"
            @click="show.card = !show.card"
            :aria-pressed="show.card"
            :title="`행운카드 ${show.card ? '숨기기' : '보기'}`"
            :class="[
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold ring-1 transition',
              show.card
                ? 'bg-white dark:bg-stone-800 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300'
                : 'bg-transparent ring-stone-200 dark:ring-stone-700 text-stone-300 dark:text-stone-600 line-through',
            ]"
          >
            <i
              :class="[
                'w-3 h-3 rounded-sm not-italic transition',
                show.card ? 'bg-amber-400' : 'bg-stone-200 dark:bg-stone-700',
              ]"
            ></i>
            행운카드
          </button>

          <!-- 워프·사다리는 '몇 칸 이상 이동하는 것만' 이 실제로 쓰는 기준이다 -->
          <label
            v-for="k in [
              { key: 'warp', label: '워프', dot: 'bg-sky-500' },
              { key: 'ladder', label: '사다리', dot: 'bg-emerald-500' },
            ]"
            :key="k.key"
            :class="[
              'flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-[11px] font-bold ring-1 cursor-pointer transition',
              show[k.key] !== -1
                ? 'bg-white dark:bg-stone-800 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300'
                : 'bg-transparent ring-stone-200 dark:ring-stone-700 text-stone-300 dark:text-stone-600',
            ]"
          >
            <i
              :class="[
                'w-3 h-3 rounded-sm not-italic transition',
                show[k.key] !== -1 ? k.dot : 'bg-stone-200 dark:bg-stone-700',
              ]"
            ></i>
            {{ k.label }}
            <select
              v-model.number="show[k.key]"
              class="bg-transparent text-[11px] font-bold tabular-nums cursor-pointer focus:outline-none text-stone-600 dark:text-stone-300"
            >
              <option v-for="o in RANGE_OPTIONS" :key="o.v" :value="o.v" class="text-stone-800">
                {{ o.t }}
              </option>
            </select>
          </label>
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
              :title="cellTitle(c)"
              :class="[
                'rounded-md py-1 text-center leading-tight',
                !c.valid
                  ? 'bg-stone-50 dark:bg-stone-700/30 text-stone-300 dark:text-stone-600'
                  : c.isCard
                    ? 'bg-amber-400 text-amber-950 ring-1 ring-amber-500/50'
                    : c.chain
                      ? (c.chain.kind === 'warp'
                        ? 'bg-amber-400 text-amber-950 ring-2 ring-sky-500'
                        : 'bg-amber-400 text-amber-950 ring-2 ring-emerald-500')
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
                  c.isCard || c.chain || c.warp || c.ladder ? 'font-black' : 'font-semibold',
                ]"
              >{{ c.sq }}</span>
              <!-- 워프·사다리는 이동 칸수를 여기에 붙여 아래 설명 줄을 없앴다.
                   뒤에 ? 가 붙으면 그 이동 끝에 행운카드가 있다는 뜻이다. -->
              <span class="block text-[9px] font-bold tabular-nums opacity-90">
                {{ c.isCard ? '?'
                  : c.chain ? hopLabel(c.chain.m[1]) + '?'
                  : c.warp ? hopLabel(c.warp[1])
                  : c.ladder ? hopLabel(c.ladder[1])
                  : '·' }}
              </span>
            </div>
          </div>
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
      큰 숫자는 그 맵의 <strong>몇 번째 칸</strong>인지입니다. 이전 맵 마지막 칸에서 출발하면
      그 숫자가 곧 <strong>눌러야 할 행운카드 번호</strong>가 됩니다.
      작은 숫자는 워프·사다리가 <strong>몇 칸 이동</strong>하는지고,
      <strong>◂</strong> 는 후퇴입니다.
      <span class="text-stone-300 dark:text-stone-600">|</span>
      <strong class="text-amber-600 dark:text-amber-400">노란 칸</strong>은 행운카드를 먹는 칸입니다.
      <code class="px-1 rounded bg-stone-100 dark:bg-stone-700/60">▸10?</code> 처럼
      뒤에 <strong>?</strong> 가 붙으면 그 칸의 워프·사다리를 타고 <strong>도착한 자리</strong>에
      카드가 있다는 뜻이라, 12칸 밖이라도 결국 카드를 먹습니다
      (테두리 색이 <span class="text-sky-500">워프</span> ·
      <span class="text-emerald-500">사다리</span>). 이 칸은 칸수 필터와 무관하게 항상 표시됩니다.
      <span class="text-stone-300 dark:text-stone-600">|</span>
      보던 위치와 표시 설정은 저장됩니다.
    </p>
  </div>
</template>
