from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import (
    create_access_token,
    generate_recovery_code,
    hash_password,
    verify_password,
)
from ..deps import get_db
from ..models import User
from ..rate_limit import limiter


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.RegisterResponse, status_code=201)
@limiter.limit("10/minute")
def register(
    request: Request,  # noqa: ARG001 — slowapi 가 Request 인자를 요구
    body: schemas.RegisterRequest,
    db: Session = Depends(get_db),
):
    nickname = body.nickname.strip()
    if not nickname:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "닉네임이 비어 있습니다.")

    if db.query(User).filter(User.nickname == nickname).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 사용 중인 닉네임입니다.")

    recovery_code = generate_recovery_code()
    user = User(
        nickname=nickname,
        pw_hash=hash_password(body.password),
        recovery_hash=hash_password(recovery_code),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return schemas.RegisterResponse(
        token=create_access_token(user.id),
        recovery_code=recovery_code,
    )


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,  # noqa: ARG001
    body: schemas.LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.nickname == body.nickname.strip()).first()
    if user is None or not verify_password(body.password, user.pw_hash):
        # 닉네임 존재 여부를 노출하지 않기 위해 동일 에러.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "닉네임 또는 비밀번호가 올바르지 않습니다.")
    return schemas.TokenResponse(token=create_access_token(user.id))


@router.post("/recover", response_model=schemas.TokenResponse)
@limiter.limit("5/minute")
def recover(
    request: Request,  # noqa: ARG001
    body: schemas.RecoverRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.nickname == body.nickname.strip()).first()
    if user is None or user.recovery_hash is None or not verify_password(
        body.recovery_code, user.recovery_hash
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "복구코드가 올바르지 않습니다.")

    user.pw_hash = hash_password(body.new_password)
    # 복구코드는 1회용 — 사용 후 무효화. 신규 복구코드는 별도 엔드포인트(추후) 또는 재가입.
    user.recovery_hash = None
    db.commit()
    return schemas.TokenResponse(token=create_access_token(user.id))
