/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback } from "react";
import { PlugZap, UserPlus, Plus, Loader2, Save, Eye, EyeOff } from "lucide-react";
import { SBadge, Card, CardHead } from "../sentra-ui";
import { useWorkspace } from "@/lib/workspace-context";

interface Settings {
  scanOnPush:     boolean;
  nightlyScan:    boolean;
  autoFixLowRisk: boolean;
  emailAlerts:    boolean;
  slackAlerts:    boolean;
  alertEmail:     string | null;
  slackWebhookUrl:string | null;
  githubToken:    string | null;
}

interface Repo { id: string; fullName: string; isPrivate: boolean; scanStatus: string; lastScanAt: string | null; }

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full border transition-colors ${on ? "border-primary/40 bg-primary/15" : "border-white/10 bg-white/5"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full shadow transition-transform ${on ? "translate-x-4 bg-primary" : "translate-x-0.5 bg-white/20"}`} />
    </button>
  );
}

function SettingsRow({ title, desc, right }: { title: string; desc?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-white/5 py-4 first:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/80">{title}</p>
        {desc && <p className="mt-0.5 text-[11.5px] text-white/30">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function SentraSettingsPage({ onNavigate }: { onNavigate: (p: any) => void }) {
  const { workspaceId } = useWorkspace();

  const [settings, setSettings] = useState<Settings>({
    scanOnPush: true, nightlyScan: true, autoFixLowRisk: false,
    emailAlerts: true, slackAlerts: false,
    alertEmail: null, slackWebhookUrl: null, githubToken: null,
  });
  const [repos,      setRepos     ] = useState<Repo[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [saving,     setSaving    ] = useState(false);
  const [saved,      setSaved     ] = useState(false);
  const [showToken,  setShowToken ] = useState(false);

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`/api/sentra/settings?workspaceId=${workspaceId}`),
        fetch(`/api/sentra/repos?workspaceId=${workspaceId}`),
      ]);
      const sData = await sRes.json();
      const rData = await rRes.json();
      if (sData.settings) setSettings(sData.settings);
      setRepos(rData.repos ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const save = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await fetch("/api/sentra/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...settings }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const disconnectRepo = async (repoId: string) => {
    if (!confirm("Disconnect this repository? All findings will be deleted.")) return;
    await fetch(`/api/sentra/repos/${repoId}`, { method: "DELETE" });
    setRepos(prev => prev.filter(r => r.id !== repoId));
  };

  const upd = (key: keyof Settings) => (value: boolean | string) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Settings</h1>
          <p className="mt-0.5 text-[12px] text-white/30">Manage repositories, scans, and notifications</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saved ? "Saved ✓" : saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {/* GitHub token */}
      <Card>
        <CardHead title="GitHub integration" />
        <SettingsRow
          title="GitHub personal access token"
          desc="Required for private repositories. Needs repo scope."
          right={
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={settings.githubToken ?? ""}
                onChange={e => upd("githubToken")(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 pr-9 text-xs text-white/60 focus:border-primary/50 focus:outline-none"
                style={{ width: 260 }}
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          }
        />
        <p className="text-[11px] text-white/15 mt-1">
          Create a token at github.com/settings/tokens — select repo&quot; scope for private repos.
        </p>
      </Card>

      {/* connected repos */}
      <Card>
        <CardHead title="Connected repositories" />
        {repos.length === 0 ? (
          <p className="py-4 text-[12px] text-white/25">No repositories connected</p>
        ) : (
          repos.map(r => (
            <SettingsRow
              key={r.id}
              title={r.fullName}
              desc={`${r.isPrivate ? "Private" : "Public"} · Last scan: ${r.lastScanAt ? new Date(r.lastScanAt).toLocaleString() : "Never"}`}
              right={
                <button
                  onClick={() => disconnectRepo(r.id)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/40 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors"
                >
                  <PlugZap className="h-3.5 w-3.5" />Disconnect
                </button>
              }
            />
          ))
        )}
        <button
          onClick={() => onNavigate("repositories")}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-2.5 text-[12px] text-white/30 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />Connect another repository
        </button>
      </Card>

      {/* scan schedule */}
      <Card>
        <CardHead title="Scan schedule" />
        <SettingsRow title="Scan on every push"     desc="Run a security scan automatically when code is pushed."   right={<Toggle on={settings.scanOnPush}     onChange={upd("scanOnPush"    ) as any} />} />
        <SettingsRow title="Nightly full scan"       desc="Re-scan every connected repository once a day at 02:00 UTC." right={<Toggle on={settings.nightlyScan}   onChange={upd("nightlyScan"  ) as any} />} />
        <SettingsRow title="Auto-fix low-risk findings" desc="Open a pull request for safe, low-risk fixes automatically." right={<Toggle on={settings.autoFixLowRisk} onChange={upd("autoFixLowRisk") as any} />} />
      </Card>

      {/* notifications */}
      <Card>
        <CardHead title="Notification channels" />
        <SettingsRow title="Email alerts for critical findings" desc="Send an email the moment a critical severity issue is detected." right={<Toggle on={settings.emailAlerts} onChange={upd("emailAlerts") as any} />} />
        <SettingsRow title="Slack alerts" desc="Post findings and scan summaries to a connected Slack channel." right={<Toggle on={settings.slackAlerts} onChange={upd("slackAlerts") as any} />} />
        <SettingsRow
          title="Alert email address"
          desc="Where to send critical alerts."
          right={
            <input
              value={settings.alertEmail ?? ""}
              onChange={e => upd("alertEmail")(e.target.value)}
              placeholder="you@company.com"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 focus:border-primary/50 focus:outline-none"
              style={{ width: 220 }}
            />
          }
        />
        <SettingsRow
          title="Slack webhook URL"
          desc="Connect a Slack incoming webhook for automated notifications."
          right={
            <input
              value={settings.slackWebhookUrl ?? ""}
              onChange={e => upd("slackWebhookUrl")(e.target.value)}
              placeholder="https://hooks.slack.com/…"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/40 focus:border-primary/50 focus:outline-none"
              style={{ width: 220 }}
            />
          }
        />
      </Card>

      {/* team */}
      <Card>
        <CardHead title="Team and roles" />
        <SettingsRow
          title="Pendem Prashanth"
          desc="prashanthpendem2323@gmail.com"
          right={<SBadge sev="Success">Owner</SBadge>}
        />
        <SettingsRow
          title="Invite teammate"
          desc="Give your team access to SentraCode findings and reviews."
          right={
            <button className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-primary/90 transition-colors">
              <UserPlus className="h-3.5 w-3.5" />Invite member
            </button>
          }
        />
      </Card>
    </div>
  );
}