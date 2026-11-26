"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ExcelUploadWizard } from "@/components/campaigns/ExcelUploadWizard";
import { EmailPreviewDialog } from "@/components/outreach/EmailPreviewDialog";
import { apiFetch } from "@/lib/api-client";
import { LeadItem, PaginatedLeads } from "@/lib/types";

export default function CampaignNewStagePage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewLead, setPreviewLead] = useState<LeadItem | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"send" | "delete" | null>(null);

  const loadLeads = useCallback(async () => {
    try {
      const data = await apiFetch<PaginatedLeads>(
        `/campaigns/${campaignId}/leads?stage=new`,
        { skipCache: true }
      );
      setLeads(data.items);
    } catch {
      // ignore if backend not running
    }
  }, [campaignId]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const queuedCount = leads.filter(
    (l) => l.email_record?.send_status === "queued" || l.email_record?.job_status === "processing"
  ).length;
  const processingCount = leads.filter(
    (l) => l.email_record?.job_status === "processing"
  ).length;
  const failedCount = leads.filter(
    (l) => l.email_record?.send_status === "failed"
  ).length;

  useEffect(() => {
    if (queuedCount === 0) return;
    const timer = setInterval(loadLeads, 3000);
    return () => clearInterval(timer);
  }, [queuedCount, loadLeads]);

  function toggleAll() {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleSend(sendAll: boolean, specificIds?: string[]) {
    setBusyAction("send");
    try {
      const res = await apiFetch<{ queued_count: number; skipped_ineligible: number }>(
        `/campaigns/${campaignId}/send`,
        {
          method: "POST",
          body: JSON.stringify({
            stage: "initial",
            lead_ids: specificIds ?? (sendAll ? null : Array.from(selectedIds)),
            send_all_eligible: sendAll,
          }),
        }
      );
      setStatusMessage(
        `Queued ${res.queued_count} initial emails (${res.skipped_ineligible} skipped).`
      );
      if (!specificIds) setSelectedIds(new Set());
      loadLeads();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveSelected() {
    if (selectedIds.size === 0) return;
    setBusyAction("delete");
    try {
      await apiFetch(`/campaigns/${campaignId}/leads/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ lead_ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      loadLeads();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteOne(leadId: string) {
    await apiFetch(`/campaigns/${campaignId}/leads/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ lead_ids: [leadId] }),
    });
    const next = new Set(selectedIds);
    next.delete(leadId);
    setSelectedIds(next);
    loadLeads();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#323130]">NEW — Initial Email Management</h1>
        <p className="text-xs text-[#605E5C]">
          Upload leads via Excel/CSV, preview and edit individual emails, and queue initial outreach
        </p>
      </div>

      <ExcelUploadWizard campaignId={campaignId} onImported={loadLeads} />

      {queuedCount > 0 && (
        <div className="flex items-center justify-between gap-4 rounded border border-[#C7E0F4] bg-[#EFF6FC] px-4 py-2.5 text-xs text-[#004578]">
          <div className="flex items-center gap-2.5 font-semibold">
            <Loader2 className="h-4 w-4 animate-spin text-[#0078D4]" />
            <span>
              Sending in progress: {processingCount} sending now, {queuedCount} remaining in queue
              {failedCount > 0 ? ` (${failedCount} failed)` : ""} — auto-refreshing...
            </span>
          </div>
          <button
            type="button"
            onClick={loadLeads}
            className="rounded border border-[#0078D4] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#0078D4] hover:bg-[#DEECF9]"
          >
            Refresh Now
          </button>
        </div>
      )}

      {statusMessage && (
        <div className="rounded border border-[#EDEBE9] bg-white px-4 py-2.5 text-xs font-semibold text-[#323130]">
          {statusMessage}
        </div>
      )}

      <div className="rounded border border-[#EDEBE9] bg-white">
        {/* Fluent Command Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDEBE9] px-4 py-2.5">
          <div className="text-xs font-semibold text-[#323130]">
            Ready Leads ({leads.length})
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busyAction !== null || selectedIds.size === 0}
              onClick={handleRemoveSelected}
              className="rounded border border-[#EDEBE9] bg-white px-3 py-1 text-xs font-semibold text-[#A4262C] hover:bg-[#FDE7E9] disabled:opacity-40"
            >
              {busyAction === "delete" ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
            </button>
            <button
              disabled={busyAction !== null || selectedIds.size === 0}
              onClick={() => handleSend(false)}
              className="rounded border border-[#8A8886] bg-white px-3 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1] disabled:opacity-40"
            >
              {busyAction === "send" ? "Queueing..." : `Send Selected (${selectedIds.size})`}
            </button>
            <button
              disabled={busyAction !== null || leads.length === 0}
              onClick={() => handleSend(true)}
              className="rounded bg-[#0078D4] px-3 py-1 text-xs font-semibold text-white hover:bg-[#106EBE] disabled:opacity-40"
            >
              {busyAction === "send" ? "Queueing..." : "Send All"}
            </button>
          </div>
        </div>

        {/* Mobile Stacked List */}
        <div className="divide-y divide-[#EDEBE9] md:hidden">
          {leads.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#605E5C]">
              No leads in NEW stage. Upload an Excel or CSV file above.
            </div>
          ) : (
            leads.map((lead) => {
              const rec = lead.email_record;
              const isProcessing = rec?.job_status === "processing";
              const isQueued = rec?.send_status === "queued";
              const isFailed = rec?.send_status === "failed";
              return (
                <div key={lead.id} className="space-y-2 p-3.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleOne(lead.id)}
                      />
                      <div>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-semibold text-[#0078D4] hover:underline"
                        >
                          {lead.practice_name}
                        </Link>
                        <p className="text-[#605E5C]">
                          {lead.contact_name ? `${lead.contact_name} — ` : ""}
                          {lead.email}
                        </p>
                      </div>
                    </label>
                    <span className="shrink-0 rounded-sm bg-[#F3F2F1] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#323130]">
                      {isProcessing
                        ? "Sending..."
                        : isQueued
                          ? "Queued"
                          : isFailed
                            ? "Failed"
                            : rec?.send_status || "draft"}
                    </span>
                  </div>
                  <p className="truncate text-[#323130]">{rec?.subject || "—"}</p>
                  {isFailed && rec?.last_error && (
                    <p className="text-[11px] text-[#A4262C]">{rec.last_error}</p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {isFailed && (
                      <button
                        onClick={() => handleSend(false, [lead.id])}
                        className="font-semibold text-[#107C10] hover:underline"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => setPreviewLead(lead)}
                      className="font-semibold text-[#0078D4] hover:underline"
                    >
                      Preview / Edit
                    </button>
                    <button
                      onClick={() => handleDeleteOne(lead.id)}
                      className="font-semibold text-[#A4262C] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EDEBE9] bg-[#FAF9F8] font-semibold uppercase text-[#605E5C]">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedIds.size === leads.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-3">Practice</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Email</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEBE9]">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[#605E5C]">
                    No leads in NEW stage. Upload an Excel or CSV file above.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const rec = lead.email_record;
                  const isProcessing = rec?.job_status === "processing";
                  const isQueued = rec?.send_status === "queued";
                  const isFailed = rec?.send_status === "failed";

                  return (
                    <tr key={lead.id} className="hover:bg-[#FAF9F8]">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleOne(lead.id)}
                        />
                      </td>
                      <td className="p-3 font-semibold text-[#323130]">
                        <Link href={`/leads/${lead.id}`} className="text-[#0078D4] hover:underline">
                          {lead.practice_name}
                        </Link>
                      </td>
                      <td className="p-3 text-[#605E5C]">{lead.contact_name || "—"}</td>
                      <td className="p-3 text-[#605E5C]">{lead.email}</td>
                      <td className="p-3 text-[#323130] max-w-xs truncate">
                        {rec?.subject || "—"}
                      </td>
                      <td className="p-3">
                        {isProcessing ? (
                          <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#EFF6FC] px-2 py-0.5 text-[11px] font-semibold text-[#0078D4]">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sending...
                          </span>
                        ) : isQueued ? (
                          <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#FFF4CE] px-2 py-0.5 text-[11px] font-semibold text-[#835B00]">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Queued
                            {rec?.scheduled_at
                              ? ` (${new Date(rec.scheduled_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })})`
                              : ""}
                          </span>
                        ) : isFailed ? (
                          <div className="space-y-0.5">
                            <span className="inline-block rounded-sm bg-[#FDE7E9] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#A4262C]">
                              Failed
                            </span>
                            {rec?.last_error && (
                              <p className="max-w-[200px] truncate text-[11px] text-[#A4262C]" title={rec.last_error}>
                                {rec.last_error}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="rounded-sm bg-[#F3F2F1] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#323130]">
                            {rec?.send_status || "draft"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-3">
                        {isFailed && (
                          <button
                            onClick={() => handleSend(false, [lead.id])}
                            className="font-semibold text-[#107C10] hover:underline"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => setPreviewLead(lead)}
                          className="font-semibold text-[#0078D4] hover:underline"
                        >
                          Preview / Edit
                        </button>
                        <button
                          onClick={() => handleDeleteOne(lead.id)}
                          className="font-semibold text-[#A4262C] hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewLead && (
        <EmailPreviewDialog
          lead={previewLead}
          onClose={() => setPreviewLead(null)}
          onSaved={loadLeads}
        />
      )}
    </div>
  );
}
