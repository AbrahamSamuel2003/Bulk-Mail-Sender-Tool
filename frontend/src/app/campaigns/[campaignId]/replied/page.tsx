"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface CampaignReplyItem {
  id: string;
  lead_id: string;
  practice_name: string;
  contact_name: string | null;
  sender_email: string;
  subject: string | null;
  body: string | null;
  lead_status: string;
  received_at: string;
}

export default function RepliedPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const [replies, setReplies] = useState<CampaignReplyItem[]>([]);

  useEffect(() => {
    apiFetch<CampaignReplyItem[]>(`/replies?campaign_id=${campaignId}`)
      .then(setReplies)
      .catch(() => {});
  }, [campaignId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#323130]">REPLIED</h1>
        <Link
          href="/replies"
          className="text-xs font-semibold text-[#0078D4] hover:underline"
        >
          Open All Replies Inbox
        </Link>
      </div>
      <div className="rounded border border-[#EDEBE9] bg-white overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#EDEBE9] bg-[#FAF9F8] font-semibold uppercase text-[#605E5C]">
            <tr>
              <th className="p-3">Practice</th>
              <th className="p-3">From</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Reply Preview</th>
              <th className="p-3">Received</th>
              <th className="p-3 text-right">History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDEBE9]">
            {replies.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-xs text-[#605E5C]">
                  No replies recorded yet.
                </td>
              </tr>
            ) : (
              replies.map((rep) => (
                <tr key={rep.id} className="hover:bg-[#FAF9F8]">
                  <td className="p-3 font-semibold text-[#323130]">{rep.practice_name}</td>
                  <td className="p-3 text-[#605E5C]">{rep.sender_email}</td>
                  <td className="p-3 font-medium text-[#323130]">
                    {rep.subject || "(No Subject)"}
                  </td>
                  <td className="p-3 text-[#605E5C] max-w-xs truncate">
                    {rep.body || "—"}
                  </td>
                  <td className="p-3 text-[#605E5C]">
                    {new Date(rep.received_at).toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/leads/${rep.lead_id}`}
                      className="font-semibold text-[#0078D4] hover:underline"
                    >
                      View Thread
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
