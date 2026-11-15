import { useViewport } from "@xyflow/react";
import { getStroke } from "perfect-freehand";

function toPath(points: number[][], size=4) {
  const stroke = getStroke(points, { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
  if (!stroke.length) return "";
  return stroke.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z";
}

export default function InkLayer({ strokes, liveStroke, drawColor }: any) {
  const vp = useViewport();
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <g transform={`translate(${vp.x},${vp.y}) scale(${vp.zoom})`}>
        {strokes.filter((s: any) => !s.deleted).map((s: any) => (
          <path key={s.id} d={toPath(s.points, s.size)} fill={s.color} opacity={s.tool === "highlighter" ? 0.35 : s.tool === "pencil" ? 0.7 : 1} style={{ mixBlendMode: s.tool === "highlighter" ? "multiply" : "normal" }} />
        ))}
        {liveStroke && <path d={toPath(liveStroke, 4)} fill={drawColor} opacity={0.8} />}
      </g>
    </svg>
  );
}
