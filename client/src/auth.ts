export const authApi = {
  async signup(username: string, password: string) {
    const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ username, password }) });
    if (!r.ok) throw new Error((await r.json()).error || "signup failed");
    return r.json();
  },
  async login(username: string, password: string) {
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ username, password }) });
    if (!r.ok) throw new Error((await r.json()).error || "login failed");
    return r.json();
  },
  async logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  },
  async me() {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (!r.ok) return null;
    return r.json();
  },
};
