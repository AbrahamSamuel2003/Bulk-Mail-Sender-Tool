"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { LeadItem, PaginatedLeads } from "@/lib/types";

export default function CompletedPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const [leads, setLeads] = useState<LeadItem[]>([]);

  useEffect(() => {
    apiFetch<PaginatedLeads>(`/campaigns/${campaignId}/leads?stage=completed`)
      .then((res) => setLeads(res.items))
      .catch(() => {});
  }, [campaignId]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[#323130]">COMPLETED</h1>
      <div className="rounded border border-[#EDEBE9] bg-white overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#EDEBE9] bg-[#FAF9F8] font-semibold uppercase text-[#605E5C]">
            <tr>
              <th className="p-3">Practice</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Email</th>
              <th className="p-3">Last Sent</th>
              <th className="p-3 text-right">History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDEBE9]">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-xs text-[#605E5C]">
                  No completed leads yet.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-[#FAF9F8]">
                  <td className="p-3 font-semibold text-[#323130]">{lead.practice_name}</td>
                  <td className="p-3 text-[#605E5C]">{lead.contact_name || "—"}</td>
                  <td className="p-3 text-[#605E5C]">{lead.email}</td>
                  <td className="p-3 text-[#605E5C]">
                    {lead.last_sent_at ? new Date(lead.last_sent_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-[#0078D4] hover:underline">
                      View History
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
