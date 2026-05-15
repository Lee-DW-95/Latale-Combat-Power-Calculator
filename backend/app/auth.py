import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from .config import get_settings


_settings = get_settings()
_JWT_ALG = "HS256"


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=_settings.bcrypt_rounds)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # 해시 포맷이 깨진 경우 — 잘못된 비번으로 처리.
        return False


def generate_recovery_code() -> str:
    # URL-safe 32자 토큰 — 사용자가 메모하기 좋게 적당히 짧게.
    return secrets.token_urlsafe(18)  # base64로 약 24자


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=_settings.jwt_expire_seconds)).timestamp()),
    }
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_JWT_ALG)


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, _settings.jwt_secret, algorithms=[_JWT_ALG])
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except (JWTError, ValueError):
        return None
