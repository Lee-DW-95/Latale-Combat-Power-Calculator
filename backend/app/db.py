from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

# SQLite 는 단일 connection 만 같은 스레드에서 안전 — FastAPI 의존성 패턴에선
# 요청마다 새 세션을 받으므로 check_same_thread=False 가 필요.
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

# SQLite 동시성 향상 — WAL 모드 + foreign key 활성화. 연결마다 1회 실행.
if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragma(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    # 모델 import 가 Base.metadata 등록을 트리거. 순환 import 방지를 위해 함수 내부에서.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
