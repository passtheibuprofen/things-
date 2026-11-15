import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

function StringEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, data, markerEnd, style } = props;
  const mx = (sourceX + targetX) / 2;
  const my = (sourceY + targetY) / 2 + 18;
  const path = `M ${sourceX},${sourceY} Q ${mx},${my} ${targetX},${targetY}`;
  const color = (data as any)?.color || "var(--string-color)";
  const thickness = (data as any)?.thickness || 2;
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: thickness, fill: "none", ...style }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${mx}px,${my}px)`,
            pointerEvents: "all",
          }}
          className="edge-label"
        >
          {(data as any)?.label || ""}
        </div>
      </EdgeLabelRenderer>
      {/* pins */}
      <circle cx={sourceX} cy={sourceY} r={4} fill="var(--pin-color)" />
      <circle cx={targetX} cy={targetY} r={4} fill="var(--pin-color)" />
    </>
  );
}
export default memo(StringEdge);
