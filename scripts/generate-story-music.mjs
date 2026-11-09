// Explicit, resumable ElevenLabs generation. Dry-run is the default; no key in client code.
// API: https://elevenlabs.io/docs/api-reference/music/compose
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const plan = JSON.parse(await readFile(join(root, 'docs/story/v3/music-prompts.json'), 'utf8'));
const manifestPath = join(root, 'src/audio/story-scores.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const live = process.argv.includes('--generate');
const selected = process.argv.find((arg) => arg.startsWith('--track='))?.slice(8);
if (selected && !Object.hasOwn(plan.tracks, selected)) throw new Error('Unknown track');
if (live && !process.env.ELEVENLABS_API_KEY) {
  throw new Error('ELEVENLABS_API_KEY is not configured. Set it locally; never paste it into chat or source control.');
}
for (const [track, specification] of Object.entries(plan.tracks)) {
  if (selected && selected !== track) continue;
  const relative = `audio/story/${track}-v1.mp3`;
  const destination = join(root, 'public', relative);
  if (manifest[track]?.status === 'generated') {
    console.log(`${track}: already generated, skipping (no API charge).`);
    continue;
  }
  if (!live) {
    console.log(`${track}: ${specification.music_length_ms / 1000}s, ${plan.model_id}, ${plan.output_format}. Dry run; pass --generate to consume API credits.`);
    continue;
  }
  // Refuse to replace an unregistered output; recover it manually rather than regenerate.
  if (await stat(destination).catch(() => undefined)) throw new Error(`Output exists: ${relative}. Inspect it before continuing.`);
  console.log(`Generating ${track}. This consumes ElevenLabs credits; uncertain failures are NOT retried automatically.`);
  const response = await fetch(`https://api.elevenlabs.io/v1/music?output_format=${encodeURIComponent(plan.output_format)}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: plan.model_id, prompt: specification.prompt, music_length_ms: specification.music_length_ms, force_instrumental: true }),
    signal: AbortSignal.timeout(600_000),
  });
  // Do not log request headers, environment or arbitrary provider response bodies.
  if (!response.ok) throw new Error(`ElevenLabs HTTP ${response.status}. Inspect account access/credits before any retry.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mp3 = bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!mp3 || bytes.length < 100_000) throw new Error('Response is not a non-empty MP3. No automatic retry.');
  await mkdir(join(root, 'public/audio/story'), { recursive: true });
  await writeFile(`${destination}.partial`, bytes, { flag: 'wx' });
  await rename(`${destination}.partial`, destination);
  manifest[track] = {
    file: relative, status: 'generated', durationSeconds: specification.music_length_ms / 1000,
    provider: 'ElevenLabs', model: plan.model_id, generatedAt: new Date().toISOString(),
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  // Persist after each successful track so an interrupted second request cannot duplicate the first.
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${track}: saved ${relative}. Decode, measure duration, and audition before publication.`);
}
