"""캐릭터 변경 이력 (character_history) — 생성·수정·삭제 기록, 무변경 저장 생략, 본인만 조회."""

from app import history

from .conftest import auth_headers, register, sample_character


def _setup(client, nickname="tester"):
    headers = auth_headers(register(client, nickname)["token"])
    created = client.post("/characters", json=sample_character(), headers=headers).json()
    return headers, created


def _history(client, headers, char_id):
    res = client.get(f"/characters/{char_id}/history", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def test_diff_flattens_dicts_and_keeps_lists_whole():
    before = {"stats": {"크댐": 150, "주스탯": 1}, "runeword": [1, 2], "name": "a"}
    after = {"stats": {"크댐": 151, "주스탯": 1, "관통": 97}, "runeword": [1, 3], "name": "a"}
    assert history.diff(before, after) == {
        "stats.크댐": [150, 151],
        "stats.관통": [None, 97],
        "runeword": [[1, 2], [1, 3]],
    }


def test_create_records_snapshot(client):
    headers, created = _setup(client)
    rows = _history(client, headers, created["id"])
    assert [r["action"] for r in rows] == ["create"]
    assert rows[0]["changes"]["stats"]["크댐"] == 150.5
    assert rows[0]["character_name"] == "테스트캐릭"


def test_update_records_only_changed_paths(client):
    headers, created = _setup(client)
    stats = dict(sample_character()["stats"], 크댐=160)
    res = client.put(
        f"/characters/{created['id']}",
        json=dict(sample_character(), stats=stats, skill_configs={"cls": 1}),
        headers=headers,
    )
    assert res.status_code == 200, res.text
    latest = _history(client, headers, created["id"])[0]
    assert latest["action"] == "update"
    assert latest["changes"] == {"stats.크댐": [150.5, 160], "skill_configs.cls": [None, 1]}


def test_unchanged_save_is_not_recorded(client):
    headers, created = _setup(client)
    res = client.put(f"/characters/{created['id']}", json=sample_character(), headers=headers)
    assert res.status_code == 200
    assert len(_history(client, headers, created["id"])) == 1


def test_delete_keeps_history(client):
    headers, created = _setup(client)
    assert client.delete(f"/characters/{created['id']}", headers=headers).status_code == 204
    rows = _history(client, headers, created["id"])
    assert [r["action"] for r in rows] == ["delete", "create"]
    assert rows[0]["changes"]["name"] == "테스트캐릭"


def test_other_user_cannot_read(client):
    _, created = _setup(client, "owner")
    other = auth_headers(register(client, "other")["token"])
    assert _history(client, other, created["id"]) == []


def test_prunes_to_keep_limit(client, monkeypatch):
    monkeypatch.setattr(history, "KEEP_PER_CHARACTER", 3)
    headers, created = _setup(client)
    for v in range(5):
        stats = dict(sample_character()["stats"], 크댐=200 + v)
        client.put(f"/characters/{created['id']}", json=dict(sample_character(), stats=stats), headers=headers)
    rows = _history(client, headers, created["id"])
    assert len(rows) == 3
    assert rows[0]["changes"]["stats.크댐"] == [203, 204]
