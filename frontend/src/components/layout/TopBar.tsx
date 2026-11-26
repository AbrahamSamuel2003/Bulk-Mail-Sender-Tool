"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, LayoutGrid, Menu } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface QueueStatus {
  global_queue_paused: boolean;
  pending_jobs: number;
  sent_today: number;
  daily_sending_limit: number;
  within_sending_window: boolean;
  ai_quota_exhausted?: boolean;
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const [status, setStatus] = useState<QueueStatus | null>(null);

  const loadStatus = useCallback(() => {
    apiFetch<QueueStatus>("/sending/status").then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 10000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  async function toggleQueue() {
    if (!status) return;
    const action = status.global_queue_paused ? "resume" : "pause";
    await apiFetch(`/sending/${action}`, { method: "POST" });
    loadStatus();
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-[#0078D4] px-3 text-white sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open Navigation"
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded text-white hover:bg-white/15 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <LayoutGrid className="hidden h-4 w-4 shrink-0 text-white/90 sm:block" />
        <span className="truncate text-sm font-semibold tracking-tight">
          SS40 Email Outreach
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {status?.ai_quota_exhausted && (
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 rounded-sm bg-[#FDE7E9] px-2 py-0.5 text-[11px] font-semibold text-[#A4262C] hover:bg-[#FBD0D4]"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">AI Tokens Exhausted — Check Settings</span>
            <span className="sm:hidden">AI Quota</span>
          </Link>
        )}

        <span
          className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold sm:text-xs ${
            status?.global_queue_paused
              ? "bg-[#FFF4CE] text-[#835B00]"
              : "bg-[#DFF6DD] text-[#107C10]"
          }`}
        >
          {status?.global_queue_paused ? "Paused" : "Active"}
        </span>

        {status && (
          <div className="hidden items-center gap-3 text-xs text-white/90 md:flex">
            <span>
              Sent Today: <strong>{status.sent_today}</strong> / {status.daily_sending_limit}
            </span>
            <span className="text-white/50">|</span>
            <span>
              Pending: <strong>{status.pending_jobs}</strong>
            </span>
          </div>
        )}

        {status && (
          <button
            onClick={toggleQueue}
            className="rounded border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20 sm:px-2.5 sm:text-xs"
          >
            <span className="hidden sm:inline">
              {status.global_queue_paused ? "Resume Queue" : "Pause Queue"}
            </span>
            <span className="sm:hidden">
              {status.global_queue_paused ? "Resume" : "Pause"}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
