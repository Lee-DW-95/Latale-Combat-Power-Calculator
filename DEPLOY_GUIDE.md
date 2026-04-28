# 🚀 라테일 전투력 시뮬레이터 — 배포 가이드 (GitHub + Vercel)

> 이 문서는 집 노트북에서 압축 푼 직후, 사이트를 인터넷에 정식 배포하기 위한 가이드입니다.
> Claude/ChatGPT 같은 AI에 막힌 부분을 그대로 복사해서 물어볼 수 있도록 단계마다 컨텍스트가 명시되어 있습니다.

---

## 📦 프로젝트 컨텍스트 (AI에게 물어볼 때 그대로 복붙)

```
프로젝트: 라테일 전투력 비교 시뮬레이터 (Phase 1 MVP)
기술 스택: Vue 3 (Composition API) + Vite + Tailwind CSS + LocalStorage
백엔드: 없음 (정적 사이트, SPA)
빌드 결과: dist/ 폴더 (HTML + JS + CSS)
번들 크기: JS 95KB / gzip 36KB
공식 정확도: 물리 직업 RMSE 0.26% (V_BIG 모델, 30건 학습)
빌드 명령: npm run build
개발 명령: npm run dev (포트 5173)
테스트 명령: npm test (학습 데이터 회귀)
주요 파일: src/utils/battlePower.js (핵심 계산), SAMPLE_DATA.json (학습 데이터)
```

---

## 🎯 목표

`https://latale-battle-power.vercel.app` 같은 무료 도메인으로 **인터넷 어디서든 접속 가능한 사이트**를 운영한다.

**완료 후 워크플로우**:
```
코드 수정 → git push → 1~2분 후 자동 라이브 갱신
```

---

## 📋 사전 준비 체크리스트

### 1) 집 노트북에 설치할 것

| 도구 | 다운로드 | 검증 명령 |
|---|---|---|
| **Node.js (LTS)** | https://nodejs.org/ko/ | `node --version` → v18+ |
| **Git** | https://git-scm.com/download/win | `git --version` |
| **VS Code (선택)** | https://code.visualstudio.com/ | 코드 편집기 |

### 2) 가입할 계정 (브라우저)

| 서비스 | 가입 URL | 소요 시간 |
|---|---|---|
| **GitHub** | https://github.com/signup | 2분 |
| **Vercel** | https://vercel.com/signup | 1분 (GitHub 계정으로 가입 가능) |

> 💡 Vercel은 GitHub 계정으로 가입하면 자동 연동됨 (권장)

---

## 🛠 단계별 가이드

### STEP 1 — 프로젝트 압축 풀고 동작 확인

**1.1** zip 파일 압축 풀기
- 추천 위치: `C:\Dev\latale-battle-power` (한글 경로 피하기)

**1.2** 의존성 설치 + 동작 확인 (PowerShell 또는 명령 프롬프트)

```powershell
cd C:\Dev\latale-battle-power
npm install
npm test
# → "물리(P) 30건 RMSE=0.257% PASS=30" 나오면 정상
npm run dev
# → 브라우저에서 http://localhost:5173 자동 열림
```

**1.3** 화면 정상 동작 확인 후 Ctrl+C로 dev 서버 중단

---

### STEP 2 — GitHub 저장소 만들기

**2.1** 브라우저에서 https://github.com/new 접속

**2.2** 입력 항목:
- **Repository name**: `latale-battle-power`
- **Description** (선택): `라테일 전투력 비교 시뮬레이터 (Phase 1 MVP)`
- **Public** vs **Private**:
  - Public: 누구나 코드 볼 수 있음, 별 받기 가능, AdSense 심사 유리
  - Private: 코드 비공개, 본인만 접근 가능 (Vercel 연동 무료로 OK)
  - **추천**: 처음엔 Private, 나중에 Public 전환 가능
- **Initialize this repository with**: 모두 체크 해제 (이미 코드 있음)
- **Create repository** 클릭

**2.3** 생성된 저장소 페이지의 URL 복사 (예: `https://github.com/내아이디/latale-battle-power.git`)

