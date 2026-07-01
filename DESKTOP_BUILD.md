# 데스크탑 앱 (Tauri) 빌드 가이드

웹 버전(Vue SPA)을 그대로 감싼 Windows 데스크탑 앱. 백엔드는 웹과 동일하게
Oracle Cloud의 FastAPI(`https://latale-api.duckdns.org`)를 사용하므로
계정/데이터가 웹 버전과 공유된다.

## 🔄 화면 로딩 방식 — 원격 URL (v0.2.0~)

`tauri.conf.json` 의 윈도우 `url` 을 Vercel 배포본
(`https://latale-calculator.vercel.app`)으로 지정한다. 즉 exe 는 프론트엔드를
**내장하지 않고** 배포된 웹사이트를 실시간으로 띄우는 웹뷰 셸이다.

- **장점**: 코드 수정 → `git push` → Vercel 자동 재배포 → 설치된 모든 앱이
  **재실행 시 최신 UI 자동 반영**. 재빌드·재설치 불필요.
- **전제**: 온라인 전용. 인터넷이 없으면 화면이 뜨지 않는다(원래 로그인·저장이
  원격 백엔드 의존이라 실질 제약 없음).
- **주의**: 이 방식으로 **처음 전환할 때는** 기존 사용자에게 새 exe 를 한 번
  재설치시켜야 한다(기존 exe 는 여전히 구 UI 가 박제된 상태). 그 1회 이후로는 자동.
- 오프라인/내장 방식으로 되돌리려면 윈도우 `url` 을 제거(기본값 `index.html`)한다.

## 구성

| 항목 | 내용 |
|---|---|
| 셸 | Tauri 2 (WebView2 기반, Windows 10/11 기본 내장) |
| 프론트 빌드 | `npm run build:desktop` → `vite build --mode desktop` |
| API 주소 | `.env.desktop` 의 `VITE_API_BASE` (웹/Vercel 빌드에는 영향 없음) |
| 설치 파일 | NSIS 설치형 (`src-tauri/target/release/bundle/nsis/*-setup.exe`) |

## 빌드 환경 (최초 1회)

1. Rust (MSVC): `winget install Rustlang.Rustup` 후 `rustup default stable-msvc`
2. VS Build Tools 2022 + "C++를 사용한 데스크톱 개발" 워크로드
3. `npm install`

## 빌드

```bash
npm run tauri build
```

산출물: `src-tauri/target/release/bundle/nsis/LaTale Battle Power_<버전>_x64-setup.exe`

개발 모드(핫리로드): `npm run tauri dev` — 이때 API는 `http://localhost:8000` (기본값).

## 버전 올리기

`src-tauri/tauri.conf.json` 의 `version` 수정 후 다시 빌드.
(`package.json` 버전과 별개로 관리됨 — 맞춰주는 것을 권장.)

## ⚠️ 서버 CORS 설정 (필수, 최초 1회)

데스크탑 앱은 `http://tauri.localhost` 오리진에서 API를 호출한다.
Oracle Cloud 서버의 백엔드 환경변수 `CORS_ORIGINS` 에 아래 오리진을 추가해야 한다:

```
CORS_ORIGINS=https://latale-calculator.vercel.app,http://localhost:5173,http://tauri.localhost,https://tauri.localhost
```

수정 후 백엔드 서비스 재시작 (`sudo systemctl restart latale-api` 등 배포 방식에 따라).
이 설정 전까지 데스크탑 앱에서 로그인/저장 등 API 호출이 CORS 오류로 실패한다.

## 앱 아이콘 변경

`src-tauri/app-icon.svg` 수정 후:

```bash
npx tauri icon src-tauri/app-icon.svg
```
