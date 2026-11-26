"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Campaign } from "@/lib/types";

export default function CampaignOverviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    apiFetch<Campaign>(`/campaigns/${campaignId}`).then(setCampaign).catch(() => {});
  }, [campaignId]);

  const stages = [
    { key: "new", label: "NEW", href: `/campaigns/${campaignId}/new` },
    { key: "follow_up_1", label: "FOLLOW-UP 1", href: `/campaigns/${campaignId}/follow-up-1` },
    { key: "follow_up_2", label: "FOLLOW-UP 2", href: `/campaigns/${campaignId}/follow-up-2` },
    { key: "follow_up_3", label: "FOLLOW-UP 3", href: `/campaigns/${campaignId}/follow-up-3` },
    { key: "completed", label: "COMPLETED", href: `/campaigns/${campaignId}/completed` },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-[#323130]">Campaign Stage Overview</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((st) => (
          <Link
            key={st.key}
            href={st.href}
            className="rounded border border-[#EDEBE9] bg-white p-4 hover:border-[#0078D4] transition-colors"
          >
            <p className="text-[11px] font-semibold text-[#605E5C]">{st.label}</p>
            <p className="mt-1.5 text-2xl font-semibold text-[#323130]">
              {campaign?.stage_counts?.[st.key] ?? 0}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
