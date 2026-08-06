<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ADVENTURE_BUFFS,
  BUFF_KIND_STYLE,
  ADVENTURE_MAPS,
  ADVENTURE_SOURCE_URL,
  ADVENTURE_BOARDS,
  LUCKY_CARD_MAX,
  PORTAL_MIN_OPTIONS,
} from '../data/adventureData.js';

// ──── 보기 방식 · 필터 ────
const viewMode = ref('list');        // 'list' 간략 표기 | 'map' 지도 이미지
const warpMin = ref(20);             // 이 칸수 이상 이동하는 워프만 표시
const ladderMin = ref(5);            // 이 칸수 이상 이동하는 사다리만 표시
const showAll = ref(false);          // false = 앞쪽 12칸만, true = 전부

// 이전 맵 마지막 칸에서 행운카드(+1~+12)를 써서 닿을 수 있는 건 다음 맵 앞쪽 12칸뿐이다.
// 그래서 이 범위 제한은 행운카드뿐 아니라 워프·사다리 위치에도 똑같이 적용된다 —
// 13번 칸에 있는 워프는 애초에 밟을 방법이 없으니 볼 이유도 없다.
const squareLimit = computed(() => (showAll.value ? Infinity : LUCKY_CARD_MAX));

function moveLabel(n) {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

const boardRows = computed(() =>
  Object.entries(ADVENTURE_BOARDS).map(([stage, b]) => {
    const inRange = (sq) => sq <= squareLimit.value;
    const cards = b.q.filter(inRange);
    const warps = b.portals.filter(
      (m) => inRange(m[0]) && Math.abs(m[1]) >= warpMin.value,
    );
    const ladders = b.bridges.filter(
      (m) => inRange(m[0]) && Math.abs(m[1]) >= ladderMin.value,
    );
    return {
      stage: Number(stage),
      squares: b.squares,
      cards,
      warps,
      ladders,
      hasAny: cards.length > 0 || warps.length > 0 || ladders.length > 0,
    };
  }),
);

const hitCount = computed(() => boardRows.value.filter((r) => r.hasAny).length);

// ──── 라이트박스(이미지 확대) 상태 ────
const lightboxIndex = ref(-1); // -1 = 닫힘
const isOpen = computed(() => lightboxIndex.value >= 0);
const activeMap = computed(() =>
  isOpen.value ? ADVENTURE_MAPS[lightboxIndex.value] : null,
);

function openLightbox(idx) {
  lightboxIndex.value = idx;
}
function closeLightbox() {
  lightboxIndex.value = -1;
}
function prev() {
  if (lightboxIndex.value > 0) lightboxIndex.value -= 1;
}
function next() {
  if (lightboxIndex.value < ADVENTURE_MAPS.length - 1) lightboxIndex.value += 1;
}
function onKey(e) {
  if (!isOpen.value) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === 'ArrowRight') next();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  if (highlightTimer) clearTimeout(highlightTimer);
});

// ──── 단계 검색 → 해당 지도로 스크롤 이동 + 하이라이트 ────
const searchQuery = ref('');
const highlightStage = ref(-1);
const searchError = ref('');
const cardRefs = ref({}); // stage → DOM 엘리먼트
let highlightTimer = null;

function setCardRef(el, stage) {
  if (el) cardRefs.value[stage] = el;
  else delete cardRefs.value[stage];
}

function jumpToStage() {
  searchError.value = '';
  const n = parseInt(String(searchQuery.value).trim(), 10);
  if (!Number.isFinite(n)) {
    searchError.value = '숫자를 입력하세요.';
    return;
  }
  const el = cardRefs.value[n];
  if (!el) {
    searchError.value = `지도 ${n}번은 없습니다 (제공 범위 ${ADVENTURE_MAPS[0].stage}~${ADVENTURE_MAPS[ADVENTURE_MAPS.length - 1].stage}).`;
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightStage.value = n;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightStage.value = -1;
  }, 2000);
}
</script>

