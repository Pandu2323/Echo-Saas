import { db } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      const poll = async () => {
        const scan = await db.sentraScan.findUnique({
          where:   { id: scanId },
          include: { findings: { select: { severity: true } } },
        });

        if (!scan) {
          send({ type: "error", message: "Scan not found" });
          controller.close();
          return;
        }

        send({
          type:         "progress",
          status:       scan.status,
          filesScanned: scan.filesScanned,
          findingsCount:scan.findingsCount,
          duration:     scan.duration,
          criticals:    scan.findings.filter(f => f.severity === "CRITICAL").length,
          warnings:     scan.findings.filter(f => f.severity === "WARNING").length,
        });

        if (scan.status === "COMPLETED" || scan.status === "FAILED") {
          controller.close();
          return;
        }

        setTimeout(poll, 2000);
      };

      await poll();

      req.signal.addEventListener("abort", () => {
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection:      "keep-alive",
    },
  });
}