# 🎮 라테일 전투력 비교 시뮬레이터

라테일(LaTale) 게임에서 장비 교체 시 전투력 변화를 미리 시뮬레이션하는 웹 도구.

## 📁 패키지 구성 (인수인계 자료)

이 폴더는 Claude Code 등으로 본격 개발하기 전의 **인수인계 자료**입니다.
실제 Vue 프로젝트는 Claude Code가 이 자료를 읽고 새로 생성합니다.

```
latale-battle-power/
├── README.md                  ← 이 파일
├── CLAUDE_CODE_PROMPT.md      ← Claude Code 첫 메시지로 던질 프롬프트
├── PROJECT_BRIEF.md           ← 프로젝트 요구사항/기능명세
├── FORMULA_RESEARCH.md        ← 전투력 공식 연구 보고서
├── battlePower.js             ← 핵심 공식 구현 (Vue 프로젝트로 그대로 이식)
├── SAMPLE_DATA.json           ← 검증용 15개 샘플 데이터
└── refit_formula.py           ← 데이터 추가 시 공식 재학습 스크립트 (Python)
```

## 🚀 시작 방법

### 1단계: Claude Code 실행

이 폴더에서 Claude Code를 실행:
```bash
cd latale-battle-power
claude
```

### 2단계: 첫 프롬프트 입력

`CLAUDE_CODE_PROMPT.md` 파일을 열고, 안의 "복사할 프롬프트" 섹션을
그대로 복사해서 Claude Code에 붙여넣기.

### 3단계: 진행

Claude Code가 4개 문서를 읽고 Vue 3 + Vite + Tailwind CSS 프로젝트를
생성한 뒤 컴포넌트들을 작성합니다. 진행 중 결정이 필요한 부분은
Claude Code가 물어봅니다.

## 📊 현재 공식 정확도

물리 직업 12개 데이터 기준:
- **RMSE: 1.18%**
- 모든 케이스 오차 2.5% 이내
- 베타 단계 명시 필요

자세한 내용은 `FORMULA_RESEARCH.md` 참고.

## 🔄 공식 보완 방법

집에서 T창 데이터를 더 모으면:

1. `SAMPLE_DATA.json`에 새 객체 추가 (`FORMULA_RESEARCH.md` 양식 참고)
2. Python 환경에서 `refit_formula.py` 실행:
   ```bash
   pip install numpy scipy
   python refit_formula.py
   ```
3. 출력된 새 파라미터를 `src/utils/battlePower.js`의 `PHYSICAL_PARAMS`에 복사
4. 검증 테스트로 정확도 확인

또는 Claude Code에 "데이터 추가했으니 공식 재학습해줘"라고 말하면 자동으로 처리.

## ⚠️ 알려진 한계

1. 마법 직업 데이터 부족 (3개) → 별도 공식 학습 어려움
2. 일몬추/보몬추/관통의 정확한 가중치 미확인
3. 단일 변수 통제 데이터 부재

→ Phase 2에서 사용자 데이터 익명 수집으로 점진적 개선 예정

## 💼 부업 운영 메모

- Phase 1 (지금): Vue + LocalStorage만으로 무료 호스팅 (Vercel/Netlify)
- Phase 2: Google Apps Script + 구글시트로 백엔드 없이 데이터 수집
- Phase 3: 광고 부착 (Google AdSense)
- 게임 도박/현질 광고는 피할 것

## 🛠 기술 스택

- Vue 3 + Composition API
- Vite
- Tailwind CSS
- LocalStorage (Phase 1)
- 무료 호스팅 (Vercel 또는 Netlify)
