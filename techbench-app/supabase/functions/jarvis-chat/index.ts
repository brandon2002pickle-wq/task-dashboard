// Supabase Edge Function: J.A.R.V.I.S.'s brain for the hosted command centre.
// The page keeps the conversation and runs the board tools; this function forwards each turn to Claude.
// Deploy:  supabase functions deploy jarvis-chat
// Secret:  supabase secrets set ANTHROPIC_API_KEY=...
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic();
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("JARVIS_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY is not set on the backend." }, 500);

  let body: { system?: string; messages?: Anthropic.Beta.BetaMessageParam[]; tools?: Anthropic.Beta.BetaTool[] };
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "messages required" }, 400);
  if (JSON.stringify(body).length > 150_000) return json({ error: "Conversation too long" }, 400);

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      output_config: { effort: "low" },          // short spoken replies: keep latency down
      system: body.system ?? "",
      messages: body.messages,
      tools: (body.tools ?? []).slice(0, 16),
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") return json({ content: [{ type: "text", text: "I'd rather not, Sir." }], stop_reason: "end_turn" });
    // the page sends this content back unchanged (thinking blocks included) when it returns tool results
    return json({ content: response.content, stop_reason: response.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Rate limited" }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "ANTHROPIC_API_KEY is missing or invalid." }, 500);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude API error ${err.status}` }, 502);
    console.error("jarvis-chat:", err instanceof Error ? err.message : err);
    return json({ error: "jarvis-chat failed" }, 500);
  }
});
