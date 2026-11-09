import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RADIO_FILES, REQUIRED_RADIO_CUES, REQUIRED_RADIO_FILES, validateRadioWave, verifyRadioAudio } from './verify-radio-audio.mjs';

function chunk(id, payload) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, Buffer.alloc(payload.length % 2)]);
}

function format(overrides = {}, extended = false) {
  const settings = { encoding: 1, channels: 1, sampleRate: 22_050, byteRate: 44_100, blockAlign: 2, bits: 16, ...overrides };
  const bytes = Buffer.alloc(extended ? 18 : 16);
  bytes.writeUInt16LE(settings.encoding, 0);
  bytes.writeUInt16LE(settings.channels, 2);
  bytes.writeUInt32LE(settings.sampleRate, 4);
  bytes.writeUInt32LE(settings.byteRate, 8);
  bytes.writeUInt16LE(settings.blockAlign, 12);
  bytes.writeUInt16LE(settings.bits, 14);
  return bytes;
}

function samples(count = 11_025, value = (index) => Math.round(6_000 * Math.sin(index * Math.PI * 2 * 440 / 22_050))) {
  const bytes = Buffer.alloc(count * 2);
  for (let index = 0; index < count; index += 1) bytes.writeInt16LE(value(index), index * 2);
  return bytes;
}

function wave(parts = [chunk('fmt ', format()), chunk('data', samples())]) {
  const body = Buffer.concat([Buffer.from('WAVE'), ...parts]);
  const header = Buffer.alloc(8);
  header.write('RIFF');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

test('decodes an audible little-endian PCM recording and reports sample metrics', () => {
  const bytes = wave();
  const result = validateRadioWave(bytes);
  assert.equal(result.durationSeconds, 0.5);
  assert.equal(result.sampleCount, 11_025);
  assert.equal(result.bytes, bytes.length);
  assert.ok(result.rms > 0.12 && result.rms < 0.14);
  assert.ok(result.peak > 0.18 && result.peak < 0.19);
  assert.ok(result.activeSampleCount > 10_000);
});

test('walks padded metadata chunks without interpreting payload strings as chunk headers', () => {
  const bytes = wave([
    chunk('JUNK', Buffer.from('fmt data are not real chunk headers here')),
    chunk('fmt ', format({}, true)),
    chunk('LIST', Buffer.from('abc')),
    chunk('data', samples()),
    chunk('INFO', Buffer.from('tail metadata')),
  ]);
  assert.equal(validateRadioWave(bytes).durationSeconds, 0.5);
});

test('accepts inclusive 0.2-second and 5-second duration boundaries', () => {
  for (const [count, duration] of [[4_410, 0.2], [110_250, 5]]) {
    assert.equal(validateRadioWave(wave([chunk('fmt ', format()), chunk('data', samples(count))])).durationSeconds, duration);
  }
});

const invalidCases = [
  ['empty file', () => Buffer.alloc(0), /header/],
  ['big-endian header', () => { const bytes = wave(); bytes.write('RIFX'); return bytes; }, /little-endian/],
  ['high-bit forged RIFF signature', () => { const bytes = wave(); bytes[0] |= 0x80; return bytes; }, /RIFF\/WAVE/],
  ['high-bit forged format chunk ID', () => { const bytes = wave(); bytes[12] |= 0x80; return bytes; }, /must follow/],
  ['non-WAVE form', () => { const bytes = wave(); bytes.write('AVI ', 8); return bytes; }, /RIFF\/WAVE/],
  ['declared RIFF size mismatch', () => { const bytes = wave(); bytes.writeUInt32LE(bytes.length, 4); return bytes; }, /RIFF size/],
  ['truncated body', () => wave().subarray(0, -2), /RIFF size/],
  ['unaccounted trailing bytes', () => Buffer.concat([wave(), Buffer.from([0, 0])]), /RIFF size/],
  ['truncated chunk header', () => wave([Buffer.from('abc')]), /chunk header/],
  ['out-of-bounds chunk size', () => {
    const bytes = wave(); bytes.writeUInt32LE(0xffff_ffff, 16); return bytes;
  }, /boundary/],
  ['missing odd chunk padding', () => {
    const bytes = wave([chunk('fmt ', format()), chunk('data', samples()), chunk('JUNK', Buffer.from('a'))]).subarray(0, -1);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    return bytes;
  }, /padding/],
  ['missing format', () => wave([chunk('JUNK', Buffer.from('fmt data'))]), /missing fmt/],
  ['missing data', () => wave([chunk('fmt ', format())]), /missing data/],
  ['data before format', () => wave([chunk('data', samples()), chunk('fmt ', format())]), /must follow/],
  ['duplicate format', () => wave([chunk('fmt ', format()), chunk('fmt ', format()), chunk('data', samples())]), /duplicate fmt/],
  ['duplicate data', () => wave([chunk('fmt ', format()), chunk('data', samples()), chunk('data', samples())]), /duplicate data/],
  ['short format', () => wave([chunk('fmt ', Buffer.alloc(15)), chunk('data', samples())]), /fmt chunk/],
  ['nonempty format extension', () => {
    const fmt = format({}, true); fmt.writeUInt16LE(2, 16);
    return wave([chunk('fmt ', fmt), chunk('data', samples())]);
  }, /extension/],
  ['empty data', () => wave([chunk('fmt ', format()), chunk('data', Buffer.alloc(0))]), /nonempty/],
  ['unaligned sample data', () => wave([chunk('fmt ', format()), chunk('data', samples().subarray(0, -1))]), /complete/],
  ['too short', () => wave([chunk('fmt ', format()), chunk('data', samples(4_409))]), /duration/],
  ['too long', () => wave([chunk('fmt ', format()), chunk('data', samples(110_251))]), /duration/],
  ['all-zero samples', () => wave([chunk('fmt ', format()), chunk('data', samples(11_025, () => 0))]), /audible/],
  ['constant DC', () => wave([chunk('fmt ', format()), chunk('data', samples(11_025, () => 4_000))]), /audible/],
  ['near-inaudible dither', () => wave([chunk('fmt ', format()), chunk('data', samples(11_025, (index) => index % 2 ? 1 : -1))]), /audible/],
  ['isolated full-scale click', () => wave([chunk('fmt ', format()), chunk('data', samples(11_025, (index) => index === 500 ? 32_767 : 0))]), /audible/],
];

for (const [label, makeBytes, expected] of invalidCases) {
  test(`rejects ${label}`, () => assert.throws(() => validateRadioWave(makeBytes(), 'fixture'), expected));
}

for (const [field, value] of [
  ['encoding', 3], ['encoding', 65_534], ['channels', 2], ['sampleRate', 44_100],
  ['bits', 8], ['blockAlign', 4], ['byteRate', 88_200],
]) {
  test(`rejects incorrect PCM ${field} ${value}`, () => {
    assert.throws(() => validateRadioWave(wave([chunk('fmt ', format({ [field]: value })), chunk('data', samples())])), /PCM/);
  });
}

test('requires all eleven versioned recordings and never falls back to historical voices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aegis-radio-verifier-'));
  const put = async (file, bytes = wave()) => {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), bytes);
  };
  await Promise.all(REQUIRED_RADIO_CUES.map((cue) => put(`audio/voice/${cue}.wav`)));
  await assert.rejects(verifyRadioAudio(root), /voice-v2.*shield-down\.wav/);
  await Promise.all(REQUIRED_RADIO_FILES.slice(0, -1).map((file) => put(file)));
  await assert.rejects(verifyRadioAudio(root), /aegis-upgraded\.wav/);
  await put(REQUIRED_RADIO_FILES.at(-1));
  const result = await verifyRadioAudio(root);
  assert.equal(result.length, 11);
  assert.deepEqual(result.map(({ file }) => file), REQUIRED_RADIO_FILES);
  await put(RADIO_FILES['shield-down'], wave([chunk('fmt ', format()), chunk('data', samples(11_025, () => 0))]));
  await assert.rejects(verifyRadioAudio(root), /shield-down\.wav:.*audible/);
});

