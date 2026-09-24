// src/lib/cli-auth.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function getSentraApiContext(req: Request) {
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

  const { userId } = await auth();
  if (!userId) return null;

  return {
    clerkUserId: userId,
    source: "clerk" as const,
  };
}