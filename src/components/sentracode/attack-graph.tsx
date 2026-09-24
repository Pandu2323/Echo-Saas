/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/refs */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import {
  ZoomIn, ZoomOut, Maximize2, RefreshCw,
  AlertTriangle, Shield, X, FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SBadge } from "./sentra-ui";
import { Loader2 } from "lucide-react";

interface GraphNode {
  id:       string;
  label:    string;
  fullPath: string;
  type:     "file" | "attacker" | "goal";
  severity: string;
  findings: {
    id: string; title: string;
    severity: string; lineNumber: number | null; cwe: string | null;
  }[];
  x: number;
  y: number;
}

interface GraphEdge {
  id:          string;
  source:      string;
  target:      string;
  label:       string;
  severity:    string;
  stepNumber:  number;
}

interface GraphData {
  nodes:       GraphNode[];
  edges:       GraphEdge[];
  attackPaths: any[];
}

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#EF4444",
  HIGH:     "#F97316",
  WARNING:  "#F59E0B",
  INFO:     "#3B82F6",
};

const NODE_COLORS: Record<string, { fill: string; stroke: string }> = {
  attacker: { fill: "#1a0000", stroke: "#EF4444" },
  goal:     { fill: "#001a0a", stroke: "#10B981" },
  CRITICAL: { fill: "#1a0505", stroke: "#EF4444" },
  WARNING:  { fill: "#1a1200", stroke: "#F59E0B" },
  INFO:     { fill: "#050a1a", stroke: "#3B82F6" },
};

