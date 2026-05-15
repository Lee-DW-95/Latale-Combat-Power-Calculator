from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./latale.db"
    jwt_secret: str = "change-me"
    jwt_expire_seconds: int = 604800  # 7일
    cors_origins: str = "http://localhost:5173"
    bcrypt_rounds: int = 12

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
