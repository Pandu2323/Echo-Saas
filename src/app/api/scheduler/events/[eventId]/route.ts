import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// PATCH — update event
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const body = await req.json();

  const event = await db.schedulerEvent.update({
    where: { id: eventId },
    data: {
      ...(body.title     !== undefined && { title:     body.title }),
      ...(body.status    !== undefined && { status:    body.status }),
      ...(body.location  !== undefined && { location:  body.location }),
      ...(body.startTime !== undefined && { startTime: body.startTime }),
      ...(body.endTime   !== undefined && { endTime:   body.endTime }),
      ...(body.needsReply !== undefined && { needsReply: body.needsReply }),
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

// DELETE — delete event
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  await db.schedulerEvent.delete({ where: { id: eventId } });
  return NextResponse.json({ success: true });
}