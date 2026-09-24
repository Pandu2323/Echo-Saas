// src/lib/sentra-cli-auth.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function requireSentraAuth(req: Request) {
  const apiKey =
    req.headers.get("x-sentra-apikey") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (apiKey) {
    const key = await db.agentKey.findFirst({
      where: {
        keyHash: apiKey,
        isActive: true,
        provider: { startsWith: "cli:" },
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    if (!key) return null;

    return {
      userId: key.user.id,
      email: key.user.email,
      workspaceId: key.provider.replace("cli:", ""),
      source: "cli" as const,
    };
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true, email: true },
  });

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    workspaceId: null,
    source: "clerk" as const,
  };
}