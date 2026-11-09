import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readElevenLabsCredential } from './elevenlabs-credentials.mjs';

describe('local ElevenLabs credentials', () => {
  it('accepts an explicit environment value without consulting a file', async () => {
    expect(await readElevenLabsCredential({ ELEVENLABS_API_KEY: 'test-only-value', ELEVENLABS_KEY_FILE: '/nonexistent' })).toBe('test-only-value');
  });
  it('accepts owner-only files and refuses shared files and symlinks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aegis-credential-test-'));
    const privateFile = join(directory, 'private');
    const sharedFile = join(directory, 'shared');
    const linkedFile = join(directory, 'link');
    await writeFile(privateFile, 'not-a-real-key\n', { mode: 0o600, flag: 'wx' });
    await writeFile(sharedFile, 'not-a-real-key', { mode: 0o644, flag: 'wx' });
    await symlink(privateFile, linkedFile);
    expect(await readElevenLabsCredential({ ELEVENLABS_KEY_FILE: privateFile })).toBe('not-a-real-key');
    await expect(readElevenLabsCredential({ ELEVENLABS_KEY_FILE: sharedFile })).rejects.toThrow('owner-only');
    await expect(readElevenLabsCredential({ ELEVENLABS_KEY_FILE: linkedFile })).rejects.toThrow('owner-only');
  });
  it('reports errors without echoing the malformed value', async () => {
    await expect(readElevenLabsCredential({ ELEVENLABS_API_KEY: 'test-only invalid value' })).rejects.toThrow('malformed');
    await expect(readElevenLabsCredential({ ELEVENLABS_KEY_FILE: '/does-not-exist' })).rejects.toThrow('Configure');
  });
});
