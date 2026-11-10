"""캐릭터 변경 이력 기록 — routers/characters.py 가 commit 직전에 호출한다."""

from typing import Any

from sqlalchemy.orm import Session

from .models import Character, CharacterHistory

# 이력에 담는 캐릭터 칸 (id·user_id·updated_at 제외).
TRACKED_FIELDS = (
    "name", "type", "stats", "awak_stones", "memorials", "runeword",
    "skill_configs", "relics", "damage_settings",
)
# 자동 저장(2초 디바운스)이 잦으므로 캐릭터당 최근 N건만 보관한다.
KEEP_PER_CHARACTER = 500


def snapshot(char: Character) -> dict[str, Any]:
    return {f: getattr(char, f) for f in TRACKED_FIELDS}


def diff(before: Any, after: Any, prefix: str = "") -> dict[str, list]:
    """dict 는 키 단위로 재귀해 바뀐 경로만, 그 밖(list·스칼라)은 값이 다르면 [전, 후] 통째로."""
    if isinstance(before, dict) and isinstance(after, dict):
        out: dict[str, list] = {}
        for key in list(before) + [k for k in after if k not in before]:
            path = f"{prefix}.{key}" if prefix else str(key)
            out.update(diff(before.get(key), after.get(key), path))
        return out
    return {} if before == after else {prefix: [before, after]}


def record(db: Session, char: Character, action: str, changes: dict[str, Any]) -> None:
    if action == "update" and not changes:
        return  # 값이 그대로인 자동 저장은 남기지 않는다.
    db.add(CharacterHistory(
        character_id=char.id,
        user_id=char.user_id,
        character_name=char.name,
        action=action,
        changes=changes,
    ))
    db.flush()
    stale = (
        db.query(CharacterHistory.id)
        .filter(
            CharacterHistory.character_id == char.id,
            CharacterHistory.user_id == char.user_id,
        )
        .order_by(CharacterHistory.id.desc())
        .offset(KEEP_PER_CHARACTER)
        .all()
    )
    if stale:
        db.query(CharacterHistory).filter(
            CharacterHistory.id.in_([r.id for r in stale])
        ).delete(synchronize_session=False)
