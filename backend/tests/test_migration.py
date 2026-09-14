"""db._add_missing_columns — memorials/runeword 컬럼이 없던 옛 스키마를 init_db() 가 보강하는지."""

from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from app import db as app_db
from app.main import app

from .conftest import auth_headers, register, sample_character

# memorials / runeword 컬럼이 추가되기 전 시점의 characters 테이블 DDL.
_OLD_USERS = """
CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY,
    nickname VARCHAR(20) NOT NULL,
    pw_hash VARCHAR(72) NOT NULL,
    recovery_hash VARCHAR(72),
    created_at DATETIME
)
"""
_OLD_CHARACTERS = """
CREATE TABLE characters (
    id INTEGER NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(40) NOT NULL,
    type VARCHAR(1) NOT NULL,
    stats JSON NOT NULL,
    awak_stones JSON NOT NULL,
    updated_at DATETIME,
    CONSTRAINT uq_user_character_name UNIQUE (user_id, name)
)
"""


def _create_old_schema(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(_OLD_USERS))
        conn.execute(text(_OLD_CHARACTERS))
        conn.execute(text("CREATE UNIQUE INDEX ix_users_nickname ON users (nickname)"))


def _columns(engine, table: str) -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns(table)}


def test_init_db_adds_missing_json_columns(engine):
    _create_old_schema(engine)
    with engine.begin() as conn:
        # 옛 스키마에 이미 저장돼 있던 행 — 보강 후 DEFAULT '[]' 가 채워져야 한다.
        conn.execute(text("INSERT INTO users (id, nickname, pw_hash) VALUES (1, 'legacy', 'x')"))
        conn.execute(
            text(
                "INSERT INTO characters (id, user_id, name, type, stats, awak_stones, updated_at) "
                "VALUES (1, 1, '옛캐릭', 'P', '{}', '[]', '2025-01-01 00:00:00')"
            )
        )
    assert _columns(engine, "characters").isdisjoint({"memorials", "runeword"})

    app_db.init_db()

    cols = _columns(engine, "characters")
    assert {"memorials", "runeword"} <= cols
    with engine.connect() as conn:
        row = conn.execute(text("SELECT memorials, runeword FROM characters WHERE id = 1")).one()
    assert tuple(row) == ("[]", "[]")

    # 두 번 실행해도 (idempotent) 에러 없음
    app_db.init_db()
    assert _columns(engine, "characters") == cols


def test_app_works_after_migration(engine):
    _create_old_schema(engine)

    with TestClient(app) as client:  # lifespan → init_db → 컬럼 보강
        headers = auth_headers(register(client)["token"])
        res = client.post("/characters", json=sample_character(), headers=headers)
        assert res.status_code == 201, res.text
        assert res.json()["memorials"] == sample_character()["memorials"]
        assert res.json()["runeword"] == sample_character()["runeword"]
