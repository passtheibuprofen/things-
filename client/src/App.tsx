import { useCallback, useEffect, useState } from "react";
import { db, getMeta, setMeta } from "./db";
import { syncManager } from "./sync";
import { authApi } from "./auth";
import type { Theme, User } from "./types";
import Homepage from "./components/Homepage";
import BoardView from "./components/BoardView";
import "./index.css";

function getInitialTheme(): Theme {
  try {
    const t = localStorage.getItem("things-theme");
    if (t === "corkboard" || t === "light" || t === "dark") return t;
  } catch {}
  return "corkboard";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<{ type: "home" } | { type: "board"; boardId: string }>({ type: "home" });
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("things-theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    (async () => {
      try { await navigator.storage?.persist?.(); } catch {}
      const cached = await getMeta("user");
      if (cached) setUser(cached);
      // try server
      try {
        const u = await authApi.me();
        if (u) { setUser(u); await setMeta("user", u); }
      } catch {}
      setBooted(true);
      syncManager.start();
    })();
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme((t) => (t === "corkboard" ? "light" : t === "light" ? "dark" : "corkboard"));
  }, []);

  if (!booted) return <div className="boot">loading…</div>;

  if (view.type === "board") {
    return (
      <BoardView
        boardId={view.boardId}
        theme={theme}
        user={user}
        onBack={() => setView({ type: "home" })}
      />
    );
  }
  return (
    <Homepage
      theme={theme}
      user={user}
      setUser={setUser}
      cycleTheme={cycleTheme}
      openBoard={(id: string) => setView({ type: "board", boardId: id })}
    />
  );
}
