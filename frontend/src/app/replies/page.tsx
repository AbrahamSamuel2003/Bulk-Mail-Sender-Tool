"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface ReplyItem {
  id: string;
  lead_id: string;
  campaign_id: string;
  campaign_name: string;
  practice_name: string;
  contact_name: string | null;
  lead_email: string;
  lead_status: string;
  current_stage: string;
  sender_email: string;
  subject: string | null;
  body: string | null;
  received_at: string;
}

export default function RepliesInboxPage() {
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadReplies = useCallback(() => {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    apiFetch<ReplyItem[]>(`/replies${query}`)
      .then((rows) => {
        setReplies(rows);
        if (rows.length > 0 && !rows.some((r) => r.id === selectedId)) {
          setSelectedId(rows[0].id);
        }
      })
      .catch(() => {});
  }, [search, selectedId]);

  useEffect(() => {
    loadReplies();
  }, [loadReplies]);

  const selected = replies.find((r) => r.id === selectedId) || null;

  async function handleSuppress(leadId: string) {
    await apiFetch(`/leads/${leadId}/unsubscribe`, { method: "POST" });
    setActionMsg("Lead marked unsubscribed and added to Suppressed Recipients.");
    loadReplies();
    setTimeout(() => setActionMsg(null), 3000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#323130]">Lead Replies Inbox</h1>
          <p className="text-xs text-[#605E5C]">
            Review all incoming replies from leads and manually decide next steps or suppressions
          </p>
        </div>
        <input
          type="text"
          placeholder="Search practice, email, subject, or message..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-[#8A8886] bg-white px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none sm:w-72"
        />
      </div>

      {actionMsg && (
        <div className="rounded border border-[#A7E3A5] bg-[#DFF6DD] px-4 py-2 text-xs font-semibold text-[#107C10]">
          {actionMsg}
        </div>
      )}

      <div className="grid grid-cols-1 overflow-hidden rounded border border-[#EDEBE9] bg-white lg:grid-cols-12 min-h-[480px]">
        {/* Left List */}
        <div
          className={`border-b border-[#EDEBE9] lg:col-span-5 lg:block lg:border-b-0 lg:border-r ${
            selected ? "hidden lg:block" : "block"
          }`}
        >
          <div className="border-b border-[#EDEBE9] bg-[#FAF9F8] px-4 py-2 text-[11px] font-semibold uppercase text-[#605E5C]">
            All Replies ({replies.length})
          </div>
          {replies.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#605E5C]">
              No lead replies received yet.
            </div>
          ) : (
            <div className="divide-y divide-[#EDEBE9] max-h-[540px] overflow-y-auto">
              {replies.map((rep) => {
                const isSelected = rep.id === selectedId;
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => setSelectedId(rep.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      isSelected ? "bg-[#EFF6FC]" : "hover:bg-[#FAF9F8]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-[#323130]">
                        {rep.practice_name}
                      </span>
                      <span className="shrink-0 text-[11px] text-[#605E5C]">
                        {new Date(rep.received_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-[#605E5C]">{rep.sender_email}</p>
                    <p className="mt-1 truncate text-xs font-medium text-[#323130]">
                      {rep.subject || "(No Subject)"}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#605E5C]">
                      {rep.body || "—"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Reading Pane */}
        <div
          className={`lg:col-span-7 flex flex-col ${
            selected ? "flex" : "hidden lg:flex"
          }`}
        >
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-xs text-[#605E5C]">
              Select a reply from the left to read the full message.
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="border-b border-[#EDEBE9] bg-[#F3F2F1] px-4 py-2 lg:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-xs font-semibold text-[#0078D4] hover:underline"
                >
                  ← Back to Replies
                </button>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EDEBE9] bg-[#FAF9F8] px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-[#323130]">
                    {selected.subject || "(No Subject)"}
                  </h2>
                  <p className="mt-0.5 text-xs text-[#605E5C]">
                    From: <strong>{selected.practice_name}</strong> ({selected.sender_email})
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#605E5C]">
                    Campaign: {selected.campaign_name} | Received:{" "}
                    {new Date(selected.received_at).toLocaleString()} | Status:{" "}
                    <strong className="uppercase">{selected.lead_status}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/leads/${selected.lead_id}`}
                    className="rounded border border-[#8A8886] bg-white px-3 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
                  >
                    Full Email History
                  </Link>
                  {selected.lead_status !== "unsubscribed" && (
                    <button
                      onClick={() => handleSuppress(selected.lead_id)}
                      className="rounded border border-[#F1707B] bg-[#FDE7E9] px-3 py-1 text-xs font-semibold text-[#A4262C] hover:bg-[#FBD0D4]"
                    >
                      Suppress / Unsubscribe
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#323130]">
                  {selected.body || "(Empty message body)"}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

