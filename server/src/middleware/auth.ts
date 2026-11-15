import { db } from "../db.js";
import type { Request, Response, NextFunction } from "express";

export interface AuthedRequest extends Request {
  userId?: string;
  username?: string;
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const sid = req.cookies?.sid;
  if (!sid) return res.status(401).json({ error: "unauthorized" });
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").get(sid) as { user_id: string; expires_at: string } | undefined;
  if (!row) return res.status(401).json({ error: "unauthorized" });
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
    return res.status(401).json({ error: "unauthorized" });
  }
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(row.user_id) as { username: string } | undefined;
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.userId = row.user_id;
  req.username = user.username;
  next();
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const sid = req.cookies?.sid;
  if (sid) {
    const row = db.prepare("SELECT user_id FROM sessions WHERE id = ?").get(sid) as { user_id: string } | undefined;
    if (row) { req.userId = row.user_id; }
  }
  next();
}
