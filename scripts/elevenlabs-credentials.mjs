import { open, constants } from 'node:fs/promises';

/** Server-side only. Never put credential values in logs, files or browser code. */
export async function readElevenLabsCredential(env = process.env) {
  const validate = (value) => {
    const key = value.trim();
    if (!key || /\s/.test(key) || key.length > 4096) throw new Error('ElevenLabs credential is empty or malformed; no request made.');
    return key;
  };
  if (env.ELEVENLABS_API_KEY?.trim()) return validate(env.ELEVENLABS_API_KEY);
  const path = env.ELEVENLABS_KEY_FILE || '/private/tmp/aegis-elevenlabs-api-key';
  let handle;
  try {
    // Opening without following symlinks and checking the open handle avoids
    // changing targets between a permission check and the actual read.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 4096) throw new Error();
    if ((info.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error();
  } catch {
    await handle?.close();
    throw new Error('Configure an owner-only regular ElevenLabs credential file (mode 600), or ELEVENLABS_API_KEY. Never paste the key into chat.');
  }
  try { return validate(await handle.readFile('utf8')); }
  finally { await handle.close(); }
}
