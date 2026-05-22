import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Float, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    video_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    video_url: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued"
    )  # queued, processing, completed, failed
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_message: Mapped[str] = mapped_column(
        String(255), nullable=False, default="Waiting in queue..."
    )

    # Video metadata
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(255), nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    thumbnail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    view_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    upload_date: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Transcript
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Analysis result (JSON)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Error tracking
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def to_dict(self) -> dict:
        """Serialize job to dictionary for API responses."""
        data = {
            "job_id": self.id,
            "video_id": self.video_id,
            "video_url": self.video_url,
            "status": self.status,
            "progress": self.progress,
            "progress_message": self.progress_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
        }

        # Include metadata if available
        if self.title:
            data["metadata"] = {
                "title": self.title,
                "channel": self.channel,
                "duration": self.duration,
                "thumbnail": self.thumbnail,
                "view_count": self.view_count,
                "upload_date": self.upload_date,
            }

        # Include result if completed
        if self.status == "completed" and self.result:
            data["result"] = self.result
            if self.transcript:
                data["transcript"] = self.transcript

        # Include error if failed
        if self.status == "failed" and self.error:
            data["error"] = self.error

        return data
