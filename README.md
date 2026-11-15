# things?

A corkboard-style personal research tool. React + Vite frontend, Node/Express + SQLite backend, served on one port.

## Setup

```bash
npm install
npm run build
npm start
```

Dev:
```bash
npm run dev
```

Server binds to 0.0.0.0 and reads PORT from env (default 3000).

## Tailscale HTTPS (private tailnet only, never Funnel)

```bash
tailscale serve --bg 3000
```

Then open https://<machine>.<tailnet>.ts.net on your phone. Do not use `tailscale funnel`.

## Keep running on Pop!_OS (systemd user service)

`~/.config/systemd/user/things.service`:
```
[Unit]
Description=things?
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/softpaws/things
Environment=PORT=3000
Environment=DB_PATH=/home/softpaws/things/data/things.db
ExecStart=/usr/bin/node /home/softpaws/things/server/dist/index.js
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now things
```

ALLOW_SIGNUP env (default true) to disable signups after accounts exist.
