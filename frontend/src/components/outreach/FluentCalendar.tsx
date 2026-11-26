"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDbDate, formatDisplayDate } from "@/lib/date";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseYmd(iso: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

export function FluentCalendar({
  value,
  todayIso,
  labelText,
  onChange,
  align = "center",
}: {
  value: string;
  todayIso: string;
  labelText?: string;
  onChange: (nextIso: string) => void;
  align?: "left" | "center";
}) {
  const [open, setOpen] = useState(false);
  const initial = parseYmd(value || todayIso);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = parseYmd(value || todayIso);
    setViewYear(parsed.year);
    setViewMonth(parsed.month);
  }, [value, todayIso]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const calendarCells = useMemo(() => {
    const firstDayWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const startUtc = new Date(Date.UTC(viewYear, viewMonth, 1 - firstDayWeekday));
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(startUtc);
      cellDate.setUTCDate(startUtc.getUTCDate() + i);
      cells.push({
        iso: formatDbDate(cellDate),
        day: cellDate.getUTCDate(),
        inMonth: cellDate.getUTCMonth() === viewMonth,
      });
    }
    return cells;
  }, [viewYear, viewMonth]);

  function stepMonth(delta: number) {
    const dt = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(dt.getUTCFullYear());
    setViewMonth(dt.getUTCMonth());
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-8 items-center justify-center gap-2 rounded border px-3 text-xs font-semibold transition-colors ${
          open
            ? "border-[#0078D4] bg-[#EFF6FC] text-[#0078D4]"
            : "border-[#8A8886] bg-[#FAF9F8] text-[#323130] hover:bg-[#F3F2F1]"
        }`}
      >
        <Calendar className="h-3.5 w-3.5 text-[#0078D4]" />
        <span>{labelText || formatDisplayDate(value || todayIso)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#605E5C]" />
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 w-64 rounded border border-[#EDEBE9] bg-white p-3 shadow-lg ${
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
          }`}
        >
          {/* Month / Year Header */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => stepMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded text-[#605E5C] hover:bg-[#F3F2F1] hover:text-[#323130]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-[#323130]">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => stepMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded text-[#605E5C] hover:bg-[#F3F2F1] hover:text-[#323130]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-[#605E5C]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {calendarCells.map((cell) => {
              const isSelected = cell.iso === value;
              const isToday = cell.iso === todayIso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => {
                    onChange(cell.iso);
                    setOpen(false);
                  }}
                  className={`flex h-7 w-full items-center justify-center rounded text-xs transition-colors ${
                    isSelected
                      ? "bg-[#0078D4] font-semibold text-white"
                      : isToday
                        ? "border border-[#0078D4] font-semibold text-[#0078D4] hover:bg-[#EFF6FC]"
                        : cell.inMonth
                          ? "text-[#323130] hover:bg-[#F3F2F1]"
                          : "text-[#A19F9D] hover:bg-[#FAF9F8]"
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2.5 flex items-center justify-between border-t border-[#EDEBE9] pt-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
              className="font-semibold text-[#0078D4] hover:underline"
            >
              Go to Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-semibold text-[#605E5C] hover:text-[#323130]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

