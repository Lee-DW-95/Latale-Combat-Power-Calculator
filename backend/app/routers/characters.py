from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_current_user, get_db
from ..models import Character, User


router = APIRouter(prefix="/characters", tags=["characters"])


def _own_character_or_404(db: Session, user: User, character_id: int) -> Character:
    char = db.get(Character, character_id)
    if char is None or char.user_id != user.id:
        # 타인의 캐릭터 존재 여부를 노출하지 않기 위해 동일 에러.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "캐릭터를 찾을 수 없습니다.")
    return char


@router.get("", response_model=list[schemas.CharacterRead])
def list_characters(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Character)
        .filter(Character.user_id == user.id)
        .order_by(Character.updated_at.desc())
        .all()
    )


@router.post("", response_model=schemas.CharacterRead, status_code=201)
def create_character(
    body: schemas.CharacterCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "캐릭터 이름이 비어 있습니다.")

    if (
        db.query(Character)
        .filter(Character.user_id == user.id, Character.name == name)
        .first()
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "같은 이름의 캐릭터가 이미 있습니다.")

    char = Character(
        user_id=user.id,
        name=name,
        type=body.type,
        stats=body.stats,
        awak_stones=body.awak_stones,
    )
    db.add(char)
    db.commit()
    db.refresh(char)
    return char


@router.put("/{character_id}", response_model=schemas.CharacterRead)
def update_character(
    character_id: int,
    body: schemas.CharacterUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    char = _own_character_or_404(db, user, character_id)
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "캐릭터 이름이 비어 있습니다.")

    # 이름 변경 시 같은 유저의 다른 캐릭터와 충돌하면 409.
    if new_name != char.name:
        clash = (
            db.query(Character)
            .filter(Character.user_id == user.id, Character.name == new_name)
            .first()
        )
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "같은 이름의 캐릭터가 이미 있습니다.")

    char.name = new_name
    char.type = body.type
    char.stats = body.stats
    char.awak_stones = body.awak_stones
    db.commit()
    db.refresh(char)
    return char


@router.delete("/{character_id}", status_code=204)
def delete_character(
    character_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    char = _own_character_or_404(db, user, character_id)
    db.delete(char)
    db.commit()
    return None
