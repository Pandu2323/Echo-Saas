import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET — fetch events for a month
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const year        = parseInt(searchParams.get("year")  ?? `${new Date().getFullYear()}`);
  const month       = parseInt(searchParams.get("month") ?? `${new Date().getMonth()}`);
  const personal    = searchParams.get("personal") === "true";

  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // date range for the month
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0, 23, 59, 59);

  const events = await db.schedulerEvent.findMany({
    where: {
      workspaceId,
      isPersonal: personal ? true : false,
      date: { gte: start, lte: end },
      ...(personal ? { creatorId: user.id } : {}),
    },
    include: {
      creator:   { select: { id: true, name: true, email: true, imageUrl: true } },
      attendees: {
        include: {
          user: { select: { id: true, name: true, email: true, imageUrl: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({ events });
}

// POST — create event
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    workspaceId, title, date, startTime,
    endTime, location, status, isPersonal,
    needsReply, attendeeIds = [],
  } = await req.json();

  if (!workspaceId || !title?.trim() || !date || !startTime) {
    return NextResponse.json({ error: "workspaceId, title, date, startTime required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const event = await db.schedulerEvent.create({
    data: {
      workspaceId,
      title:      title.trim(),
      date:       new Date(date),
      startTime,
      endTime:    endTime ?? null,
      location:   location ?? null,
      status:     status ?? "UPCOMING",
      isPersonal: isPersonal ?? false,
      needsReply: needsReply ?? false,
      creatorId:  user.id,
      attendees: {
        create: [
          // creator is always an attendee
          { userId: user.id, replied: true, accepted: true },
          // other attendees
          ...attendeeIds
            .filter((id: string) => id !== user.id)
            .map((id: string) => ({ userId: id, replied: false, accepted: null })),
        ],
      },
    },
    include: {
      creator:   { select: { id: true, name: true, email: true, imageUrl: true } },
      attendees: {
        include: {
          user: { select: { id: true, name: true, email: true, imageUrl: true } },
        },
      },
    },
  });

  return NextResponse.json({ event });
}