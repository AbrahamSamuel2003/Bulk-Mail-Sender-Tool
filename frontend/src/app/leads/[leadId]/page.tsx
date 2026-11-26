"use client";

import { use, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface LeadHistoryResponse {
  lead: {
    id: string;
    campaign_name: string | null;
    practice_name: string;
    contact_name: string | null;
    email: string;
    current_stage: string;
    status: string;
    next_followup_due_at: string | null;
  };
  email_records: {
    id: string;
    stage: string;
    subject: string;
    body: string;
    ai_generated: boolean;
    ai_generated_body: string | null;
    send_status: string;
    sent_at: string | null;
    provider_message_id: string | null;
  }[];
  replies: {
    id: string;
    sender_email: string;
    subject: string | null;
    body: string | null;
    received_at: string;
  }[];
}

export default function LeadHistoryPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = use(params);
  const [data, setData] = useState<LeadHistoryResponse | null>(null);

  const loadHistory = useCallback(() => {
    apiFetch<LeadHistoryResponse>(`/leads/${leadId}/history`)
      .then(setData)
      .catch(() => {});
  }, [leadId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleLeadAction(action: "stop" | "unsubscribe") {
    await apiFetch(`/leads/${leadId}/${action}`, { method: "POST" });
    loadHistory();
  }

  if (!data) {
    return <p className="text-xs text-[#605E5C]">Loading lead email history...</p>;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded border border-[#EDEBE9] bg-white p-5">
        <div>
          <h1 className="text-lg font-semibold text-[#323130]">{data.lead.practice_name}</h1>
          <p className="text-xs text-[#605E5C]">
            {data.lead.contact_name ? `${data.lead.contact_name} — ` : ""}
            {data.lead.email}
          </p>
          <p className="mt-1 text-xs text-[#605E5C]">
            Campaign: {data.lead.campaign_name || "—"} | Stage: {data.lead.current_stage} | Status:{" "}
            <strong className="uppercase text-[#323130]">{data.lead.status}</strong>
          </p>
        </div>
        {data.lead.status === "active" && (
          <div className="flex gap-2">
            <button
              onClick={() => handleLeadAction("stop")}
              className="rounded border border-[#8A8886] bg-white px-3 py-1.5 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
            >
              Stop Follow-Ups
            </button>
            <button
              onClick={() => handleLeadAction("unsubscribe")}
              className="rounded border border-[#F1707B] bg-[#FDE7E9] px-3 py-1.5 text-xs font-semibold text-[#A4262C] hover:bg-[#FBD0D4]"
            >
              Unsubscribe
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[#323130]">Outreach Emails</h2>
        {data.email_records.map((rec) => (
          <div key={rec.id} className="rounded border border-[#EDEBE9] bg-white p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-[#0078D4]">
                {rec.stage} {rec.ai_generated ? "(AI Generated)" : ""}
              </span>
              <span className="text-xs text-[#605E5C]">
                {rec.send_status.toUpperCase()}
                {rec.sent_at ? ` — ${new Date(rec.sent_at).toLocaleString()}` : ""}
              </span>
            </div>
            <p className="text-sm font-semibold text-[#323130]">{rec.subject}</p>
            <pre className="whitespace-pre-wrap font-sans text-xs text-[#323130]">{rec.body}</pre>
            {rec.provider_message_id && (
              <p className="text-[11px] text-[#A19F9D]">Gmail ID: {rec.provider_message_id}</p>
            )}
          </div>
        ))}
      </div>

      {data.replies.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#323130]">Replies Received</h2>
          {data.replies.map((rep) => (
            <div key={rep.id} className="rounded border border-[#A7E3A5] bg-[#DFF6DD]/40 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#107C10]">
                <strong>From: {rep.sender_email}</strong>
                <span>{new Date(rep.received_at).toLocaleString()}</span>
              </div>
              {rep.subject && <p className="text-sm font-semibold text-[#323130]">{rep.subject}</p>}
              <pre className="whitespace-pre-wrap font-sans text-xs text-[#323130]">{rep.body}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
