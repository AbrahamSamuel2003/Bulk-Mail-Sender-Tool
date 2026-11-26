from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "AI Bulk Email Outreach"
    APP_ENV: str = "development"
    APP_ACCESS_PASSWORD: str = ""
    TOKEN_ENCRYPTION_KEY: str = ""

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/outreach_db"

    AI_PROVIDER: str = "groq"  # groq | gemini | openai
    GROQ_API_KEY: str = ""
    GROQ_FALLBACK_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    OPENAI_API_KEY: str = ""
    OPENAI_DEFAULT_MODEL: str = "gpt-4o-mini"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/gmail/callback"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    IMAP_HOST: str = "imap.gmail.com"
    IMAP_PORT: int = 993

    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

