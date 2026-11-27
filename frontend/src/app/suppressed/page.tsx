"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface SuppressionDetails {
  error?: string | null;
  practice_name?: string | null;
  contact_name?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  stage?: string | null;
  subject?: string | null;
  body?: string | null;
}

interface SuppressionItem {
  id: string;
  email: string;
  reason: string;
  notes: string | null;
  details?: SuppressionDetails | null;
  created_at: string | null;
}

export default function SuppressedPage() {
  const [items, setItems] = useState<SuppressionItem[]>([]);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<SuppressionItem | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadItems = useCallback(() => {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    apiFetch<SuppressionItem[]>(`/suppression${query}`).then(setItems).catch(() => {});
  }, [search]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setErrorMsg(null);
    try {
      await apiFetch("/suppression", {
        method: "POST",
        body: JSON.stringify({ email: newEmail.trim(), reason: "manual", notes }),
      });
      setNewEmail("");
      setNotes("");
      loadItems();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add email.");
    }
  }

  async function handleRemove(id: string) {
    await apiFetch(`/suppression/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    loadItems();
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // clipboard unavailable
    }
  }

  const failedCount = items.filter((i) => i.reason === "bounced").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#323130]">Suppressed Recipients</h1>
        <p className="text-xs text-[#605E5C]">
          Global suppression list for DNS-failed, bounced, unsubscribed, and manually blocked addresses
        </p>
      </div>

      {failedCount > 0 && (
        <div className="rounded border border-[#F2C811] bg-[#FFF4CE] px-4 py-2.5 text-xs text-[#835B00]">
          <strong>{failedCount}</strong> failed/bounced recipient(s) moved here with full lead &amp; message details so you can review or send manually from Zoho Mail.
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 rounded border border-[#EDEBE9] bg-white p-4"
      >
        {errorMsg && (
          <div className="w-full rounded border border-[#F1707B] bg-[#FDE7E9] p-2.5 text-xs text-[#A4262C]">
            {errorMsg}
          </div>
        )}
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-semibold text-[#323130] mb-1">Email Address</label>
          <input
            required
            type="email"
            placeholder="person@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none sm:w-64"
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-semibold text-[#323130] mb-1">Notes</label>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none sm:w-64"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded bg-[#0078D4] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE] sm:w-auto"
        >
          Add to Suppression List
        </button>
      </form>

      <div className="rounded border border-[#EDEBE9] bg-white">
        <div className="border-b border-[#EDEBE9] px-4 py-2.5">
          <input
            type="text"
            placeholder="Search suppressed emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none sm:w-64 sm:py-1"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EDEBE9] bg-[#FAF9F8] font-semibold uppercase text-[#605E5C]">
              <tr>
                <th className="p-3">Practice / Contact</th>
                <th className="p-3">Email</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Error / Notes</th>
                <th className="p-3">Added</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEBE9]">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-[#605E5C]">
                    No suppressed emails found.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF9F8]">
                    <td className="p-3 text-[#323130]">
                      {item.details?.practice_name ? (
                        <div>
                          <div className="font-semibold">{item.details.practice_name}</div>
                          {item.details.contact_name && (
                            <div className="text-[11px] text-[#605E5C]">
                              {item.details.contact_name}
                            </div>
                          )}
                          {item.details.campaign_name && (
                            <div className="text-[11px] text-[#0078D4]">
                              {item.details.campaign_name}
                              {item.details.stage ? ` (${item.details.stage})` : ""}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#605E5C]">—</span>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-[#323130]">{item.email}</td>
                    <td className="p-3">
                      <span className="rounded-sm bg-[#FDE7E9] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#A4262C]">
                        {item.reason}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs text-[#605E5C] break-words">
                      {item.notes || "—"}
                    </td>
                    <td className="p-3 text-[#605E5C]">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-right space-x-3 whitespace-nowrap">
                      {item.details && (
                        <button
                          onClick={() => setSelected(item)}
                          className="font-semibold text-[#0078D4] hover:underline"
                        >
                          View &amp; Copy
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="font-semibold text-[#A4262C] hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded border border-[#EDEBE9] bg-white p-5 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-[#EDEBE9] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#323130]">
                  {selected.details?.practice_name || selected.email}
                </h2>
                <p className="text-xs text-[#605E5C]">
                  {selected.details?.contact_name ? `${selected.details.contact_name} • ` : ""}
                  {selected.details?.campaign_name || "Manual / Suppressed"}
                  {selected.details?.stage ? ` • ${selected.details.stage}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded border border-[#8A8886] px-2.5 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
              >
                Close
              </button>
            </div>

            {selected.notes && (
              <div className="rounded border border-[#F1707B] bg-[#FDE7E9] p-3 text-xs text-[#A4262C]">
                <strong>Failure Reason:</strong> {selected.notes}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 rounded border border-[#EDEBE9] bg-[#FAF9F8] p-2.5">
                <div className="min-w-0">
                  <span className="font-semibold text-[#605E5C]">To: </span>
                  <span className="font-semibold text-[#323130] break-all">{selected.email}</span>
                </div>
                <button
                  onClick={() => copyText("email", selected.email)}
                  className="shrink-0 rounded bg-[#0078D4] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#106EBE]"
                >
                  {copiedField === "email" ? "Copied!" : "Copy Email"}
                </button>
              </div>

              {selected.details?.subject && (
                <div className="flex items-center justify-between gap-2 rounded border border-[#EDEBE9] bg-[#FAF9F8] p-2.5">
                  <div className="min-w-0">
                    <span className="font-semibold text-[#605E5C]">Subject: </span>
                    <span className="text-[#323130] break-words">{selected.details.subject}</span>
                  </div>
                  <button
                    onClick={() => copyText("subject", selected.details?.subject || "")}
                    className="shrink-0 rounded border border-[#8A8886] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#323130] hover:bg-[#F3F2F1]"
                  >
                    {copiedField === "subject" ? "Copied!" : "Copy Subject"}
                  </button>
                </div>
              )}

              {selected.details?.body && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#605E5C]">Message Body</span>
                    <button
                      onClick={() => copyText("body", selected.details?.body || "")}
                      className="rounded border border-[#8A8886] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#323130] hover:bg-[#F3F2F1]"
                    >
                      {copiedField === "body" ? "Copied!" : "Copy Body"}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded border border-[#EDEBE9] bg-[#FAF9F8] p-3 font-sans text-xs text-[#323130]">
                    {selected.details.body}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
