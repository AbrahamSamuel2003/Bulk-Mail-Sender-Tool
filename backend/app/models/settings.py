import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ApplicationSettings(Base):
    __tablename__ = "application_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fu1_interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    fu2_interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    fu3_interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    use_business_days: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    batch_size: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    delay_between_emails_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    delay_between_batches_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    daily_sending_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    sending_window_start: Mapped[str] = mapped_column(String(5), nullable=False, default="09:00")
    sending_window_end: Mapped[str] = mapped_column(String(5), nullable=False, default="17:00")
    default_timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/New_York")
    global_queue_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_prompt_config: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: {
            "tone": "professional, polite, natural, human-written",
            "length": "concise (3-5 sentences)",
            "style": "avoid promotional hype, reference prior email naturally",
            "restrictions": "never invent facts about the business or claim unprovided services",
            "signature_footer": 'Reply "no" and you won\'t hear from me again.',
        },
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

