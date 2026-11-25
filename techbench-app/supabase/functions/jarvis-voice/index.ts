// Supabase Edge Function: J.A.R.V.I.S.'s voice. Claude writes the reply; ElevenLabs speaks it.
// Deploy:  supabase functions deploy jarvis-voice
// Secret:  supabase secrets set ELEVENLABS_API_KEY=...   (a key from the workspace that holds the jarvis voice)
// Callers must be signed in (Supabase verifies the JWT before this runs).
const VOICE_ID = Deno.env.get("JARVIS_VOICE_ID") ?? "fONmGZvf9jMdFhjqnd2L";
const MODEL_ID = "eleven_flash_v2_5";
const OUTPUT = "mp3_44100_128";
const SETTINGS = { stability: 0.62, similarity_boost: 0.8, style: 0.05, speed: 0.96, use_speaker_boost: true };

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("JARVIS_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const err = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return err(405, "POST only");

  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) return err(500, "ELEVENLABS_API_KEY is not set on the backend.");

  let text: unknown;
  try { ({ text } = await req.json()); } catch { return err(400, "Body must be JSON: {text}"); }
  if (typeof text !== "string" || !text.trim()) return err(400, "text is required");
  if (text.length > 1200) return err(400, "Keep spoken replies under 1200 characters.");

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=${OUTPUT}`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.trim(), model_id: MODEL_ID, voice_settings: SETTINGS }),
    },
  );
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    const status = upstream.status === 401 ? 502 : upstream.status === 429 ? 429 : 502;
    return err(status, `ElevenLabs ${upstream.status}: ${detail.slice(0, 300)}`);
  }
  // stream the MP3 straight through so playback starts before the whole clip exists
  return new Response(upstream.body, { headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
});
