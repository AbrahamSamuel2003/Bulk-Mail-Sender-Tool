"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Campaign } from "@/lib/types";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadCampaigns() {
    try {
      const data = await apiFetch<Campaign[]>("/campaigns");
      setCampaigns(data);
    } catch {
      // Backend may be offline during initial UI preview
    }
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErrorMsg(null);
    try {
      await apiFetch("/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, description, timezone }),
      });
      setName("");
      setDescription("");
      setShowCreate(false);
      loadCampaigns();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create campaign.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#323130]">Campaigns</h1>
          <p className="text-xs text-[#605E5C]">
            Create, pause, resume, and archive independent outreach campaigns
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-[#0078D4] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE]"
        >
          New Campaign
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded border border-[#EDEBE9] bg-white p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-[#323130]">Create Campaign</h2>
          {errorMsg && (
            <div className="rounded border border-[#F1707B] bg-[#FDE7E9] p-2.5 text-xs text-[#A4262C]">
              {errorMsg}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">
                Campaign Name
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dental Clinics – November 2026"
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-sm text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">Timezone</label>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-sm text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#323130] mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-sm text-[#323130] focus:border-[#0078D4] focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded border border-[#8A8886] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#323130] hover:bg-[#F3F2F1]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-[#0078D4] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE]"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded border border-dashed border-[#C8C6C4] bg-white p-10 text-center text-xs text-[#605E5C]">
          No campaigns yet. Click &ldquo;New Campaign&rdquo; to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}/new`}
              className="rounded border border-[#EDEBE9] bg-white p-5 hover:border-[#0078D4] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#323130]">{c.name}</h3>
                <span className="rounded-sm bg-[#DFF6DD] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#107C10]">
                  {c.status}
                </span>
              </div>
              {c.description && <p className="mt-2 text-xs text-[#605E5C]">{c.description}</p>}
              <p className="mt-3 text-[11px] text-[#605E5C]">Timezone: {c.timezone}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
