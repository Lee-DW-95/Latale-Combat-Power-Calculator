from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from .config import get_settings
from .db import init_db
from .rate_limit import limiter
from .routers import auth as auth_router
from .routers import characters as characters_router


settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 첫 기동 시 테이블 생성 — Alembic 마이그레이션 없이 단일 SQLite 파일 운영 전제.
    init_db()
    yield


app = FastAPI(
    title="Latale Calculator API",
    version="0.1.0",
    lifespan=lifespan,
)

# rate limit — slowapi 패턴 (Limiter 를 state 에 두고 미들웨어 + 예외 핸들러 등록).
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # Authorization 헤더 기반 — cookie 안 씀.
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router.router)
app.include_router(characters_router.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
