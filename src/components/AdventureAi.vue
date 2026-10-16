<script setup>
import { ref, watch } from 'vue';
import AdventureAiManual from './AdventureAiManual.vue';

// ============================================================
// 어드벤처 AI — 원작자(alfm201) 허락을 받아 원본 시뮬레이터를 우리 서버에서 띄운다.
//   원본: UI + 수동/자동/어시스트(화면 인식) 모드 + VELA·LYRA·X36 모델 + 음성 안내.
//   오라클 VM 의 /srv/adventure 에 원본 저장소와 모델 파일을 미러링해 Caddy 로 서빙한다
//   (backend/scripts/adventure_mirror.sh). 원본 업데이트는 그 스크립트를 다시 돌리면 반영된다.
//   어시스트의 화면 공유(getDisplayMedia)는 iframe 에 display-capture 권한을 줘야 동작한다.
// 간단 추천: 우리 지도 데이터 위에 새로 짠 엔진(adventureAi.js) — 미러가 안 열릴 때의 대안.
// ============================================================

const SOURCE_URL = 'https://latale-api.duckdns.org/adventure/';
const REPO_URL = 'https://github.com/alfm201/adventure';
const VIEW_KEY = 'latale.adventure.ai.view';

function loadView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'manual' ? 'manual' : 'original';
  } catch {
    return 'original';
  }
}
const view = ref(loadView());
watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* 저장 불가 환경 */
  }
});

const tab = (active) =>
  [
    'rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition',
    active
      ? 'bg-cyan-600 text-white ring-cyan-600'
      : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 ring-stone-200 dark:ring-stone-700 hover:ring-cyan-400',
  ].join(' ');
</script>

<template>
  <div>
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pt-4">
      <button type="button" :class="tab(view === 'original')" @click="view = 'original'">원본 시뮬레이터 (어시스트 포함)</button>
      <button type="button" :class="tab(view === 'manual')" @click="view = 'manual'">간단 추천</button>
      <span class="ml-auto text-[11px] text-stone-500 dark:text-stone-400">
        원작:
        <a :href="REPO_URL" target="_blank" rel="noopener" class="underline hover:text-cyan-600">alfm201/adventure</a>
        (허락받아 사용)
        <template v-if="view === 'original'">
          ·
          <a :href="SOURCE_URL" target="_blank" rel="noopener" class="underline hover:text-cyan-600">새 창에서 열기</a>
        </template>
      </span>
    </div>

    <div v-if="view === 'original'" class="mx-auto max-w-6xl px-4 py-3">
      <!-- 원본은 1234×694 비율로 창에 맞춰 스스로 축소한다 — 같은 비율의 상자를 주고, 화면 높이를 넘지 않게 제한 -->
      <div
        class="relative mx-auto w-full overflow-hidden rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-black"
        style="aspect-ratio: 1234 / 694; max-width: calc((100vh - 170px) * 1234 / 694)"
      >
        <iframe
          :src="SOURCE_URL"
          title="어드벤처 시뮬레이터 (alfm201)"
          class="absolute inset-0 h-full w-full border-0"
          allow="display-capture; autoplay; fullscreen; clipboard-write"
          referrerpolicy="no-referrer"
        />
      </div>
      <p class="mt-2 text-center text-[11px] text-stone-500 dark:text-stone-400">
        어시스트 화면 공유가 안 되면 "새 창에서 열기"로 쓰세요. 코드와 모델 모두 우리 서버에서 받습니다.
      </p>
    </div>

    <AdventureAiManual v-else />
  </div>
</template>
