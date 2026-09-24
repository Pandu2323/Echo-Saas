import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireSentraAuth } from "@/lib/sentra-cli-auth";

export async function GET(req: Request) {
  const ctx = await requireSentraAuth(req);
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId") ?? ctx.workspaceId;
  const repoId = searchParams.get("repoId");

  if (!workspaceId)
    return NextResponse.json(
      { error: "workspaceId required" },
      { status: 400 },
    );

  const attackPaths = await db.sentraAttackPath.findMany({
    where: {
      repo: { workspaceId },
      ...(repoId ? { repoId } : {}),
    },
    include: {
      repo: { select: { fullName: true } },
    },
    orderBy: [{ severity: "asc" }, { cvssScore: "desc" }],
    take: 20,
  });

  return NextResponse.json({ attackPaths });
}