---

### STEP 3 — 로컬 코드를 GitHub에 push

PowerShell에서 (프로젝트 폴더에서):

```powershell
# 처음 한 번만 — git 사용자 정보 설정 (이미 했다면 건너뜀)
git config --global user.name "본인이름"
git config --global user.email "본인이메일@example.com"

# 1. git 저장소 초기화
git init

# 2. 모든 파일 스테이징
git add .

# 3. 첫 커밋
git commit -m "Initial commit: Phase 1 MVP"

# 4. 기본 브랜치 이름을 main으로
git branch -M main

# 5. GitHub 저장소를 원격으로 추가 (URL은 본인 것으로 교체)
git remote add origin https://github.com/내아이디/latale-battle-power.git

# 6. push
git push -u origin main
```

**예상 결과**: 인증 창 뜨면 GitHub 계정으로 로그인 (브라우저 또는 Personal Access Token).

> ⚠️ HTTPS push 인증이 안 되면: GitHub → Settings → Developer settings → Personal access tokens (classic) → Generate new token (repo 권한 체크) → 비밀번호 자리에 토큰 붙여넣기

**검증**: 브라우저에서 GitHub 저장소 새로고침 → 모든 파일 목록 보이면 성공 ✅

---

### STEP 4 — Vercel에 연결하고 배포

**4.1** https://vercel.com/new 접속 (GitHub 계정으로 로그인)

**4.2** "Import Git Repository" 섹션에서 `latale-battle-power` 찾아 **Import** 클릭
- 처음이라면 "Install GitHub App" 단계 → 권한 부여 → All repositories 또는 해당 저장소만 선택

**4.3** 프로젝트 설정 화면:
- **Framework Preset**: `Vite` 자동 감지됨 ✅
- **Build Command**: `npm run build` (자동)
- **Output Directory**: `dist` (자동)
- **Install Command**: `npm install` (자동)
- **Environment Variables**: 없음 (Phase 1은 백엔드 없음)
- **Deploy** 클릭

**4.4** 1~2분 대기 → 빌드 로그 확인 → 🎉 배포 완료
- 자동 도메인: `https://latale-battle-power.vercel.app`
- 또는: `https://latale-battle-power-내아이디.vercel.app`

---

### STEP 5 — 동작 검증

배포된 URL에 접속해서 확인:

- [ ] 페이지가 정상적으로 보임 (베타 안내 배너, 입력 폼)
- [ ] 직업 타입 토글 동작 (물리 ↔ 마법)
- [ ] 스탯 입력 시 전투력 자동 계산
- [ ] 장비 비교 결과 표시
- [ ] 다크 모드 토글
- [ ] 캐릭터 저장/불러오기 (LocalStorage)
- [ ] 모바일 화면 (브라우저 개발자 도구 디바이스 모드)

---

## 🔄 STEP 6 — 이후 워크플로우 (코드 수정 → 자동 배포)

```powershell
# 코드 수정 후
git add .
git commit -m "수정 내용 (예: 새 학습 데이터 추가)"
git push
# → Vercel이 자동 감지 → 빌드 → 배포 (1~2분)
```

**Vercel 대시보드에서 확인**:
- https://vercel.com/dashboard → 프로젝트 클릭 → "Deployments" 탭
- 빌드 진행 상황 + 배포 결과 + 이전 버전 롤백 가능

---

## 🚦 트러블슈팅 (Claude/ChatGPT에 그대로 복붙)

### ❌ `git push` 시 인증 오류

**증상**: `remote: Support for password authentication was removed`

**해결**:
1. GitHub → 우측 상단 프로필 → Settings
2. 좌측 맨 아래 **Developer settings**
3. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
4. Note: `latale-battle-power-deploy` / Expiration: 90 days / Scopes: **repo** 체크
5. 생성된 토큰 복사
6. `git push` 시 비밀번호 자리에 토큰 붙여넣기
   - Windows: 자격증명 관리자에 자동 저장됨

### ❌ Vercel 빌드 실패

**Build Failed**: 로그 확인하고 Claude에 다음과 같이 복붙:

