import enum


class CampaignStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class LeadStage(str, enum.Enum):
    NEW = "new"
    FOLLOW_UP_1 = "follow_up_1"
    FOLLOW_UP_2 = "follow_up_2"
    FOLLOW_UP_3 = "follow_up_3"
    COMPLETED = "completed"


class LeadStatus(str, enum.Enum):
    ACTIVE = "active"
    REPLIED = "replied"
    BOUNCED = "bounced"
    UNSUBSCRIBED = "unsubscribed"
    MANUALLY_STOPPED = "manually_stopped"
    COMPLETED = "completed"


class EmailStage(str, enum.Enum):
    INITIAL = "initial"
    FOLLOW_UP_1 = "follow_up_1"
    FOLLOW_UP_2 = "follow_up_2"
    FOLLOW_UP_3 = "follow_up_3"


class SendStatus(str, enum.Enum):
    DRAFT = "draft"
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SuppressionReason(str, enum.Enum):
    UNSUBSCRIBED = "unsubscribed"
    BOUNCED = "bounced"
    MANUAL = "manual"

