import { FollowUpStageView } from "@/components/outreach/FollowUpStageView";

export default async function FollowUp2Page({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <FollowUpStageView
      campaignId={campaignId}
      stage="follow_up_2"
      title="FOLLOW-UP 2"
      description="Generate second follow-ups using the original email and Follow-Up 1 as context."
    />
  );
}
