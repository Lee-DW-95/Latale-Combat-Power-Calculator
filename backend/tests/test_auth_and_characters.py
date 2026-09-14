"""회원가입 → 로그인 → 캐릭터 CRUD 스모크 테스트 + 인증/권한/중복 에러 케이스."""

from .conftest import auth_headers, register, sample_character


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_register_login_and_character_crud(client):
    # 회원가입 — 토큰 + 1회성 복구코드
    reg = register(client, "flowuser")
    assert reg["token"]
    assert reg["token_type"] == "bearer"
    assert len(reg["recovery_code"]) >= 16

    # 로그인 — 새 토큰
    res = client.post("/auth/login", json={"nickname": "flowuser", "password": "password123"})
    assert res.status_code == 200, res.text
    headers = auth_headers(res.json()["token"])

    # 빈 목록
    res = client.get("/characters", headers=headers)
    assert res.status_code == 200
    assert res.json() == []

    # 생성 — stats/awak_stones/memorials/runeword 모두 저장·반환되는지
    payload = sample_character()
    res = client.post("/characters", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    created = res.json()
    char_id = created["id"]
    assert created["updated_at"]
    for key in ("name", "type", "stats", "awak_stones", "memorials", "runeword"):
        assert created[key] == payload[key], key

    # 목록
    res = client.get("/characters", headers=headers)
    assert res.status_code == 200
    listed = res.json()
    assert [c["id"] for c in listed] == [char_id]
    assert listed[0]["runeword"] == payload["runeword"]

    # 수정(PUT) — 이름/타입/스탯 변경
    updated_payload = dict(payload, name="이름변경", type="M", stats={"주스탯": 99999})
    res = client.put(f"/characters/{char_id}", json=updated_payload, headers=headers)
    assert res.status_code == 200, res.text
    updated = res.json()
    assert updated["id"] == char_id
    assert updated["name"] == "이름변경"
    assert updated["type"] == "M"
    assert updated["stats"] == {"주스탯": 99999}
    assert updated["memorials"] == payload["memorials"]
    # 응답 스키마(CharacterRead)에 요청 전용 필드가 새지 않는지
    assert "expected_updated_at" not in updated

    # 삭제
    res = client.delete(f"/characters/{char_id}", headers=headers)
    assert res.status_code == 204
    res = client.get("/characters", headers=headers)
    assert res.json() == []
    res = client.delete(f"/characters/{char_id}", headers=headers)
    assert res.status_code == 404


def test_characters_require_auth(client):
    assert client.get("/characters").status_code == 401
    assert client.post("/characters", json=sample_character()).status_code == 401
    assert client.put("/characters/1", json=sample_character()).status_code == 401
    assert client.delete("/characters/1").status_code == 401
    # 깨진 토큰도 401
    bad = auth_headers("not.a.jwt")
    assert client.get("/characters", headers=bad).status_code == 401


def test_login_wrong_password_401(client):
    register(client, "loginuser")
    res = client.post("/auth/login", json={"nickname": "loginuser", "password": "wrong-password"})
    assert res.status_code == 401
    # 존재하지 않는 닉네임도 같은 메시지 (닉네임 존재 여부 비노출)
    res2 = client.post("/auth/login", json={"nickname": "nobody", "password": "wrong-password"})
    assert res2.status_code == 401
    assert res2.json()["detail"] == res.json()["detail"]


def test_duplicate_nickname_409(client):
    register(client, "dupuser")
    res = client.post("/auth/register", json={"nickname": "dupuser", "password": "password123"})
    assert res.status_code == 409
    assert "닉네임" in res.json()["detail"]


def test_duplicate_character_name_409(client):
    headers = auth_headers(register(client)["token"])
    res = client.post("/characters", json=sample_character("A"), headers=headers)
    assert res.status_code == 201
    res = client.post("/characters", json=sample_character("B"), headers=headers)
    assert res.status_code == 201
    b_id = res.json()["id"]

    # 같은 이름으로 생성
    res = client.post("/characters", json=sample_character("A"), headers=headers)
    assert res.status_code == 409
    # 앞뒤 공백은 strip 후 비교
    res = client.post("/characters", json=sample_character("  A "), headers=headers)
    assert res.status_code == 409

    # PUT 으로 다른 캐릭터 이름과 충돌
    res = client.put(f"/characters/{b_id}", json=sample_character("A"), headers=headers)
    assert res.status_code == 409

    # 자기 자신 이름 그대로는 OK
    res = client.put(f"/characters/{b_id}", json=sample_character("B"), headers=headers)
    assert res.status_code == 200

    # 다른 유저는 같은 이름을 쓸 수 있다 (유니크는 user_id+name)
    other = auth_headers(register(client, "otheruser")["token"])
    res = client.post("/characters", json=sample_character("A"), headers=other)
    assert res.status_code == 201


def test_other_users_character_404(client):
    owner = auth_headers(register(client, "owner")["token"])
    intruder = auth_headers(register(client, "intruder")["token"])

    res = client.post("/characters", json=sample_character(), headers=owner)
    char_id = res.json()["id"]

    # 타인 캐릭터는 존재 자체를 노출하지 않음 — 수정/삭제 모두 404
    res = client.put(f"/characters/{char_id}", json=sample_character("hack"), headers=intruder)
    assert res.status_code == 404
    res = client.delete(f"/characters/{char_id}", headers=intruder)
    assert res.status_code == 404
    assert client.get("/characters", headers=intruder).json() == []

    # 원래 주인 데이터는 그대로
    mine = client.get("/characters", headers=owner).json()
    assert len(mine) == 1 and mine[0]["name"] == sample_character()["name"]


def test_recover_password_rotates_code(client):
    reg = register(client, "recoveruser")
    old_code = reg["recovery_code"]

    res = client.post(
        "/auth/recover",
        json={"nickname": "recoveruser", "recovery_code": old_code, "new_password": "newpassword1"},
    )
    assert res.status_code == 200, res.text
    new_code = res.json()["recovery_code"]
    assert new_code and new_code != old_code

    # 새 비번으로 로그인 되고, 옛 비번은 안 됨
    assert client.post("/auth/login", json={"nickname": "recoveruser", "password": "newpassword1"}).status_code == 200
    assert client.post("/auth/login", json={"nickname": "recoveruser", "password": "password123"}).status_code == 401

    # 복구코드는 1회용 — 옛 코드 재사용 불가
    res = client.post(
        "/auth/recover",
        json={"nickname": "recoveruser", "recovery_code": old_code, "new_password": "another123"},
    )
    assert res.status_code == 401
