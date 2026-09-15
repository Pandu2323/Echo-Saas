/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const severity    = searchParams.get("severity");
  const status      = searchParams.get("status");
  const repoId      = searchParams.get("repoId");

  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const findings = await db.sentraFinding.findMany({
    where: {
      repo: { workspaceId },
      ...(severity ? { severity: severity as any } : {}),
      ...(status   ? { status:   status   as any } : {}),
      ...(repoId   ? { repoId }                    : {}),
    },
    include: {
      repo: { select: { fullName: true, owner: true, repoName: true } },
    },
    orderBy: [
      { severity: "asc" }, // CRITICAL first (alphabetically C < I < W)
      { createdAt: "desc" },
    ],
    take: 100,
  });

  return NextResponse.json({ findings });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { findingId, status, ignoreReason } = await req.json();

  const finding = await db.sentraFinding.update({
    where: { id: findingId },
    data: {
      status,
      ...(ignoreReason ? { ignoreReason } : {}),
      ...(status === "FIXED" ? { autoFixed: true } : {}),
    },
  });

  return NextResponse.json({ finding });
}