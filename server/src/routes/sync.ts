import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

function nextSeq(userId: string): number {
  const row = db.prepare("SELECT seq FROM user_seq WHERE user_id = ?").get(userId) as { seq: number } | undefined;
  if (!row) {
    db.prepare("INSERT INTO user_seq (user_id, seq) VALUES (?,0)").run(userId);
    return 1;
  }
  const n = row.seq + 1;
  db.prepare("UPDATE user_seq SET seq = ? WHERE user_id = ?").run(n, userId);
  return n;
}

const TYPE_TABLE: Record<string, string> = {
  board: "boards",
  note: "notes",
  string: "strings",
  stroke: "strokes",
  textBox: "text_boxes",
};

function ownsBoard(userId: string, boardId: string): boolean {
  const row = db.prepare("SELECT user_id FROM boards WHERE id = ?").get(boardId) as { user_id: string | null } | undefined;
  if (!row) return false;
  return row.user_id === userId;
}

function getRecord(type: string, id: string): any {
  const table = TYPE_TABLE[type];
  if (!table) return null;
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function applyChange(userId: string, c: any) {
  const type = c.type;
  const id = c.id;
  const table = TYPE_TABLE[type];
  if (!table) return;
  const now = c.updated_at || new Date().toISOString();
  const deleted = c.deleted ? 1 : 0;

  if (type === "board") {
    const existing = db.prepare("SELECT * FROM boards WHERE id = ?").get(id) as any;
    if (existing && new Date(existing.updated_at) > new Date(now)) return; // server newer
    if (existing && existing.user_id && existing.user_id !== userId) return; // not yours
    const title = c.data?.title ?? existing?.title ?? "Untitled";
    const tx = c.data?.topicX ?? c.data?.topic_x ?? existing?.topic_x ?? 0;
    const ty = c.data?.topicY ?? c.data?.topic_y ?? existing?.topic_y ?? 0;
    const seq = nextSeq(userId);
    if (existing) {
      db.prepare("UPDATE boards SET user_id=?, title=?, topic_x=?, topic_y=?, updated_at=?, deleted=?, seq=? WHERE id=?")
        .run(userId, title, tx, ty, now, deleted, seq, id);
    } else {
      db.prepare("INSERT INTO boards (id, user_id, title, topic_x, topic_y, updated_at, deleted, seq) VALUES (?,?,?,?,?,?,?,?)")
        .run(id, userId, title, tx, ty, now, deleted, seq);
    }
    return;
  }

  // nested: ensure board
  const boardId = c.data?.boardId ?? c.data?.board_id;
  if (!boardId) return;
  // attach board to user if missing
  const brow = db.prepare("SELECT user_id FROM boards WHERE id = ?").get(boardId) as { user_id: string | null } | undefined;
  if (!brow) {
    // create board owned by user
    const bseq = nextSeq(userId);
    db.prepare("INSERT INTO boards (id, user_id, title, topic_x, topic_y, updated_at, deleted, seq) VALUES (?,?,?,?,?,?,?,?)")
      .run(boardId, userId, "Untitled", 0, 0, now, 0, bseq);
  } else if (brow.user_id !== userId) {
    return; // not yours
  }

  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any;
  if (existing && new Date(existing.updated_at) > new Date(now)) return;

  if (type === "note") {
    const d = c.data || {};
    const seq = nextSeq(userId);
    const vals = {
      board_id: boardId,
      title: d.title ?? existing?.title ?? null,
      body: d.body ?? existing?.body ?? null,
      color: d.color ?? existing?.color ?? null,
      x: d.x ?? existing?.x ?? 0,
      y: d.y ?? existing?.y ?? 0,
      width: d.width ?? existing?.width ?? 200,
      height: d.height ?? existing?.height ?? 160,
      source_url: d.sourceUrl ?? d.source_url ?? existing?.source_url ?? null,
      created_at: d.createdAt ?? d.created_at ?? existing?.created_at ?? now,
    };
    if (existing) {
      db.prepare(`UPDATE notes SET board_id=?, title=?, body=?, color=?, x=?, y=?, width=?, height=?, source_url=?, created_at=?, updated_at=?, deleted=?, seq=? WHERE id=?`)
        .run(vals.board_id, vals.title, vals.body, vals.color, vals.x, vals.y, vals.width, vals.height, vals.source_url, vals.created_at, now, deleted, seq, id);
    } else {
      db.prepare(`INSERT INTO notes (id, board_id, title, body, color, x, y, width, height, source_url, created_at, updated_at, deleted, seq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, vals.board_id, vals.title, vals.body, vals.color, vals.x, vals.y, vals.width, vals.height, vals.source_url, vals.created_at, now, deleted, seq);
    }
  } else if (type === "string") {
    const d = c.data || {};
    const seq = nextSeq(userId);
    const vals = {
      board_id: boardId,
      from_id: d.fromId ?? d.from_id ?? existing?.from_id,
      to_id: d.toId ?? d.to_id ?? existing?.to_id,
      label: d.label ?? existing?.label ?? null,
      color: d.color ?? existing?.color ?? null,
      thickness: d.thickness ?? existing?.thickness ?? 2,
    };
    if (existing) {
      db.prepare(`UPDATE strings SET board_id=?, from_id=?, to_id=?, label=?, color=?, thickness=?, updated_at=?, deleted=?, seq=? WHERE id=?`)
        .run(vals.board_id, vals.from_id, vals.to_id, vals.label, vals.color, vals.thickness, now, deleted, seq, id);
    } else {
      db.prepare(`INSERT INTO strings (id, board_id, from_id, to_id, label, color, thickness, updated_at, deleted, seq) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(id, vals.board_id, vals.from_id, vals.to_id, vals.label, vals.color, vals.thickness, now, deleted, seq);
    }
  } else if (type === "stroke") {
    const d = c.data || {};
    const seq = nextSeq(userId);
    const vals = {
      board_id: boardId,
      tool: d.tool ?? existing?.tool ?? "pencil",
      color: d.color ?? existing?.color ?? "#000",
      size: d.size ?? existing?.size ?? 2,
      points: typeof d.points === "string" ? d.points : JSON.stringify(d.points ?? (existing ? JSON.parse(existing.points) : [])),
    };
    if (existing) {
      db.prepare(`UPDATE strokes SET board_id=?, tool=?, color=?, size=?, points=?, updated_at=?, deleted=?, seq=? WHERE id=?`)
        .run(vals.board_id, vals.tool, vals.color, vals.size, vals.points, now, deleted, seq, id);
    } else {
      db.prepare(`INSERT INTO strokes (id, board_id, tool, color, size, points, updated_at, deleted, seq) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id, vals.board_id, vals.tool, vals.color, vals.size, vals.points, now, deleted, seq);
    }
  } else if (type === "textBox") {
    const d = c.data || {};
    const seq = nextSeq(userId);
    const vals = {
      board_id: boardId,
      content: d.content ?? existing?.content ?? null,
      x: d.x ?? existing?.x ?? 0,
      y: d.y ?? existing?.y ?? 0,
      width: d.width ?? existing?.width ?? 200,
    };
    if (existing) {
      db.prepare(`UPDATE text_boxes SET board_id=?, content=?, x=?, y=?, width=?, updated_at=?, deleted=?, seq=? WHERE id=?`)
        .run(vals.board_id, vals.content, vals.x, vals.y, vals.width, now, deleted, seq, id);
    } else {
      db.prepare(`INSERT INTO text_boxes (id, board_id, content, x, y, width, updated_at, deleted, seq) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id, vals.board_id, vals.content, vals.x, vals.y, vals.width, now, deleted, seq);
    }
  }
}

function rowToChange(type: string, r: any): any {
  if (type === "board") {
    return {
      type, id: r.id, updated_at: r.updated_at, deleted: !!r.deleted, seq: r.seq,
      data: { title: r.title, topicX: r.topic_x, topicY: r.topic_y, userId: r.user_id },
    };
  }
  if (type === "note") {
    return {
      type, id: r.id, updated_at: r.updated_at, deleted: !!r.deleted, seq: r.seq,
      data: {
        boardId: r.board_id, title: r.title, body: r.body, color: r.color,
        x: r.x, y: r.y, width: r.width, height: r.height, sourceUrl: r.source_url,
        createdAt: r.created_at,
      },
    };
  }
  if (type === "string") {
    return {
      type, id: r.id, updated_at: r.updated_at, deleted: !!r.deleted, seq: r.seq,
      data: { boardId: r.board_id, fromId: r.from_id, toId: r.to_id, label: r.label, color: r.color, thickness: r.thickness },
    };
  }
  if (type === "stroke") {
    return {
      type, id: r.id, updated_at: r.updated_at, deleted: !!r.deleted, seq: r.seq,
      data: { boardId: r.board_id, tool: r.tool, color: r.color, size: r.size, points: JSON.parse(r.points) },
    };
  }
  if (type === "textBox") {
    return {
      type, id: r.id, updated_at: r.updated_at, deleted: !!r.deleted, seq: r.seq,
      data: { boardId: r.board_id, content: r.content, x: r.x, y: r.y, width: r.width },
    };
  }
}

router.post("/", authMiddleware, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { cursor = 0, changes = [] } = req.body || {};
  // apply incoming
  for (const c of changes) {
    try { applyChange(userId, c); } catch (e) { console.error(e); }
  }
  // gather since cursor
  const out: any[] = [];
  const tables: [string, string][] = [
    ["board", "boards"],
    ["note", "notes"],
    ["string", "strings"],
    ["stroke", "strokes"],
    ["textBox", "text_boxes"],
  ];
  // boards filtered by user
  const boards = db.prepare("SELECT * FROM boards WHERE user_id = ? AND seq > ?").all(userId, cursor) as any[];
  for (const r of boards) out.push(rowToChange("board", r));
  // nested: boards owned by user
  const ownedBoardIds = db.prepare("SELECT id FROM boards WHERE user_id = ?").all(userId).map((b: any) => b.id);
  if (ownedBoardIds.length) {
    const ph = ownedBoardIds.map(() => "?").join(",");
    const notes = db.prepare(`SELECT * FROM notes WHERE board_id IN (${ph}) AND seq > ?`).all(...ownedBoardIds, cursor) as any[];
    for (const r of notes) out.push(rowToChange("note", r));
    const strings = db.prepare(`SELECT * FROM strings WHERE board_id IN (${ph}) AND seq > ?`).all(...ownedBoardIds, cursor) as any[];
    for (const r of strings) out.push(rowToChange("string", r));
    const strokes = db.prepare(`SELECT * FROM strokes WHERE board_id IN (${ph}) AND seq > ?`).all(...ownedBoardIds, cursor) as any[];
    for (const r of strokes) out.push(rowToChange("stroke", r));
    const tbs = db.prepare(`SELECT * FROM text_boxes WHERE board_id IN (${ph}) AND seq > ?`).all(...ownedBoardIds, cursor) as any[];
    for (const r of tbs) out.push(rowToChange("textBox", r));
  }
  // dedupe tbs double push fix: redo cleanly
  // (remove duplicate above by filtering) - we'll just dedupe by seq+id
  const seen = new Set();
  const deduped = out.filter((c) => {
    const k = c.type + ":" + c.id + ":" + c.seq;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // new cursor = max seq across user
  const maxRow = db.prepare("SELECT MAX(seq) as m FROM user_seq WHERE user_id = ?").get(userId) as { m: number | null };
  // also consider nested seqs? user_seq incremented per change, so max is fine
  const newCursor = maxRow?.m ?? cursor;
  res.json({ changes: deduped, cursor: newCursor });
});

export default router;
