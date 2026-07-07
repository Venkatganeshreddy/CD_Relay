#!/usr/bin/env node
// CD_Relay OAuth MCP server (Streamable HTTP) — for claude.ai custom connectors.
//
// The hosted counterpart of team-server.mjs: same tools (mcp/tools.mjs), but
// per-user auth via a spec-compliant OAuth 2.1 flow so anyone on the team can
// add it in claude.ai → Settings → Connectors and sign in with THEIR OWN Relay
// account. Every tool call then runs under that user's Supabase JWT → RLS.
//
//   discovery  GET /.well-known/oauth-protected-resource   (RFC 9728)
//              GET /.well-known/oauth-authorization-server (RFC 8414)
//   DCR        POST /register                              (RFC 7591)
//   login      GET/POST /authorize  (+ /oauth/callback for Google)
//   tokens     POST /token          (authorization_code + refresh_token, PKCE S256)
//   MCP        POST /mcp            (Bearer-gated, stateless transport)
//
// STATELESS by design: no database, no session store. Auth codes and tokens are
// AES-256-GCM envelopes (TOKEN_SECRET) around the user's own Supabase session —
// survives restarts/sleep on Render's free plan, and revoking = user's Supabase
// session dying or the gate (tools.mjs) rejecting them on refresh.
//
// Env (Render dashboard):
//   TOKEN_SECRET     - long random string (required; encrypts codes/tokens)
//   SUPABASE_URL     - optional, defaults to the project
//   SUPABASE_ANON_KEY- optional, defaults to the public anon key
//   BASE_URL         - optional, e.g. https://cd-relay-mcp-oauth.onrender.com
//   MCP_ALLOWED_SUBS / MCP_ALLOWED_EMAILS - gate (see tools.mjs)
//   MCP_EXTRA_REDIRECTS - optional csv of extra redirect-URI prefixes (testing)
//
// Google sign-in button additionally requires <BASE_URL>/oauth/callback to be
// added to Supabase Auth → URL Configuration → Redirect URLs. The
// email/password form works without any Supabase config change.
import express from 'express';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClient } from '@supabase/supabase-js';
import { resolveEmployee, gateOk, registerTeamTools } from './tools.mjs';

const URL_ = process.env.SUPABASE_URL || 'https://fzwgdiphjehecsizvwyl.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d2dkaXBoamVoZWNzaXp2d3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTU3MjYsImV4cCI6MjA5NTMzMTcyNn0.jqMxmf4x1sJc2j8wxfMoW_OsH4nwjtfALk0pCUhinBI';
const SECRET = (process.env.TOKEN_SECRET || '').trim();
if (!SECRET) { console.error('Set TOKEN_SECRET (a long random string).'); process.exit(1); }
const KEY = crypto.createHash('sha256').update(SECRET).digest();

// Where claude.ai may be sent back to after login. PKCE + real user login are
// the security; this prefix check just keeps codes off arbitrary sites.
const REDIRECT_PREFIXES = ['https://claude.ai/', 'https://claude.com/',
  ...(process.env.MCP_EXTRA_REDIRECTS || '').split(',').map((s) => s.trim()).filter(Boolean)];
const redirectOk = (u) => REDIRECT_PREFIXES.some((p) => String(u || '').startsWith(p));

