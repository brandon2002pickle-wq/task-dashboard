// Supabase Edge Function: drafts one AX segment of a service report with Claude.
// Deploy:  supabase functions deploy report
// Secret:  supabase secrets set ANTHROPIC_API_KEY=...   (never put the key in the app)
// Supabase verifies the caller's sign-in token before this runs (verify_jwt is on by default).
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the function's secrets

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let prompt: unknown;
  try { ({ prompt } = await req.json()); } catch { return json({ error: "Body must be JSON: {prompt}" }, 400); }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 200_000) {
    return json({ error: "prompt must be a non-empty string under 200k characters" }, 400);
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // if a safety classifier declines, the API re-runs the request on a fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") {
      return json({ error: "The model declined this request.", category: response.stop_details?.category ?? null }, 422);
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return json({ text, model: response.model, stop_reason: response.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Rate limited, try again shortly." }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "ANTHROPIC_API_KEY is missing or invalid." }, 500);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude API error ${err.status}` }, 502);
    return json({ error: "Report function failed." }, 500);
  }
});
