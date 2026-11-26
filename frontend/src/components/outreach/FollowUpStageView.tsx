"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { DateFilterBar, DateFilterState } from "@/components/outreach/DateFilterBar";
import { EmailPreviewDialog } from "@/components/outreach/EmailPreviewDialog";
import { apiFetch } from "@/lib/api-client";
import { Campaign, LeadItem, PaginatedLeads } from "@/lib/types";

interface ProgressModalState {
  open: boolean;
  title: string;
  running: boolean;
  details: string[];
  errors: string[];
  canSendEarly?: boolean;
  lastSendAll?: boolean;
}

export function FollowUpStageView({
  campaignId,
  stage,
  title,
  description,
}: {
  campaignId: string;
  stage: "follow_up_1" | "follow_up_2" | "follow_up_3";
  title: string;
  description: string;
}) {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [campaignTimezone, setCampaignTimezone] = useState<string>("America/New_York");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewLead, setPreviewLead] = useState<LeadItem | null>(null);
  const [ignoreDueDate, setIgnoreDueDate] = useState<boolean>(false);
  const [filters, setFilters] = useState<DateFilterState>({
    dateFilter: "all",
    startDate: "",
    endDate: "",
    search: "",
  });
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ProgressModalState>({
    open: false,
    title: "",
    running: false,
    details: [],
    errors: [],
  });

  useEffect(() => {
    apiFetch<Campaign>(`/campaigns/${campaignId}`)
      .then((c) => setCampaignTimezone(c.timezone || "America/New_York"))
      .catch(() => {});
  }, [campaignId]);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams({ stage, status: "active" });
    if (filters.dateFilter !== "all") params.set("date_filter", filters.dateFilter);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    if (filters.search.trim()) params.set("search", filters.search.trim());

    try {
      const data = await apiFetch<PaginatedLeads>(
        `/campaigns/${campaignId}/leads?${params.toString()}`,
        { skipCache: true }
      );
      setLeads(data.items);
    } catch {
      // ignore if backend offline
    }
  }, [campaignId, stage, filters]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const queuedCount = leads.filter(
    (l) => l.email_record?.send_status === "queued" || l.email_record?.job_status === "processing"
  ).length;

  useEffect(() => {
    if (queuedCount === 0) return;
    const timer = setInterval(loadLeads, 3000);
    return () => clearInterval(timer);
  }, [queuedCount, loadLeads]);

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleGenerate(generateAll: boolean) {
    setBusy(true);
    setModal({
      open: true,
      title: "Generating AI Follow-Up Drafts",
      running: true,
      details: ["Analyzing prior emails and generating concise follow-ups..."],
      errors: [],
    });
    try {
      const res = await apiFetch<{
        generated_count: number;
        errors: { email: string; error: string }[];
        ai_quota_exhausted?: boolean;
      }>(`/campaigns/${campaignId}/followups/generate`, {
        method: "POST",
        body: JSON.stringify({
          stage,
          lead_ids: generateAll ? null : Array.from(selectedIds),
          generate_all: generateAll,
        }),
      });
      const details = [
        `Generated ${res.generated_count} AI follow-up draft(s).`,
        "Review any draft with Preview / Edit before sending.",
      ];
      if (res.ai_quota_exhausted) {
        details.push("Warning: All AI keys hit their token limit. Check Settings.");
      }
      setModal({
        open: true,
        title: "AI Generation Complete",
        running: false,
        details,
        errors: res.errors.map((e) => `${e.email}: ${e.error}`),
      });
      loadLeads();
    } catch (err) {
      setModal({
        open: true,
        title: "AI Generation Error",
        running: false,
        details: [],
        errors: [err instanceof Error ? err.message : "Failed to generate drafts."],
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(sendAllEligible: boolean, forceEarly = ignoreDueDate) {
    setBusy(true);
    setModal({
      open: true,
      title: "Generating & Sending Follow-Up Emails",
      running: true,
      details: [
        "1. Checking eligibility and generating any missing AI follow-up drafts...",
        "2. Queueing emails for controlled delivery...",
      ],
      errors: [],
    });
    try {
      const res = await apiFetch<{
        generated_count: number;
        queued_count: number;
        skipped_not_due: number;
        skipped_suppressed: number;
        skipped_other: number;
        errors: { email: string; error: string }[];
        ai_quota_exhausted?: boolean;
      }>(`/campaigns/${campaignId}/send`, {
        method: "POST",
        body: JSON.stringify({
          stage,
          lead_ids: sendAllEligible ? null : Array.from(selectedIds),
          send_all_eligible: sendAllEligible,
          auto_generate: true,
          ignore_due_date: forceEarly,
        }),
      });

      const details = [
        `AI Drafts Generated: ${res.generated_count}`,
        `Emails Queued for Sending: ${res.queued_count}`,
      ];
      if (res.skipped_not_due > 0) {
        details.push(
          `Skipped (Not Yet Due): ${res.skipped_not_due} — enable "Include Upcoming (Send Early)" or click Send Anyway below.`
        );
      }
      if (res.skipped_suppressed > 0) {
        details.push(`Skipped (Suppressed): ${res.skipped_suppressed}`);
      }
      if (res.ai_quota_exhausted) {
        details.push("Warning: All AI keys exhausted tokens. Check Settings.");
      }

      setModal({
        open: true,
        title: res.queued_count > 0 ? "Emails Queued for Sending" : "No Emails Queued",
        running: false,
        details,
        errors: res.errors.map((e) => `${e.email}: ${e.error}`),
        canSendEarly: res.skipped_not_due > 0 && res.queued_count === 0,
        lastSendAll: sendAllEligible,
      });
      if (res.queued_count > 0) {
        setSelectedIds(new Set());
      }
      loadLeads();
    } catch (err) {
      setModal({
        open: true,
        title: "Send Failed",
        running: false,
        details: [],
        errors: [err instanceof Error ? err.message : "Failed to queue follow-up emails."],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#323130]">{title}</h1>
        <p className="text-xs text-[#605E5C]">{description}</p>
      </div>

      <DateFilterBar
        value={filters}
        campaignTimezone={campaignTimezone}
        onChange={setFilters}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-[#EDEBE9] bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-semibold text-[#605E5C]">Showing</p>
          <p className="text-lg font-semibold text-[#323130]">{leads.length}</p>
        </div>
        <div className="rounded border border-[#EDEBE9] bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-semibold text-[#605E5C]">Due / Eligible</p>
          <p className="text-lg font-semibold text-[#107C10]">
            {leads.filter((l) => l.is_eligible).length}
          </p>
        </div>
        <div className="rounded border border-[#EDEBE9] bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-semibold text-[#605E5C]">Upcoming</p>
          <p className="text-lg font-semibold text-[#835B00]">
            {leads.filter((l) => !l.is_eligible).length}
          </p>
        </div>
        <div className="rounded border border-[#EDEBE9] bg-white px-3.5 py-2.5">
          <p className="text-[11px] font-semibold text-[#605E5C]">Draft Ready</p>
          <p className="text-lg font-semibold text-[#0078D4]">
            {leads.filter((l) => Boolean(l.email_record?.body?.trim())).length}
          </p>
        </div>
      </div>

      {queuedCount > 0 && (
        <div className="flex items-center gap-2.5 rounded border border-[#C7E0F4] bg-[#EFF6FC] px-4 py-2.5 text-xs font-semibold text-[#004578]">
          <Loader2 className="h-4 w-4 animate-spin text-[#0078D4]" />
          <span>Sending {queuedCount} follow-up(s) in background — auto-refreshing...</span>
        </div>
      )}

      <div className="rounded border border-[#EDEBE9] bg-white">
        {/* Fluent Command Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDEBE9] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set(leads.map((l) => l.id)))}
              className="rounded border border-[#8A8886] bg-white px-2.5 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded border border-[#8A8886] bg-white px-2.5 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
            >
              Deselect All
            </button>
            <span className="text-xs text-[#605E5C]">
              {selectedIds.size} of {leads.length} selected
            </span>
            <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#8A8886] bg-[#FAF9F8] px-2.5 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]">
              <input
                type="checkbox"
                checked={ignoreDueDate}
                onChange={(e) => setIgnoreDueDate(e.target.checked)}
              />
              Include Upcoming (Send Early)
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || selectedIds.size === 0}
              onClick={() => handleGenerate(false)}
              className="rounded border border-[#8A8886] bg-white px-3 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1] disabled:opacity-40"
            >
              Generate Selected (AI)
            </button>
            <button
              disabled={busy || leads.length === 0}
              onClick={() => handleGenerate(true)}
              className="rounded border border-[#0078D4] bg-[#EFF6FC] px-3 py-1 text-xs font-semibold text-[#0078D4] hover:bg-[#DEECF9] disabled:opacity-40"
            >
              Generate All (AI)
            </button>
            <button
              disabled={busy || selectedIds.size === 0}
              onClick={() => handleSend(false)}
              className="rounded border border-[#8A8886] bg-white px-3 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1] disabled:opacity-40"
            >
              Send Selected
            </button>
            <button
              disabled={busy || leads.length === 0}
              onClick={() => handleSend(true)}
              className="rounded bg-[#0078D4] px-3 py-1 text-xs font-semibold text-white hover:bg-[#106EBE] disabled:opacity-40"
            >
              Send All Eligible
            </button>
          </div>
        </div>

        {/* Mobile Stacked List */}
        <div className="divide-y divide-[#EDEBE9] md:hidden">
          {leads.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#605E5C]">
              No leads in this stage matching your filters.
            </div>
          ) : (
            leads.map((lead) => {
              const rec = lead.email_record;
              const isSending = rec?.send_status === "queued" || rec?.job_status === "processing";
              const isFailed = rec?.send_status === "failed";
              const hasDraft = Boolean(rec?.body?.trim());

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
                    <span
                      className={`shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
                        lead.is_eligible
                          ? "bg-[#DFF6DD] text-[#107C10]"
                          : "bg-[#FFF4CE] text-[#835B00]"
                      }`}
                    >
                      {lead.is_eligible ? "Due" : "Upcoming"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#605E5C]">
                    <span>
                      Prev:{" "}
                      {lead.last_sent_at ? new Date(lead.last_sent_at).toLocaleDateString() : "—"}
                    </span>
                    <span>
                      Due:{" "}
                      {lead.next_followup_due_at
                        ? new Date(lead.next_followup_due_at).toLocaleDateString()
                        : "—"}
                    </span>
                    {isSending && <span className="font-semibold text-[#0078D4]">Queued</span>}
                    {isFailed && <span className="font-semibold text-[#A4262C]">Failed</span>}
                  </div>

                  {isFailed && rec?.last_error && (
                    <p className="text-[11px] text-[#A4262C]">{rec.last_error}</p>
                  )}

                  <div>
                    {hasDraft ? (
                      <button
                        onClick={() => setPreviewLead(lead)}
                        className="font-semibold text-[#0078D4] hover:underline"
                      >
                        Preview / Edit
                      </button>
                    ) : (
                      <span className="text-[#A19F9D]">Auto-generates on Send</span>
                    )}
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
                    onChange={() =>
                      setSelectedIds(
                        selectedIds.size === leads.length
                          ? new Set()
                          : new Set(leads.map((l) => l.id))
                      )
                    }
                  />
                </th>
                <th className="p-3">Practice</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Email</th>
                <th className="p-3">Prev Sent</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Eligibility &amp; Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEBE9]">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-[#605E5C]">
                    No leads in this stage matching your filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const rec = lead.email_record;
                  const isSending = rec?.send_status === "queued" || rec?.job_status === "processing";
                  const isFailed = rec?.send_status === "failed";
                  const hasDraft = Boolean(rec?.body?.trim());

                  return (
                    <tr key={lead.id} className="hover:bg-[#FAF9F8]">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleOne(lead.id)}
                        />
                      </td>
                      <td className="p-3 font-semibold">
                        <Link href={`/leads/${lead.id}`} className="text-[#0078D4] hover:underline">
                          {lead.practice_name}
                        </Link>
                      </td>
                      <td className="p-3 text-[#605E5C]">{lead.contact_name || "—"}</td>
                      <td className="p-3 text-[#605E5C]">{lead.email}</td>
                      <td className="p-3 text-[#605E5C]">
                        {lead.last_sent_at ? new Date(lead.last_sent_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-[#605E5C]">
                        {lead.next_followup_due_at
                          ? new Date(lead.next_followup_due_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="p-3 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
                              lead.is_eligible
                                ? "bg-[#DFF6DD] text-[#107C10]"
                                : "bg-[#FFF4CE] text-[#835B00]"
                            }`}
                          >
                            {lead.is_eligible ? "Due" : "Upcoming"}
                          </span>
                          {isSending && (
                            <span className="inline-flex items-center gap-1 rounded-sm bg-[#EFF6FC] px-2 py-0.5 text-[11px] font-semibold text-[#0078D4]">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Queued
                            </span>
                          )}
                          {isFailed && (
                            <span className="rounded-sm bg-[#FDE7E9] px-2 py-0.5 text-[11px] font-semibold text-[#A4262C]">
                              Failed
                            </span>
                          )}
                        </div>
                        {isFailed && rec?.last_error && (
                          <p className="max-w-[180px] truncate text-[11px] text-[#A4262C]" title={rec.last_error}>
                            {rec.last_error}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {hasDraft ? (
                          <button
                            onClick={() => setPreviewLead(lead)}
                            className="font-semibold text-[#0078D4] hover:underline"
                          >
                            Preview / Edit
                          </button>
                        ) : (
                          <span className="text-[#A19F9D]">Auto-generates on Send</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Centered Fluent 2 Progress Popup with X */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded border border-[#EDEBE9] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#EDEBE9] bg-[#F3F2F1] px-4 py-2.5">
              <h3 className="text-sm font-semibold text-[#323130]">{modal.title}</h3>
              <button
                type="button"
                aria-label="Close popup"
                onClick={() => setModal((m) => ({ ...m, open: false }))}
                className="rounded p-1 text-[#605E5C] hover:bg-[#E1DFDD] hover:text-[#323130]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 text-xs text-[#323130]">
              {modal.running && (
                <div className="flex items-center gap-2.5 font-semibold text-[#0078D4]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing request...</span>
                </div>
              )}

              {modal.details.length > 0 && (
                <ul className="space-y-1.5">
                  {modal.details.map((line, idx) => (
                    <li key={idx} className="text-[#323130]">
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              {modal.errors.length > 0 && (
                <div className="rounded border border-[#F1707B] bg-[#FDE7E9] p-3 text-[#A4262C] space-y-1 max-h-40 overflow-y-auto">
                  <p className="font-semibold">Errors:</p>
                  {modal.errors.map((err, idx) => (
                    <p key={idx}>{err}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#EDEBE9] bg-[#FAF9F8] px-4 py-2.5">
              {modal.canSendEarly && (
                <button
                  type="button"
                  onClick={() => {
                    setIgnoreDueDate(true);
                    handleSend(Boolean(modal.lastSendAll), true);
                  }}
                  className="rounded border border-[#0078D4] bg-[#EFF6FC] px-3 py-1.5 text-xs font-semibold text-[#0078D4] hover:bg-[#DEECF9]"
                >
                  Send Anyway (Include Upcoming)
                </button>
              )}
              <button
                type="button"
                onClick={() => setModal((m) => ({ ...m, open: false }))}
                className="rounded bg-[#0078D4] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
