import React, { useMemo, useState, useEffect, useCallback } from "react";
import { interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";

/**
 * Renders an MDGraph-generated diagram SVG (scripts/generate-diagram.ts)
 * inside Remotion, with reveal timing driven entirely by our own frame
 * clock instead of MDGraph's real-time animation engine — see
 * scripts/generate-diagram.ts for why that split exists.
 *
 * The SVG is loaded once and used as-is (defs, markers, icons, layout all
 * come straight from MDGraph); every frame we just patch the `opacity` on
 * the specific node/edge groups that should be visible by then, and draw a
 * small traveling dot along an edge's own path while it's "flowing".
 */

export type DiagramStep =
  | { kind: "node"; id: string; atMs: number }
  | { kind: "edge"; from: string; to: string; atMs: number };

const FADE_MS = 300;
const FLOW_MS = 550;
const FLOW_COLOR = "#4DE8FF";

const useSvgText = (file: string): string | null => {
  const [svg, setSvg] = useState<string | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Loading ${file}`));

  const load = useCallback(async () => {
    try {
      const res = await fetch(staticFile(file));
      const text = await res.text();
      setSvg(text);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [file, continueRender, cancelRender, handle]);

  useEffect(() => {
    load();
  }, [load]);

  return svg;
};

type EdgeMeta = { id: string; from: string; to: string; pathD: string };

type DiagramMeta = {
  viewBox: string;
  nodeIds: string[];
  edges: EdgeMeta[];
};

const parseMeta = (svgText: string): DiagramMeta => {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  const viewBox = svgEl?.getAttribute("viewBox") || "0 0 100 100";

  const nodeIds = Array.from(doc.querySelectorAll(".mdg-node")).map((g) => g.getAttribute("data-id") || "");

  const edges: EdgeMeta[] = Array.from(doc.querySelectorAll(".mdg-edge")).map((g) => ({
    id: g.getAttribute("data-id") || "",
    from: g.getAttribute("data-from") || "",
    to: g.getAttribute("data-to") || "",
    pathD: g.querySelector("path")?.getAttribute("d") || "",
  }));

  return { viewBox, nodeIds, edges };
};

// Patches the opacity inline-styled onto a specific data-id'd group, leaving
// everything else in the (large, MDGraph-generated) markup untouched.
const withOpacity = (svgText: string, id: string, opacity: number): string => {
  const re = new RegExp(`(data-id="${id}"[^>]*style="[^"]*opacity:\\s*)[\\d.]+`);
  return svgText.replace(re, `$1${opacity}`);
};

// Edge paths here are always a single cubic bezier: "M x,y C x1,y1 x2,y2 x3,y3".
const cubicPointAt = (pathD: string, t: number): { x: number; y: number } | null => {
  const n = pathD.match(/-?\d+(\.\d+)?/g)?.map(Number);
  if (!n || n.length < 8) return null;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
  const mt = 1 - t;
  return {
    x: mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
    y: mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
  };
};

export const MdGraphDiagram: React.FC<{
  svgFile: string;
  timeline: DiagramStep[];
  visibleFromMs: number;
  visibleToMs: number;
  style?: React.CSSProperties;
}> = ({ svgFile, timeline, visibleFromMs, visibleToMs, style }) => {
  const svgText = useSvgText(svgFile);
  const meta = useMemo(() => (svgText ? parseMeta(svgText) : null), [svgText]);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const containerOpacity = interpolate(
    nowMs,
    [visibleFromMs, visibleFromMs + FADE_MS, visibleToMs - FADE_MS, visibleToMs],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const patchedSvg = useMemo(() => {
    if (!svgText || !meta) return null;
    let patched = svgText;

    for (const id of meta.nodeIds) {
      const step = timeline.find((s) => s.kind === "node" && s.id === id);
      const o = step ? interpolate(nowMs, [step.atMs, step.atMs + FADE_MS], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) : 0;
      patched = withOpacity(patched, id, o);
    }

    for (const edge of meta.edges) {
      const step = timeline.find((s) => s.kind === "edge" && s.from === edge.from && s.to === edge.to);
      const o = step ? interpolate(nowMs, [step.atMs, step.atMs + FADE_MS], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) : 0;
      patched = withOpacity(patched, edge.id, o);
    }

    return patched;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgText, meta, nowMs]);

  if (!meta || !patchedSvg || containerOpacity <= 0) return null;

  const flowDots = meta.edges
    .map((edge) => {
      const step = timeline.find((s) => s.kind === "edge" && s.from === edge.from && s.to === edge.to);
      if (!step) return null;
      const t = interpolate(nowMs, [step.atMs, step.atMs + FLOW_MS], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      if (t <= 0 || t >= 1) return null;
      const point = cubicPointAt(edge.pathD, t);
      if (!point) return null;
      return <circle key={edge.id} cx={point.x} cy={point.y} r={5} fill={FLOW_COLOR} opacity={0.9} />;
    })
    .filter(Boolean);

  return (
    <div style={{ position: "relative", opacity: containerOpacity, ...style }}>
      <div dangerouslySetInnerHTML={{ __html: patchedSvg }} />
      {flowDots.length > 0 && (
        <svg
          viewBox={meta.viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          {flowDots}
        </svg>
      )}
    </div>
  );
};