test('a mixed-version map requires approved corrections and cannot fall back to retained or rejected takes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aegis-radio-candidate-'));
  const put = async (file, bytes = wave()) => {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), bytes);
  };
  await Promise.all(REQUIRED_RADIO_CUES.map((cue) => put(`audio/voice-v2/${cue}.wav`)));
  await assert.rejects(verifyRadioAudio(root), /voice-v5\/shield-hit\.wav/);
  await put(RADIO_FILES['shield-hit']);
  await put('audio/voice-v3/ion-upgraded.wav');
  const radioFiles = { ...RADIO_FILES,
    'arc-upgraded': 'audio/voice-v3/arc-upgraded.wav',
    'ion-upgraded': 'audio/voice-v4/ion-upgraded.wav',
  };
  await assert.rejects(verifyRadioAudio(root, { radioFiles }), /voice-v3\/arc-upgraded\.wav/);
  await put(radioFiles['arc-upgraded']);
  await assert.rejects(verifyRadioAudio(root, { radioFiles }), /voice-v4\/ion-upgraded\.wav/);
  await put(radioFiles['ion-upgraded'], Buffer.from('not a WAV'));
  await assert.rejects(verifyRadioAudio(root, { radioFiles }), /voice-v4\/ion-upgraded\.wav:.*header/);
  await put(radioFiles['ion-upgraded']);
  assert.deepEqual((await verifyRadioAudio(root, { radioFiles })).map(({ file }) => file), Object.values(radioFiles));
});

test('rejects incomplete or unsafe radio maps before checking files', async () => {
  const incomplete = { ...RADIO_FILES };
  delete incomplete['arc-upgraded'];
  await assert.rejects(verifyRadioAudio('/unused', { radioFiles: incomplete }), /exactly the eleven/);
  await assert.rejects(verifyRadioAudio('/unused', { radioFiles: { ...RADIO_FILES, typo: 'audio/voice-v2/typo.wav' } }), /exactly the eleven/);
  for (const file of ['../arc-upgraded.wav', 'audio/voice/arc-upgraded.wav', 'audio/voice-v3/ion-upgraded.wav']) {
    await assert.rejects(verifyRadioAudio('/unused', { radioFiles: { ...RADIO_FILES, 'arc-upgraded': file } }), /Invalid or missing.*arc-upgraded/);
  }
});

test('module imports have no CLI side effects and missing production files fail the CLI', async () => {
  const verifier = new URL('./verify-radio-audio.mjs', import.meta.url);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(verifier.href)})`], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
  const missingRoot = await mkdtemp(join(tmpdir(), 'aegis-radio-cli-'));
  const cli = spawnSync(process.execPath, [fileURLToPath(verifier), missingRoot], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /Required radio voice verification failed/);
  assert.match(cli.stderr, /audio\/voice-v2\/shield-down\.wav/);
});
