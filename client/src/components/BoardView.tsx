import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, useNodesState, useEdgesState, useViewport, useReactFlow, Background, type Node, type Edge, type Connection, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { db, getMeta } from "../db";
import { useLiveQuery } from "dexie-react-hooks";
import { queueChange, syncManager } from "../sync";
import { getSyncState, subscribeSync } from "../sync";
import type { Board, Note, Str, Stroke, TextBox, Theme } from "../types";
import TopicNode from "./TopicNode";
import NoteNode from "./NoteNode";
import TextBoxNode from "./TextBoxNode";
import StringEdge from "./StringEdge";
import { getStroke } from "perfect-freehand";
import InkLayer from "./InkLayer";
import { Undo2, Redo2, Search, LayoutGrid, MoreHorizontal, ArrowLeft, Download, Upload } from "lucide-react";

const nodeTypes: any = { topic: TopicNode, note: NoteNode, textBox: TextBoxNode };
const edgeTypes: any = { string: StringEdge };

function strokeToPath(points: number[][]) {
  const stroke = getStroke(points, { size: 4, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
  if (!stroke.length) return "";
  return stroke.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + " Z";
}

export default function BoardView({ boardId, theme, user, onBack }: any) {
  const [tool, setTool] = useState<"none" | "text" | "draw" | "note">("none");
  const [drawTool, setDrawTool] = useState<"pencil" | "pen" | "marker" | "highlighter" | "eraser">("pencil");
  const [drawColor, setDrawColor] = useState("#222");
  const [drawSize, setDrawSize] = useState(4);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [syncState, setSyncState] = useState(getSyncState());
  useEffect(() => subscribeSync(() => setSyncState(getSyncState())), []);

  const board = useLiveQuery(() => db.boards.get(boardId), [boardId]);
  const notes = useLiveQuery(() => db.notes.where("boardId").equals(boardId).toArray(), [boardId]) || [];
  const strings = useLiveQuery(() => db.strings.where("boardId").equals(boardId).toArray(), [boardId]) || [];
  const strokes = useLiveQuery(() => db.strokes.where("boardId").equals(boardId).toArray(), [boardId]) || [];
  const textBoxes = useLiveQuery(() => db.textBoxes.where("boardId").equals(boardId).toArray(), [boardId]) || [];

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // history
  const historyRef = useRef<string[]>([]);
  const histIdx = useRef(-1);
  const isDragging = useRef(false);

  const snapshot = useCallback(() => {
    const data = JSON.stringify({ notes, strings, strokes, textBoxes, board });
    return data;
  }, [notes, strings, strokes, textBoxes, board]);

  const pushHistory = useCallback(() => {
    const s = snapshot();
    if (histIdx.current >= 0 && historyRef.current[histIdx.current] === s) return;
    historyRef.current = historyRef.current.slice(0, histIdx.current + 1);
    historyRef.current.push(s);
    if (historyRef.current.length > 50) historyRef.current.shift();
    histIdx.current = historyRef.current.length - 1;
  }, [snapshot]);

  // sync db -> nodes
  useEffect(() => {
    if (isDragging.current) return;
    const ns: Node[] = [];
    // topic
    if (board) {
      ns.push({
        id: "topic",
        type: "topic",
        position: { x: board.topicX, y: board.topicY },
        data: {
          title: board.title,
          onTitleChange: (v: string) => updateBoardTitle(v),
        },
        zIndex: 6,
      });
    }
    for (const n of notes.filter((x: Note) => !x.deleted)) {
      ns.push({
        id: n.id,
        type: "note",
        position: { x: n.x, y: n.y },
        style: { width: n.width, height: n.height },
        data: {
          id: n.id,
          title: n.title,
          body: n.body,
          color: n.color || "yellow",
          sourceUrl: n.sourceUrl,
          onTitleChange: (v: string) => updateNote(n.id, { title: v }),
          onBodyChange: (json: any) => updateNote(n.id, { body: json }),
          onResize: (w: number, h: number) => updateNote(n.id, { width: w, height: h }),
        },
        zIndex: 5,
      });
    }
    for (const t of textBoxes.filter((x: TextBox) => !x.deleted)) {
      ns.push({
        id: t.id,
        type: "textBox",
        position: { x: t.x, y: t.y },
        data: {
          content: t.content,
          width: t.width,
          onContentChange: (json: any) => updateTextBox(t.id, { content: json }),
        },
        zIndex: 3,
      });
    }
    setNodes(ns);

    const es: Edge[] = strings.filter((x: Str) => !x.deleted).map((s: Str) => ({
      id: s.id,
      source: s.fromId,
      target: s.toId,
      type: "string",
      data: { label: s.label, color: s.color, thickness: s.thickness },
    }));
    setEdges(es);
  }, [board, notes, strings, strokes, textBoxes]);

  // node color opacity for search
  useEffect(() => {
    if (!search) return;
    setNodes((nds) => nds.map((n) => {
      if (n.type !== "note") return n;
      const note = notes.find((x: Note) => x.id === n.id);
      const match = !search || (note?.title || "").toLowerCase().includes(search.toLowerCase()) || JSON.stringify(note?.body || "").toLowerCase().includes(search.toLowerCase());
      return { ...n, style: { ...n.style, opacity: match ? 1 : 0.25 } };
    }));
  }, [search]);

  const rfInstance = useReactFlow();

  const updateBoard = useCallback(async (patch: Partial<Board>) => {
    if (!board) return;
    const now = new Date().toISOString();
    const updated = { ...board, ...patch, updatedAt: now };
    await db.boards.put(updated);
    await queueChange("board", board.id, updated);
  }, [board]);

  const updateBoardTitle = (v: string) => { updateBoard({ title: v }); };

  const updateNote = useCallback(async (id: string, patch: any) => {
    const n = await db.notes.get(id);
    if (!n) return;
    const now = new Date().toISOString();
    const updated = { ...n, ...patch, updatedAt: now };
    // map sourceUrl etc
    if (patch.sourceUrl !== undefined) updated.sourceUrl = patch.sourceUrl;
    await db.notes.put(updated);
    await queueChange("note", id, updated);
  }, []);

  const updateTextBox = useCallback(async (id: string, patch: any) => {
    const t = await db.textBoxes.get(id);
    if (!t) return;
    const now = new Date().toISOString();
    const updated = { ...t, ...patch, updatedAt: now };
    await db.textBoxes.put(updated);
    await queueChange("textBox", id, updated);
  }, []);

  const createNote = useCallback(async (x: number, y: number) => {
    pushHistory();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const note: Note = { id, boardId, title: "", body: null, color: "yellow", x, y, width: 200, height: 160, sourceUrl: "", createdAt: now, updatedAt: now, deleted: false, seq: 0 };
    await db.notes.add(note);
    await queueChange("note", id, note);
    setSelectedNoteId(id);
    setTool("note");
  }, [boardId, pushHistory]);

  const createTextBox = useCallback(async (x: number, y: number) => {
    pushHistory();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const tb: TextBox = { id, boardId, content: null, x, y, width: 200, updatedAt: now, deleted: false, seq: 0 };
    await db.textBoxes.add(tb);
    await queueChange("textBox", id, tb);
  }, [boardId, pushHistory]);

  const createString = useCallback(async (fromId: string, toId: string) => {
    pushHistory();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const s: Str = { id, boardId, fromId, toId, label: "", color: "", thickness: 2, updatedAt: now, deleted: false, seq: 0 };
    await db.strings.add(s);
    await queueChange("string", id, s);
  }, [boardId, pushHistory]);

  // connection
  const onConnect = useCallback((conn: Connection) => {
    if (conn.source && conn.target && conn.source !== conn.target) {
      createString(conn.source, conn.target);
    }
  }, [createString]);

  // drag handling
  const onNodeDragStart = useCallback(() => { isDragging.current = true; pushHistory(); }, [pushHistory]);
  const onNodeDragStop = useCallback(async (_e: any, node: Node) => {
    isDragging.current = false;
    if (node.type === "topic") {
      await updateBoard({ topicX: node.position.x, topicY: node.position.y });
    } else if (node.type === "note") {
      await updateNote(node.id, { x: node.position.x, y: node.position.y });
    } else if (node.type === "textBox") {
      await updateTextBox(node.id, { x: node.position.x, y: node.position.y });
    }
  }, [updateBoard, updateNote, updateTextBox]);

  // resize note via corner? React Flow node resize requires nodeResizer. We'll add NodeResizer in NoteNode? Let's add via NodeResizer in component. Simpler: use NodeResizer in NoteNode. Add import.
  // We'll handle resize persist via onNodesChange detecting width/height? React Flow onNodesChange includes dimensions. Let's persist on change when not dragging? Use effect? Instead use NodeResizer onChangeEnd.

  // selection
  const onSelectionChange = useCallback(({ nodes: sel }: any) => {
    const noteSel = sel.find((n: Node) => n.type === "note");
    if (noteSel) {
      setSelectedNoteId(noteSel.id);
      setTool("note");
    } else {
      setSelectedNoteId(null);
      if (tool === "note") setTool("none");
    }
  }, [tool]);

  // draw handling
  const drawing = useRef(false);
  const currentStroke = useRef<number[][]>([]);
  const [liveStroke, setLiveStroke] = useState<number[][] | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (tool !== "draw") return;
    // ensure empty canvas (not on node) - check target
    const target = e.target as HTMLElement;
    if (target.closest(".react-flow__node") || target.closest(".react-flow__edge")) return;
    drawing.current = true;
    (e.target as any).setPointerCapture?.(e.pointerId);
    const pos = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    currentStroke.current = [[pos.x, pos.y]];
    setLiveStroke([[pos.x, pos.y]]);
  }, [tool, rfInstance]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing.current) return;
    const pos = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    currentStroke.current.push([pos.x, pos.y]);
    setLiveStroke([...currentStroke.current]);
  }, [rfInstance]);

  const handlePointerUp = useCallback(async () => {
    if (!drawing.current) return;
    drawing.current = false;
    const pts = currentStroke.current;
    setLiveStroke(null);
    currentStroke.current = [];
    if (pts.length < 2) return;
    if (drawTool === "eraser") {
      // remove strokes touched
      pushHistory();
      const hit = strokes.filter((st: Stroke) => {
        // simple: if any point within 10px of any stroke point
        for (const p of pts) {
          for (const sp of st.points) {
            const dx = sp[0]-p[0], dy = sp[1]-p[1];
            if (dx*dx+dy*dy < 400) return true;
          }
        }
        return false;
      });
      for (const st of hit) {
        const now = new Date().toISOString();
        const updated = { ...st, deleted: true, updatedAt: now };
        await db.strokes.put(updated);
        await queueChange("stroke", st.id, updated);
      }
      return;
    }
    pushHistory();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const stroke: Stroke = { id, boardId, tool: drawTool, color: drawColor, size: drawSize, points: pts, updatedAt: now, deleted: false, seq: 0 };
    await db.strokes.add(stroke);
    await queueChange("stroke", id, stroke);
  }, [drawTool, drawColor, drawSize, boardId, strokes, pushHistory, rfInstance]);

  // pinch-to-resize note (touch)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const el = document.querySelector(".canvas-wrap") as HTMLElement;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (selectedNoteId && pointers.current.size === 2) {
        // check if started on selected note
        const nodeEl = document.querySelector(`[data-id="${selectedNoteId}"]`) as HTMLElement;
        // React Flow node has data-id
        const rect = nodeEl?.getBoundingClientRect();
        const pts = [...pointers.current.values()];
        const onNote = rect && pts.every((p) => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom);
        if (onNote) {
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          const dist = Math.hypot(dx, dy);
          const n = notes.find((x: Note) => x.id === selectedNoteId);
          pinchStart.current = { dist, width: n?.width || 200, height: n?.height || 160 };
        } else {
          pinchStart.current = null;
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchStart.current && pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy);
        const scale = dist / pinchStart.current.dist;
        const newW = Math.max(120, Math.min(500, pinchStart.current.width * scale));
        const newH = Math.max(80, Math.min(400, pinchStart.current.height * scale));
        updateNote(selectedNoteId!, { width: newW, height: newH });
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [selectedNoteId, notes, updateNote]);

  // desktop ctrl+scroll resize note
  useEffect(() => {
    const el = document.querySelector(".canvas-wrap");
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!selectedNoteId) return;
      if (!e.ctrlKey) return;
      const target = e.target as HTMLElement;
      const nodeEl = target.closest(`[data-id="${selectedNoteId}"]`);
      if (!nodeEl) return;
      e.preventDefault();
      const n = notes.find((x: Note) => x.id === selectedNoteId);
      if (!n) return;
      const delta = e.deltaY < 0 ? 1.05 : 0.95;
      updateNote(selectedNoteId, { width: Math.max(120, Math.min(500, n.width * delta)), height: Math.max(80, Math.min(400, n.height * delta)) });
    };
    (el as any).addEventListener("wheel", onWheel, { passive: false });
    return () => (el as any).removeEventListener("wheel", onWheel);
  }, [selectedNoteId, notes, updateNote]);

  // undo/redo
  const undo = async () => {
    if (histIdx.current <= 0) return;
    histIdx.current -= 1;
    await applySnapshot(historyRef.current[histIdx.current]);
  };
  const redo = async () => {
    if (histIdx.current >= historyRef.current.length - 1) return;
    histIdx.current += 1;
    await applySnapshot(historyRef.current[histIdx.current]);
  };
  const applySnapshot = async (s: string) => {
    const data = JSON.parse(s);
    // replace board records
    // notes
    const curNotes = await db.notes.where("boardId").equals(boardId).toArray();
    for (const n of curNotes) await db.notes.delete(n.id);
    for (const n of data.notes || []) if (!n.deleted) await db.notes.put(n);
    const curStr = await db.strings.where("boardId").equals(boardId).toArray();
    for (const s2 of curStr) await db.strings.delete(s2.id);
    for (const s2 of data.strings || []) if (!s2.deleted) await db.strings.put(s2);
    const curSt = await db.strokes.where("boardId").equals(boardId).toArray();
    for (const s2 of curSt) await db.strokes.delete(s2.id);
    for (const s2 of data.strokes || []) if (!s2.deleted) await db.strokes.put(s2);
    const curTb = await db.textBoxes.where("boardId").equals(boardId).toArray();
    for (const t of curTb) await db.textBoxes.delete(t.id);
    for (const t of data.textBoxes || []) if (!t.deleted) await db.textBoxes.put(t);
    if (data.board) await db.boards.put(data.board);
  };

  // auto-arrange
  const autoArrange = () => {
    pushHistory();
    const ns = notes.filter((n: Note) => !n.deleted);
    const cx = board?.topicX || 0, cy = board?.topicY || 0;
    const r = 300;
    ns.forEach((n: Note, i: number) => {
      const ang = (i / ns.length) * Math.PI * 2;
      updateNote(n.id, { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
    });
  };

  // export/import
  const exportBoard = () => {
    const data = { board, notes, strings, strokes, textBoxes };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${board?.title || "board"}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importBoard = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      const text = await f.text();
      const data = JSON.parse(text);
      // create new board
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newBoard = { ...(data.board || board), id: newId, title: (data.board?.title || board?.title) + " (imported)", updatedAt: now };
      await db.boards.add(newBoard);
      const idMap: Record<string, string> = {};
      for (const n of data.notes || []) {
        const nid = crypto.randomUUID();
        idMap[n.id] = nid;
        await db.notes.add({ ...n, id: nid, boardId: newId, updatedAt: now });
      }
      for (const s of data.strings || []) {
        await db.strings.add({ ...s, id: crypto.randomUUID(), boardId: newId, fromId: idMap[s.fromId] || s.fromId, toId: idMap[s.toId] || s.toId, updatedAt: now });
      }
      for (const st of data.strokes || []) {
        await db.strokes.add({ ...st, id: crypto.randomUUID(), boardId: newId, updatedAt: now });
      }
      for (const t of data.textBoxes || []) {
        await db.textBoxes.add({ ...t, id: crypto.randomUUID(), boardId: newId, updatedAt: now });
      }
      onBack();
    };
    input.click();
  };

  // delete note
  const deleteNote = async (id: string) => {
    pushHistory();
    const now = new Date().toISOString();
    await db.notes.update(id, { deleted: true, updatedAt: now });
    const n = await db.notes.get(id);
    if (n) await queueChange("note", id, n);
    // remove strings connected
    const strs = await db.strings.where("boardId").equals(boardId).toArray();
    for (const s of strs) {
      if (s.fromId === id || s.toId === id) {
        await db.strings.update(s.id, { deleted: true, updatedAt: now });
        const su = await db.strings.get(s.id);
        if (su) await queueChange("string", s.id, su);
      }
    }
    setSelectedNoteId(null);
    setTool("none");
  };

  const duplicateNote = async (id: string) => {
    pushHistory();
    const n = await db.notes.get(id);
    if (!n) return;
    const nid = crypto.randomUUID();
    const now = new Date().toISOString();
    const copy: Note = { ...n, id: nid, x: n.x + 20, y: n.y + 20, updatedAt: now, createdAt: now };
    await db.notes.add(copy);
    await queueChange("note", nid, copy);
  };

  // delete string on click? Edge click -> delete/edit. We'll handle via onEdgeClick
  const onEdgeClick = useCallback((_e: any, edge: Edge) => {
    if (confirm("Delete this string?")) {
      pushHistory();
      const now = new Date().toISOString();
      db.strings.update(edge.id, { deleted: true, updatedAt: now }).then(async () => {
        const s = await db.strings.get(edge.id);
        if (s) await queueChange("string", edge.id, s);
      });
    }
  }, [pushHistory]);

  const [moreOpen, setMoreOpen] = useState(false);

  const syncDotClass = syncState.status === "synced" ? "" : syncState.status === "pending" ? "pending" : syncState.status === "offline" ? "offline" : "";

  return (
    <div className="board-view">
      <div className="board-topbar">
        <button onClick={undo}><Undo2 size={16} /></button>
        <button onClick={redo}><Redo2 size={16} /></button>
        <button onClick={() => setShowSearch((v) => !v)}><Search size={16} /></button>
        <button onClick={autoArrange}><LayoutGrid size={16} /></button>
        <button onClick={() => setMoreOpen((v) => !v)}><MoreHorizontal size={16} /></button>
        <span className={`sync-dot ${syncDotClass}`} title={syncState.status} />
      </div>
      <button className="back-btn" onClick={onBack}><ArrowLeft size={16} /> Back</button>

      {showSearch && (
        <div style={{ position: "absolute", top: 46, left: 8, zIndex: 20 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search notes" style={{ padding: 6, borderRadius: 8, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)" }} />
        </div>
      )}
      {moreOpen && (
        <div style={{ position: "absolute", top: 46, left: 8, zIndex: 20, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={exportBoard} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)", display: "flex", gap: 6, alignItems: "center" }}><Download size={14} /> Export</button>
          <button onClick={importBoard} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)", display: "flex", gap: 6, alignItems: "center" }}><Upload size={14} /> Import</button>
          {selectedNoteId && (
            <>
              <button onClick={() => duplicateNote(selectedNoteId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>Duplicate note</button>
              <button onClick={() => deleteNote(selectedNoteId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}>Delete note</button>
            </>
          )}
        </div>
      )}

      <div className="canvas-wrap" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange}
          onPaneClick={(e: any) => {
            const pos = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            if (tool === "text") createTextBox(pos.x, pos.y);
            else if (tool === "note") { setTool("none"); setSelectedNoteId(null); }
            else { setSelectedNoteId(null); }
          }}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          panOnDrag
          zoomOnPinch={!selectedNoteId}
          selectionOnDrag={false}
        >
          <Background />
          <InkLayer strokes={strokes} liveStroke={liveStroke} drawColor={drawColor} />
        </ReactFlow>


      </div>

      {/* bottom island */}
      <div className="island-wrap">
        <div className="island">
          {tool === "none" && (
            <>
              <button className="island-btn" onClick={() => setTool("text")}><span style={{ fontSize: 20 }}>T</span><span>Text</span></button>
              <button className="island-btn" onClick={() => setTool("draw")}><span style={{ fontSize: 20 }}>✎</span><span>Draw</span></button>
              <button className="island-btn" onClick={() => { const c = rfInstance.screenToFlowPosition({ x: window.innerWidth/2, y: window.innerHeight/2 }); createNote(c.x, c.y); }}><span style={{ fontSize: 20 }}>✎</span><span>Note</span></button>
            </>
          )}

          {tool === "text" && (
            <div className="sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="island-back" onClick={() => setTool("none")}>←</button>
              <div className="stepper">
                <button onClick={() => {}}>A-</button>
                <button onClick={() => {}}>A+</button>
              </div>
              <button className="island-btn" style={{ minWidth: 40 }} onClick={() => {}}><b>B</b></button>
              <button className="island-btn" style={{ minWidth: 40 }} onClick={() => {}}><i>I</i></button>
              <button className="island-btn" style={{ minWidth: 40 }} onClick={() => {}}><s>S</s></button>
              {["#222", "#c0392b", "#2b5a9b", "#2e7d32"].map((c) => (
                <button key={c} className="swatch" style={{ background: c }} />
              ))}
            </div>
          )}

          {tool === "draw" && (
            <div className="sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="island-back" onClick={() => setTool("none")}>←</button>
              {(["pencil", "pen", "marker", "highlighter", "eraser"] as const).map((t) => (
                <button key={t} className={`island-btn ${drawTool === t ? "selected" : ""}`} style={{ minWidth: 44 }} onClick={() => setDrawTool(t)}>{t}</button>
              ))}
              {["#222", "#c0392b", "#2b5a9b", "#2e7d32", "#f1c40f"].map((c) => (
                <button key={c} className="swatch" style={{ background: c }} onClick={() => setDrawColor(c)} />
              ))}
              <input type="range" min={1} max={20} value={drawSize} onChange={(e) => setDrawSize(Number(e.target.value))} />
            </div>
          )}

          {tool === "note" && (
            <div className="sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="island-back" onClick={() => { setTool("none"); setSelectedNoteId(null); }}>←</button>
              {[["yellow","#fff9c4"],["blue","#d6eaff"],["green","#dcf5dc"],["white","#ffffff"],["purple","#eadcff"]].map(([c,hex]) => (
                <button key={c} className="swatch" style={{ background: hex }} onClick={() => { if (selectedNoteId) updateNote(selectedNoteId, { color: c }); }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
