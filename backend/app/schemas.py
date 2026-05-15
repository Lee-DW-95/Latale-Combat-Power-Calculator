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


# ─────────────────── Character ───────────────────

class CharacterBase(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    type: Literal["P", "M"]
    stats: dict[str, Any] = Field(default_factory=dict)
    awak_stones: list[Any] = Field(default_factory=list)


class CharacterCreate(CharacterBase):
    pass


class CharacterUpdate(CharacterBase):
    pass


class CharacterRead(CharacterBase):
    id: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
