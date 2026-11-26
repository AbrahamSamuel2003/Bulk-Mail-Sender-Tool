import { FollowUpStageView } from "@/components/outreach/FollowUpStageView";

export default async function FollowUp3Page({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <FollowUpStageView
      campaignId={campaignId}
      stage="follow_up_3"
      title="FOLLOW-UP 3 (Final)"
      description="Generate the final polite follow-up using full prior email history."
    />
  );
}