// ── Stateless crypto envelopes ──────────────────────────────────────────────
const b64u = (buf) => buf.toString('base64url');
function enc(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), ct]));
}
function dec(tok) {
  try {
    const buf = Buffer.from(String(tok), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}
const s256 = (v) => b64u(crypto.createHash('sha256').update(v).digest());

const userClient = (at) => createClient(URL_, ANON, {
  global: { headers: { Authorization: `Bearer ${at}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

// Sign-in helpers against Supabase Auth REST.
async function passwordGrant(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { error: j.error_description || j.msg || 'sign-in failed' };
}
async function refreshGrant(rt) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { error: j.error_description || j.msg || 'refresh failed' };
}

// Validate a Supabase session → employee row + gate. Returns {emp} or {error}.
async function admit(session) {
  const sb = userClient(session.access_token);
  const email = session.user?.email || '';
  const emp = await resolveEmployee(sb, session.user?.id, email);
  if (!emp) return { error: 'No Relay employee record for this account.' };
  if (!gateOk(emp, email)) return { error: `This connector is not enabled for your team (${emp.sub || 'unassigned'}).` };
  return { emp: { id: emp.id, sub: emp.sub, dept: emp.dept, name: emp.name, role_level: emp.role_level }, email };
}

// Mint the OAuth token response from a Supabase session (post-gate).
function tokenResponse(session, emp) {
  const expSec = Math.min(Number(session.expires_in) || 3600, 3600);
  return {
    access_token: enc({ t: 'at', at: session.access_token, emp, exp: Date.now() + expSec * 1000 }),
    token_type: 'bearer',
    expires_in: Math.max(expSec - 300, 600),   // tell the client to refresh early
    refresh_token: enc({ t: 'rt', rt: session.refresh_token }),
  };
}

const app = express();
app.set('trust proxy', 1);                      // Render's TLS proxy → req.protocol=https
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {                   // permissive CORS for connector clients
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const base = (req) => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

app.get('/', (_req, res) => res.send('cd-relay OAuth MCP. Add the /mcp URL as a claude.ai custom connector.'));

// ── OAuth discovery + dynamic client registration ───────────────────────────
app.get('/.well-known/oauth-protected-resource', (req, res) => res.json({
  resource: `${base(req)}/mcp`,
  authorization_servers: [base(req)],
}));
app.get('/.well-known/oauth-authorization-server', (req, res) => res.json({
  issuer: base(req),
  authorization_endpoint: `${base(req)}/authorize`,
  token_endpoint: `${base(req)}/token`,
  registration_endpoint: `${base(req)}/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['relay.tasks'],
}));
app.post('/register', (req, res) => {
  // Stateless DCR: identity/security come from the user login + PKCE, so we
  // accept any client and never need to store it.
  const b = req.body || {};
  res.status(201).json({
    client_id: crypto.randomUUID(),
    token_endpoint_auth_method: 'none',
    redirect_uris: b.redirect_uris || [],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: b.client_name || 'mcp-client',
  });
});

// ── Login page ───────────────────────────────────────────────────────────────
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function loginPage(req, q, err = '') {
  const ctx = enc({ t: 'ctx', chal: q.code_challenge, ruri: q.redirect_uri, state: q.state || '', exp: Date.now() + 600e3 });
  const googleUrl = `${URL_}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${base(req)}/oauth/callback`)}`;
  return { ctx, html: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relay — connect</title>
<style>body{font:15px system-ui;background:#0a1422;color:#e7eef7;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#0e1b2c;border:1px solid #1f3a5f;border-radius:12px;padding:28px;width:min(360px,92vw)}
h1{font-size:17px;margin:0 0 4px}p{color:#8fa5bd;font-size:13px;margin:0 0 18px}
input{width:100%;box-sizing:border-box;margin:5px 0;padding:10px;border-radius:8px;border:1px solid #2b4a73;background:#0a1422;color:#e7eef7}
button,a.g{display:block;width:100%;box-sizing:border-box;text-align:center;margin-top:12px;padding:10px;border-radius:8px;border:0;background:#2b6cb0;color:#fff;font-size:14px;cursor:pointer;text-decoration:none}
a.g{background:#0a1422;border:1px solid #2b4a73}.err{color:#f88;font-size:13px;margin-top:10px}</style>
<div class="card"><h1>Connect Relay tasks</h1><p>Sign in with your Relay account. Claude will only be able to do what your account can.</p>
<form method="post" action="/authorize">
<input type="hidden" name="ctx" value="${esc(ctx)}">
<input name="email" type="email" placeholder="you@nxtwave.co.in" required>
<input name="password" type="password" placeholder="Relay password" required>
<button type="submit">Sign in</button></form>
<a class="g" href="${esc(googleUrl)}">Continue with Google</a>
${err ? `<div class="err">${esc(err)}</div>` : ''}</div>` };
}

