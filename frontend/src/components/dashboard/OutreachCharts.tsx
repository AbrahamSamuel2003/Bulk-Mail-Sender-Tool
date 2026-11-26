"use client";

import { useState } from "react";

export interface DailyActivityPoint {
  date: string;
  label: string;
  initial_sent: number;
  followups_sent: number;
  replies: number;
}

export interface PipelinePoint {
  key: string;
  label: string;
  count: number;
  color: string;
}

export function OutreachCharts({
  dailyActivity,
  pipeline,
}: {
  dailyActivity: DailyActivityPoint[];
  pipeline: PipelinePoint[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxDaily = Math.max(
    1,
    ...dailyActivity.map((d) => Math.max(d.initial_sent + d.followups_sent, d.replies))
  );
  const maxPipeline = Math.max(1, ...pipeline.map((p) => p.count));

  const chartHeight = 180;
  const barAreaWidth = 560;
  const barGroupWidth = dailyActivity.length > 0 ? barAreaWidth / dailyActivity.length : 40;
  const barWidth = Math.max(10, Math.min(22, barGroupWidth - 10));

  const replyLinePoints = dailyActivity
    .map((d, i) => {
      const x = i * barGroupWidth + barGroupWidth / 2;
      const y = chartHeight - (d.replies / maxDaily) * (chartHeight - 20);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left 2/3: 14-Day Outreach Volume & Replies */}
      <div className="lg:col-span-2 rounded border border-[#EDEBE9] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#323130]">
              Outreach Volume &amp; Replies (Last 14 Days)
            </h2>
            <p className="text-xs text-[#605E5C]">
              Daily initial emails, follow-ups sent, and replies received
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#605E5C]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#0078D4]" />
              Initial Sent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#71AFE5]" />
              Follow-Ups
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 bg-[#107C10]" />
              Replies
            </span>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${barAreaWidth} ${chartHeight + 28}`}
            className="h-52 w-full min-w-[460px]"
          >
            {/* Horizontal gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = chartHeight - ratio * (chartHeight - 20);
              return (
                <g key={ratio}>
                  <line
                    x1={0}
                    y1={y}
                    x2={barAreaWidth}
                    y2={y}
                    stroke="#EDEBE9"
                    strokeWidth={1}
                  />
                  <text x={2} y={y - 3} fontSize="10" fill="#A19F9D">
                    {Math.round(ratio * maxDaily)}
                  </text>
                </g>
              );
            })}

            {/* Stacked Bars */}
            {dailyActivity.map((d, i) => {
              const x = i * barGroupWidth + (barGroupWidth - barWidth) / 2;
              const initialH = (d.initial_sent / maxDaily) * (chartHeight - 20);
              const fuH = (d.followups_sent / maxDaily) * (chartHeight - 20);
              const initialY = chartHeight - initialH;
              const fuY = initialY - fuH;

              return (
                <g
                  key={d.date}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={i * barGroupWidth}
                    y={0}
                    width={barGroupWidth}
                    height={chartHeight}
                    fill={hoveredIdx === i ? "#FAF9F8" : "transparent"}
                  />
                  {initialH > 0 && (
                    <rect
                      x={x}
                      y={initialY}
                      width={barWidth}
                      height={initialH}
                      rx={1}
                      fill="#0078D4"
                    />
                  )}
                  {fuH > 0 && (
                    <rect
                      x={x}
                      y={fuY}
                      width={barWidth}
                      height={fuH}
                      rx={1}
                      fill="#71AFE5"
                    />
                  )}
                  <text
                    x={i * barGroupWidth + barGroupWidth / 2}
                    y={chartHeight + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#605E5C"
                  >
                    {i % 2 === 0 ? d.label : ""}
                  </text>
                </g>
              );
            })}

            {/* Replies Trend Line */}
            {dailyActivity.length > 1 && (
              <polyline
                fill="none"
                stroke="#107C10"
                strokeWidth={2}
                points={replyLinePoints}
              />
            )}
            {dailyActivity.map((d, i) => {
              const cx = i * barGroupWidth + barGroupWidth / 2;
              const cy = chartHeight - (d.replies / maxDaily) * (chartHeight - 20);
              return (
                <circle
                  key={`pt-${d.date}`}
                  cx={cx}
                  cy={cy}
                  r={hoveredIdx === i ? 4 : 2.5}
                  fill="#107C10"
                />
              );
            })}
          </svg>

          {hoveredIdx !== null && dailyActivity[hoveredIdx] && (
            <div className="mt-2 flex items-center gap-4 border-t border-[#EDEBE9] pt-2 text-xs text-[#323130]">
              <strong>{dailyActivity[hoveredIdx].label}:</strong>
              <span>Initial: {dailyActivity[hoveredIdx].initial_sent}</span>
              <span>Follow-Ups: {dailyActivity[hoveredIdx].followups_sent}</span>
              <span className="text-[#107C10]">
                Replies: {dailyActivity[hoveredIdx].replies}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right 1/3: Lead Pipeline Breakdown */}
      <div className="rounded border border-[#EDEBE9] bg-white p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-[#323130]">Lead Pipeline Breakdown</h2>
          <p className="text-xs text-[#605E5C]">Current distribution across outreach stages</p>
        </div>

        <div className="space-y-3">
          {pipeline.map((item) => {
            const pct = Math.round((item.count / maxPipeline) * 100);
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#323130]">{item.label}</span>
                  <span className="text-[#605E5C]">{item.count}</span>
                </div>
                <div className="h-2 w-full rounded-xs bg-[#F3F2F1]">
                  <div
                    className="h-2 rounded-xs transition-all"
                    style={{
                      width: `${item.count > 0 ? Math.max(4, pct) : 0}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

