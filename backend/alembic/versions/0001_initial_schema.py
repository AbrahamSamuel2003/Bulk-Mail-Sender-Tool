"""Initial schema for AI-Powered Bulk Email Outreach & Follow-Up Management System.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    campaign_status = postgresql.ENUM("active", "paused", "archived", name="campaign_status")
    lead_stage = postgresql.ENUM(
        "new", "follow_up_1", "follow_up_2", "follow_up_3", "completed", name="lead_stage"
    )
    lead_status = postgresql.ENUM(
        "active",
        "replied",
        "bounced",
        "unsubscribed",
        "manually_stopped",
        "completed",
        name="lead_status",
    )
    email_stage = postgresql.ENUM(
        "initial", "follow_up_1", "follow_up_2", "follow_up_3", name="email_stage"
    )
    send_status = postgresql.ENUM("draft", "queued", "sent", "failed", name="send_status")
    job_status = postgresql.ENUM(
        "pending", "processing", "completed", "failed", "cancelled", name="job_status"
    )
    suppression_reason = postgresql.ENUM(
        "unsubscribed", "bounced", "manual", name="suppression_reason"
    )

    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", campaign_status, nullable=False, server_default="active"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="America/New_York"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "campaign_imports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("imported_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invalid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("column_mapping", sa.JSON(), nullable=False),
        sa.Column("error_report", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("practice_name", sa.String(255), nullable=False),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("current_stage", lead_stage, nullable=False, server_default="new"),
        sa.Column("status", lead_status, nullable=False, server_default="active"),
        sa.Column("initial_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_followup_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("campaign_id", "email", name="uq_leads_campaign_email"),
    )
    op.create_index("ix_leads_email", "leads", ["email"])
    op.create_index(
        "ix_leads_campaign_stage_status", "leads", ["campaign_id", "current_stage", "status"]
    )
    op.create_index("ix_leads_next_followup_due", "leads", ["next_followup_due_at"])

    op.create_table(
        "email_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage", email_stage, nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("ai_generated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ai_generated_subject", sa.String(500), nullable=True),
        sa.Column("ai_generated_body", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("send_status", send_status, nullable=False, server_default="draft"),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("provider_thread_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("lead_id", "stage", name="uq_email_records_lead_stage"),
    )
    op.create_index("ix_email_records_campaign_id", "email_records", ["campaign_id"])
    op.create_index(
        "ix_email_records_provider_message_id", "email_records", ["provider_message_id"]
    )
    op.create_index(
        "ix_email_records_provider_thread_id", "email_records", ["provider_thread_id"]
    )

    op.create_table(
        "ai_generation_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "email_record_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("email_records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("prompt_snapshot", sa.Text(), nullable=False),
        sa.Column("generated_subject", sa.String(500), nullable=False),
        sa.Column("generated_body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "sending_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "email_record_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("email_records.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", job_status, nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_sending_jobs_status_scheduled", "sending_jobs", ["status", "scheduled_at"]
    )

    op.create_table(
        "sending_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "sending_job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sending_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "replies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider_message_id", sa.String(255), nullable=False, unique=True),
        sa.Column("provider_thread_id", sa.String(255), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sender_email", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_replies_lead_id", "replies", ["lead_id"])
    op.create_index("ix_replies_provider_thread_id", "replies", ["provider_thread_id"])

    op.create_table(
        "suppression_list",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("reason", suppression_reason, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_suppression_list_email", "suppression_list", ["email"])

    op.create_table(
        "application_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("fu1_interval_days", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("fu2_interval_days", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("fu3_interval_days", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("use_business_days", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("batch_size", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("delay_between_emails_sec", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("delay_between_batches_sec", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("daily_sending_limit", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("sending_window_start", sa.String(5), nullable=False, server_default="09:00"),
        sa.Column("sending_window_end", sa.String(5), nullable=False, server_default="17:00"),
        sa.Column("default_timezone", sa.String(64), nullable=False, server_default="America/New_York"),
        sa.Column("global_queue_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ai_prompt_config", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "oauth_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(32), nullable=False, unique=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
        sa.Column("encrypted_access_token", sa.Text(), nullable=True),
        sa.Column("token_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gmail_history_id", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("oauth_accounts")
    op.drop_table("application_settings")
    op.drop_table("suppression_list")
    op.drop_table("replies")
    op.drop_table("sending_events")
    op.drop_table("sending_jobs")
    op.drop_table("ai_generation_logs")
    op.drop_table("email_records")
    op.drop_table("leads")
    op.drop_table("campaign_imports")
    op.drop_table("campaigns")

