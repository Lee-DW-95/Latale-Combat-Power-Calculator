"""pytest 공통 픽스처.

app.db 는 import 시점에 settings 의 DATABASE_URL 로 엔진을 만들므로, 실제 latale.db 를
건드리지 않도록 app 을 import 하기 전에 환경변수를 덮어쓴다. 실제 테스트 DB 는 테스트마다
tmp_path 의 임시 SQLite 파일로 configure_engine() 을 통해 교체한다.
"""

import os

# 반드시 app 패키지 import 보다 먼저 — .env 보다 환경변수가 우선한다.
os.environ["DATABASE_URL"] = "sqlite://"  # import 시점 placeholder (메모리, 실제로 안 씀)
os.environ["JWT_SECRET"] = "test-secret-not-for-production"
os.environ["BCRYPT_ROUNDS"] = "4"  # bcrypt 최소값 — 해시 비용을 줄여 테스트 속도 확보

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db as app_db  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limit import limiter  # noqa: E402

# slowapi 는 프로세스 내 메모리 저장소를 쓰므로 테스트를 여러 번 돌면 5/minute 에 걸린다 — 테스트에선 끈다.
limiter.enabled = False


@pytest.fixture
def db_url(tmp_path) -> str:
    return f"sqlite:///{(tmp_path / 'test.db').as_posix()}"


@pytest.fixture
def engine(db_url):
    # 테이블은 만들지 않은 빈 엔진 — 마이그레이션 테스트처럼 옛 스키마를 직접 깔 때 사용.
    eng = app_db.configure_engine(db_url)
    yield eng
    eng.dispose()


@pytest.fixture
def client(engine):
    # TestClient 를 context manager 로 열면 lifespan(init_db) 이 실행되어 테이블이 생긴다.
    with TestClient(app) as c:
        yield c


# ─────────────────── 헬퍼 ───────────────────

def register(client: TestClient, nickname: str = "tester", password: str = "password123") -> dict:
    res = client.post("/auth/register", json={"nickname": nickname, "password": password})
    assert res.status_code == 201, res.text
    return res.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def sample_character(name: str = "테스트캐릭") -> dict:
    return {
        "name": name,
        "type": "P",
        "stats": {"주스탯": 12345, "공격력": 6789, "크댐": 150.5, "기본_주스탯": 1000},
        "awak_stones": [
            {"options": [{"stat": "주스탯", "unit": "%", "value": 10}, {"stat": "크댐", "unit": "%", "value": 3}]}
        ],
        "memorials": [{"key": "CHOENPAM_SET", "lines": [{"label": "주스탯", "value": 100}]}],
        "runeword": [10, 19, None, None, None, None, None, 28],
    }
