import { db, getMeta, setMeta } from "./db";
import type { SyncChange, Board, Note, Str, Stroke, TextBox } from "./types";

type Status = "synced" | "syncing" | "offline" | "pending";
let status: Status = "synced";
let pendingCount = 0;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeSync(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function getSyncState() { return { status, pendingCount }; }

async function recomputePending() {
  pendingCount = await db.pending.count();
  if (pendingCount > 0 && status !== "syncing") status = navigator.onLine ? "pending" : "offline";
  if (pendingCount === 0 && status !== "syncing") status = navigator.onLine ? "synced" : "offline";
  emit();
}

function toChange(p: any): SyncChange {
  return { type: p.type, id: p.entityId, data: p.record, updated_at: p.updatedAt, deleted: !!p.record?.deleted, seq: 0 };
}

async function applyRemote(c: SyncChange) {
  const now = c.updated_at;
  if (c.type === "board") {
    const existing = await db.boards.get(c.id);
    if (existing && new Date(existing.updatedAt) > new Date(now)) return;
    const d = c.data || {};
    const rec: Board = {
      id: c.id,
      userId: d.userId ?? existing?.userId ?? null,
      title: d.title ?? existing?.title ?? "Untitled",
      topicX: d.topicX ?? existing?.topicX ?? 0,
      topicY: d.topicY ?? existing?.topicY ?? 0,
      updatedAt: now,
      deleted: c.deleted,
      seq: c.seq,
    };
    if (c.deleted) {
      // keep soft deleted
    }
    await db.boards.put(rec);
  } else if (c.type === "note") {
    const existing = await db.notes.get(c.id);
    if (existing && new Date(existing.updatedAt) > new Date(now)) return;
    const d = c.data || {};
    const rec: Note = {
      id: c.id,
      boardId: d.boardId,
      title: d.title ?? "",
      body: d.body ?? null,
      color: d.color ?? "",
      x: d.x ?? 0,
      y: d.y ?? 0,
      width: d.width ?? 200,
      height: d.height ?? 160,
      sourceUrl: d.sourceUrl ?? "",
      createdAt: d.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
      deleted: c.deleted,
      seq: c.seq,
    };
    await db.notes.put(rec);
  } else if (c.type === "string") {
    const existing = await db.strings.get(c.id);
    if (existing && new Date(existing.updatedAt) > new Date(now)) return;
    const d = c.data || {};
    const rec: Str = {
      id: c.id,
      boardId: d.boardId,
      fromId: d.fromId,
      toId: d.toId,
      label: d.label ?? "",
      color: d.color ?? "",
      thickness: d.thickness ?? 2,
      updatedAt: now,
      deleted: c.deleted,
      seq: c.seq,
    };
    await db.strings.put(rec);
  } else if (c.type === "stroke") {
    const existing = await db.strokes.get(c.id);
    if (existing && new Date(existing.updatedAt) > new Date(now)) return;
    const d = c.data || {};
    const rec: Stroke = {
      id: c.id,
      boardId: d.boardId,
      tool: d.tool,
      color: d.color,
      size: d.size,
      points: d.points,
      updatedAt: now,
      deleted: c.deleted,
      seq: c.seq,
    };
    await db.strokes.put(rec);
  } else if (c.type === "textBox") {
    const existing = await db.textBoxes.get(c.id);
    if (existing && new Date(existing.updatedAt) > new Date(now)) return;
    const d = c.data || {};
    const rec: TextBox = {
      id: c.id,
      boardId: d.boardId,
      content: d.content,
      x: d.x ?? 0,
      y: d.y ?? 0,
      width: d.width ?? 200,
      updatedAt: now,
      deleted: c.deleted,
      seq: c.seq,
    };
    await db.textBoxes.put(rec);
  }
}

let syncing = false;
export async function syncNow() {
  if (syncing) return;
  if (!navigator.onLine) { status = "offline"; emit(); return; }
  const token = await getMeta("authToken"); // not used; cookie
  syncing = true;
  status = "syncing"; emit();
  try {
    const cursor = (await getMeta("cursor")) ?? 0;
    const pending = await db.pending.toArray();
    const changes = pending.map(toChange);
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cursor, changes }),
    });
    if (!r.ok) throw new Error("sync failed");
    const data = await r.json();
    // apply remote
    for (const c of data.changes || []) await applyRemote(c);
    // remove pending that were sent
    if (pending.length) {
      const ids = pending.map((p) => p.id!).filter(Boolean);
      await db.pending.bulkDelete(ids);
    }
    await setMeta("cursor", data.cursor ?? cursor);
    status = "synced";
  } catch (e) {
    status = navigator.onLine ? "pending" : "offline";
  } finally {
    syncing = false;
    await recomputePending();
    emit();
  }
}

export const syncManager = {
  start() {
    // initial sync attempt
    syncNow();
    // online event
    window.addEventListener("online", () => syncNow());
    // periodic
    setInterval(() => syncNow(), 60000);
  },
  trigger() {
    // debounced
    clearTimeout((window as any).__syncTimer);
    (window as any).__syncTimer = setTimeout(() => syncNow(), 800);
  },
};

// attach user attach boards on login handled by caller via meta? We'll handle in Homepage.
export async function attachAnonymousBoards(userId: string) {
  const boards = await db.boards.where("userId").equals(null as any).toArray();
  // Dexie where with null may not work; do filter
  const all = await db.boards.toArray();
  for (const b of all) {
    if (b.userId === null || b.userId === undefined) {
      await db.boards.update(b.id, { userId, updatedAt: new Date().toISOString() });
      // queue change
      await db.pending.add({ type: "board", entityId: b.id, record: { ...b, userId, updatedAt: new Date().toISOString(), deleted: b.deleted }, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    }
  }
  syncManager.trigger();
}

export async function queueChange(type: string, entityId: string, record: any) {
  await db.pending.add({ type, entityId, record, updatedAt: record.updatedAt, createdAt: new Date().toISOString() });
  await recomputePending();
  syncManager.trigger();
}

export { recomputePending };
