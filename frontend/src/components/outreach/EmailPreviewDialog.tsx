"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { LeadItem } from "@/lib/types";

export function EmailPreviewDialog({
  lead,
  onClose,
  onSaved,
}: {
  lead: LeadItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(lead.email_record?.subject || "");
  const [body, setBody] = useState(lead.email_record?.body || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!lead.email_record) return;
    setSaving(true);
    try {
      await apiFetch(`/email-records/${lead.email_record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ subject, body }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded border border-[#EDEBE9] bg-white shadow-lg overflow-hidden">
        <div className="flex items-start justify-between border-b border-[#EDEBE9] bg-[#F3F2F1] px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[#323130]">
              Preview &amp; Edit Email — {lead.practice_name}
            </h3>
            <p className="text-xs text-[#605E5C]">
              To: {lead.contact_name ? `${lead.contact_name} <${lead.email}>` : lead.email}
            </p>
          </div>
          <button onClick={onClose} className="text-xs font-semibold text-[#605E5C] hover:text-[#323130]">
            Close
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="block text-xs font-semibold text-[#323130] mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-sm text-[#323130] focus:border-[#0078D4] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#323130] mb-1">Email Body</label>
            <textarea
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded border border-[#8A8886] px-3 py-2 text-sm text-[#323130] focus:border-[#0078D4] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#EDEBE9] bg-[#FAF9F8] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded border border-[#8A8886] bg-white px-4 py-1.5 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={handleSave}
            className="rounded bg-[#0078D4] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
