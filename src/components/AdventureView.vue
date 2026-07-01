<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ADVENTURE_BUFFS,
  BUFF_KIND_STYLE,
  ADVENTURE_MAPS,
  ADVENTURE_SOURCE_URL,
} from '../data/adventureData.js';

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
      class="rounded-xl bg-gradient-to-br from-indigo-50 to-sky-50 dark:from-indigo-950/40 dark:to-sky-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 sm:px-5 py-4"
    >
      <h2 class="text-base sm:text-lg font-extrabold text-indigo-800 dark:text-indigo-200">
        🗺️ 라테일 어드벤처 지도
      </h2>
      <p class="mt-1 text-sm text-indigo-700/90 dark:text-indigo-300/90 leading-relaxed">
        어드벤처는 스테이지를 진행하며 칸을 밟아 나가는 콘텐츠입니다.
        <strong>5단계 단위(30·35·40…)로 진입에 성공하면 특별한 버프</strong>를 획득합니다.
        아래에서 단계별 보상과 전체 지도(2~56)를 확인하세요.
      </p>
    </div>

    <!-- ───── 버프 테이블 ───── -->
    <section
      class="rounded-xl bg-white dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden"
    >
      <div class="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-700">
        <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">
          🎁 단계별 진입 보상
        </h3>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          해당 스테이지 진입에 필요한 누적 칸 수와 획득 버프
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800">
              <th class="px-4 py-2 font-semibold">스테이지</th>
              <th class="px-4 py-2 font-semibold text-right">필요 칸 수</th>
              <th class="px-4 py-2 font-semibold">버프</th>
              <th class="px-4 py-2 font-semibold text-right">수치</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-700/70">
            <tr
              v-for="row in ADVENTURE_BUFFS"
              :key="row.stage"
              class="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition"
            >
              <td class="px-4 py-2.5">
                <span class="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {{ row.stage }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                {{ row.squares.toLocaleString() }}칸
              </td>
              <td class="px-4 py-2.5">
                <span
                  :class="['inline-block px-2 py-0.5 rounded-full text-xs font-medium', BUFF_KIND_STYLE[row.kind]]"
                >
                  {{ row.buff }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums font-bold text-slate-700 dark:text-slate-200">
                {{ row.value }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ───── 지도 갤러리 ───── -->
    <section
      class="rounded-xl bg-white dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden"
    >
      <div class="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">
            🧭 어드벤처 지도
          </h3>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
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
                class="w-32 sm:w-36 pl-8 pr-2 py-1.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none tabular-nums"
              />
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
            </div>
            <button
              type="button"
              @click="jumpToStage"
              class="px-3 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition"
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
              'group relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 focus:outline-none transition',
              highlightStage === map.stage
                ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 scale-[1.02]'
                : 'ring-1 ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-indigo-500',
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
    <p class="text-center text-[11px] text-slate-400 dark:text-slate-500">
      자료 출처 ·
      <a
        :href="ADVENTURE_SOURCE_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="underline decoration-dotted hover:text-indigo-500 dark:hover:text-indigo-400"
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
