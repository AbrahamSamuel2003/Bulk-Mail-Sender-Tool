"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/api-client";

interface PreviewResponse {
  filename: string;
  headers: string[];
  total_rows: number;
  sample_rows: Record<string, string>[];
}

interface CommitResponse {
  total_rows: number;
  imported_count: number;
  invalid_count: number;
  invalid_rows: { row_number: number; email: string | null; reasons: string[] }[];
}

type FieldKey = "practice_name" | "contact_name" | "email" | "subject" | "body";

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  practice_name: [
    "practice name",
    "practice",
    "company name",
    "company",
    "business name",
    "business",
    "organization",
    "clinic name",
    "clinic",
    "client name",
    "client",
    "lead name",
    "name",
  ],
  contact_name: [
    "contact person",
    "contact name",
    "contact",
    "person",
    "full name",
    "first name",
    "owner",
    "recipient",
  ],
  email: [
    "email",
    "email id",
    "mail id",
    "email address",
    "mail address",
    "e mail",
    "mail",
    "contact email",
    "to",
  ],
  subject: ["subject", "email subject", "subject line", "title", "topic", "heading"],
  body: [
    "email body",
    "body",
    "message",
    "email message",
    "msg",
    "content",
    "email content",
    "text",
    "draft",
    "template",
  ],
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectColumnMapping(
  headers: string[],
  sampleRows: Record<string, string>[]
): Record<FieldKey, string> {
  const result: Record<FieldKey, string> = {
    practice_name: "",
    contact_name: "",
    email: "",
    subject: "",
    body: "",
  };
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  // Pass 1: exact alias match (in priority order so "email id" matches email before name)
  const fieldOrder: FieldKey[] = ["email", "subject", "body", "contact_name", "practice_name"];
  for (const field of fieldOrder) {
    const aliases = HEADER_ALIASES[field];
    for (const alias of aliases) {
      const match = normalized.find((h) => !used.has(h.raw) && h.norm === alias);
      if (match) {
        result[field] = match.raw;
        used.add(match.raw);
        break;
      }
    }
  }

  // Pass 2: partial/substring header match for any remaining unmapped fields
  for (const field of fieldOrder) {
    if (result[field]) continue;
    const aliases = HEADER_ALIASES[field];
    const match = normalized.find(
      (h) => !used.has(h.raw) && aliases.some((alias) => h.norm.includes(alias))
    );
    if (match) {
      result[field] = match.raw;
      used.add(match.raw);
    }
  }

  // Pass 3: content-based fallback using sample rows
  if (sampleRows.length > 0) {
    if (!result.email) {
      const emailHeader = headers.find(
        (h) =>
          !used.has(h) &&
          sampleRows.some((row) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((row[h] || "").trim()))
      );
      if (emailHeader) {
        result.email = emailHeader;
        used.add(emailHeader);
      }
    }

    if (!result.body) {
      let bestHeader = "";
      let bestAvgLen = 0;
      for (const h of headers) {
        if (used.has(h)) continue;
        const lengths = sampleRows.map((r) => (r[h] || "").trim().length);
        const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        if (avg > bestAvgLen && avg >= 25) {
          bestAvgLen = avg;
          bestHeader = h;
        }
      }
      if (bestHeader) {
        result.body = bestHeader;
        used.add(bestHeader);
      }
    }

    if (!result.practice_name) {
      const nameHeader = headers.find(
        (h) => !used.has(h) && sampleRows.some((row) => (row[h] || "").trim().length > 0)
      );
      if (nameHeader) {
        result.practice_name = nameHeader;
        used.add(nameHeader);
      }
    }
  }

  return result;
}

function extractErrorMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    if (parsed?.detail) return parsed.detail;
  } catch {
    // raw text
  }
  return raw || fallback;
}

export function ExcelUploadWizard({
  campaignId,
  onImported,
}: {
  campaignId: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    practice_name: "",
    contact_name: "",
    email: "",
    subject: "",
    body: "",
  });
  const [defaultSubject, setDefaultSubject] = useState("");
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(selected: File | null) {
    setFile(selected);
    setResult(null);
    setError(null);
    if (!selected) return;

    const formData = new FormData();
    formData.append("file", selected);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaignId}/imports/preview`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(extractErrorMessage(await res.text(), "Failed to preview file."));
      const data: PreviewResponse = await res.json();
      setPreview(data);
      setMapping(detectColumnMapping(data.headers, data.sample_rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;

    const missing: string[] = [];
    if (!mapping.practice_name) missing.push("Practice / Name");
    if (!mapping.email) missing.push("Email");
    if (!mapping.body) missing.push("Email Body / Message");
    if (!mapping.subject && !defaultSubject.trim()) {
      missing.push("Subject (or enter a Default Subject below)");
    }

    if (missing.length > 0) {
      setError(`Please map the required columns before importing: ${missing.join(", ")}.`);
      return;
    }

    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("column_mapping", JSON.stringify(mapping));
    if (defaultSubject.trim()) {
      formData.append("default_subject", defaultSubject.trim());
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaignId}/imports/commit`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(extractErrorMessage(await res.text(), "Import failed."));
      const data: CommitResponse = await res.json();
      setResult(data);
      setPreview(null);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-[#EDEBE9] bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#323130]">Upload Leads (.xlsx or .csv)</h2>
          <p className="text-xs text-[#605E5C]">
            Auto-detects Name, Contact, Email, Subject, and Message columns from your file
          </p>
        </div>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
          className="text-xs text-[#605E5C] file:mr-3 file:rounded file:border file:border-[#8A8886] file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#323130] hover:file:bg-[#F3F2F1]"
        />
      </div>

      {error && (
        <div className="rounded border border-[#F1707B] bg-[#FDE7E9] p-3 text-xs text-[#A4262C]">
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-4 border-t border-[#EDEBE9] pt-4">
          <p className="text-xs font-semibold text-[#323130]">
            Detected {preview.total_rows} rows in <strong>{preview.filename}</strong>. Verify column mapping:
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {(
              [
                ["practice_name", "Practice / Name *"],
                ["contact_name", "Contact Person"],
                ["email", "Email *"],
                ["subject", "Subject"],
                ["body", "Email Body / Message *"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-[#605E5C] mb-1">{label}</label>
                <select
                  value={mapping[key]}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded border border-[#8A8886] px-2 py-1 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
                >
                  <option value="">-- Select column --</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#605E5C] mb-1">
              Default Subject {!mapping.subject ? "*" : "(optional fallback if Subject cell is blank)"}
            </label>
            <input
              type="text"
              value={defaultSubject}
              onChange={(e) => setDefaultSubject(e.target.value)}
              placeholder="e.g. Quick question for {{practice_name}}"
              className="w-full max-w-md rounded border border-[#8A8886] px-2.5 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
            />
          </div>

          <button
            disabled={loading}
            onClick={handleCommit}
            className="rounded bg-[#0078D4] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE] disabled:opacity-50"
          >
            {loading ? "Importing..." : "Validate & Import Leads"}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded border border-[#EDEBE9] bg-[#FAF9F8] p-3 text-xs space-y-2">
          <p className="font-semibold text-[#323130]">
            Imported {result.imported_count} of {result.total_rows} rows ({result.invalid_count} invalid/skipped).
          </p>
          {result.invalid_rows.length > 0 && (
            <ul className="list-disc pl-5 text-[#A4262C] space-y-0.5 max-h-32 overflow-y-auto">
              {result.invalid_rows.map((r) => (
                <li key={r.row_number}>
                  Row {r.row_number} ({r.email || "no email"}): {r.reasons.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
