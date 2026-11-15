import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

function allowSignup() {
  return process.env.ALLOW_SIGNUP !== "false";
}

router.get("/me", authMiddleware, (req: AuthedRequest, res) => {
  res.json({ id: req.userId, username: req.username });
});

router.post("/signup", (req, res) => {
  if (!allowSignup()) return res.status(403).json({ error: "signup disabled" });
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || username.length < 2 || password.length < 4) {
    return res.status(400).json({ error: "invalid" });
  }
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return res.status(409).json({ error: "username taken" });
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)").run(id, username, hash, new Date().toISOString());
  createSession(res, id);
  res.json({ id, username });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(username) as { id: string; password_hash: string } | undefined;
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  createSession(res, user.id);
  const u = db.prepare("SELECT username FROM users WHERE id = ?").get(user.id) as { username: string };
  res.json({ id: user.id, username: u.username });
});

router.post("/logout", authMiddleware, (req: AuthedRequest, res) => {
  const sid = req.cookies?.sid;
  if (sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
  res.clearCookie("sid");
  res.json({ ok: true });
});

function createSession(res: any, userId: string) {
  const sid = uuidv4();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, userId, expires);
  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || process.env.SECURE_COOKIES === "true",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

export default router;
