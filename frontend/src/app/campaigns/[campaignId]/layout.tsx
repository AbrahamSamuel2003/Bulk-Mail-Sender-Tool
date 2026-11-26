"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Campaign } from "@/lib/types";

export default function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const pathname = usePathname();
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const loadCampaign = useCallback(async () => {
    try {
      const data = await apiFetch<Campaign>(`/campaigns/${campaignId}`);
      setCampaign(data);
    } catch {
      // ignore if backend offline
    }
  }, [campaignId]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  async function handleAction(action: "pause" | "resume" | "archive") {
    await apiFetch(`/campaigns/${campaignId}/${action}`, { method: "POST" });
    loadCampaign();
  }

  const stageTabs = [
    { href: `/campaigns/${campaignId}`, label: "Overview" },
    { href: `/campaigns/${campaignId}/new`, label: "NEW" },
    { href: `/campaigns/${campaignId}/follow-up-1`, label: "FOLLOW-UP 1" },
    { href: `/campaigns/${campaignId}/follow-up-2`, label: "FOLLOW-UP 2" },
    { href: `/campaigns/${campaignId}/follow-up-3`, label: "FOLLOW-UP 3" },
    { href: `/campaigns/${campaignId}/completed`, label: "COMPLETED" },
    { href: `/campaigns/${campaignId}/replied`, label: "REPLIED" },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded border border-[#EDEBE9] bg-white">
        {campaign && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EDEBE9] px-5 py-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-[#323130]">{campaign.name}</h2>
                <span className="rounded-sm bg-[#F3F2F1] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#323130]">
                  {campaign.status}
                </span>
              </div>
              <p className="text-xs text-[#605E5C]">Timezone: {campaign.timezone}</p>
            </div>
            <div className="flex gap-2">
              {campaign.status === "active" && (
                <button
                  onClick={() => handleAction("pause")}
                  className="rounded border border-[#8A8886] bg-white px-3 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
                >
                  Pause Campaign
                </button>
              )}
              {campaign.status === "paused" && (
                <button
                  onClick={() => handleAction("resume")}
                  className="rounded bg-[#0078D4] px-3 py-1 text-xs font-semibold text-white hover:bg-[#106EBE]"
                >
                  Resume Campaign
                </button>
              )}
              {campaign.status !== "archived" && (
                <button
                  onClick={() => handleAction("archive")}
                  className="rounded border border-[#8A8886] bg-white px-3 py-1 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top Campaign Stage Navigation (Scrollable on mobile, 7-col Fluent Pivot on desktop) */}
        <nav className="flex overflow-x-auto divide-x divide-[#F3F2F1] lg:grid lg:grid-cols-7">
          {stageTabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative shrink-0 whitespace-nowrap px-4 py-2.5 text-center text-xs transition-colors lg:px-3 ${
                  active
                    ? "bg-[#FAF9F8] font-semibold text-[#0078D4]"
                    : "font-normal text-[#605E5C] hover:bg-[#FAF9F8] hover:text-[#323130]"
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#0078D4]" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
