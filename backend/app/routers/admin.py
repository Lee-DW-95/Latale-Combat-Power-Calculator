"""관리자 전용 API — users.admin 계정만 호출할 수 있다."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_admin_user, get_db
from ..models import CharacterHistory, User


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/history", response_model=list[schemas.AdminHistoryRead])
def list_all_history(
    limit: int = 50,
    before_id: int | None = None,
    q: str | None = None,
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """전체 사용자의 캐릭터 변경 이력, 최신순. before_id 로 다음 쪽, q 는 닉네임·캐릭터명 부분 일치."""
    query = db.query(CharacterHistory, User.nickname).join(User, User.id == CharacterHistory.user_id)
    if before_id is not None:
        query = query.filter(CharacterHistory.id < before_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(User.nickname.like(like) | CharacterHistory.character_name.like(like))
    rows = query.order_by(CharacterHistory.id.desc()).limit(max(1, min(limit, 200))).all()
    return [
        schemas.AdminHistoryRead(
            **schemas.CharacterHistoryRead.model_validate(h).model_dump(),
            user_id=h.user_id,
            nickname=nickname,
        )
        for h, nickname in rows
    ]
