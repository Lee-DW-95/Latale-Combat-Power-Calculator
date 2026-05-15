from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nickname: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    pw_hash: Mapped[str] = mapped_column(String(72), nullable=False)
    # 복구코드는 회원가입 1회 발급 후 평문 노출 불가 — 해시만 보관.
    recovery_hash: Mapped[str | None] = mapped_column(String(72), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    characters: Mapped[list["Character"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Character(Base):
    __tablename__ = "characters"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_character_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    type: Mapped[str] = mapped_column(String(1), nullable=False)  # 'P' | 'M'
    # 주스탯/공격력/크댐/기본_* 등 전체 stats 묶음 — 게임 옵션 추가 시 마이그레이션 없이 흡수.
    stats: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 각성석 10 stones × 4 options. [{options: [{stat, unit, value}, ...]}, ...]
    awak_stones: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    user: Mapped[User] = relationship(back_populates="characters")
