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
    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) return json({ error: "OPENROUTER_API_KEY not set on the function" }, 500);

    const { messages, model, max_tokens, temperature } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "`messages` (non-empty array) required" }, 400);
    }
    const slug = MODELS[model as string] || (model as string) || MODELS.smart;

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://relay.nxtwave.io",
        "X-Title": "Relay",
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
      model: slug,
      usage: data?.usage || null,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
