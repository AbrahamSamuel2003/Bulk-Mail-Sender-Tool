"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { FluentCalendar } from "@/components/outreach/FluentCalendar";
import {
  formatDisplayDate,
  getRelativeDayLabel,
  getTodayDateString,
  stepIsoDate,
} from "@/lib/date";

export interface DateFilterState {
  dateFilter: string;
  startDate: string;
  endDate: string;
  search: string;
}

const DEFAULT_FILTER_OPTIONS = [
  { value: "all", label: "All Leads" },
  { value: "due_today", label: "Due Today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "sent_date", label: "By Sent Date" },
  { value: "due_date", label: "By Due Date" },
  { value: "custom_range", label: "Custom Range" },
];

export function DateFilterBar({
  value,
  campaignTimezone = "Asia/Kolkata",
  options = DEFAULT_FILTER_OPTIONS,
  onChange,
}: {
  value: DateFilterState;
  campaignTimezone?: string;
  options?: { value: string; label: string }[];
  onChange: (next: DateFilterState) => void;
}) {
  const todayIso = getTodayDateString(campaignTimezone);
  const activeDate = value.startDate || todayIso;
  const relativeLabel = getRelativeDayLabel(activeDate, todayIso);
  const targetDateMode = value.dateFilter === "due_date" ? "due_date" : "sent_date";

  function handleSelectDate(nextDate: string) {
    onChange({
      ...value,
      dateFilter: targetDateMode,
      startDate: nextDate,
    });
  }

  function handleModeChange(nextMode: string) {
    if ((nextMode === "due_date" || nextMode === "sent_date") && !value.startDate) {
      onChange({ ...value, dateFilter: nextMode, startDate: todayIso });
      return;
    }
    if (nextMode === "custom_range" && (!value.startDate || !value.endDate)) {
      onChange({
        ...value,
        dateFilter: nextMode,
        startDate: value.startDate || todayIso,
        endDate: value.endDate || todayIso,
      });
      return;
    }
    onChange({ ...value, dateFilter: nextMode });
  }

  return (
    <div className="space-y-2.5 rounded border border-[#EDEBE9] bg-white px-3.5 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {options.map((opt) => {
            const active = value.dateFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleModeChange(opt.value)}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#0078D4] text-white"
                    : "border border-[#EDEBE9] bg-[#FAF9F8] text-[#323130] hover:bg-[#F3F2F1]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder="Search practice, contact, or email..."
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none sm:w-64 sm:py-1"
        />
      </div>

      {/* Centered Custom Fluent 2 Calendar Stepper */}
      <div className="flex items-center justify-center gap-2 border-t border-[#EDEBE9] pt-2.5">
        <button
          type="button"
          aria-label="Previous day"
          title="Previous day"
          onClick={() => handleSelectDate(stepIsoDate(activeDate, -1))}
          className="flex h-8 w-8 items-center justify-center rounded border border-[#8A8886] bg-white text-[#323130] hover:bg-[#F3F2F1]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <FluentCalendar
          value={activeDate}
          todayIso={todayIso}
          labelText={`${formatDisplayDate(activeDate)}${relativeLabel ? ` (${relativeLabel})` : ""}`}
          onChange={handleSelectDate}
          align="center"
        />

        <button
          type="button"
          aria-label="Next day"
          title="Next day"
          onClick={() => handleSelectDate(stepIsoDate(activeDate, 1))}
          className="flex h-8 w-8 items-center justify-center rounded border border-[#8A8886] bg-white text-[#323130] hover:bg-[#F3F2F1]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {value.dateFilter === "custom_range" && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[#EDEBE9] pt-2.5 text-xs text-[#605E5C]">
          <span>From:</span>
          <FluentCalendar
            value={value.startDate || todayIso}
            todayIso={todayIso}
            onChange={(d) => onChange({ ...value, startDate: d })}
            align="left"
          />
          <span>To:</span>
          <FluentCalendar
            value={value.endDate || todayIso}
            todayIso={todayIso}
            onChange={(d) => onChange({ ...value, endDate: d })}
            align="left"
          />
        </div>
      )}
    </div>
  );
}