```
Vercel 빌드 실패. 프로젝트는 Vue 3 + Vite + Tailwind CSS.
다음은 빌드 로그:

[여기에 Vercel "Deployments" → 실패한 빌드 클릭 → "Building" 로그 복붙]

원인과 해결 방법 알려줘.
```

### ❌ 화면이 흰색 (배포는 됐는데)

**증상**: 사이트 접속하면 빈 화면, F12 콘솔에 에러

**가능한 원인**:
1. `vite.config.js`의 `base` 옵션 잘못 설정 (Vercel은 기본 `/` 사용 → 변경하지 말 것)
2. 환경변수 미설정 (현재 프로젝트는 환경변수 없음)
3. SPA 라우팅 문제 (현재 프로젝트는 단일 페이지라 해당 없음)

**해결**: F12 → Console 탭의 에러 메시지를 Claude에 복붙

### ❌ npm install 시 에러

```powershell
# Node.js 버전 확인
node --version  # v18+ 권장

# 캐시 정리 후 재시도
npm cache clean --force
rm -rf node_modules package-lock.json   # PowerShell: Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

---

## 🌐 다음 단계 (선택사항)

### 1) 커스텀 도메인 연결

| 등록처 | 추천 도메인 | 가격 |
|---|---|---|
| Cloudflare Domains | `.com` | $10/년 (가장 저렴) |
| 가비아 | `.kr` / `.co.kr` | ₩22,000/년 |
| Namecheap | `.com` / `.app` | $10~14/년 |

도메인 구매 후 Vercel: Project → Settings → Domains → Add → 안내대로 DNS 레코드 등록 (5분).

### 2) 익명 데이터 수집 (Phase 2 활성화)

`PROJECT_BRIEF.md`의 Phase 2 참고:
- Google Apps Script + Google Sheets로 백엔드 없이 데이터 수집
- `App.vue`에서 "익명 데이터 기여" 체크박스 활성화 (현재 비활성)

### 3) Google AdSense (광고)

- 사이트 라이브 후 1~4주 정도 운영 (트래픽 + 콘텐츠 쌓기)
- AdSense 신청 → 심사
- 콘텐츠 보강 권장: 라테일 가이드/패치노트/공략 페이지 추가
- 게임 도박/현질 광고는 차단 설정

### 4) SEO 최적화

`index.html`의 meta 태그 보강:
```html
<meta name="description" content="라테일 전투력 비교 시뮬레이터 - 장비 교체 시 전투력 변화를 미리 확인" />
<meta property="og:title" content="라테일 전투력 시뮬레이터" />
<meta property="og:description" content="..." />
<meta property="og:image" content="https://yourdomain.com/og-image.png" />
```

Google Search Console 등록도 추천.

---

## 📎 참고 링크

- Vercel 공식 문서 (Vite): https://vercel.com/docs/frameworks/vite
- GitHub 첫 push 가이드: https://docs.github.com/ko/get-started/quickstart/create-a-repo
- Vue 3 공식: https://ko.vuejs.org/
- Vite 공식: https://ko.vitejs.dev/

---

## ✅ 체크리스트 (완료 시 체크)

- [ ] Node.js, Git, VS Code 설치
- [ ] GitHub 가입 + 저장소 생성
- [ ] 로컬 → GitHub push 성공
- [ ] Vercel 가입 + 프로젝트 import
- [ ] Vercel 빌드 + 배포 성공
- [ ] 라이브 사이트 동작 확인 (PC + 모바일)
- [ ] 첫 수정 후 `git push` → 자동 배포 검증

---

## 💬 막혔을 때 Claude/ChatGPT에 물어보기

이 가이드의 어떤 단계든 막히면 다음 형식으로 질문하세요:

```
라테일 전투력 시뮬레이터 (Vue 3 + Vite + Tailwind CSS) 배포 중인데 막혔어.

지금 STEP [번호] 진행 중.
실행한 명령: [복사]
나온 에러/결과:
[복사]

해결 방법 알려줘.
```

이 컨텍스트만 있으면 AI가 정확한 답을 줍니다.
