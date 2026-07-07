# Relay tasks in claude.ai — team connector (OAuth)

One shared link. Each teammate adds it in claude.ai, signs in with **their own
Relay account**, and can then list, add, and update their tasks from any Claude
chat (web, desktop, mobile). Everything runs under their identity — Relay's
permissions decide what each person can touch, and every change shows in the
Relay app within ~20 seconds.

**Who gets in:** Content — Fullstack members, Admin accounts, and named grants
(`MCP_ALLOWED_EMAILS`). Everyone else is refused at sign-in.

## Deploy once (admin, ~5 minutes)

1. Render dashboard → **New → Blueprint** on this repo (or *Sync* if the
   blueprint is already applied). It creates the service **cd-relay-mcp-oauth**
   from `render.yaml` — `TOKEN_SECRET` is auto-generated; no other secrets
   needed (this server never sees the service-role key).
2. Note the URL, e.g. `https://cd-relay-mcp-oauth.onrender.com`.
3. *(Optional — enables the "Continue with Google" button)* Supabase Dashboard →
   Authentication → URL Configuration → Redirect URLs → add
   `https://cd-relay-mcp-oauth.onrender.com/oauth/callback`.
   Email/password sign-in works without this step.

## Each teammate (~1 minute)

1. claude.ai → Settings → **Connectors** → **Add custom connector**
2. URL: `https://cd-relay-mcp-oauth.onrender.com/mcp`
3. Claude opens the Relay sign-in page → log in (email/password, or Google if
   enabled) → done.

Then just chat:
- *"Show my open tasks"*
- *"Add a task: build the auth module lab, due 2026-07-15"*
- *"Mark the MCQ task as Done"* / *"Set it to Blocked — waiting on infra"*
- *"Update iterations to 5 and accuracy to 92 on task-1234"*

## How it works / security

- Spec-compliant OAuth 2.1: discovery (RFC 8414/9728), dynamic client
  registration (RFC 7591), authorization-code + PKCE (S256), refresh tokens.
- The server is **stateless**: codes and tokens are AES-256-GCM envelopes
  around the user's own Supabase session — nothing stored, survives free-tier
  sleeps. Refresh re-checks the team gate, so removing someone takes effect on
  their next token refresh (≤1 hour).
- No admin credentials anywhere: tool calls run on the signed-in user's JWT;
  Relay RLS is the enforcement (member → own tasks, L2 → team, Admin → all).
- Status updates count as the 6 PM acknowledgement and feed the escalation
  engine; number edits sync the mirrored worklog — identical to the app.

Local (Claude Code) alternative without hosting: `TEAM-SETUP.md`.
