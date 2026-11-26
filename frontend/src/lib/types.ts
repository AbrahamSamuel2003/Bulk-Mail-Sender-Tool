export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  timezone: string;
  created_at: string | null;
  stage_counts?: Record<string, number>;
  status_counts?: Record<string, number>;
}

export interface EmailRecordSummary {
  id: string;
  subject: string;
  body: string;
  ai_generated?: boolean;
  send_status: "draft" | "queued" | "sent" | "failed";
  sent_at: string | null;
  job_status?: "pending" | "processing" | "completed" | "failed" | "cancelled" | null;
  scheduled_at?: string | null;
  last_error?: string | null;
}

export interface LeadItem {
  id: string;
  campaign_id: string;
  practice_name: string;
  contact_name: string | null;
  email: string;
  current_stage: string;
  status: string;
  is_eligible?: boolean;
  initial_sent_at: string | null;
  last_sent_at: string | null;
  next_followup_due_at: string | null;
  email_record: EmailRecordSummary | null;
}

export interface PaginatedLeads {
  items: LeadItem[];
  total: number;
  page: number;
  page_size: number;
}
