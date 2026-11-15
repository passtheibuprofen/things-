import { memo, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { type NodeProps } from "@xyflow/react";

function TextBoxNode({ data }: NodeProps<any>) {
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color],
    content: data.content || "",
    onUpdate: ({ editor }) => data.onContentChange(editor.getJSON()),
  });
  useEffect(() => {
    if (editor && data.content && JSON.stringify(editor.getJSON()) !== JSON.stringify(data.content)) {
      editor.commands.setContent(data.content, { emitUpdate: false });
    }
  }, [data.content, editor]);
  return (
    <div className="text-box" style={{ width: data.width || 200 }}>
      <EditorContent editor={editor} />
    </div>
  );
}
export default memo(TextBoxNode);
