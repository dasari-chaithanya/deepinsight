import os
import json
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    # API Keys
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./deep_insight.db"

    # Processing limits
    MAX_CONCURRENT_JOBS: int = 2
    MAX_VIDEO_DURATION: int = 5400  # 90 minutes in seconds
    MAX_AUDIO_CHUNK_SIZE_MB: int = 20  # Groq Whisper limit
    AUDIO_CHUNK_DURATION_MINUTES: int = 10  # Duration per chunk

    # Transcription
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"

    # Analysis
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_MAX_RETRIES: int = 3

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
    ]

    # Temp files
    TEMP_DIR: str = str(Path("./tmp_audio").resolve())

    # Cleanup
    CLEANUP_INTERVAL_SECONDS: int = 300  # 5 minutes
    TEMP_FILE_MAX_AGE_SECONDS: int = 600  # 10 minutes

    class Config:
        env_file = ".env"
        case_sensitive = True

    def model_post_init(self, __context):
        # Parse CORS_ORIGINS if passed as JSON string from environment
        cors_raw = os.getenv("CORS_ORIGINS")
        if cors_raw:
            try:
                parsed = json.loads(cors_raw)
                if isinstance(parsed, list):
                    self.CORS_ORIGINS = parsed
            except (json.JSONDecodeError, TypeError):
                pass

        # Ensure temp directory exists
        Path(self.TEMP_DIR).mkdir(parents=True, exist_ok=True)


settings = Settings()
