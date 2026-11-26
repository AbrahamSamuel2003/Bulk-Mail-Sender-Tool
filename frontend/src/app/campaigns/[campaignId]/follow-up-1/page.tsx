import { FollowUpStageView } from "@/components/outreach/FollowUpStageView";

export default async function FollowUp1Page({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <FollowUpStageView
      campaignId={campaignId}
      stage="follow_up_1"
      title="FOLLOW-UP 1"
      description="Generate personalized first follow-ups referencing the original email, preview/edit, and send eligible leads."
    />
  );
}
