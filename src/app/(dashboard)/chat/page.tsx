/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/purity */
"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Send, Loader2, Upload, Link2, FileText, Trash2,
  Database, Sparkles, CheckCircle2, AlertCircle,
  ThumbsUp, ThumbsDown, ChevronDown, X, Plus,
  Bot, Globe, Zap, RefreshCw, Settings2,
  Hash, Search, Paperclip, Smile, Pin, Users,
} from "lucide-react";
import { useChatPersistence, type PersistedMessage } from "@/hooks/use-chat-persistence";
import { useWorkspace } from "@/lib/workspace-context";
import { toast } from "sonner";

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Doc { source: string; type: string; chunks: number; }

interface ConnectedModel {
  provider: string;
  model:    string;
  keyHint:  string;
}

/* ─── Provider meta ──────────────────────────────────────────────────── */
const PROVIDER_META: Record<string, { label: string; icon: string; color: string }> = {
  default: { label: "echo-nemo-1.0",  icon: "✦",  color: "#7C3AED" },
  claude:  { label: "Claude",         icon: "🔮", color: "#CC785C" },
  openai:  { label: "GPT-4",          icon: "⚡", color: "#10A37F" },
  gemini:  { label: "Gemini",         icon: "✨", color: "#4285F4" },
  mistral: { label: "Mistral",        icon: "🌪️", color: "#FF7000" },
};

const TYPE_ICON: Record<string, string> = {
  pdf: "📄", docx: "📝", doc: "📝", csv: "📊",
  txt: "📋", md: "📋", url: "🔗", transcript: "🎥", video_notes: "🎥",
};

/* Formats a time like "09:12" — falls back gracefully if the persisted
   message doesn't carry a timestamp field yet. */
