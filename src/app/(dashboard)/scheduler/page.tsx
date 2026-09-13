/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useUser } from "@clerk/nextjs";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  X,
  Check,
  Loader2,
  Users,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────── */
type EventStatus = "UPCOMING" | "CONFIRMED" | "TENTATIVE";

interface Member {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
}

interface Attendee {
  id: string;
  replied: boolean;
  accepted: boolean | null;
  user: Member;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  status: EventStatus;
  isPersonal: boolean;
  needsReply: boolean;
  creator: Member;
  attendees: Attendee[];
}

/* ─── Constants ──────────────────────────────────────────────────────── */
const MONTHS = [
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

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const STATUS_STYLES: Record<EventStatus, string> = {
  UPCOMING: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  CONFIRMED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  TENTATIVE: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

/* ─── Helper: get initials ───────────────────────────────────────────── */
function initials(m: Member) {
  return (m.name ?? m.email)
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* ─── Attendee avatar stack ──────────────────────────────────────────── */
function AttendeeStack({
  attendees,
  max = 4,
}: {
  attendees: Attendee[];
  max?: number;
}) {
  const visible = attendees.slice(0, max);
  const overflow = attendees.length - max;
  return (
    <div className="flex items-center">
      {visible.map((a, i) => (
        <div
          key={a.id}
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: max - i }}
        >
          <Avatar className="h-5 w-5 ring-1 ring-black">
            <AvatarImage src={a.user.imageUrl ?? ""} />
            <AvatarFallback
              className="text-[8px]"
              style={{ backgroundColor: "#2a2a35" }}
            >
              {initials(a.user).slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-medium text-white/30 ring-1 ring-black"
          style={{ marginLeft: -6, backgroundColor: "#2a2a35" }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

/* ─── Status badge ───────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: EventStatus }) {
  const labels = {
    UPCOMING: "Upcoming",
    CONFIRMED: "Confirmed",
    TENTATIVE: "Tentative",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium",
        STATUS_STYLES[status],
      )}
    >
      {labels[status]}
    </span>
  );
}

/* ─── Event row (right panel) ────────────────────────────────────────── */
function EventRow({
  event,
  currentUserId,
  onReply,
  onDelete,
  onStatusChange,
}: {
  event: CalendarEvent;
  currentUserId: string;
  onReply: (eventId: string, accepted: boolean) => void;
  onDelete: (eventId: string) => void;
  onStatusChange: (eventId: string, status: EventStatus) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  const myAttendance = event.attendees.find((a) => a.user.id === currentUserId);
  const needsMyReply =
    event.needsReply && myAttendance && !myAttendance.replied;
  const isCreator = event.creator.id === currentUserId;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-white/10 hover:bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3">
        {/* left content */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white/85">
              {event.title}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={event.status} />
            <AttendeeStack attendees={event.attendees} />

            {event.startTime && (
              <span className="flex items-center gap-1 text-[11px] text-white/30">
                <Clock className="h-3 w-3" />
                {event.startTime}
                {event.endTime && ` – ${event.endTime}`}
              </span>
            )}

            {event.location && (
              <span className="flex items-center gap-1 text-[11px] text-white/30">
                <MapPin className="h-3 w-3" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        {/* right actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* needs reply buttons */}
          {needsMyReply && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onReply(event.id, true)}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                <Check className="h-3 w-3" /> Accept
              </button>
              <button
                onClick={() => onReply(event.id, false)}
                className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/8 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/15 transition-colors"
              >
                <X className="h-3 w-3" /> Decline
              </button>
            </div>
          )}

          {/* my reply status */}
          {myAttendance?.replied && !isCreator && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-medium",
                myAttendance.accepted
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400",
              )}
            >
              {myAttendance.accepted ? "Accepted" : "Declined"}
            </span>
          )}

          {/* status change (creator only) */}
          {isCreator && (
            <div className="relative">
              <button
                onClick={() => setShowStatus(!showStatus)}
                className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] text-white/30 hover:border-white/15 hover:text-white/60 transition-colors"
              >
                Status <ChevronDown className="h-3 w-3" />
              </button>
              {showStatus && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-white/10 py-1 shadow-2xl"
                  style={{ backgroundColor: "#111116" }}
                >
                  {(
                    ["UPCOMING", "CONFIRMED", "TENTATIVE"] as EventStatus[]
                  ).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onStatusChange(event.id, s);
                        setShowStatus(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-[11px] hover:bg-white/5",
                        event.status === s ? "text-primary" : "text-white/40",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          s === "UPCOMING"
                            ? "bg-blue-400"
                            : s === "CONFIRMED"
                              ? "bg-emerald-400"
                              : "bg-amber-400",
                        )}
                      />
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                      {event.status === s && (
                        <Check className="ml-auto h-3 w-3" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* delete (creator only) */}
          {isCreator && (
            <button
              onClick={() => onDelete(event.id)}
              className="rounded-lg p-1.5 text-white/0 transition-all group-hover:text-white/15 hover:!text-red-400 hover:bg-red-500/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Add Event Modal ────────────────────────────────────────────────── */
function AddEventModal({
  selectedDate,
  members,
  workspaceId,
  isPersonal,
  onAdd,
  onClose,
}: {
  selectedDate: Date;
  members: Member[];
  workspaceId: string;
  isPersonal: boolean;
  onAdd: (event: CalendarEvent) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("10:00 am");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<EventStatus>("UPCOMING");
  const [needsReply, setNeedsReply] = useState(false);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAttendee = (id: string) => {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduler/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: title.trim(),
          date: selectedDate.toISOString(),
          startTime,
          endTime: endTime || null,
          location: location || null,
          status,
          isPersonal,
          needsReply,
          attendeeIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create event");
        return;
      }
      onAdd(data.event);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{ backgroundColor: "#111116" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Add Event</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/30">
              {selectedDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-white/20 hover:text-white/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* form */}
        <div className="space-y-4 px-6 py-5">
          {/* title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-white/25">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Event title…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/15 focus:border-primary/40 focus:outline-none"
            />
          </div>

          {/* time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-white/25">
                Start time
              </label>
              <input
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="10:00 am"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/15 focus:border-primary/40 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-white/25">
                End time
              </label>
              <input
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="11:00 am"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/15 focus:border-primary/40 focus:outline-none"
              />
            </div>
          </div>

          {/* location */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-white/25">
              Location
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room 4B / Video call / Remote…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/15 focus:border-primary/40 focus:outline-none"
            />
          </div>

          {/* status */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-white/25">
              Status
            </label>
            <div className="flex gap-2">
              {(["UPCOMING", "CONFIRMED", "TENTATIVE"] as EventStatus[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "flex-1 rounded-xl border py-2 text-[11px] font-medium transition-all",
                      status === s
                        ? STATUS_STYLES[s]
                        : "border-white/8 text-white/25 hover:border-white/15",
                    )}
                  >
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* attendees */}
          {!isPersonal && members.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-white/25">
                Attendees
              </label>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const selected = attendeeIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleAttendee(m.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all",
                        selected
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-white/8 text-white/30 hover:border-white/15",
                      )}
                    >
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={m.imageUrl ?? ""} />
                        <AvatarFallback className="text-[7px]">
                          {initials(m)}
                        </AvatarFallback>
                      </Avatar>
                      {m.name ?? m.email.split("@")[0]}
                      {selected && <Check className="h-2.5 w-2.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* needs reply toggle */}
          {/* needs reply toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.015] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/70">
                Needs reply
              </p>
              <p className="mt-0.5 text-[10px] text-white/30">
                Attendees must accept or decline
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={needsReply}
              onClick={() => setNeedsReply((prev) => !prev)}
              className={cn(
                "relative ml-4 h-6 w-11 shrink-0 rounded-full p-0.5",
                "transition-colors duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary/30",
                needsReply ? "bg-primary" : "bg-white/10 hover:bg-white/15",
              )}
            >
              <span
                className={cn(
                  "block h-5 w-5 rounded-full bg-white shadow-md",
                  "transition-transform duration-200 ease-out",
                  needsReply ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* footer */}
        <div className="flex gap-2 border-t border-white/5 px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 py-2.5 text-xs text-white/40 hover:border-white/20 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Add event"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function SchedulerPage() {
  const { workspaceId } = useWorkspace();
  const { user } = useUser();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [isPersonal, setIsPersonal] = useState(false);
  const [showNeedsReply, setShowNeedsReply] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  /* fetch current user's DB id */
  useEffect(() => {
    if (!workspaceId) return;
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => {
        const ws = data.workspaces?.find(
          (w: { id: string }) => w.id === workspaceId,
        );
        if (ws) {
          // get members to find current user's internal id
          fetch(`/api/workspaces/${workspaceId}/members`)
            .then((r) => r.json())
            .then((md) => {
              setMembers(
                md.members?.map((m: { user: Member }) => m.user) ?? [],
              );
              // find user whose email matches clerk user email
              const me = md.members?.find(
                (m: { user: Member }) =>
                  m.user.email === user?.primaryEmailAddress?.emailAddress,
              );
              if (me) setCurrentUserId(me.user.id);
            });
        }
      });
  }, [workspaceId, user]);

  /* fetch events */
  const fetchEvents = useCallback(
    async (silent = false) => {
      if (!workspaceId) return;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(
          `/api/scheduler/events?workspaceId=${workspaceId}&year=${viewYear}&month=${viewMonth}&personal=${isPersonal}`,
        );
        const data = await res.json();
        setEvents(data.events ?? []);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [workspaceId, viewYear, viewMonth, isPersonal],
  );

  useEffect(() => {
    fetchEvents(false);
  }, [fetchEvents]);

  /* calendar helpers */
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  /* events for selected day */
  const dayEvents = events.filter((e) => {
    const d = new Date(e.date);
    return (
      d.getFullYear() === selectedDate.getFullYear() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getDate() === selectedDate.getDate()
    );
  });

  /* events needing reply */
  const needsReplyEvents = events.filter(
    (e) =>
      e.needsReply &&
      e.attendees.some((a) => a.user.id === currentUserId && !a.replied),
  );

  /* dots on calendar */
  const eventsByDate: Record<string, boolean> = {};
  events.forEach((e) => {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    eventsByDate[key] = true;
  });

  const hasEvents = (year: number, month: number, day: number) =>
    eventsByDate[`${year}-${month}-${day}`] ?? false;

  /* actions */
  const handleReply = async (eventId: string, accepted: boolean) => {
    await fetch(`/api/scheduler/events/${eventId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted }),
    });
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        return {
          ...e,
          attendees: e.attendees.map((a) =>
            a.user.id === currentUserId ? { ...a, replied: true, accepted } : a,
          ),
        };
      }),
    );
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm("Delete this event?")) return;
    await fetch(`/api/scheduler/events/${eventId}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  const handleStatusChange = async (eventId: string, status: EventStatus) => {
    const res = await fetch(`/api/scheduler/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, ...data.event } : e)),
    );
  };

  const isToday = (day: number) =>
    day === today.getDate() &&
    viewMonth === today.getMonth() &&
    viewYear === today.getFullYear();

  const isSelected = (day: number) =>
    day === selectedDate.getDate() &&
    viewMonth === selectedDate.getMonth() &&
    viewYear === selectedDate.getFullYear();

  const selectDay = (day: number) => {
    setSelectedDate(new Date(viewYear, viewMonth, day));
  };

  /* day panel heading */
  const selectedLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const displayEvents = showNeedsReply ? needsReplyEvents : dayEvents;
  const needsReplyCount = dayEvents.filter(
    (e) =>
      e.needsReply &&
      e.attendees.some((a) => a.user.id === currentUserId && !a.replied),
  ).length;

  /* ─── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT: calendar ─────────────────────────────────────────── */}
      <div
        className="flex w-80 shrink-0 flex-col border-r border-white/5 px-5 py-5"
        style={{ backgroundColor: "rgba(255,255,255,0.01)" }}
      >
        {/* workspace / personal toggle */}
        <div className="mb-5 flex rounded-xl border border-white/8 bg-white/[0.02] p-1">
          {[
            { label: "Workspace", value: false },
            { label: "Personal", value: true },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setIsPersonal(opt.value)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-all",
                isPersonal === opt.value
                  ? "bg-primary/15 text-primary"
                  : "text-white/25 hover:text-white/50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* month nav */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="rounded-lg p-1.5 text-white/20 hover:bg-white/5 hover:text-white/60 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {MONTHS[viewMonth]}
            </span>
            <span className="text-sm text-white/30">{viewYear}</span>
          </div>

          <button
            onClick={nextMonth}
            className="rounded-lg p-1.5 text-white/20 hover:bg-white/5 hover:text-white/60 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* day headers */}
        <div className="mb-1 grid grid-cols-7">
          {DAYS.map((d) => (
            <div
              key={d}
              className="py-1.5 text-center text-[9px] font-medium text-white/20"
            >
              {d}
            </div>
          ))}
        </div>

        {/* calendar grid */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {/* empty cells before month start */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e-${i}`} />
          ))}

          {/* day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const todayDot = isToday(day);
            const sel = isSelected(day);
            const hasEvt = hasEvents(viewYear, viewMonth, day);

            return (
              <button
                key={day}
                onClick={() => selectDay(day)}
                className={cn(
                  "relative flex h-9 w-full flex-col items-center justify-center rounded-lg text-sm transition-all",
                  sel && "bg-white text-black font-semibold",
                  !sel && todayDot && "border border-white/20 text-white",
                  !sel &&
                    !todayDot &&
                    "text-white/40 hover:bg-white/5 hover:text-white/80",
                )}
              >
                {day}
                {/* event dot */}
                {hasEvt && !sel && (
                  <span
                    className={cn(
                      "absolute bottom-1 h-1 w-1 rounded-full",
                      todayDot ? "bg-primary" : "bg-white/25",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* mini stats */}
        <div className="mt-5 space-y-2 border-t border-white/5 pt-5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/25">This month</span>
            <span className="font-medium text-white/50">
              {events.length} events
            </span>
          </div>
          {needsReplyEvents.length > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-amber-400/60">Need reply</span>
              <span className="font-medium text-amber-400">
                {needsReplyEvents.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: day detail ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* day header */}
        <div className="flex items-center justify-between border-b border-white/5 px-8 py-5">
          <div>
            <h2 className="text-xl font-bold text-white">{selectedLabel}</h2>
            <p className="mt-0.5 text-sm text-white/25">
              {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
              {needsReplyCount > 0 && (
                <span className="ml-2 text-amber-400">
                  · {needsReplyCount} need{needsReplyCount !== 1 ? "" : "s"} a
                  reply
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* needs reply filter */}
            {needsReplyCount > 0 && (
              <button
                onClick={() => setShowNeedsReply(!showNeedsReply)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-medium transition-all",
                  showNeedsReply
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-white/8 text-white/30 hover:border-white/15",
                )}
              >
                Needs reply
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showNeedsReply && "rotate-180",
                  )}
                />
              </button>
            )}

            {/* add event */}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        {/* events list */}
        <div className="flex-1 overflow-y-auto px-8 py-5">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          ) : displayEvents.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02]">
                <Clock className="h-5 w-5 text-white/15" />
              </div>
              <div>
                <p className="text-sm text-white/25">
                  {showNeedsReply
                    ? "No events need a reply"
                    : "No events on this day"}
                </p>
                <p className="mt-0.5 text-xs text-white/15">
                  {!showNeedsReply && "Click + Add to schedule something"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayEvents
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    currentUserId={currentUserId}
                    onReply={handleReply}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add event modal ─────────────────────────────────────────── */}
      {showAdd && (
        <AddEventModal
          selectedDate={selectedDate}
          members={members}
          workspaceId={workspaceId ?? ""}
          isPersonal={isPersonal}
          onAdd={(event) => setEvents((prev) => [...prev, event])}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
