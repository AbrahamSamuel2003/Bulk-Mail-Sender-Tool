"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface AppSettingsState {
  fu1_interval_days: number;
  fu2_interval_days: number;
  fu3_interval_days: number;
  use_business_days: boolean;
  batch_size: number;
  delay_between_emails_sec: number;
  delay_between_batches_sec: number;
  daily_sending_limit: number;
  default_timezone: string;
  ai_prompt_config: {
    provider?: string;
    tone?: string;
    length?: string;
    style?: string;
    restrictions?: string;
    signature_footer?: string;
    ai_quota_exhausted?: boolean;
    ai_quota_error?: string | null;
  };
}

interface SenderStatus {
  connected: boolean;
  email: string | null;
  mode: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
}

export default function SettingsPage() {
  const [senderStatus, setSenderStatus] = useState<SenderStatus>({
    connected: false,
    email: null,
    mode: null,
  });
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettingsState | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadSenderStatus = useCallback(() => {
    apiFetch<SenderStatus>("/auth/gmail/status")
      .then(setSenderStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSenderStatus();
    apiFetch<AppSettingsState>("/settings")
      .then(setSettings)
      .catch(() => {});
  }, [loadSenderStatus]);

  async function handleConnectSmtp(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch("/auth/smtp/connect", {
      method: "POST",
      body: JSON.stringify({ email: smtpEmail, password: smtpPassword }),
    });
    setSmtpPassword("");
    loadSenderStatus();
  }

  async function handleDisconnect() {
    const endpoint =
      senderStatus.mode === "smtp" ? "/auth/smtp/disconnect" : "/auth/gmail/disconnect";
    await apiFetch(endpoint, { method: "POST" });
    loadSenderStatus();
  }

  async function handleSendTest(e: React.FormEvent) {
    e.preventDefault();
    setTestResult(null);
    try {
      const res = await apiFetch<{ sent: boolean; message_id: string }>("/auth/test-email", {
        method: "POST",
        body: JSON.stringify({ to_email: testEmail }),
      });
      setTestResult(`Test email sent (${res.message_id})`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "Failed to send test email");
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    await apiFetch("/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
    setSavedMsg("Settings saved.");
    setTimeout(() => setSavedMsg(null), 3000);
  }

  async function handleClearAiAlert() {
    await apiFetch("/settings/clear-ai-alert", { method: "POST" });
    if (settings) {
      setSettings({
        ...settings,
        ai_prompt_config: {
          ...settings.ai_prompt_config,
          ai_quota_exhausted: false,
          ai_quota_error: null,
        },
      });
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-[#323130]">Settings</h1>
        <p className="text-xs text-[#605E5C]">
          Configure sending email account, AI provider (Groq, Gemini, OpenAI), intervals, and sending limits
        </p>
      </div>

      {settings?.ai_prompt_config?.ai_quota_exhausted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#F1707B] bg-[#FDE7E9] p-4 text-xs text-[#A4262C]">
          <div>
            <p className="font-semibold">All AI API Keys Exhausted or Rate-Limited</p>
            <p className="mt-0.5">
              {settings.ai_prompt_config.ai_quota_error ||
                "Primary and fallback Groq keys reached their token limit. Switch to Gemini in AI Provider below or update keys in .env."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearAiAlert}
            className="rounded border border-[#A4262C] bg-white px-3 py-1 font-semibold text-[#A4262C] hover:bg-[#FAF9F8]"
          >
            Clear Alert
          </button>
        </div>
      )}

      <div className="rounded border border-[#EDEBE9] bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#323130]">Sending Email Account</h2>
        {senderStatus.connected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#107C10]">
                Connected as <strong>{senderStatus.email}</strong> (
                {senderStatus.mode === "smtp"
                  ? `SMTP ${senderStatus.smtp_host}:${senderStatus.smtp_port}`
                  : "Gmail OAuth"}
                )
              </p>
              <button
                onClick={handleDisconnect}
                className="rounded border border-[#F1707B] bg-[#FDE7E9] px-3 py-1 text-xs font-semibold text-[#A4262C] hover:bg-[#FBD0D4]"
              >
                Disconnect
              </button>
            </div>

            <form onSubmit={handleSendTest} className="flex flex-wrap items-center gap-2 border-t border-[#EDEBE9] pt-3">
              <input
                required
                type="email"
                placeholder="Send test email to..."
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none sm:w-64 sm:py-1"
              />
              <button
                type="submit"
                className="rounded bg-[#0078D4] px-3 py-1 text-xs font-semibold text-white hover:bg-[#106EBE]"
              >
                Send Test Email
              </button>
              {testResult && <span className="text-xs text-[#605E5C]">{testResult}</span>}
            </form>
          </div>
        ) : (
          <form onSubmit={handleConnectSmtp} className="space-y-3">
            <p className="text-xs text-[#605E5C]">
              Connect your sending email account (credentials are encrypted at rest):
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                required
                type="email"
                placeholder="Email (e.g. founder@ss40network.com)"
                value={smtpEmail}
                onChange={(e) => setSmtpEmail(e.target.value)}
                className="rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
              <input
                required
                type="password"
                placeholder="Password / App Password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                className="rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded bg-[#0078D4] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE]"
            >
              Save Sending Account
            </button>
          </form>
        )}
      </div>

      {settings && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded border border-[#EDEBE9] bg-white p-5 space-y-5"
        >
          <h2 className="text-sm font-semibold text-[#323130]">AI &amp; Scheduling Configuration</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">AI Provider</label>
              <select
                value={settings.ai_prompt_config?.provider || "groq"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ai_prompt_config: { ...settings.ai_prompt_config, provider: e.target.value },
                  })
                }
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              >
                <option value="groq">Groq (Free Tier — Llama 3.3 70B)</option>
                <option value="gemini">Google Gemini (Free Tier — Gemini 2.0 Flash)</option>
                <option value="openai">OpenAI (GPT-4o-mini)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">
                Default Timezone
              </label>
              <input
                value={settings.default_timezone}
                onChange={(e) => setSettings({ ...settings, default_timezone: e.target.value })}
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">FU1 Days</label>
              <input
                type="number"
                value={settings.fu1_interval_days}
                onChange={(e) =>
                  setSettings({ ...settings, fu1_interval_days: Number(e.target.value) })
                }
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">FU2 Days</label>
              <input
                type="number"
                value={settings.fu2_interval_days}
                onChange={(e) =>
                  setSettings({ ...settings, fu2_interval_days: Number(e.target.value) })
                }
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">FU3 Days</label>
              <input
                type="number"
                value={settings.fu3_interval_days}
                onChange={(e) =>
                  setSettings({ ...settings, fu3_interval_days: Number(e.target.value) })
                }
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#323130]">
            <input
              type="checkbox"
              checked={settings.use_business_days}
              onChange={(e) => setSettings({ ...settings, use_business_days: e.target.checked })}
            />
            Use Business Days (exclude Saturdays &amp; Sundays)
          </label>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">Batch Size</label>
              <input
                type="number"
                value={settings.batch_size}
                onChange={(e) => setSettings({ ...settings, batch_size: Number(e.target.value) })}
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">
                Email Delay (s)
              </label>
              <input
                type="number"
                value={settings.delay_between_emails_sec}
                onChange={(e) =>
                  setSettings({ ...settings, delay_between_emails_sec: Number(e.target.value) })
                }
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">
                Batch Delay (s)
              </label>
              <input
                type="number"
                value={settings.delay_between_batches_sec}
                onChange={(e) =>
                  setSettings({ ...settings, delay_between_batches_sec: Number(e.target.value) })
                }
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#323130] mb-1">Daily Limit</label>
              <input
                type="number"
                value={settings.daily_sending_limit}
                onChange={(e) =>
                  setSettings({ ...settings, daily_sending_limit: Number(e.target.value) })
                }
                className="w-full rounded border border-[#8A8886] px-3 py-1.5 text-xs text-[#323130] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-[#107C10]">{savedMsg}</span>
            <button
              type="submit"
              className="rounded bg-[#0078D4] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#106EBE]"
            >
              Save Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