function formatTime(msg: PersistedMessage): string {
  const raw = (msg as unknown as { createdAt?: string | number | Date }).createdAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ─── Model selector dropdown ────────────────────────────────────────── */
function ModelSelector({
  models, active, onChange,
}: {
  models: ConnectedModel[];
  active: string;
  onChange: (p: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const allOptions = [
    { provider: "default", model: "echo-nemo-1.0", keyHint: "" },
    ...models,
  ];
  const current = allOptions.find(m => m.provider === active) ?? allOptions[0];
  const meta = PROVIDER_META[current.provider] ?? PROVIDER_META.default;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] transition-colors hover:border-white/15 hover:bg-white/5"
      >
        <span style={{ color: meta.color }}>{meta.icon}</span>
        <span className="font-medium text-white/60">{meta.label}</span>
        {current.model !== "echo-nemo-1.0" && (
          <span className="text-[10px] text-white/30">{current.model}</span>
        )}
        <ChevronDown className={cn("h-3 w-3 text-white/20 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-white/10 py-1 shadow-2xl"
          style={{ backgroundColor: "#111116" }}
        >
          {allOptions.map(opt => {
            const m = PROVIDER_META[opt.provider] ?? PROVIDER_META.default;
            return (
              <button
                key={opt.provider}
                onClick={() => { onChange(opt.provider); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/5",
                  opt.provider === active && "bg-white/[0.04]"
                )}
              >
                <span className="text-base" style={{ color: m.color }}>{m.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white/80">{m.label}</p>
                  {opt.model !== "echo-nemo-1.0" && (
                    <p className="text-[10px] text-white/30 truncate">{opt.model}</p>
                  )}
                </div>
                {opt.provider === active && (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
                )}
              </button>
            );
          })}

          {models.length === 0 && (
            <div className="px-3 py-2.5 text-[10px] text-white/20">
              Connect API keys in the Agents section on Overview to unlock more models
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Day divider ─────────────────────────────────────────────────────── */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-white/6" />
      <span className="text-[11px] font-medium text-white/25">{label}</span>
      <div className="h-px flex-1 bg-white/6" />
    </div>
  );
}

/* ─── Message row (flat, Slack-style — no bubble) ────────────────────── */
function MessageRow({
  msg, onFeedback, feedbackSent, showHeader,
}: {
  msg: PersistedMessage;
  onFeedback: (msg: PersistedMessage, r: 1 | -1) => void;
  feedbackSent: Record<string, 1 | -1>;
  showHeader: boolean;
}) {
  const isUser = msg.role === "user";
  const meta   = PROVIDER_META[msg.modelUsed ?? "default"] ?? PROVIDER_META.default;
  const name   = isUser ? "You" : (msg.modelUsed ? (PROVIDER_META[msg.modelUsed]?.label ?? msg.modelUsed) : meta.label);
  const time   = formatTime(msg);

  return (
    <div className={cn("group flex gap-3 rounded-lg px-2 py-0.5 -mx-2 hover:bg-white/[0.02]", !showHeader && "mt-0.5")}>
      {/* avatar rail — only render on the first message of a run */}
      <div className="w-9 shrink-0 pt-0.5">
        {showHeader ? (
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold",
              isUser ? "bg-white/8 text-white/60" : "border border-white/8"
            )}
            style={!isUser ? { backgroundColor: meta.color + "18", color: meta.color } : undefined}
          >
            {isUser ? "P" : meta.icon}
          </div>
        ) : (
          <span className="block text-center text-[9px] text-white/0 group-hover:text-white/15">{time}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-white/85">{name}</span>
            {time && <span className="text-[10px] text-white/20">{time}</span>}
          </div>
        )}

        <div
          className="text-[13.5px] leading-relaxed text-white/75"
          dangerouslySetInnerHTML={{
            __html: msg.content
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/\n/g, "<br/>"),
          }}
        />

        {/* sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.sources.map((src, i) => (
              <span
                key={`${src}-${i}`}
                className="flex items-center gap-1 rounded-full border border-white/8 px-2 py-0.5 text-[10px] text-white/25"
              >
                <FileText className="h-2.5 w-2.5" />
                {src.length > 28 ? src.slice(0, 25) + "…" : src}
              </span>
            ))}
          </div>
        )}

        {/* feedback */}
        {!isUser && msg.contextUsed && (
          <div className="mt-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="text-[10px] text-white/15">Helpful?</span>
            {([1, -1] as const).map(r => (
              <button
                key={r}
                onClick={() => onFeedback(msg, r)}
                disabled={!!feedbackSent[msg.id]}
                className={cn(
                  "rounded-lg p-1 transition-colors",
                  feedbackSent[msg.id] === r
                    ? r === 1 ? "text-emerald-400" : "text-red-400"
                    : "text-white/15 hover:text-white/50"
                )}
              >
                {r === 1
                  ? <ThumbsUp className="h-3 w-3" />
                  : <ThumbsDown className="h-3 w-3" />}
              </button>
            ))}
            {feedbackSent[msg.id] && (
              <span className="text-[10px] text-white/20">
                {feedbackSent[msg.id] === 1 ? "Boosting this source" : "Reducing this source"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Source list item (styled as a channel row) ─────────────────────── */
function DocItem({
  doc, onDelete,
}: {
  doc: Doc;
  onDelete: (source: string) => void;
}) {
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[0.04]">
      <span className="shrink-0 text-sm leading-none">{TYPE_ICON[doc.type] ?? "📄"}</span>
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-white/55">
        {doc.source.length > 26 ? doc.source.slice(0, 23) + "…" : doc.source}
      </p>
      <span className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] text-white/30 group-hover:hidden">
        {doc.chunks}
      </span>
      <button
        onClick={() => onDelete(doc.source)}
        className="hidden shrink-0 rounded p-0.5 text-white/30 hover:!text-red-400 group-hover:block"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ─── Typing indicator (plain text, matches the reference channel) ────── */
function TypingIndicator({ provider }: { provider: string }) {
  const meta = PROVIDER_META[provider] ?? PROVIDER_META.default;
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: meta.color }} />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      </span>
      <span className="text-[12px] text-white/30">{meta.label} is typing</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function ChatPage() {
  const { user }       = useUser();
  const { workspaceId } = useWorkspace();

  const {
    messages, setMessages, loading: sessionLoading,
    saving, saveUserMessage, saveAssistantMessage,
    saveFeedback, clearSession,
  } = useChatPersistence();

  /* state */
  const [input,       setInput      ] = useState("");
  const [querying,    setQuerying   ] = useState(false);
  const [docs,        setDocs       ] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [ragOnline,   setRagOnline  ] = useState<boolean | null>(null);
  const [showDocs,    setShowDocs   ] = useState(true);
  const [urlInput,    setUrlInput   ] = useState("");
  const [showUrl,     setShowUrl    ] = useState(false);
  const [docFilter,   setDocFilter  ] = useState("");
  const [feedbackSent,setFeedbackSent] = useState<Record<string, 1 | -1>>({});
  const [activeModel, setActiveModel] = useState("default");
  const [connectedModels, setConnectedModels] = useState<ConnectedModel[]>([]);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const textareaRef= useRef<HTMLTextAreaElement>(null);

  /* fetch connected models */
  const fetchModels = useCallback(async () => {
    try {
      const res  = await fetch("/api/agents/keys");
      const data = await res.json();
      setConnectedModels(data.keys ?? []);
    } catch {}
  }, []);

  /* fetch docs */
  const fetchDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res  = await fetch("/api/rag/documents", {
        headers: { "x-workspace-id": workspaceId ?? "" },
      });
      const data = await res.json();
      const seen = new Set<string>();
      setDocs((data.documents ?? []).filter((d: Doc) => {
        if (seen.has(d.source)) return false;
        seen.add(d.source);
        return true;
      }));
    } catch {}
    finally { setDocsLoading(false); }
  }, [workspaceId]);

  /* rag health */
  useEffect(() => {
    fetch("/api/rag/health")
      .then(r => r.json())
      .then(d => setRagOnline(d.ok ?? false))
      .catch(() => setRagOnline(false));
  }, []);

  useEffect(() => { fetchDocs();   }, [fetchDocs]);
  useEffect(() => { fetchModels(); }, [fetchModels]);

  /* auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, querying]);

  /* auto-resize textarea */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  /* ── Send message ─────────────────────────────────────────────────── */
  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || querying) return;
    setInput("");
    setQuerying(true);

    const tempUser: PersistedMessage = {
      id: `tmp_u_${Date.now()}`, role: "user", content,
      sources: [], contextUsed: false, chunkIds: [],
    };
    setMessages(prev => [...prev, tempUser]);

    const userMsgId = await saveUserMessage(content).catch(() => null);
    if (userMsgId) {
      setMessages(prev => prev.map(m => m.id === tempUser.id ? { ...m, id: userMsgId } : m));
    }

    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId ?? "",
          ...(activeModel !== "default" ? { "x-agent-provider": activeModel } : {}),
        },
        body: JSON.stringify({
          question: content,
          agentProvider: activeModel !== "default" ? activeModel : undefined,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.status === 503) {
        const d = await res.json();
        setMessages(prev => prev.filter(m => m.id !== tempUser.id && m.id !== userMsgId));
        setInput(content);
        toast.warning("echo-nemo-1.0 is warming up", {
          description: d.reason ?? "Wait ~15s and retry.",
          action: { label: "Retry", onClick: () => sendMessage(content) },
        });
        return;
      }

      if (!res.ok) throw new Error(`${res.status}`);

      const data = await res.json();
      const providerUsed = data.model_used ?? activeModel;

      const tempAsst: PersistedMessage = {
        id: `tmp_a_${Date.now()}`, role: "assistant",
        content: data.answer ?? "No response.",
        sources: data.sources ?? [],
        modelUsed: providerUsed,
        contextUsed: data.context_used ?? false,
        chunkIds: data.chunk_ids ?? [],
      };
      setMessages(prev => [...prev, tempAsst]);

      const asstId = await saveAssistantMessage(tempAsst.content, {
        sources: tempAsst.sources,
        modelUsed: tempAsst.modelUsed ?? undefined,
        contextUsed: tempAsst.contextUsed,
        chunkIds: tempAsst.chunkIds,
      }).catch(() => null);

      if (asstId) {
        setMessages(prev => prev.map(m => m.id === tempAsst.id ? { ...m, id: asstId } : m));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempUser.id && m.id !== userMsgId));
      setInput(content);
      toast.error("Something went wrong", {
        action: { label: "Retry", onClick: () => sendMessage(content) },
      });
    } finally {
      setQuerying(false);
    }
  };

  /* ── Feedback ─────────────────────────────────────────────────────── */
  const handleFeedback = async (msg: PersistedMessage, rating: 1 | -1) => {
    if (feedbackSent[msg.id]) return;
    setFeedbackSent(prev => ({ ...prev, [msg.id]: rating }));
    const prev = messages[messages.indexOf(msg) - 1];
    await fetch("/api/rag/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: prev?.content ?? "",
        answer: msg.content,
        sources: msg.sources ?? [],
        rating,
        chunkIds: msg.chunkIds ?? [],
        modelUsed: msg.modelUsed ?? "echo-nemo-1.0",
      }),
    });
    await saveFeedback(msg.id, rating);
  };

  /* ── File upload ──────────────────────────────────────────────────── */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const id = toast.loading(`Processing ${file.name}…`);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch("/api/rag/ingest", {
        method: "POST", body: fd,
        headers: { "x-workspace-id": workspaceId ?? "" },
      });
      const data = await res.json();
      if (!res.ok) { toast.error("Upload failed", { id, description: data.error }); return; }
      toast.success(`${file.name} indexed`, { id, description: `${data.ingested} chunks added.` });
      await fetchDocs();
    } catch {
      toast.error("Upload failed", { id });
    }
    e.target.value = "";
  };

  /* ── URL ingest ───────────────────────────────────────────────────── */
  const handleUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setShowUrl(false);
    const id = toast.loading(`Fetching ${url}…`);
    try {
      const res  = await fetch("/api/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": workspaceId ?? "" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("URL fetch failed", { id, description: data.error });
        setShowUrl(true); setUrlInput(url);
        return;
      }
      toast.success("URL indexed", { id, description: `${data.ingested} chunks added.` });
      setUrlInput("");
      await fetchDocs();
    } catch {
      toast.error("Network error", { id });
      setShowUrl(true);
    }
  };

  /* ── Delete doc ───────────────────────────────────────────────────── */
  const handleDelete = async (source: string) => {
    if (!confirm(`Remove "${source}"?`)) return;
    const id = toast.loading(`Removing…`);
    try {
      const res = await fetch("/api/rag/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, workspaceId }),
      });
      if (!res.ok) { toast.error("Delete failed", { id }); return; }
      toast.success("Removed", { id });
      setDocs(prev => prev.filter(d => d.source !== source));
    } catch {
      toast.error("Network error", { id });
    }
  };

  /* suggested questions */
  const SUGGESTIONS = [
    "Summarise the key points",
    "What are the main topics?",
    "List any action items",
    "What decisions were made?",
  ];

  const filteredDocs = useMemo(
    () => docs.filter(d => d.source.toLowerCase().includes(docFilter.toLowerCase())),
    [docs, docFilter]
  );

  const totalChunks = docs.reduce((s, d) => s + d.chunks, 0);
  const activeMeta  = PROVIDER_META[activeModel] ?? PROVIDER_META.default;

  /* ── Loading skeleton ─────────────────────────────────────────────── */
  if (sessionLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-full border border-primary/20" />
            <Sparkles className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-primary" />
          </div>
          <p className="text-xs text-white/30">Restoring your conversation…</p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-full overflow-hidden bg-black">

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      {showDocs && (
        <div
          className="flex w-64 shrink-0 flex-col border-r border-white/6"
          style={{ backgroundColor: "#0a0a0c" }}
        >
          {/* search */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/25" />
              <input
                value={docFilter}
                onChange={e => setDocFilter(e.target.value)}
                placeholder="Search sources"
                className="w-full bg-transparent text-[12px] text-white/70 placeholder:text-white/20 focus:outline-none"
              />
            </div>
          </div>

          {/* section label */}
          <div className="flex items-center justify-between px-4 pb-1.5 pt-4">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-white/25">Sources</span>
            {totalChunks > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-primary"
                style={{ backgroundColor: "rgba(124,58,237,0.15)" }}
              >
                {totalChunks}
              </span>
            )}
          </div>

          {/* rag status */}
          <div className="mx-3 mb-2">
            {ragOnline === false && (
              <div
                className="flex items-center gap-2 rounded-lg border border-amber-500/20 px-3 py-2"
                style={{ backgroundColor: "rgba(245,158,11,0.06)" }}
              >
                <AlertCircle className="h-3 w-3 shrink-0 text-amber-400" />
                <p className="text-[10px] text-amber-400/80">RAG warming up — ~15s</p>
              </div>
            )}
          </div>

          {/* doc list, styled as a channel list */}
          <div className="flex-1 overflow-y-auto px-2">
            {docsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-white/10" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[11px] text-white/15">
                  {docs.length === 0 ? "No documents yet" : "No matches"}
                </p>
                {docs.length === 0 && (
                  <p className="mt-0.5 text-[10px] text-white/10">Upload a file or add a URL</p>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredDocs.map((doc, i) => (
                  <DocItem key={`${doc.source}-${i}`} doc={doc} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>

          {/* ingest actions */}
          <div className="space-y-1.5 border-t border-white/6 px-3 py-3">
            <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.csv,.txt,.md" className="hidden" onChange={handleFile} />

            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg border border-white/6 px-3 py-2 text-[11px] text-white/40 transition-all hover:border-white/12 hover:text-white/70"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              Upload file
            </button>

            {showUrl ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleUrl()}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white placeholder:text-white/15 focus:border-primary/40 focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={handleUrl}
                    disabled={!urlInput.trim()}
                    className="flex-1 rounded-lg bg-primary/15 py-1.5 text-[10px] font-medium text-primary hover:bg-primary/25 disabled:opacity-40"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowUrl(false); setUrlInput(""); }}
                    className="rounded-lg px-2 text-white/20 hover:text-white/50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowUrl(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/6 px-3 py-2 text-[11px] text-white/40 transition-all hover:border-white/12 hover:text-white/70"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                Add URL
              </button>
            )}
          </div>

          {/* footer */}
          <div className="border-t border-white/6 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {ragOnline === true ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ) : (
                  <Sparkles className="h-3 w-3 text-primary" />
                )}
                <span className="text-[9px] font-medium text-white/25">echo-nemo-1.0</span>
              </div>
              {saving && (
                <span className="animate-pulse text-[9px] text-white/15">saving…</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CHAT ───────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* channel-style header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/6 px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setShowDocs(!showDocs)}
              className="shrink-0 rounded-lg p-1.5 text-white/25 transition-colors hover:bg-white/5 hover:text-white/60"
              title={showDocs ? "Hide sources" : "Show sources"}
            >
              <Hash className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-bold text-white">
                {workspaceId ? "workspace" : "knowledge-base"}
              </h1>
              <p className="truncate text-[11.5px] text-white/35">
                {docs.length === 0
                  ? "Add sources, then ask anything"
                  : `Answers grounded in ${docs.length} source${docs.length > 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <ModelSelector models={connectedModels} active={activeModel} onChange={setActiveModel} />
            <div className="flex items-center gap-1.5 text-white/25">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-[12px]">{totalChunks}</span>
            </div>
            {messages.length > 0 && (
              <span className="text-[11px] text-white/20">
                {messages.length} msg{messages.length !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={async () => {
                if (!confirm("Clear all chat history?")) return;
                await clearSession();
                setFeedbackSent({});
              }}
              className="text-[11px] text-white/20 transition-colors hover:text-white/50"
            >
              Clear
            </button>
          </div>
        </div>

        {/* messages area */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-6">

            {/* empty state */}
            {messages.length === 0 && !sessionLoading && (
              <div className="flex flex-col items-center py-20 text-center">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(124,58,237,0.05))",
                    border: "1px solid rgba(124,58,237,0.2)",
                  }}
                >
                  ✦
                </div>
                <h2 className="mt-5 text-lg font-semibold text-white">
                  echo-nemo-1.0
                </h2>
                <p className="mt-2 max-w-xs text-sm text-white/30">
                  {docs.length === 0
                    ? "Add files or URLs to your knowledge base, then ask anything."
                    : `${docs.length} source${docs.length > 1 ? "s" : ""} ready. Ask me anything about them.`}
                </p>

                {docs.length > 0 && (
                  <div className="mt-8 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="rounded-full border border-white/8 bg-white/[0.02] px-3.5 py-1.5 text-[11px] text-white/40 transition-all hover:border-white/16 hover:text-white/70"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* day divider — the whole visible session reads as "Today" */}
            {messages.length > 0 && <DayDivider label="Today" />}

            {/* messages, grouped: consecutive same-role messages collapse the header */}
            <div className="space-y-2 pt-2">
              {messages.map((msg, i) => (
                <MessageRow
                  key={msg.id}
                  msg={msg}
                  onFeedback={handleFeedback}
                  feedbackSent={feedbackSent}
                  showHeader={i === 0 || messages[i - 1].role !== msg.role}
                />
              ))}
            </div>

            {/* typing indicator */}
            {querying && (
              <div className="mt-2">
                <TypingIndicator provider={activeModel} />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── INPUT ─────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <div
              className="overflow-hidden rounded-xl border border-white/10 transition-colors focus-within:border-white/20"
              style={{ backgroundColor: "#111114" }}
            >
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Message #${workspaceId ? "workspace" : "knowledge-base"}`}
                rows={1}
                className="max-h-40 min-h-[46px] w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-sm text-white shadow-none placeholder:text-white/20 focus-visible:ring-0"
              />

              {/* toolbar row, mirrors a Slack composer */}
              <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg p-1.5 text-white/25 transition-colors hover:bg-white/6 hover:text-white/60"
                    title="Attach a file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-white/25 transition-colors hover:bg-white/6 hover:text-white/60"
                    title="Emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                </div>

                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || querying}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
                    input.trim() && !querying
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "bg-white/5 text-white/20"
                  )}
                >
                  {querying
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between px-1">
              <p className="text-[10px] text-white/10">
                ↵ to send · ⇧↵ for new line · answers from your documents only
              </p>
              {activeModel !== "default" && (
                <p className="text-[10px] text-white/15">
                  Answering with {activeMeta.label}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}