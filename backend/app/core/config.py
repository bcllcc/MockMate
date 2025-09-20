from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "MockMate API"
    environment: str = "development"
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    database_url: str = "sqlite:///./mockmate.db"
    default_question_count: int = 6
    llm_log_path: str = "logs/llm.log"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
