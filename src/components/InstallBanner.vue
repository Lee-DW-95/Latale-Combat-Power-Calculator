<script setup>
// PWA 설치 유도 배너 — 설치 가능한 환경에서만 보인다.
//   · 이미 설치된 상태(standalone)·Tauri 데스크탑에선 렌더하지 않는다
//   · Android/Chrome 계열: beforeinstallprompt 를 잡아 뒀다가 버튼 한 번으로 설치
//   · iOS Safari: 설치 이벤트가 없어 "공유 → 홈 화면에 추가" 안내로 대체
//   · 닫으면 localStorage 에 기억해 다시 보이지 않는다
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const DISMISS_KEY = 'latale.installBanner.dismissed';

const hasWindow = typeof window !== 'undefined';

// 이미 앱으로 실행 중인가 — 브라우저 표시모드 standalone 또는 iOS 홈 화면 실행
const isStandalone =
  hasWindow &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

const isTauriApp =
  hasWindow &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || window.location.protocol === 'tauri:');

// iPadOS 는 UA 가 Mac 으로 나와서 터치 지점 수로 구분한다
const isIos =
  hasWindow &&
  (/iPhone|iPad|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1));

const dismissed = ref(false);
try {
  dismissed.value = localStorage.getItem(DISMISS_KEY) === '1';
} catch {
  /* localStorage 불가 — 매번 노출 허용 */
}

// Android/Chrome 의 설치 프롬프트 이벤트 (지원 브라우저에서만 발생)
const deferredPrompt = ref(null);
function onBeforeInstall(e) {
  e.preventDefault(); // 브라우저 기본 미니 배너 대신 우리 배너로
  deferredPrompt.value = e;
}
function onInstalled() {
  deferredPrompt.value = null;
  dismiss();
}
onMounted(() => {
  if (!hasWindow) return;
  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onInstalled);
});
onBeforeUnmount(() => {
  if (!hasWindow) return;
  window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  window.removeEventListener('appinstalled', onInstalled);
});

// iOS 는 안내만 가능하므로 항상 후보, 그 외엔 설치 이벤트가 온 경우만
const show = computed(
  () => !dismissed.value && !isStandalone && !isTauriApp && (isIos || deferredPrompt.value),
);

async function install() {
  const p = deferredPrompt.value;
  if (!p) return;
  deferredPrompt.value = null;
  p.prompt();
  const choice = await p.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') dismiss();
}

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* 저장 실패 — 이번 세션만 숨김 */
  }
}
</script>

<template>
  <div
    v-if="show"
    class="rounded-xl ring-1 ring-cyan-200 dark:ring-cyan-800 bg-cyan-50/70 dark:bg-cyan-950/30 px-4 py-3 flex items-center gap-3 flex-wrap"
  >
    <span class="text-2xl select-none" aria-hidden="true">📲</span>
    <div class="flex-1 min-w-[200px]">
      <p class="text-sm font-semibold text-cyan-900 dark:text-cyan-100">앱으로 설치할 수 있어요</p>
      <p class="text-xs text-cyan-800/80 dark:text-cyan-200/80 leading-relaxed">
        <template v-if="deferredPrompt">홈 화면에 추가하면 전체화면 앱으로 열리고, 오프라인에서도 계산할 수 있습니다.</template>
        <template v-else>
          Safari 하단의 <strong>공유 버튼 <span aria-hidden="true">⎋</span></strong> →
          <strong>"홈 화면에 추가"</strong>를 누르면 앱으로 설치됩니다.
        </template>
      </p>
    </div>
    <div class="flex items-center gap-2 ml-auto">
      <button
        v-if="deferredPrompt"
        type="button"
        @click="install"
        class="h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold shadow-sm transition"
      >
        앱 설치
      </button>
      <button
        type="button"
        @click="dismiss"
        class="h-10 px-3 rounded-lg text-sm text-stone-500 dark:text-stone-400 hover:bg-white/60 dark:hover:bg-stone-800/60 transition"
        aria-label="설치 안내 닫기"
      >
        닫기
      </button>
    </div>
  </div>
</template>
