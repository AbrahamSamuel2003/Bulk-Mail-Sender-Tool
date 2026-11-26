"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DateFilterBar, DateFilterState } from "@/components/outreach/DateFilterBar";
import { apiFetch } from "@/lib/api-client";
import { Campaign } from "@/lib/types";

interface HistorySummary {
  total_sent: number;
  initial_sent: number;
  fu1_sent: number;
  fu2_sent: number;
  fu3_sent: number;
  failed_count: number;
  replies_count: number;
}

interface HistoryItem {
  id: string;
  lead_id: string;
  campaign_id: string;
  campaign_name: string;
  practice_name: string;
  contact_name: string | null;
  email: string;
  stage: string;
  subject: string;
  send_status: string;
  ai_generated: boolean;
  sent_at: string | null;
}

interface HistoryResponse {
  summary: HistorySummary;
  items: HistoryItem[];
  total: number;
}

const HISTORY_DATE_OPTIONS = [
  { value: "all", label: "All Sent" },
  { value: "sent_date", label: "By Sent Date" },
  { value: "custom_range", label: "Custom Range" },
];

export default function EmailHistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [stage, setStage] = useState("");
  const [filters, setFilters] = useState<DateFilterState>({
    dateFilter: "all",
    startDate: "",
    endDate: "",
    search: "",
  });

  useEffect(() => {
    apiFetch<Campaign[]>("/campaigns").then(setCampaigns).catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    if (stage) params.set("stage", stage);
    if (filters.dateFilter !== "all") params.set("date_filter", filters.dateFilter);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    if (filters.search.trim()) params.set("search", filters.search.trim());

    apiFetch<HistoryResponse>(`/history?${params.toString()}`)
      .then(setData)
      .catch(() => {});
  }, [campaignId, stage, filters]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const s = data?.summary;
  const summaryCards = [
    { label: "Total Sent", value: s?.total_sent ?? 0, color: "text-[#0078D4]" },
    { label: "Initial Sent", value: s?.initial_sent ?? 0, color: "text-[#323130]" },
    { label: "Follow-Up 1", value: s?.fu1_sent ?? 0, color: "text-[#323130]" },
    { label: "Follow-Up 2", value: s?.fu2_sent ?? 0, color: "text-[#323130]" },
    { label: "Follow-Up 3", value: s?.fu3_sent ?? 0, color: "text-[#323130]" },
    { label: "Replies", value: s?.replies_count ?? 0, color: "text-[#107C10]" },
    { label: "Failed", value: s?.failed_count ?? 0, color: "text-[#A4262C]" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#323130]">Email History</h1>
          <p className="text-xs text-[#605E5C]">
            Complete log of initial emails, follow-ups sent, replies, and failures across campaigns
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="rounded border border-[#8A8886] bg-white px-3 py-1.5 text-xs font-semibold text-[#323130] focus:border-[#0078D4] focus:outline-none"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="rounded border border-[#8A8886] bg-white px-3 py-1.5 text-xs font-semibold text-[#323130] focus:border-[#0078D4] focus:outline-none"
          >
            <option value="">All Stages</option>
            <option value="initial">Initial</option>
            <option value="follow_up_1">Follow-Up 1</option>
            <option value="follow_up_2">Follow-Up 2</option>
            <option value="follow_up_3">Follow-Up 3</option>
          </select>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded border border-[#EDEBE9] bg-white px-3.5 py-2.5">
            <p className="text-[11px] font-semibold text-[#605E5C]">{card.label}</p>
            <p className={`mt-1 text-lg font-semibold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <DateFilterBar
        value={filters}
        options={HISTORY_DATE_OPTIONS}
        onChange={setFilters}
      />

      <div className="rounded border border-[#EDEBE9] bg-white">
        <div className="border-b border-[#EDEBE9] px-4 py-2.5 text-xs font-semibold text-[#323130]">
          Sent &amp; Attempted Emails ({data?.total ?? 0})
        </div>

        {/* Mobile Stacked List */}
        <div className="divide-y divide-[#EDEBE9] md:hidden">
          {!data || data.items.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#605E5C]">
              No email history matching your filters.
            </div>
          ) : (
            data.items.map((item) => (
              <div key={item.id} className="space-y-1.5 p-3.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/leads/${item.lead_id}`}
                      className="font-semibold text-[#0078D4] hover:underline"
                    >
                      {item.practice_name}
                    </Link>
                    <p className="text-[#605E5C]">{item.email}</p>
                  </div>
                  <span className="rounded-sm bg-[#F3F2F1] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#323130]">
                    {item.stage}
                  </span>
                </div>
                <p className="truncate font-medium text-[#323130]">{item.subject}</p>
                <div className="flex items-center justify-between text-[11px] text-[#605E5C]">
                  <span>{item.campaign_name}</span>
                  <span>
                    {item.send_status.toUpperCase()}
                    {item.sent_at ? ` • ${new Date(item.sent_at).toLocaleString()}` : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EDEBE9] bg-[#FAF9F8] font-semibold uppercase text-[#605E5C]">
              <tr>
                <th className="p-3">Sent At</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Practice</th>
                <th className="p-3">Email</th>
                <th className="p-3">Stage</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Thread</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEBE9]">
              {!data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-[#605E5C]">
                    No email history matching your filters.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF9F8]">
                    <td className="p-3 whitespace-nowrap text-[#605E5C]">
                      {item.sent_at ? new Date(item.sent_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-3 text-[#605E5C]">{item.campaign_name}</td>
                    <td className="p-3 font-semibold text-[#323130]">{item.practice_name}</td>
                    <td className="p-3 text-[#605E5C]">{item.email}</td>
                    <td className="p-3 uppercase text-[#0078D4] font-semibold">
                      {item.stage}
                    </td>
                    <td className="p-3 max-w-xs truncate text-[#323130]">{item.subject}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase ${
                          item.send_status === "sent"
                            ? "bg-[#DFF6DD] text-[#107C10]"
                            : item.send_status === "failed"
                              ? "bg-[#FDE7E9] text-[#A4262C]"
                              : "bg-[#FFF4CE] text-[#835B00]"
                        }`}
                      >
                        {item.send_status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/leads/${item.lead_id}`}
                        className="font-semibold text-[#0078D4] hover:underline"
                      >
                        View
                      </Link>
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

