"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DailyActivityPoint,
  OutreachCharts,
  PipelinePoint,
} from "@/components/dashboard/OutreachCharts";
import { apiFetch } from "@/lib/api-client";

interface DashboardStats {
  total_campaigns: number;
  total_leads: number;
  initial_sent: number;
  followups_sent: number;
  due_today: number;
  overdue: number;
  awaiting_approval: number;
  failed_emails: number;
  replies_received: number;
  unsubscribed: number;
}

interface DashboardActivity {
  recent_campaigns: { id: string; name: string; status: string }[];
  recent_sends: { id: string; lead_id: string; stage: string; subject: string; sent_at: string | null }[];
  upcoming_followups: { id: string; practice_name: string; email: string; stage: string; due_at: string | null }[];
  recent_replies: { id: string; lead_id: string; sender_email: string; subject: string | null; received_at: string }[];
  recent_failures: { id: string; lead_id: string; stage: string; subject: string }[];
}

interface DashboardChartsData {
  daily_activity: DailyActivityPoint[];
  pipeline_breakdown: PipelinePoint[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [charts, setCharts] = useState<DashboardChartsData | null>(null);

  useEffect(() => {
    apiFetch<DashboardStats>("/dashboard/stats").then(setStats).catch(() => {});
    apiFetch<DashboardActivity>("/dashboard/activity").then(setActivity).catch(() => {});
    apiFetch<DashboardChartsData>("/dashboard/charts").then(setCharts).catch(() => {});
  }, []);

  const cards = [
    { label: "Total Campaigns", value: stats?.total_campaigns ?? 0 },
    { label: "Total Leads", value: stats?.total_leads ?? 0 },
    { label: "Initial Emails Sent", value: stats?.initial_sent ?? 0 },
    { label: "Follow-Ups Sent", value: stats?.followups_sent ?? 0 },
    { label: "Follow-Ups Due Today", value: stats?.due_today ?? 0 },
    { label: "Overdue Follow-Ups", value: stats?.overdue ?? 0 },
    { label: "Awaiting Approval", value: stats?.awaiting_approval ?? 0 },
    { label: "Failed Emails", value: stats?.failed_emails ?? 0 },
    { label: "Replies Received", value: stats?.replies_received ?? 0 },
    { label: "Suppressed / Opt-Out", value: stats?.unsubscribed ?? 0 },
  ];

  const defaultPipeline: PipelinePoint[] = [
    { key: "new", label: "NEW", count: 0, color: "#0078D4" },
    { key: "follow_up_1", label: "FOLLOW-UP 1", count: 0, color: "#2B88D8" },
    { key: "follow_up_2", label: "FOLLOW-UP 2", count: 0, color: "#71AFE5" },
    { key: "follow_up_3", label: "FOLLOW-UP 3", count: 0, color: "#005A9E" },
    { key: "completed", label: "COMPLETED", count: 0, color: "#605E5C" },
    { key: "replied", label: "REPLIED", count: 0, color: "#107C10" },
    { key: "suppressed", label: "SUPPRESSED", count: 0, color: "#A4262C" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#323130]">Outreach Dashboard</h1>
          <p className="text-xs text-[#605E5C]">
            Campaign performance, follow-up eligibility, sending volume, and replies
          </p>
        </div>
        <Link
          href="/campaigns"
          className="rounded bg-[#0078D4] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE]"
        >
          Manage Campaigns
        </Link>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded border border-[#EDEBE9] bg-white px-4 py-3"
          >
            <p className="text-[11px] font-semibold text-[#605E5C]">{card.label}</p>
            <p className="mt-1 text-xl font-semibold text-[#323130]">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Power BI / M365 Style Graphs */}
      <OutreachCharts
        dailyActivity={charts?.daily_activity ?? []}
        pipeline={charts?.pipeline_breakdown ?? defaultPipeline}
      />

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded border border-[#EDEBE9] bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#323130]">Recent Campaigns</h2>
          {!activity || activity.recent_campaigns.length === 0 ? (
            <p className="text-xs text-[#605E5C]">No campaigns created yet.</p>
          ) : (
            <ul className="divide-y divide-[#EDEBE9] text-xs">
              {activity.recent_campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <Link href={`/campaigns/${c.id}`} className="font-semibold text-[#0078D4] hover:underline">
                    {c.name}
                  </Link>
                  <span className="rounded-sm bg-[#F3F2F1] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#605E5C]">
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded border border-[#EDEBE9] bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#323130]">Upcoming Follow-Ups</h2>
          {!activity || activity.upcoming_followups.length === 0 ? (
            <p className="text-xs text-[#605E5C]">No upcoming follow-ups scheduled.</p>
          ) : (
            <ul className="divide-y divide-[#EDEBE9] text-xs">
              {activity.upcoming_followups.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2">
                  <Link href={`/leads/${u.id}`} className="font-semibold text-[#323130] hover:text-[#0078D4] hover:underline">
                    {u.practice_name} ({u.email})
                  </Link>
                  <span className="text-[#605E5C]">
                    {u.stage} ({u.due_at ? new Date(u.due_at).toLocaleDateString() : "—"})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
