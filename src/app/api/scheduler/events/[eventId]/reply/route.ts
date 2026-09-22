import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// POST — accept or decline an event
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const { accepted } = await req.json();

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.eventAttendee.upsert({
    where:  { eventId_userId: { eventId, userId: user.id } },
    update: { replied: true, accepted },
    create: { eventId, userId: user.id, replied: true, accepted },
  });

  return NextResponse.json({ success: true });
}