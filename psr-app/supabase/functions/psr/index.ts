// Supabase Edge Function for PSR Tool: sends one prompt (plus optional report photos) to Claude
// and returns the text reply, which the app parses as JSON.
// Deploy:  supabase functions deploy psr
// Secret:  supabase secrets set ANTHROPIC_API_KEY=...   (already set if Tech Bench's report function works)
// Supabase verifies the caller's sign-in token before this runs (verify_jwt is on by default).
import Anthropic from "npm:@anthropic-ai/sdk";

// Created on first use, so a missing key returns a clear error instead of crashing the function at boot.
let client: Anthropic | null = null;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
type Img = { media_type: string; data: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { prompt?: unknown; images?: unknown; tier?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON: {prompt, images?, tier?}" }, 400); }
  const { prompt, tier } = body;
  const images = (Array.isArray(body.images) ? body.images : []) as Img[];
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 400_000) {
    return json({ error: "prompt must be a non-empty string under 400k characters" }, 400);
  }
  if (images.length > 8) return json({ error: "8 photos at most" }, 413);
  for (const im of images) {
    if (!im || !IMAGE_TYPES.has(im.media_type) || typeof im.data !== "string" || im.data.length > 7_000_000) {
      return json({ error: "Each photo must be a base64 JPEG, PNG, WebP or GIF under 5 MB" }, 400);
    }
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map((im) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: im.media_type as "image/jpeg", data: im.data },
    })),
    { type: "text", text: prompt },
  ];

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return json({ error: "ANTHROPIC_API_KEY is not set. Add it under Edge Functions → Secrets." }, 500);
  }
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the function's secrets

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // diagnosis reads and step updates think harder; the work order paragraph doesn't need to
      output_config: { effort: tier === "complex" ? "high" : "medium" },
      // if a safety classifier declines, the API re-runs the request on a fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") {
      return json({ error: "The model declined this request.", category: response.stop_details?.category ?? null }, 422);
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return json({ text, model: response.model, stop_reason: response.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Rate limited, try again shortly." }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "ANTHROPIC_API_KEY is missing or invalid." }, 500);
    if (err instanceof Anthropic.BadRequestError) return json({ error: "Claude rejected the request (too large or malformed)." }, 413);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude API error ${err.status}` }, 502);
    return json({ error: "PSR function failed." }, 500);
  }
});
