"use client";

import { useState, useCallback, useRef } from "react";

export interface ScanProgress {
  status:       "idle" | "scanning" | "completed" | "failed";
  filesScanned: number;
  findingsCount:number;
  criticals:    number;
  warnings:     number;
  duration:     number | null;
  scanId:       string | null;
  error:        string | null;
}

const INITIAL: ScanProgress = {
  status:       "idle",
  filesScanned: 0,
  findingsCount:0,
  criticals:    0,
  warnings:     0,
  duration:     null,
  scanId:       null,
  error:        null,
};

export function useScanProgress() {
  const [progress, setProgress] = useState<ScanProgress>(INITIAL);
  const esRef = useRef<EventSource | null>(null);

  const startScan = useCallback(async (
    repoId:      string,
    workspaceId: string
  ) => {
    // reset
    setProgress({ ...INITIAL, status: "scanning" });

    // close any existing SSE connection
    esRef.current?.close();
    esRef.current = null;

    try {
      // trigger scan
      const res = await fetch("/api/sentra/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ repoId, workspaceId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setProgress(prev => ({
          ...prev,
          status: "failed",
          error:  data.error ?? "Failed to start scan",
        }));
        return;
      }

      const { scanId } = await res.json();

      setProgress(prev => ({ ...prev, scanId }));

      // open SSE stream for real-time progress
      const es = new EventSource(`/api/sentra/scan/${scanId}/status`);
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "progress") {
            setProgress(prev => ({
              ...prev,
              status:        data.status === "COMPLETED" ? "completed"
                           : data.status === "FAILED"    ? "failed"
                           : "scanning",
              filesScanned:  data.filesScanned  ?? prev.filesScanned,
              findingsCount: data.findingsCount ?? prev.findingsCount,
              criticals:     data.criticals     ?? prev.criticals,
              warnings:      data.warnings      ?? prev.warnings,
              duration:      data.duration      ?? prev.duration,
            }));

            if (data.status === "COMPLETED" || data.status === "FAILED") {
              es.close();
              esRef.current = null;
            }
          }

          if (data.type === "error") {
            setProgress(prev => ({
              ...prev,
              status: "failed",
              error:  data.message,
            }));
            es.close();
            esRef.current = null;
          }
        } catch {}
      };

      es.onerror = () => {
        setProgress(prev => ({
          ...prev,
          status: prev.status === "scanning" ? "failed" : prev.status,
          error:  "Connection to scan stream lost",
        }));
        es.close();
        esRef.current = null;
      };
    } catch (err) {
      setProgress(prev => ({
        ...prev,
        status: "failed",
        error:  (err as Error).message,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setProgress(INITIAL);
  }, []);

  return { progress, startScan, reset };
}