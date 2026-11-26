import uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import SuppressionReason


class SuppressionList(Base):
    __tablename__ = "suppression_list"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    reason: Mapped[SuppressionReason] = mapped_column(
        Enum(
            SuppressionReason,
            name="suppression_reason",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

