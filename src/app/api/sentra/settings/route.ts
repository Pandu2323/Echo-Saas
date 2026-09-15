import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const settings = await db.sentraSettings.findUnique({ where: { workspaceId } });
  return NextResponse.json({
    settings: settings ?? {
      scanOnPush: true, nightlyScan: true, autoFixLowRisk: false,
      emailAlerts: true, slackAlerts: false,
      alertEmail: null, slackWebhookUrl: null, githubToken: null,
    },
  });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workspaceId, ...data } = body;

  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const settings = await db.sentraSettings.upsert({
    where:  { workspaceId },
    update: data,
    create: { workspaceId, ...data },
  });

  return NextResponse.json({ settings });
}