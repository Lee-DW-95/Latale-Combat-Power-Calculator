# Latale Calculator — Backend API

라테일 전투력 계산기의 캐릭터 정보 / 각성석 옵션 저장용 FastAPI 백엔드.

- **스택**: FastAPI + SQLite (WAL) + SQLAlchemy + bcrypt + JWT
- **호스팅**: Oracle Cloud ARM VM (Always Free) + Caddy + DuckDNS
- **프론트**: `https://latale-calculator.vercel.app` (별도 Vue 프로젝트 — 같은 레포 루트)

## 디렉토리

```
backend/
├── app/
│   ├── main.py              FastAPI 진입점, CORS, 라우터 마운트
│   ├── config.py            환경변수 (.env)
│   ├── db.py                SQLAlchemy 엔진/세션
│   ├── models.py            User / Character ORM
│   ├── schemas.py           Pydantic 요청·응답 스키마
│   ├── auth.py              bcrypt / JWT / 복구코드 유틸
│   ├── deps.py              FastAPI 의존성 (DB, 현재 유저)
│   └── routers/
│       ├── auth.py          /auth/register, /auth/login, /auth/recover
│       └── characters.py    /characters CRUD
├── tests/                   pytest 스모크 테스트 (임시 SQLite 로 격리)
├── requirements.txt
├── requirements-dev.txt     pytest / httpx
├── .env.example
└── README.md
```

## 로컬 실행 (Windows)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# .env 의 JWT_SECRET 을 임의 긴 문자열로 교체
uvicorn app.main:app --reload --port 8000
```

`http://localhost:8000/docs` 에서 Swagger UI 확인.

## 로컬 실행 (Linux / Oracle VM)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env 편집
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

운영 환경에선 `systemd` 단위로 등록 (Phase 3 — 별도 가이드).

## 테스트

```bash
pip install -r requirements-dev.txt
python -m pytest tests -q        # backend/ 에서 실행. 테스트마다 tmp 임시 SQLite 파일을 쓰므로 latale.db 는 건드리지 않음
```

`main` 에 push / PR 시 `.github/workflows/backend.yml` 이 같은 테스트를 자동 실행한다.

## 엔드포인트 요약

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | /auth/register | ❌ | 회원가입 → `{token, recovery_code}` (복구코드 1회 표시) |
| POST | /auth/login | ❌ | 로그인 → `{token}` |
| POST | /auth/recover | ❌ | 복구코드로 비번 재설정 → `{token}` |
| GET | /characters | ✅ | 본인 캐릭터 목록 |
| POST | /characters | ✅ | 캐릭터 생성 |
| PUT | /characters/{id} | ✅ | 캐릭터 갱신 (stats + awak_stones + memorials + runeword). 선택 필드 `expected_updated_at` 을 보내면 서버 `updated_at` 과 다를 때 409 (`detail.character` 에 서버 현재본) |
| DELETE | /characters/{id} | ✅ | 삭제 |

인증은 `Authorization: Bearer <token>` 헤더.

## DB 백업

```bash
sqlite3 latale.db ".backup latale-$(date +%Y%m%d).db"
```

운영 환경에선 cron 으로 매일 자동 백업 (Phase 5).
