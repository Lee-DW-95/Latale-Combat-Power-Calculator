"""PUT /characters/{id} 낙관적 잠금 — expected_updated_at 필드 (하위호환)."""

from datetime import datetime, timedelta, timezone

from app.db import SessionLocal
from app.models import Character

from .conftest import auth_headers, register, sample_character


def _setup(client):
    headers = auth_headers(register(client)["token"])
    created = client.post("/characters", json=sample_character(), headers=headers).json()
    return headers, created


def _bump_updated_at(char_id: int, delta: timedelta) -> None:
    # 실제로는 시간이 흘러야 초 단위 비교에서 차이가 나므로, 테스트에선 DB 값을 직접 밀어 준다.
    db = SessionLocal()
    try:
        char = db.get(Character, char_id)
        char.updated_at = char.updated_at + delta
        db.commit()
    finally:
        db.close()


def test_without_field_behaves_as_before(client):
    headers, created = _setup(client)
    # 서버가 그 사이에 바뀌었더라도 필드를 안 보내면 무조건 덮어쓴다 (기존 동작).
    _bump_updated_at(created["id"], timedelta(minutes=5))
    res = client.put(
        f"/characters/{created['id']}",
        json=dict(sample_character(), stats={"주스탯": 1}),
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["stats"] == {"주스탯": 1}


def test_matching_timestamp_passes(client):
    headers, created = _setup(client)
    body = dict(sample_character(), stats={"주스탯": 2}, expected_updated_at=created["updated_at"])
    res = client.put(f"/characters/{created['id']}", json=body, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["stats"] == {"주스탯": 2}


def test_timezone_and_subsecond_are_normalized(client):
    headers, created = _setup(client)
    # 서버 updated_at 은 SQLite 특성상 tz 없는 UTC 문자열. 같은 순간을 +09:00 으로, 마이크로초는 버려서 보낸다.
    server_ts = datetime.fromisoformat(created["updated_at"])
    if server_ts.tzinfo is None:
        server_ts = server_ts.replace(tzinfo=timezone.utc)
    kst = server_ts.astimezone(timezone(timedelta(hours=9))).replace(microsecond=0)

    body = dict(sample_character(), stats={"주스탯": 3}, expected_updated_at=kst.isoformat())
    res = client.put(f"/characters/{created['id']}", json=body, headers=headers)
    assert res.status_code == 200, res.text

    # 'Z' 접미 UTC 표기도 동일하게 통과
    updated = res.json()
    ts = datetime.fromisoformat(updated["updated_at"]).replace(tzinfo=timezone.utc, microsecond=0)
    body = dict(sample_character(), stats={"주스탯": 4}, expected_updated_at=ts.isoformat().replace("+00:00", "Z"))
    res = client.put(f"/characters/{created['id']}", json=body, headers=headers)
    assert res.status_code == 200, res.text


def test_stale_timestamp_conflicts_with_server_copy(client):
    headers, created = _setup(client)
    char_id = created["id"]

    # 기기 A 가 캐릭터를 읽어 둔 상태(created) 에서, 기기 B 가 먼저 저장하고 시간이 흐름.
    res = client.put(f"/characters/{char_id}", json=dict(sample_character(), stats={"주스탯": 500}), headers=headers)
    assert res.status_code == 200
    _bump_updated_at(char_id, timedelta(seconds=30))

    # 기기 A 가 옛 updated_at 으로 저장 시도 → 409 + 서버 현재본
    body = dict(sample_character(), stats={"주스탯": 1}, expected_updated_at=created["updated_at"])
    res = client.put(f"/characters/{char_id}", json=body, headers=headers)
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert "다른 기기" in detail["message"]
    server_copy = detail["character"]
    assert server_copy["id"] == char_id
    assert server_copy["stats"] == {"주스탯": 500}
    assert server_copy["updated_at"]

    # 서버 데이터는 덮어써지지 않았다
    mine = client.get("/characters", headers=headers).json()
    assert mine[0]["stats"] == {"주스탯": 500}

    # 409 응답의 updated_at 으로 다시 보내면 통과 (재시도 플로우)
    body["expected_updated_at"] = server_copy["updated_at"]
    res = client.put(f"/characters/{char_id}", json=body, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["stats"] == {"주스탯": 1}


def test_conflict_check_runs_before_name_clash(client):
    headers, created = _setup(client)
    client.post("/characters", json=sample_character("다른캐릭"), headers=headers)
    _bump_updated_at(created["id"], timedelta(seconds=30))

    # 이름 충돌(409)보다 낙관적 잠금 충돌이 먼저 — detail 이 dict(서버본 포함)인지로 구분
    body = dict(sample_character("다른캐릭"), expected_updated_at=created["updated_at"])
    res = client.put(f"/characters/{created['id']}", json=body, headers=headers)
    assert res.status_code == 409
    assert isinstance(res.json()["detail"], dict)


def test_invalid_timestamp_422(client):
    headers, created = _setup(client)
    body = dict(sample_character(), expected_updated_at="not-a-date")
    res = client.put(f"/characters/{created['id']}", json=body, headers=headers)
    assert res.status_code == 422
