import uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import LeadStage, LeadStatus


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        UniqueConstraint("campaign_id", "email", name="uq_leads_campaign_email"),
        Index("ix_leads_campaign_stage_status", "campaign_id", "current_stage", "status"),
        Index("ix_leads_next_followup_due", "next_followup_due_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    practice_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    current_stage: Mapped[LeadStage] = mapped_column(
        Enum(
            LeadStage,
            name="lead_stage",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=LeadStage.NEW,
    )
    status: Mapped[LeadStatus] = mapped_column(
        Enum(
            LeadStatus,
            name="lead_status",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=LeadStatus.ACTIVE,
    )
    initial_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_followup_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    campaign = relationship("Campaign", back_populates="leads")
    email_records = relationship("EmailRecord", back_populates="lead", cascade="all, delete-orphan")
    replies = relationship("Reply", back_populates="lead", cascade="all, delete-orphan")

