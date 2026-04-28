# 🎮 Claude Code 시작 프롬프트

> 이 파일은 Claude Code에 처음 던질 메시지입니다.
> 아래 "복사할 프롬프트" 섹션 전체를 그대로 복사해서 Claude Code 첫 메시지로 입력하세요.

---

## 📋 복사할 프롬프트 (아래 전체)

```
안녕! 이 폴더에 라테일 전투력 비교 시뮬레이터 프로젝트를 만들 거야.

먼저 다음 파일들을 순서대로 읽고 전체 맥락을 파악해줘:

1. PROJECT_BRIEF.md - 프로젝트 개요와 요구사항
2. FORMULA_RESEARCH.md - 도출된 전투력 공식과 분석 내용
3. battlePower.js - 바로 사용 가능한 공식 구현 코드
4. SAMPLE_DATA.json - 검증용 15개 샘플 데이터

읽은 후에는:
1. 이해한 내용을 1-2문단으로 요약해줘 (어떤 프로젝트인지, 핵심 공식이 무엇인지)
2. PROJECT_BRIEF.md의 "Phase 1 MVP 기능 명세"를 기반으로 Vue 3 + Vite + 
   Tailwind CSS 프로젝트를 생성해줘
3. battlePower.js를 src/utils/battlePower.js로 그대로 이식하고
4. SAMPLE_DATA.json으로 공식 정확도 검증 테스트를 먼저 작성해서 
   "공식이 제대로 동작하는지" 확인한 후
5. 본격적으로 UI 컴포넌트 작업 시작

작업 중 막히는 부분이나 결정이 필요한 부분이 있으면 진행 전에 물어봐줘.
한국어로 응답하고, UI 텍스트도 모두 한국어로 작성해.
```

---

## 🎯 이후 작업 흐름 (참고용)

Claude Code가 위 프롬프트를 받으면 다음 순서로 진행할 거예요:

### Step 1: 컨텍스트 파악
- 4개 파일 읽기
- 요약 출력
- 의문점이 있으면 질문

### Step 2: 프로젝트 셋업
```bash
npm create vue@latest .
# 옵션 선택: Vue 3, JavaScript (또는 TypeScript), Pinia, Router (선택)
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Step 3: 핵심 로직 이식 + 검증
- `src/utils/battlePower.js` 생성 (이 패키지의 battlePower.js 사용)
- 간단한 테스트 코드로 SAMPLE_DATA.json 15개 모두 정확도 확인
- 정확도가 검증되면 다음 단계로

### Step 4: UI 컴포넌트 작성
- StatInputForm: T창 정보 입력
- EquipmentCompare: 현재/비교 장비 옵션 입력
- ResultDisplay: 전투력 변화 결과 출력
- CharacterStorage: LocalStorage로 캐릭터 저장/불러오기

### Step 5: 부가 기능
- 다크모드
- 모바일 반응형
- 비교 히스토리
- 익명 데이터 기여 (선택)

### Step 6: 배포
- Vercel 또는 Netlify 무료 배포

---

## 💡 추가 데이터로 공식 보완하는 법

집에서 T창 데이터를 더 모으셨다면, Claude Code에게 이렇게 말하세요:

```
SAMPLE_DATA.json에 새로운 데이터를 추가했어 (또는 NEW_DATA.json 별도 파일).
FORMULA_RESEARCH.md의 "공식 재학습 방법" 섹션을 참고해서 
파라미터를 다시 최적화하고 battlePower.js를 업데이트해줘.
```

Claude Code가 Python 스크립트(`scripts/refit_formula.py`도 포함되어 있음)를 
실행해서 자동으로 공식을 보정해줄 거예요.

---

## ⚠️ 알려진 한계 (꼭 인지!)

- **물리 직업**: 정확도 약 95~98% (12개 데이터로 검증)
- **마법 직업**: 정확도 약 85~95% (3개 데이터, 추가 수집 필요)
- **일몬추/보몬추/관통**: 데이터 부족으로 효과 추정 불가, 변경 시 정확한 비교 어려움
- **베타 단계**임을 사용자에게 명시할 것
