import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EmailStage, SendStatus


class EmailRecord(Base):
    __tablename__ = "email_records"
    __table_args__ = (
        UniqueConstraint("lead_id", "stage", name="uq_email_records_lead_stage"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[EmailStage] = mapped_column(
        Enum(
            EmailStage,
            name="email_stage",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    ai_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_generated_subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ai_generated_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    send_status: Mapped[SendStatus] = mapped_column(
        Enum(
            SendStatus,
            name="send_status",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=SendStatus.DRAFT,
    )
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    provider_thread_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lead = relationship("Lead", back_populates="email_records")
    sending_jobs = relationship("SendingJob", back_populates="email_record", cascade="all, delete-orphan")
    ai_generations = relationship("AIGenerationLog", back_populates="email_record", cascade="all, delete-orphan")


class AIGenerationLog(Base):
    __tablename__ = "ai_generation_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("email_records.id", ondelete="CASCADE"), nullable=False
    )
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    generated_subject: Mapped[str] = mapped_column(String(500), nullable=False)
    generated_body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    email_record = relationship("EmailRecord", back_populates="ai_generations")

