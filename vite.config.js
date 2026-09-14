import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// PWA 설정 — 앱 셸(정적 자산)만 오프라인 캐시하고 API 는 네트워크 전용.
// 새 버전이 배포되면 서비스워커가 자동 갱신된다(registerType: autoUpdate).
const pwa = VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: '라테일 유틸리티',
    short_name: '라테일 유틸',
    description: '라테일(LaTale) 전투력 비교·장비 시뮬레이션 도구',
    lang: 'ko',
    start_url: '/',
    display: 'standalone',
    theme_color: '#0891b2', // cyan-600 — 프로젝트 주색
    background_color: '#ffffff',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // 빌드 산출물(앱 셸)만 프리캐시
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
    // 백엔드 API(운영 duckdns · 로컬 8000)는 절대 캐시하지 않는다
    runtimeCaching: [
      {
        urlPattern: ({ url }) =>
          url.origin === 'https://latale-api.duckdns.org' || url.host === 'localhost:8000',
        handler: 'NetworkOnly',
      },
    ],
  },
});

export default defineConfig(({ mode }) => ({
  // 데스크탑(Tauri) 빌드에서는 웹뷰에 서비스워커가 끼지 않도록 PWA 플러그인을 뺀다
  plugins: [vue(), ...(mode === 'desktop' ? [] : [pwa])],
  server: {
    port: 5173,
    open: true,
  },
}));
