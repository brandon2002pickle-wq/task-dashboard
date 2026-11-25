// ElevenLabs quick test: node scripts/elevenlabs-test.mjs
// Reads ELEVENLABS_API_KEY from .env.local (never commit that file).
import fs from "node:fs";
import process from "node:process";
import dotenv from "dotenv";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  const stream = await client.textToSpeech.convert("21m00Tcm4TlvDq8ikWAM", {
    modelId: "eleven_v3",
    text: "This is a test for the API of ElevenLabs.",
  });
  // convert() returns a ReadableStream<Uint8Array>; collect it before writing
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  fs.writeFileSync("output.mp3", Buffer.concat(chunks));
  console.log("Saved output.mp3");
}

main().catch((err) => {
  console.error(`ElevenLabs test failed: ${err.statusCode ?? ""} ${err.body?.detail?.message ?? err.message}`.trim());
  process.exitCode = 1;
});
