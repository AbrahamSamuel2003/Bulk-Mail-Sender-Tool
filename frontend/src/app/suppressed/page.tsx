"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface SuppressionItem {
  id: string;
  email: string;
  reason: string;
  notes: string | null;
  created_at: string | null;
}

export default function SuppressedPage() {
  const [items, setItems] = useState<SuppressionItem[]>([]);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    loadItems();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#323130]">Suppressed Recipients</h1>
        <p className="text-xs text-[#605E5C]">
          Global suppression list for bounced, unsubscribed, and manually blocked addresses across all campaigns
        </p>
      </div>

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
                <th className="p-3">Email</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Added</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEBE9]">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-[#605E5C]">
                    No suppressed emails found.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF9F8]">
                    <td className="p-3 font-semibold text-[#323130]">{item.email}</td>
                    <td className="p-3">
                      <span className="rounded-sm bg-[#FDE7E9] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#A4262C]">
                        {item.reason}
                      </span>
                    </td>
                    <td className="p-3 text-[#605E5C]">{item.notes || "—"}</td>
                    <td className="p-3 text-[#605E5C]">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-right">
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
    </div>
  );
}
