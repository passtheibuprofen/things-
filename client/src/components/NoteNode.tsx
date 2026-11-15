import { memo, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";

export type NoteData = {
  id: string;
  title: string;
  body: any;
  color: string;
  sourceUrl: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (json: any) => void;
  selected: boolean;
};

function NoteNode({ data }: NodeProps<any>) {
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, Link],
    content: data.body || "",
    onUpdate: ({ editor }) => data.onBodyChange(editor.getJSON()),
  });
  useEffect(() => {
    if (editor && data.body && JSON.stringify(editor.getJSON()) !== JSON.stringify(data.body)) {
      editor.commands.setContent(data.body, { emitUpdate: false });
    }
  }, [data.body, editor]);
  return (
    <>
      <NodeResizer minWidth={120} minHeight={80} onResizeEnd={(_e, params) => data.onResize?.(params.width, params.height)} />
      <div className={`note-card color-${data.color || "yellow"}`} style={{ width: "100%", height: "100%" }}>
      <Handle type="target" position={Position.Top} className="pin-handle" />
      <Handle type="source" position={Position.Bottom} className="pin-handle" />
      <Handle type="target" position={Position.Left} className="pin-handle" />
      <Handle type="source" position={Position.Right} className="pin-handle" />
      <input className="note-title" value={data.title || ""} placeholder="title" onChange={(e) => data.onTitleChange(e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
      <div className="note-body"><EditorContent editor={editor} /></div>
      {data.sourceUrl && <a className="source-chip" href={data.sourceUrl} target="_blank" rel="noreferrer" onMouseDown={(e) => e.stopPropagation()}>link</a>}
    </div>
    </>
  );
}
export default memo(NoteNode);
