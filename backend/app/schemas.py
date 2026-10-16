from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ─────────────────── Auth ───────────────────

class RegisterRequest(BaseModel):
    nickname: str = Field(min_length=2, max_length=20)
    password: str = Field(min_length=8, max_length=72)  # bcrypt 72바이트 한계


class LoginRequest(BaseModel):
    nickname: str
    password: str


class RecoverRequest(BaseModel):
    nickname: str
    recovery_code: str
    new_password: str = Field(min_length=8, max_length=72)


class TokenResponse(BaseModel):
    token: str
    token_type: Literal["bearer"] = "bearer"


class RegisterResponse(TokenResponse):
    # 회원가입 시 1회만 노출 — 사용자가 안전한 곳에 따로 저장.
    recovery_code: str


class MeResponse(BaseModel):
    nickname: str
    privileged: bool


class RecoverResponse(TokenResponse):
    # 복구코드는 1회용 — 사용 즉시 새 코드를 재발급해 응답에 포함 (재조회 불가).
    recovery_code: str


# ─────────────────── Character ───────────────────

class CharacterBase(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    type: Literal["P", "M"]
    stats: dict[str, Any] = Field(default_factory=dict)
    awak_stones: list[Any] = Field(default_factory=list)
    memorials: list[Any] = Field(default_factory=list)
    runeword: list[Any] = Field(default_factory=list)


# 캐릭터별 설정 JSON 칸 — 대미지 탭 스킬 설정 / 성물 발동 시뮬 / 대미지 탭 입력.
#   PUT 에서 생략(None)하면 기존 값을 유지한다 (router 가 이 목록을 돈다).
SETTING_FIELDS = ("skill_configs", "relics", "damage_settings")


class CharacterCreate(CharacterBase):
    skill_configs: dict[str, Any] = Field(default_factory=dict)
    relics: dict[str, Any] = Field(default_factory=dict)
    damage_settings: dict[str, Any] = Field(default_factory=dict)


class CharacterUpdate(CharacterBase):
    # 생략(None)하면 기존 값 유지 — 이 칸을 모르는 옛 클라이언트가 저장해도 설정이 지워지지 않게.
    skill_configs: dict[str, Any] | None = None
    relics: dict[str, Any] | None = None
    damage_settings: dict[str, Any] | None = None
    # 낙관적 잠금 — 클라이언트가 마지막으로 본 updated_at. 보내면 서버 값과 초 단위로
    # 비교해 다르면 409 (다른 기기에서 먼저 저장). 생략하면 기존과 동일하게 무조건 덮어씀.
    expected_updated_at: datetime | None = None


class CharacterRead(CharacterBase):
    id: int
    skill_configs: dict[str, Any] = Field(default_factory=dict)
    relics: dict[str, Any] = Field(default_factory=dict)
    damage_settings: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
