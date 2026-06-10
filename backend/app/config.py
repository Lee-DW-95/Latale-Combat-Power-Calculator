from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Tauri 데스크탑 앱 오리진 — 서버 .env 의 CORS_ORIGINS 와 무관하게 항상 허용.
# (데스크탑 앱은 WebView2 에서 tauri.localhost 오리진으로 fetch 함)
DESKTOP_ORIGINS = ["http://tauri.localhost", "https://tauri.localhost"]


class Settings(BaseSettings):
    database_url: str = "sqlite:///./latale.db"
    jwt_secret: str = "change-me"
    jwt_expire_seconds: int = 604800  # 7일
    cors_origins: str = "http://localhost:5173"
    bcrypt_rounds: int = 12

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @property
    def cors_origin_list(self) -> list[str]:
        env_origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        return env_origins + [o for o in DESKTOP_ORIGINS if o not in env_origins]


@lru_cache
def get_settings() -> Settings:
    return Settings()
