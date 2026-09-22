import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";

// GET — list connected keys
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ keys: [] });

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ keys: [] });

  const keys = await db.agentKey.findMany({
    where:  { userId: user.id, isActive: true },
    select: { provider: true, model: true, keyHint: true },
  });

  return NextResponse.json({ keys });
}

// POST — store a new key
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider, apiKey, model } = await req.json();

  if (!provider || !apiKey?.trim() || !model) {
    return NextResponse.json(
      { error: "provider, apiKey, and model are required" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // validate the key is real before storing
  const valid = await validateKey(provider, apiKey.trim(), model);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid API key — check the key and try again." },
      { status: 400 }
    );
  }

  const encrypted = encrypt(apiKey.trim());
  const hint      = apiKey.trim().slice(-4);

  await db.agentKey.upsert({
    where:  { userId_provider: { userId: user.id, provider } },
    update: { keyHash: encrypted, keyHint: hint, model, isActive: true },
    create: { userId: user.id, provider, keyHash: encrypted, keyHint: hint, model, isActive: true },
  });

  return NextResponse.json({ success: true });
}

// DELETE — remove a key
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = await req.json();

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.agentKey.updateMany({
    where: { userId: user.id, provider },
    data:  { isActive: false },
  });

  return NextResponse.json({ success: true });
}

// live key validation before storing
async function validateKey(
  provider: string,
  apiKey:   string,
  model:    string
): Promise<boolean> {
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    }

    if (provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      return res.ok;
    }

    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      return res.ok;
    }

    if (provider === "mistral") {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    }

    return true; // unknown provider — allow through
  } catch {
    return false;
  }
}