<template>
  <div class="space-y-5">
    <!-- ───── 소개 카드 ───── -->
    <div
      class="rounded-xl bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/40 dark:to-sky-950/30 ring-1 ring-cyan-200 dark:ring-cyan-800 px-4 sm:px-5 py-4"
    >
      <h2 class="text-base sm:text-lg font-extrabold text-cyan-800 dark:text-cyan-200">
        🗺️ 라테일 어드벤처 지도
      </h2>
      <p class="mt-1 text-sm text-cyan-700/90 dark:text-cyan-300/90 leading-relaxed">
        인게임에서는 <strong>다음 맵의 칸 정보를 미리 볼 수 없습니다.</strong>
        행운카드 <strong>+1~+12</strong>로 다음 맵의 <code class="px-1 rounded bg-cyan-100 dark:bg-cyan-900/50">?</code> 칸을
        정확히 밟으려면 그 맵 앞쪽 12칸에 뭐가 있는지 알아야 하죠. 그걸 여기서 확인하세요.
      </p>
    </div>

    <!-- ───── 보기 방식 · 필터 ───── -->
    <section
      class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 px-4 sm:px-5 py-3.5"
    >
      <div class="flex flex-col lg:flex-row lg:items-end gap-4">
        <!-- 보기 방식 -->
        <div>
          <p class="text-[11px] font-semibold text-stone-400 dark:text-stone-500 mb-1.5">보기</p>
          <div class="inline-flex rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden">
            <button
              v-for="opt in [{ v: 'list', t: '간략 표기' }, { v: 'map', t: '지도 이미지' }]"
              :key="opt.v"
              type="button"
              @click="viewMode = opt.v"
              :class="[
                'px-3.5 py-1.5 text-sm font-semibold transition',
                viewMode === opt.v
                  ? 'bg-cyan-600 text-white'
                  : 'bg-transparent text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700/50',
              ]"
            >
              {{ opt.t }}
            </button>
          </div>
        </div>

        <template v-if="viewMode === 'list'">
          <!-- 표시 범위 — 행운카드·워프·사다리 위치 모두에 적용 -->
          <div>
            <p class="text-[11px] font-semibold text-stone-400 dark:text-stone-500 mb-1.5">
              표시 범위 <span class="font-normal">(행운카드·워프·사다리 공통)</span>
            </p>
            <div class="inline-flex rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden">
              <button
                v-for="opt in [{ v: false, t: `앞쪽 1~${LUCKY_CARD_MAX}칸` }, { v: true, t: '전체' }]"
                :key="String(opt.v)"
                type="button"
                @click="showAll = opt.v"
                :class="[
                  'px-3.5 py-1.5 text-sm font-semibold transition',
                  showAll === opt.v
                    ? 'bg-orange-500 text-white'
                    : 'bg-transparent text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700/50',
                ]"
              >
                {{ opt.t }}
              </button>
            </div>
          </div>

          <!-- 워프 최소 이동칸수 -->
          <div>
            <p class="text-[11px] font-semibold text-stone-400 dark:text-stone-500 mb-1.5">
              워프 최소 이동칸수
            </p>
            <div class="inline-flex rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden">
              <button
                v-for="n in PORTAL_MIN_OPTIONS"
                :key="n"
                type="button"
                @click="warpMin = n"
                :class="[
                  'px-3 py-1.5 text-sm font-semibold tabular-nums transition',
                  warpMin === n
                    ? 'bg-sky-600 text-white'
                    : 'bg-transparent text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700/50',
                ]"
              >
                {{ n }}칸+
              </button>
            </div>
          </div>

          <!-- 사다리 최소 이동칸수 -->
          <div>
            <p class="text-[11px] font-semibold text-stone-400 dark:text-stone-500 mb-1.5">
              사다리 최소 이동칸수
            </p>
            <div class="inline-flex rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden">
              <button
                v-for="n in PORTAL_MIN_OPTIONS"
                :key="n"
                type="button"
                @click="ladderMin = n"
                :class="[
                  'px-3 py-1.5 text-sm font-semibold tabular-nums transition',
                  ladderMin === n
                    ? 'bg-emerald-600 text-white'
                    : 'bg-transparent text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700/50',
                ]"
              >
                {{ n }}칸+
              </button>
            </div>
          </div>
        </template>
      </div>

      <p v-if="viewMode === 'list'" class="mt-3 text-[11px] text-stone-400 dark:text-stone-500 leading-relaxed">
        표기 예 <code class="px-1 rounded bg-stone-100 dark:bg-stone-700/60">1. ? 4, 8 · 워프 10 +7</code>
        — 4·8번째 칸에 행운카드, 10번째 칸에 7칸 이동하는 워프.
        <span class="text-stone-300 dark:text-stone-600">|</span>
        사다리는 밧줄·장대를 포함합니다.
        <span class="text-stone-300 dark:text-stone-600">|</span>
        조건에 걸린 지도 <strong class="text-stone-500 dark:text-stone-400">{{ hitCount }}</strong> / 56
      </p>
    </section>

    <!-- ───── 간략 표기 ───── -->
    <section
      v-if="viewMode === 'list'"
      class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500 bg-stone-50 dark:bg-stone-800">
              <th class="px-4 py-2 font-semibold w-16">지도</th>
              <th class="px-3 py-2 font-semibold w-16 text-right">총칸</th>
              <th class="px-3 py-2 font-semibold">? 행운카드</th>
              <th class="px-3 py-2 font-semibold">워프</th>
              <th class="px-3 py-2 font-semibold">사다리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100 dark:divide-stone-700/70">
            <tr
              v-for="row in boardRows"
              :key="row.stage"
              :class="[
                'transition',
                row.hasAny
                  ? 'hover:bg-stone-50 dark:hover:bg-stone-700/40'
                  : 'opacity-40',
              ]"
            >
              <td class="px-4 py-2">
                <span class="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                  {{ row.stage }}
                </span>
              </td>
              <td class="px-3 py-2 text-right tabular-nums text-[11px] text-stone-400 dark:text-stone-500">
                {{ row.squares }}
              </td>
              <td class="px-3 py-2">
                <span v-if="!row.cards.length" class="text-stone-300 dark:text-stone-600">—</span>
                <span
                  v-for="s in row.cards"
                  :key="s"
                  class="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >{{ s }}</span>
              </td>
              <td class="px-3 py-2">
                <span v-if="!row.warps.length" class="text-stone-300 dark:text-stone-600">—</span>
                <span
                  v-for="p in row.warps"
                  :key="p[0]"
                  class="inline-block mr-1.5 mb-0.5 text-xs tabular-nums"
                >
                  <strong class="text-stone-700 dark:text-stone-200">{{ p[0] }}</strong>
                  <span class="ml-0.5 px-1 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 font-semibold">{{ moveLabel(p[1]) }}</span>
                </span>
              </td>
              <td class="px-3 py-2">
                <span v-if="!row.ladders.length" class="text-stone-300 dark:text-stone-600">—</span>
                <span
                  v-for="b in row.ladders"
                  :key="b[0]"
                  class="inline-block mr-1.5 mb-0.5 text-xs tabular-nums"
                >
                  <strong class="text-stone-700 dark:text-stone-200">{{ b[0] }}</strong>
                  <span
                    :class="[
                      'ml-0.5 px-1 py-0.5 rounded font-semibold',
                      b[1] < 0
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                    ]"
                  >{{ moveLabel(b[1]) }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ───── 버프 테이블 ───── -->
    <section
      class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden"
    >
      <div class="px-4 sm:px-5 py-3 border-b border-stone-100 dark:border-stone-700">
        <h3 class="text-sm font-bold text-stone-700 dark:text-stone-200">
          🎁 단계별 진입 보상
        </h3>
        <p class="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
          해당 스테이지 진입에 필요한 누적 칸 수와 획득 버프
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500 bg-stone-50 dark:bg-stone-800">
              <th class="px-4 py-2 font-semibold">스테이지</th>
              <th class="px-4 py-2 font-semibold text-right">필요 칸 수</th>
              <th class="px-4 py-2 font-semibold">버프</th>
              <th class="px-4 py-2 font-semibold text-right">수치</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100 dark:divide-stone-700/70">
            <tr
              v-for="row in ADVENTURE_BUFFS"
              :key="row.stage"
              class="hover:bg-stone-50 dark:hover:bg-stone-700/40 transition"
            >
              <td class="px-4 py-2.5">
                <span class="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                  {{ row.stage }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums text-stone-500 dark:text-stone-400">
                {{ row.squares.toLocaleString() }}칸
              </td>
              <td class="px-4 py-2.5">
                <span
                  :class="['inline-block px-2 py-0.5 rounded-full text-xs font-medium', BUFF_KIND_STYLE[row.kind]]"
                >
                  {{ row.buff }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums font-bold text-stone-700 dark:text-stone-200">
                {{ row.value }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ───── 지도 갤러리 ───── -->
    <section
      v-if="viewMode === 'map'"
      class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 overflow-hidden"
    >
      <div class="px-4 sm:px-5 py-3 border-b border-stone-100 dark:border-stone-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-stone-700 dark:text-stone-200">
            🧭 어드벤처 지도
          </h3>
          <p class="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
            이미지를 누르면 크게 볼 수 있어요 · 총 {{ ADVENTURE_MAPS.length }}장
          </p>
        </div>

        <!-- 단계 검색 → 점프 -->
        <div class="shrink-0">
          <div class="flex items-center gap-2">
            <div class="relative">
              <input
                v-model="searchQuery"
                type="number"
                inputmode="numeric"
                min="1"
                max="56"
                placeholder="단계 (예: 35)"
                @keyup.enter="jumpToStage"
                @input="searchError = ''"
                class="w-32 sm:w-36 pl-8 pr-2 py-1.5 text-sm rounded-lg bg-stone-50 dark:bg-stone-900 ring-1 ring-stone-200 dark:ring-stone-700 focus:ring-2 focus:ring-cyan-500 outline-none tabular-nums"
              />
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">🔍</span>
            </div>
            <button
              type="button"
              @click="jumpToStage"
              class="px-3 py-1.5 text-sm font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white transition"
            >
              이동
            </button>
          </div>
          <p v-if="searchError" class="mt-1 text-[11px] text-rose-500 dark:text-rose-400">
            {{ searchError }}
          </p>
        </div>
      </div>

      <div class="p-3 sm:p-4">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            v-for="(map, idx) in ADVENTURE_MAPS"
            :key="map.stage"
            :ref="(el) => setCardRef(el, map.stage)"
            type="button"
            @click="openLightbox(idx)"
            :class="[
              'group relative rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-900 focus:outline-none transition',
              highlightStage === map.stage
                ? 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-white dark:ring-offset-stone-800 scale-[1.02]'
                : 'ring-1 ring-stone-200 dark:ring-stone-700 focus:ring-2 focus:ring-cyan-500',
            ]"
          >
            <img
              :src="map.src"
              :alt="map.title"
              loading="lazy"
              class="w-full aspect-[5/3] object-cover transition duration-200 group-hover:scale-[1.03]"
            />
            <span
              class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-black/55 backdrop-blur-sm"
            >
              {{ map.title }}
            </span>
          </button>
        </div>
      </div>
    </section>

    <!-- ───── 출처 ───── -->
    <p class="text-center text-[11px] text-stone-400 dark:text-stone-500">
      자료 출처 ·
      <a
        :href="ADVENTURE_SOURCE_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="underline decoration-dotted hover:text-cyan-500 dark:hover:text-cyan-400"
      >라테일 정보 블로그 (lataleinfo.tistory.com/415)</a>
    </p>

    <!-- ───── 라이트박스 모달 ───── -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        @click.self="closeLightbox"
      >
        <!-- 닫기 -->
        <button
          type="button"
          @click="closeLightbox"
          class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl leading-none transition"
          aria-label="닫기"
        >
          ✕
        </button>

        <!-- 이전 -->
        <button
          v-if="lightboxIndex > 0"
          type="button"
          @click="prev"
          class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl transition"
          aria-label="이전"
        >
          ‹
        </button>

        <!-- 이미지 + 캡션 -->
        <figure class="max-w-5xl w-full flex flex-col items-center">
          <img
            :src="activeMap.src"
            :alt="activeMap.title"
            class="max-h-[80vh] w-auto rounded-lg shadow-2xl ring-1 ring-white/10"
          />
          <figcaption class="mt-3 text-sm font-semibold text-white/90">
            {{ activeMap.title }}
            <span class="text-white/50 font-normal">
              ({{ lightboxIndex + 1 }} / {{ ADVENTURE_MAPS.length }})
            </span>
          </figcaption>
        </figure>

        <!-- 다음 -->
        <button
          v-if="lightboxIndex < ADVENTURE_MAPS.length - 1"
          type="button"
          @click="next"
          class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl transition"
          aria-label="다음"
        >
          ›
        </button>
      </div>
    </Teleport>
  </div>
</template>
