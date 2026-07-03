// Relay — `relay-agent` Edge Function (Phase 5).
// Authenticated proxy to OpenRouter. The browser calls this with the user's
// Supabase JWT (Supabase verifies it before invoking — verify_jwt stays on), so
// the OpenRouter key never leaves the server. Concierge + agent calls route here.
//
// Deploy:   supabase functions deploy relay-agent
// Secret:   supabase secrets set OPENROUTER_API_KEY=sk-or-...   (rotate the one
//           pasted in chat). Optional: LLM_MODEL_FAST / LLM_MODEL_SMART.
// Uses Deno.serve (built-in) instead of deno.land/std/http/server which is
// deprecated and no longer boots on the newer Supabase Edge runtime.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELS: Record<string, string> = {
  fast: Deno.env.get("LLM_MODEL_FAST") || "anthropic/claude-haiku-4.5",
  smart: Deno.env.get("LLM_MODEL_SMART") || "anthropic/claude-sonnet-4.6",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const { messages, model, max_tokens, temperature, agent, modal: modalAgent, payload, action } = await req.json();

    // ── Exact spend: proxy OpenRouter's auth/key so the browser never sees the key.
    if (action === "spend") {
      const key = Deno.env.get("OPENROUTER_API_KEY");
      if (!key) return json({ error: "OPENROUTER_API_KEY not set on the function" }, 500);
      const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await r.json();
      if (!r.ok) return json({ error: data?.error?.message || "OpenRouter error", status: r.status }, 502);
      return json(data.data); // { label, usage, limit, limit_remaining, is_free_tier, rate_limit }
    }

    // ── Modal forward: delegate to a Python LangGraph agent on Modal when wired.
    // Supabase verifies the browser's JWT before invoking this function (verify_jwt
    // on), so the shared secret never leaves the server. Returns path:"modal" on
    // success, or a non-"modal" path the client uses to fall back to its inline
    // prompt. Roll back instantly by unsetting MODAL_<AGENT>_URL.
    if (modalAgent) {
      const url = Deno.env.get(`MODAL_${String(modalAgent).toUpperCase()}_URL`);
      const secret = Deno.env.get("RELAY_AGENT_SECRET");
      if (!url || !secret) return json({ path: "unconfigured" });
      try {
        const mr = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-relay-secret": secret },
          body: JSON.stringify(payload || {}),
        });
        if (!mr.ok) return json({ path: "error", status: mr.status });
        return json({ ...(await mr.json()), path: "modal" });
      } catch (e) {
        return json({ path: "error", error: String((e as Error)?.message || e) });
      }
    }

    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) return json({ error: "OPENROUTER_API_KEY not set on the function" }, 500);

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "`messages` (non-empty array) required" }, 400);
    }
    const slug = MODELS[model as string] || (model as string) || MODELS.smart;

    // Observability: if HELICONE_API_KEY is set, route through Helicone's
    // OpenRouter gateway so every call is traced (cost/latency/tokens) and
    // tagged by agent. Unset → hit OpenRouter directly, unchanged.
    //   supabase secrets set HELICONE_API_KEY=sk-helicone-...
    const helicone = Deno.env.get("HELICONE_API_KEY");
    const endpoint = helicone
      ? "https://openrouter.helicone.ai/api/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
    const heliconeHeaders: Record<string, string> = helicone
      ? {
          "Helicone-Auth": `Bearer ${helicone}`,
          ...(agent ? { "Helicone-Property-Agent": String(agent) } : {}),
        }
      : {};

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://relay.nxtwave.io",
        "X-Title": "Relay",
        ...heliconeHeaders,
      },
      body: JSON.stringify({
        model: slug,
        messages,
        max_tokens: max_tokens || 4096,
        temperature: temperature ?? 0.3,
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || "OpenRouter error", status: r.status }, 502);
    return json({
      content: data?.choices?.[0]?.message?.content || "",
      model: data?.model || slug, // the model OpenRouter actually served, not just the requested slug
      usage: data?.usage || null,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
