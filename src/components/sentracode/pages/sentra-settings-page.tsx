/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { PlugZap, UserPlus, Plus } from "lucide-react";
import { SBadge, Card, CardHead } from "../sentra-ui";

function Toggle({ on = false }: { on?: boolean }) {
  const [active, setActive] = useState(on);
  return (
    <button
      role="switch"
      aria-checked={active}
      onClick={() => setActive(!active)}
      className={`relative h-5 w-9 rounded-full border transition-colors ${active ? "border-primary/40 bg-primary/15" : "border-white/10 bg-white/5"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full shadow transition-transform ${active ? "translate-x-4 bg-primary" : "translate-x-0.5 bg-white/20"}`} />
    </button>
  );
}

function SettingsRow({ title, desc, right }: { title: string; desc?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-white/5 py-4 first:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-[13px] font-medium text-white/80">{title}</p>
        {desc && <p className="mt-0.5 text-[11.5px] text-white/30">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function SentraSettingsPage({ onNavigate }: { onNavigate: (p: any) => void }) {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="mt-0.5 text-[12px] text-white/30">Manage repositories, scans, and notifications</p>
      </div>

      {/* connected repos */}
      <Card>
        <CardHead title="Connected repositories" />
        {[
          { name: "sneakybuzz/patron",         desc: "Public · TypeScript, Next.js · Last scan: 2h ago" },
          { name: "sneakybuzz/echo",           desc: "Private · TypeScript, Next.js · Last scan: 4h ago" },
          { name: "sneakybuzz/networksecurity", desc: "Private · Python, MLflow · Last scan: 6h ago" },
        ].map(r => (
          <SettingsRow
            key={r.name}
            title={r.name}
            desc={r.desc}
            right={
              <button className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/40 hover:bg-white/8 transition-colors">
                <PlugZap className="h-3.5 w-3.5" />Disconnect
              </button>
            }
          />
        ))}
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
        <SettingsRow title="Scan on every push"    desc="Run a security scan automatically when code is pushed to a tracked branch." right={<Toggle on />} />
        <SettingsRow title="Nightly full scan"     desc="Re-scan every connected repository once a day at 02:00 UTC."             right={<Toggle on />} />
        <SettingsRow title="Auto-fix low-risk findings" desc="Let SentraCode open a pull request for safe, low-risk fixes automatically." right={<Toggle />} />
      </Card>

      {/* notifications */}
      <Card>
        <CardHead title="Notification channels" />
        <SettingsRow title="Email alerts for critical findings" desc="Send an email the moment a critical severity issue is detected." right={<Toggle on />} />
        <SettingsRow title="Slack alerts" desc="Post findings and scan summaries to a connected Slack channel." right={<Toggle />} />
        <SettingsRow
          title="Email address"
          desc="Where to send critical alerts."
          right={
            <input
              defaultValue="prashanthpendem2323@gmail.com"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 focus:border-primary/40 focus:outline-none"
              style={{ width: 220 }}
            />
          }
        />
        <SettingsRow
          title="Slack webhook URL"
          desc="Connect a Slack incoming webhook."
          right={
            <input
              placeholder="https://hooks.slack.com/…"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/40 focus:border-primary/40 focus:outline-none"
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