# Relay task updates from Claude — Fullstack team setup

Update your Relay tasks straight from Claude Code / Claude Desktop. You sign in
with **your own Relay login** — the same email/password as the app — so you can
only see and change what Relay already lets you (your own tasks; the whole
team's if you're the lead). Changes appear in the Relay app within ~20 seconds.

**Enabled for:** Content — Fullstack members, Admin accounts (Aryaa), and individually named grants (`MCP_ALLOWED_EMAILS`, e.g. Venkat Ganesh). Ask the Relay admin to widen `MCP_ALLOWED_SUBS` for other teams.

## Setup (once, ~2 minutes)

1. Get the repo folder (or just the `mcp/` folder) on your machine and run `npm install` inside `mcp/`.
2. Add the server to Claude Code:

```bash
claude mcp add relay-tasks \
  --env RELAY_EMAIL=you@nxtwave.tech \
  --env RELAY_PASSWORD=your-relay-password \
  -- node <path-to-repo>/mcp/team-server.mjs
```

(Claude Desktop: add the same command + env under `mcpServers` in its config file.)

3. Restart Claude. You should see the tools `my_tasks`, `update_task`, `whoami`.

## What you can do

- *"Show my open tasks"* → `my_tasks`
- *"Add a task: build the auth module lab, due 2026-07-15"* → `add_task`
- *"Mark the MCQ generation task as Done"* → `update_task`
- *"Set the SQL lab task to Blocked — waiting on infra access, and move the due date to Friday"*
- *"Update iterations to 5 and accuracy to 92 on task task-1234"*

Status updates also count as your 6 PM acknowledgement, and number updates flow
into the weekly rollups — same as doing it in the app.

## Notes

- Wrong team? The server refuses to start unless your Relay account is in the
  enabled team — this is per-user auth, not a shared key.
- Password lives only in your local Claude config, and all reads/writes run
  under your own account with Relay's standard permissions (RLS).
- Nothing to host: the server runs on your machine and talks straight to Relay's database.
