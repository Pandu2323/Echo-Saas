import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// DELETE — disconnect repo
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { repoId } = await params;
  await db.sentraRepo.delete({ where: { id: repoId } });
  return NextResponse.json({ success: true });
}

// GET — single repo with full details
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId } = await params;

  const repo = await db.sentraRepo.findUnique({
    where: { id: repoId },
    include: {
      findings: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      commits: {
        orderBy: { committedAt: "desc" },
        take: 20,
      },
      scans: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!repo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ repo });
}