import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type TopicData = { title: string; onTitleChange: (v: string) => void };

function TopicNode({ data, selected }: NodeProps<any>) {
  return (
    <div className={`topic-card ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="pin-handle" />
      <Handle type="source" position={Position.Bottom} className="pin-handle" />
      <Handle type="target" position={Position.Left} className="pin-handle" />
      <Handle type="source" position={Position.Right} className="pin-handle" />
      <input
        className="topic-title"
        value={data.title}
        onChange={(e) => data.onTitleChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
export default memo(TopicNode);
