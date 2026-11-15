export type Theme = "corkboard" | "light" | "dark";

export type Board = {
  id: string;
  userId: string | null;
  title: string;
  topicX: number;
  topicY: number;
  updatedAt: string;
  deleted: boolean;
  seq: number;
};

export type Note = {
  id: string;
  boardId: string;
  title: string;
  body: any; // TipTap JSON
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  seq: number;
};

export type Str = {
  id: string;
  boardId: string;
  fromId: string;
  toId: string;
  label: string;
  color: string;
  thickness: number;
  updatedAt: string;
  deleted: boolean;
  seq: number;
};

export type Stroke = {
  id: string;
  boardId: string;
  tool: "pencil" | "pen" | "marker" | "highlighter" | "eraser";
  color: string;
  size: number;
  points: any[];
  updatedAt: string;
  deleted: boolean;
  seq: number;
};

export type TextBox = {
  id: string;
  boardId: string;
  content: any;
  x: number;
  y: number;
  width: number;
  updatedAt: string;
  deleted: boolean;
  seq: number;
};

export type SyncChange = {
  type: "board" | "note" | "string" | "stroke" | "textBox";
  id: string;
  data: any;
  updated_at: string;
  deleted: boolean;
  seq: number;
};

export type User = { id: string; username: string };
