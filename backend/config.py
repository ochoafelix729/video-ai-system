from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI Video Tutor API"
    environment: str = "development"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/video_tutor"
    aws_default_region: str = "us-east-1"
    s3_bucket_name: str = ""
    sqs_queue_url: str = ""
    cognito_region: str = "us-east-1"
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""
    assemblyai_api_key: str = ""
    gemini_api_key: str = ""
    auth_disabled: bool = False
    dev_user_id: str = "local-development-user"
    evidence_retention_days: int = Field(default=30, ge=1, le=365)
    raw_audio_retention_hours: int = Field(default=24, ge=1, le=168)
    api_cors_origins: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [value.strip() for value in self.api_cors_origins.split(",") if value.strip()]

    @property
    def cognito_issuer(self) -> str:
        return (
            f"https://cognito-idp.{self.cognito_region}.amazonaws.com/"
            f"{self.cognito_user_pool_id}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
