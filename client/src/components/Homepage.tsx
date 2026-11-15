import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { getSyncState, subscribeSync, syncNow } from "../sync";
import { authApi } from "../auth";
import { setMeta, getMeta } from "../db";
import { attachAnonymousBoards } from "../sync";
import type { Theme, User, Board } from "../types";
import { Plus, Menu, LogOut, RefreshCw } from "lucide-react";

export default function Homepage({ theme, user, setUser, cycleTheme, openBoard }: any) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [syncState, setSyncState] = useState(getSyncState());
  useEffect(() => { const unsub = subscribeSync(() => setSyncState(getSyncState())); return () => unsub(); }, []);

  const boards = useLiveQuery(async () => {
    const all = await db.boards.toArray();
    return all.filter((b) => !b.deleted).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  }, []);

  const themeLabel = theme === "corkboard" ? "Corkboard" : theme === "light" ? "Light Notepad" : "Dark Notepad";

  const createBoard = async () => {
    const title = prompt("Topic title?");
    if (!title) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const board: Board = { id, userId: user?.id ?? null, title, topicX: 0, topicY: 0, updatedAt: now, deleted: false, seq: 0 };
    await db.boards.add(board);
    await (await import("../sync")).queueChange("board", id, board);
    openBoard(id);
  };

  const renameBoard = async (b: Board) => {
    const t = prompt("Rename", b.title);
    if (!t) return;
    const now = new Date().toISOString();
    await db.boards.update(b.id, { title: t, updatedAt: now });
    const updated = await db.boards.get(b.id);
    if (updated) await (await import("../sync")).queueChange("board", b.id, updated);
  };

  const deleteBoard = async (b: Board) => {
    if (!confirm("Delete this board?")) return;
    const now = new Date().toISOString();
    await db.boards.update(b.id, { deleted: true, updatedAt: now });
    const updated = await db.boards.get(b.id);
    if (updated) await (await import("../sync")).queueChange("board", b.id, updated);
  };

  const doAuth = async () => {
    setAuthErr("");
    try {
      const u = authMode === "signup" ? await authApi.signup(username, password) : await authApi.login(username, password);
      setUser(u);
      await setMeta("user", u);
      if (authMode === "signup" || authMode === "login") await attachAnonymousBoards(u.id);
      setAuthMode(null);
      setUsername(""); setPassword("");
      syncNow();
    } catch (e: any) {
      setAuthErr(e.message);
    }
  };

  const logout = async () => {
    const pc = (await db.pending.count());
    if (pc > 0 && !confirm(`You have ${pc} unsynced changes. Log out anyway?`)) return;
    await authApi.logout();
    setUser(null);
    await setMeta("user", null);
  };

  const syncLabel = syncState.status === "synced" ? "synced" : syncState.status === "syncing" ? "syncing…" : syncState.status === "pending" ? `pending (${syncState.pendingCount})` : "offline";

  return (
    <div className="homepage">
      <header className="home-topbar">
        <button className="icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="menu"><Menu size={22} /></button>
        <h1 className="home-title">things?</h1>
      </header>

      {menuOpen && (
        <div className="menu-panel">
          {user ? (
            <>
              <div className="menu-user">{user.username}</div>
              <div className="menu-sync">{syncLabel}</div>
              <button className="menu-item" onClick={() => { syncNow(); }}>Sync now</button>
              <button className="menu-item" onClick={logout}>Log out</button>
            </>
          ) : (
            <button className="menu-item" onClick={() => { setAuthMode("login"); setMenuOpen(false); }}>Log in / Sign up</button>
          )}
          <button className="menu-item" onClick={() => { cycleTheme(); }}>{themeLabel}</button>
        </div>
      )}

      {authMode && (
        <div className="modal-overlay" onClick={() => setAuthMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{authMode === "signup" ? "Sign up" : "Log in"}</h2>
            <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {authErr && <div className="err">{authErr}</div>}
            <div className="modal-actions">
              <button onClick={doAuth}>{authMode === "signup" ? "Sign up" : "Log in"}</button>
              <button onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>
                {authMode === "signup" ? "Switch to log in" : "Switch to sign up"}
              </button>
              <button onClick={() => setAuthMode(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <main className="board-list">
        {(!boards || boards.length === 0) && (
          <div className="empty-state">No boards yet — tap the + button to start a new topic.</div>
        )}
        {boards?.map((b) => (
          <div key={b.id} className="board-row" onClick={() => openBoard(b.id)}>
            <div className="board-title">{b.title}</div>
            <div className="board-time">{new Date(b.updatedAt).toLocaleString()}</div>
            <button className="more-btn" onClick={(e) => { e.stopPropagation(); const a = prompt("r=rename d=delete", ""); if (a === "r") renameBoard(b); if (a === "d") deleteBoard(b); }}>⋯</button>
          </div>
        ))}
      </main>

      <button className="fab" onClick={createBoard} aria-label="new board"><Plus size={28} /></button>
    </div>
  );
}
