import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await req.json();

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await db.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId,
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = `sentra_${crypto.randomBytes(24).toString("hex")}`;
  const hint = token.slice(-6);

  await db.agentKey.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider: `cli:${workspaceId}`,
      },
    },
    update: {
      keyHash: token,
      keyHint: hint,
      isActive: true,
    },
    create: {
      userId: user.id,
      provider: `cli:${workspaceId}`,
      keyHash: token,
      keyHint: hint,
      model: "cli",
      isActive: true,
    },
  });

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
  });

  return NextResponse.json({
    token,
    workspaceId,
    workspaceName: workspace?.name ?? workspaceId,
    userId: user.id,
    email: user.email,
  });
}

export async function GET(req: Request) {
  const apiKey =
    req.headers.get("x-sentra-apikey") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const key = await db.agentKey.findFirst({
    where: {
      keyHash: apiKey,
      isActive: true,
      provider: {
        startsWith: "cli:",
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  if (!key) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const workspaceId = key.provider.replace("cli:", "");

  return NextResponse.json({
    valid: true,
    userId: key.user.id,
    email: key.user.email,
    workspaceId,
  });
}