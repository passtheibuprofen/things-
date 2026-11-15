import Dexie, { type Table } from "dexie";
import type { Board, Note, Str, Stroke, TextBox } from "./types";

export class ThingsDB extends Dexie {
  boards!: Table<Board, string>;
  notes!: Table<Note, string>;
  strings!: Table<Str, string>;
  strokes!: Table<Stroke, string>;
  textBoxes!: Table<TextBox, string>;
  pending!: Table<{ id?: number; type: string; entityId: string; record: any; updatedAt: string; createdAt: string }, number>;
  meta!: Table<{ key: string; value: any }, string>;

  constructor() {
    super("things");
    this.version(1).stores({
      boards: "id, userId, updatedAt, deleted",
      notes: "id, boardId, updatedAt, deleted",
      strings: "id, boardId, updatedAt, deleted",
      strokes: "id, boardId, updatedAt, deleted",
      textBoxes: "id, boardId, updatedAt, deleted",
      pending: "++id, type, entityId, createdAt",
      meta: "key",
    });
  }
}

export const db = new ThingsDB();

export async function getMeta(key: string) {
  const r = await db.meta.get(key);
  return r?.value;
}
export async function setMeta(key: string, value: any) {
  await db.meta.put({ key, value });
}