app.get('/authorize', (req, res) => {
  const q = req.query;
  if (!redirectOk(q.redirect_uri)) return res.status(400).send('invalid redirect_uri');
  if (!q.code_challenge || (q.code_challenge_method || 'S256') !== 'S256') return res.status(400).send('PKCE S256 required');
  const { ctx, html } = loginPage(req, q);
  // Context rides a short-lived cookie too, so the Google round-trip (which
  // can't carry query params through Supabase's allowlist) still finds it.
  res.set('Set-Cookie', `mcp_ctx=${ctx}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.type('html').send(html);
});

function finishLogin(res, ctx, session, emp) {
  const code = enc({ t: 'code', at: session.access_token, rt: session.refresh_token, emp, chal: ctx.chal, ruri: ctx.ruri, exp: Date.now() + 300e3 });
  const sep = ctx.ruri.includes('?') ? '&' : '?';
  return `${ctx.ruri}${sep}code=${encodeURIComponent(code)}${ctx.state ? `&state=${encodeURIComponent(ctx.state)}` : ''}`;
}

app.post('/authorize', async (req, res) => {
  const ctx = dec(req.body.ctx);
  if (!ctx || ctx.t !== 'ctx' || ctx.exp < Date.now()) return res.status(400).send('Login expired — reopen the connector setup.');
  const session = await passwordGrant(String(req.body.email || '').trim(), String(req.body.password || ''));
  if (session.error) {
    const { html } = loginPage(req, { code_challenge: ctx.chal, redirect_uri: ctx.ruri, state: ctx.state }, session.error);
    return res.status(401).type('html').send(html);
  }
  const who = await admit(session);
  if (who.error) {
    const { html } = loginPage(req, { code_challenge: ctx.chal, redirect_uri: ctx.ruri, state: ctx.state }, who.error);
    return res.status(403).type('html').send(html);
  }
  res.redirect(finishLogin(res, ctx, session, who.emp));
});

// Google lands here with tokens in the URL FRAGMENT (browser-only) — a tiny
// page forwards them, with the cookie context, to /authorize/complete.
app.get('/oauth/callback', (_req, res) => {
  res.type('html').send(`<!doctype html><title>Connecting…</title><body style="font:15px system-ui;background:#0a1422;color:#e7eef7">
<p style="margin:40px auto;max-width:400px" id="m">Finishing sign-in…</p><script>
const p = new URLSearchParams(location.hash.slice(1));
fetch('/authorize/complete', { method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') }) })
  .then(r => r.json()).then(j => { if (j.redirect) location = j.redirect; else document.getElementById('m').textContent = j.error || 'Sign-in failed.'; })
  .catch(() => document.getElementById('m').textContent = 'Sign-in failed.');
</script>`);
});
app.post('/authorize/complete', async (req, res) => {
  const ctx = dec((req.headers.cookie || '').match(/(?:^|;\s*)mcp_ctx=([^;]+)/)?.[1]);
  if (!ctx || ctx.t !== 'ctx' || ctx.exp < Date.now()) return res.json({ error: 'Login expired — reopen the connector setup.' });
  const at = String(req.body.access_token || ''), rt = String(req.body.refresh_token || '');
  if (!at || !rt) return res.json({ error: 'Google sign-in did not return a session.' });
  const { data, error } = await userClient(at).auth.getUser();
  if (error || !data?.user) return res.json({ error: 'Could not verify the Google session.' });
  const session = { access_token: at, refresh_token: rt, user: data.user, expires_in: 3600 };
  const who = await admit(session);
  if (who.error) return res.json({ error: who.error });
  res.json({ redirect: finishLogin(res, ctx, session, who.emp) });
});

// ── Token endpoint ───────────────────────────────────────────────────────────
app.post('/token', async (req, res) => {
  const b = req.body || {};
  if (b.grant_type === 'authorization_code') {
    const c = dec(b.code);
    if (!c || c.t !== 'code' || c.exp < Date.now()) return res.status(400).json({ error: 'invalid_grant' });
    if (s256(String(b.code_verifier || '')) !== c.chal) return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
    if (b.redirect_uri && b.redirect_uri !== c.ruri) return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    return res.json(tokenResponse({ access_token: c.at, refresh_token: c.rt, expires_in: 3600 }, c.emp));
  }
  if (b.grant_type === 'refresh_token') {
    const r = dec(b.refresh_token);
    if (!r || r.t !== 'rt') return res.status(400).json({ error: 'invalid_grant' });
    const session = await refreshGrant(r.rt);
    if (session.error) return res.status(400).json({ error: 'invalid_grant', error_description: session.error });
    const who = await admit(session);          // re-gate on every refresh — removals take effect here
    if (who.error) return res.status(400).json({ error: 'invalid_grant', error_description: who.error });
    return res.json(tokenResponse(session, who.emp));
  }
  res.status(400).json({ error: 'unsupported_grant_type' });
});

// ── MCP endpoint (Bearer-gated, per-user) ────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const tok = dec((req.headers.authorization || '').replace(/^Bearer /i, ''));
  if (!tok || tok.t !== 'at' || tok.exp < Date.now()) {
    return res.status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${base(req)}/.well-known/oauth-protected-resource"`)
      .json({ error: 'unauthorized' });
  }
  const server = new McpServer({ name: 'cd-relay-team', version: '0.2.0' });
  registerTeamTools(server, userClient(tok.at), tok.emp);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.error(`cd-relay OAuth MCP on :${PORT}`));