export function AttackGraph({ repoId }: { repoId?: string }) {
  const { workspaceId } = useWorkspace();
  const svgRef          = useRef<SVGSVGElement>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const simRef          = useRef<any>(null);

  const [data,         setData        ] = useState<GraphData | null>(null);
  const [loading,      setLoading     ] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom,         setZoom        ] = useState(1);
  const [pan,          setPan         ] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPos   = useRef({ x: 0, y: 0 });

  const fetchGraph = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceId });
      if (repoId) params.set("repoId", repoId);
      const res  = await fetch(`/api/sentra/attack-paths/graph?${params}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, repoId]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // build D3 force simulation
  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return;

    // clean up previous simulation
    simRef.current?.stop();

    const svgEl = svgRef.current;
    const W     = containerRef.current?.clientWidth  ?? 900;
    const H     = containerRef.current?.clientHeight ?? 500;

    // position special nodes
    data.nodes.forEach(n => {
      if (n.type === "attacker") { n.x = 80;     n.y = H / 2; }
      if (n.type === "goal")     { n.x = W - 80; n.y = H / 2; }
    });

    import("d3").then((d3) => {
      const svg = d3.select(svgEl);
      svg.selectAll("*").remove();

      // defs — arrow markers
      const defs = svg.append("defs");
      ["CRITICAL","WARNING","INFO"].forEach(sev => {
        defs.append("marker")
          .attr("id",         `arrow-${sev}`)
          .attr("viewBox",    "0 -5 10 10")
          .attr("refX",       28)
          .attr("refY",       0)
          .attr("markerWidth",  8)
          .attr("markerHeight", 8)
          .attr("orient",     "auto")
          .append("path")
          .attr("d",    "M0,-5L10,0L0,5")
          .attr("fill", SEV_COLORS[sev] ?? "#888");
      });

      const g = svg.append("g");

      // build node map for edge lookups
      const nodeById = new Map(data.nodes.map(n => [n.id, n]));

      // force simulation
      const sim = d3.forceSimulation(data.nodes as any)
        .force("link", d3.forceLink(data.edges.map(e => ({
          ...e,
          source: nodeById.get(e.source) ?? e.source,
          target: nodeById.get(e.target) ?? e.target,
        }))).id((d: any) => d.id).distance(180))
        .force("charge",  d3.forceManyBody().strength(-600))
        .force("center",  d3.forceCenter(W / 2, H / 2))
        .force("collide", d3.forceCollide(70));

      simRef.current = sim;

      // edges
      const link = g.selectAll("g.link")
        .data(data.edges)
        .join("g")
        .attr("class", "link");

      link.append("line")
        .attr("stroke",       (d: any) => SEV_COLORS[d.severity] ?? "#555")
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.6)
        .attr("marker-end",   (d: any) => `url(#arrow-${d.severity})`);

      link.append("text")
        .attr("text-anchor",  "middle")
        .attr("dy",          -6)
        .attr("fill",         "#ffffff30")
        .attr("font-size",    "9px")
        .attr("font-family",  "monospace")
        .text((d: any) => d.label?.slice(0, 22) ?? "");

      // nodes
      const node = g.selectAll("g.node")
        .data(data.nodes)
        .join("g")
        .attr("class", "node")
        .style("cursor", "pointer")
        .call(
          d3.drag<any, any>()
            .on("start", (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on("end",   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
        )
        .on("click", (_event, d) => {
          setSelectedNode(d as GraphNode);
        });

      // node background rect
      node.append("rect")
        .attr("width",  (d: any) => d.type === "attacker" || d.type === "goal" ? 90 : 110)
        .attr("height", (d: any) => 40)
        .attr("x",      (d: any) => d.type === "attacker" || d.type === "goal" ? -45 : -55)
        .attr("y",      -20)
        .attr("rx",     8)
        .attr("fill",   (d: any) => {
          const c = d.type !== "file" ? NODE_COLORS[d.type] : NODE_COLORS[d.severity];
          return c?.fill ?? "#111";
        })
        .attr("stroke", (d: any) => {
          const c = d.type !== "file" ? NODE_COLORS[d.type] : NODE_COLORS[d.severity];
          return c?.stroke ?? "#555";
        })
        .attr("stroke-width", 1.5);

      // severity dot
      node.filter((d: any) => d.type === "file")
        .append("circle")
        .attr("cx",   -40)
        .attr("cy",    0)
        .attr("r",     4)
        .attr("fill", (d: any) => SEV_COLORS[d.severity] ?? "#888");

      // node label
      node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#ffffffcc")
        .attr("font-size", "10px")
        .attr("font-family", "system-ui, sans-serif")
        .attr("font-weight", (d: any) => d.type !== "file" ? "bold" : "normal")
        .text((d: any) => {
          const lbl = d.label;
          return lbl.length > 14 ? lbl.slice(0, 12) + "…" : lbl;
        });

      // findings count badge
      node.filter((d: any) => d.type === "file" && d.findings.length > 0)
        .append("text")
        .attr("x", 42)
        .attr("y", -12)
        .attr("fill", "#EF4444")
        .attr("font-size", "9px")
        .attr("font-family", "monospace")
        .text((d: any) => `${d.findings.length}`);

      // simulation tick
      sim.on("tick", () => {
        link.select("line")
          .attr("x1", (d: any) => d.source.x)
          .attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x)
          .attr("y2", (d: any) => d.target.y);

        link.select("text")
          .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
          .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

        node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
      });
    });

    return () => { simRef.current?.stop(); };
  }, [data]);

  // pan handler
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).closest(".node")) return;
    isPanning.current = true;
    lastPos.current   = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isPanning.current = false; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-xs text-white/25">Building attack graph…</p>
        </div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/8">
        <Shield className="h-8 w-8 text-white/10" />
        <p className="text-sm text-white/25">No attack graph data</p>
        <p className="text-[11.5px] text-white/15">
          Run a scan with AI reasoning to generate attack paths
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* graph controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-white/30">
            {["CRITICAL","WARNING","INFO"].map(s => (
              <span key={s} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEV_COLORS[s] }} />
                {s.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="rounded-lg border border-white/8 p-1.5 text-white/30 hover:bg-white/5">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setZoom(z => Math.max(0.3, z / 1.2))} className="rounded-lg border border-white/8 p-1.5 text-white/30 hover:bg-white/5">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded-lg border border-white/8 p-1.5 text-white/30 hover:bg-white/5">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={fetchGraph} className="rounded-lg border border-white/8 p-1.5 text-white/30 hover:bg-white/5">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* graph canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-white/5"
        style={{
          height:          "480px",
          backgroundColor: "#070709",
          cursor:          isPanning.current ? "grabbing" : "grab",
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {/* grid background */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        <svg
          ref={svgRef}
          className="h-full w-full"
          style={{
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            transformOrigin: "center",
          }}
        />

        {/* legend */}
        <div className="absolute bottom-3 left-3 rounded-lg border border-white/8 bg-black/60 px-3 py-2 text-[10px] text-white/30 backdrop-blur-sm">
          <p className="mb-1 font-medium text-white/40">Drag nodes · Scroll to zoom · Click to inspect</p>
          <div className="flex gap-3">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-8 rounded border border-red-500/60 bg-red-950" /> file with critical</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-8 rounded border border-yellow-500/60 bg-yellow-950" /> file with warning</span>
          </div>
        </div>

        {/* attack path count */}
        {data.attackPaths.length > 0 && (
          <div className="absolute right-3 top-3 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-1.5">
            <p className="text-[11px] font-medium text-red-400">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              {data.attackPaths.length} attack chain{data.attackPaths.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* selected node detail panel */}
      {selectedNode && (
        <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileCode className="h-4 w-4 text-white/30" />
              <div>
                <p className="text-[13px] font-medium text-white">{selectedNode.label}</p>
                <p className="font-mono text-[10.5px] text-white/25">{selectedNode.fullPath}</p>
              </div>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-white/20 hover:text-white/50">
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedNode.type !== "file" ? (
            <p className="text-[12.5px] text-white/40">
              {selectedNode.type === "attacker"
                ? "Entry point — the attacker starts here"
                : "Attack goal achieved — full compromise"}
            </p>
          ) : selectedNode.findings.length === 0 ? (
            <p className="text-[12.5px] text-white/30">No findings in this file</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/20">
                {selectedNode.findings.length} finding{selectedNode.findings.length !== 1 ? "s" : ""} in this file
              </p>
              {selectedNode.findings.map(f => (
                <div key={f.id} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.015] px-3 py-2.5">
                  <SBadge sev={
                    f.severity === "CRITICAL" ? "Critical" :
                    f.severity === "WARNING"  ? "Warning"  : "Info"
                  }>
                    {f.severity}
                  </SBadge>
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-white/70">{f.title}</p>
                    <div className="mt-0.5 flex gap-2 text-[10.5px] text-white/25">
                      {f.lineNumber && <span>Line {f.lineNumber}</span>}
                      {f.cwe && <span>{f.cwe}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* attack paths list */}
      {data.attackPaths.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/20">Attack chains</p>
          {data.attackPaths.map((ap, i) => (
            <div
              key={ap.id}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3",
                ap.severity === "CRITICAL" ? "border-red-500/20 bg-red-500/[0.03]" : "border-amber-500/20 bg-amber-500/[0.03]"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn(
                  "text-[11px] font-bold",
                  ap.severity === "CRITICAL" ? "text-red-400" : "text-amber-400"
                )}>
                  #{i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-white/70 truncate">{ap.title}</p>
                  <p className="text-[11px] text-white/30">{ap.stepCount} steps · {ap.businessImpact?.slice(0, 60)}</p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {ap.cvssScore && (
                  <span className={cn(
                    "text-sm font-bold",
                    ap.cvssScore >= 9 ? "text-red-400" : ap.cvssScore >= 7 ? "text-orange-400" : "text-amber-400"
                  )}>
                    {ap.cvssScore}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}