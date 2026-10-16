"""/auth/me — 제한 탭 권한(users.privileged)을 DB UPDATE 만으로 바로 반영하는지."""

from sqlalchemy import inspect, text

from app import db as app_db

from .conftest import auth_headers, register


def test_me_reflects_db_update_without_restart(client, engine):
    headers = auth_headers(register(client, "권한테스트")["token"])

    res = client.get("/auth/me", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json() == {"nickname": "권한테스트", "privileged": False, "admin": False}

    # 운영에서 sqlite3 로 직접 UPDATE 하는 상황 — 서버 재시작 없이 다음 호출에 반영.
    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET privileged = 1 WHERE nickname = '권한테스트'"))
    assert client.get("/auth/me", headers=headers).json()["privileged"] is True

    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET admin = 1 WHERE nickname = '권한테스트'"))
    assert client.get("/auth/me", headers=headers).json()["admin"] is True


def test_me_requires_token(client):
    assert client.get("/auth/me").status_code == 401


def test_init_db_adds_privileged_column(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users (id INTEGER NOT NULL PRIMARY KEY, nickname VARCHAR(20) NOT NULL, "
                "pw_hash VARCHAR(72) NOT NULL, recovery_hash VARCHAR(72), created_at DATETIME)"
            )
        )
        conn.execute(text("INSERT INTO users (id, nickname, pw_hash) VALUES (1, 'legacy', 'x')"))

    app_db.init_db()

    assert {"privileged", "admin"} <= {c["name"] for c in inspect(engine).get_columns("users")}
    with engine.connect() as conn:
        assert conn.execute(text("SELECT privileged, admin FROM users WHERE id = 1")).one() == (0, 0)
