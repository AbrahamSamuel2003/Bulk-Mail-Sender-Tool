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

export function ExcelUploadWizard({
  campaignId,
  onImported,
}: {
  campaignId: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({
    practice_name: "",
    contact_name: "",
    email: "",
    subject: "",
    body: "",
  });
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
      if (!res.ok) throw new Error(await res.text());
      const data: PreviewResponse = await res.json();
      setPreview(data);

      const lowerMap = new Map(data.headers.map((h) => [h.toLowerCase(), h]));
      setMapping({
        practice_name: lowerMap.get("practice name") || lowerMap.get("practice_name") || "",
        contact_name: lowerMap.get("contact person") || lowerMap.get("contact_name") || "",
        email: lowerMap.get("email") || "",
        subject: lowerMap.get("subject") || "",
        body: lowerMap.get("email body") || lowerMap.get("body") || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("column_mapping", JSON.stringify(mapping));
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns/${campaignId}/imports/commit`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
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
            Map spreadsheet columns to Practice Name, Contact Person, Email, Subject, and Body
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
            Detected {preview.total_rows} rows in <strong>{preview.filename}</strong>. Map columns:
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {(
              [
                ["practice_name", "Practice Name *"],
                ["contact_name", "Contact Person"],
                ["email", "Email *"],
                ["subject", "Subject *"],
                ["body", "Email Body *"],
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
