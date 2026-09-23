"""Configuração via variáveis de ambiente."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore")

    database_url: str = "postgresql+psycopg://oee:oee_dev_change_me@localhost:5432/oee"
    jwt_secret: str = "troque-este-segredo-em-producao"
    jwt_expire_minutes: int = 720
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-3.5-flash-lite"
    gemini_embed_model: str = "gemini-embedding-001"
    redis_url: str = "redis://localhost:6379/0"
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost,http://localhost:5173"
    demo_dias: int = 7
    demo_seed: int = 20240517
    models_dir: str = "models/acmp"
    uploads_dir: str = "uploads/manuais"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
