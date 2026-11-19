import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = new URL(process.env.AEGIS_LOCAL_ORIGIN || 'http://127.0.0.1:4197').origin;
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
  throw Error('Use an isolated local development build');
const out = resolve(process.argv[2] || 'outputs/quality/two-pilots');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--disable-renderer-backgrounding',
  ],
});
try {
  const soloKey = 'aegis-vector-campaign-v1';
  const priorSolo = JSON.stringify({ version: 8, phase: 'briefing', difficulty: 'cadet', missionIndex: 0,
    currentMissionId: 'coastal', campaignSeed: 72134, credits: 91, score: 1520,
    weapons: { spread: 2, missile: 1, laser: 0, drone: 0, ion: 0 } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: soloKey, value: priorSolo }] }] } }),
    p = await ctx.newPage(),
    errors = [];
  p.on('pageerror', (e) => {
    errors.push(e.message);
    console.error(e.message);
  });
  p.setDefaultTimeout(15000);
  const shot = (name) => p.screenshot({ path: join(out, name + '.jpg'), quality: 85 });
  const state = () => p.evaluate(() => window.__AEGIS_DEBUG__.getState());
  const wait = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 20000 });
  await p.goto(origin + '/?debug=1&god=1');
  await p.locator('#launch-button:not([disabled])').waitFor();
  await p.locator('#two-pilots').click();
  await p.locator('#coop-new').click();
  await p.locator('[data-seat="1"] [data-choice="kit-precision"]').click();
  await p.locator('[data-seat="1"] [data-choice="kit-coverage"]').click();
  await p.getByRole('button', { name: 'Test keyboard', exact: true }).click();
  await p.keyboard.down('w');
  await p.keyboard.down('d');
  await p.keyboard.down('f');
  await p.keyboard.down('ArrowUp');
  await p.keyboard.down('ArrowLeft');
  await p.keyboard.down('j');
  await wait(
    () =>
      document.querySelectorAll('.coop-keys .lit').length >= 6 || document.querySelectorAll('kbd.lit').length >= 6,
  );
  for (const k of ['w', 'd', 'f', 'ArrowUp', 'ArrowLeft', 'j']) await p.keyboard.up(k);
  await p.getByRole('button', { name: 'Finish key test' }).click();
  await shot('preflight');
  for (const s of [0, 1]) await p.locator('[data-seat="' + s + '"] [data-choice="ready"]').click();
  await p.locator('#intro-skip-button').click();
  await p.locator('#coop-hud').waitFor();
  const before = (await state()).squad.pilots;
  assert.equal(before[0].weapons.laser, 1);
  assert.equal(before[1].weapons.drone, 1);
  await p.keyboard.down('f');
  await wait(() => window.__AEGIS_DEBUG__.getState().squad.pilots[0].shots > 3);
  await p.keyboard.up('f');
  assert.equal((await state()).squad.pilots[1].shots, 0);
  await p.keyboard.down('j');
  await p.keyboard.down('ArrowLeft');
  await p.keyboard.down('d');
  await p.keyboard.down('f');
  await wait(() => {
    const a = window.__AEGIS_DEBUG__.getState().squad.pilots;
    return a[1].shots >= 2 && a[0].x > 525 && a[1].x < 755;
  });
  for (const k of ['j', 'ArrowLeft', 'd', 'f']) await p.keyboard.up(k);
  await p.keyboard.press('k');
  await wait(() => window.__AEGIS_DEBUG__.getState().squad.pilots[1].emp === 0);
  assert.equal((await state()).squad.pilots[0].emp, 1);
  await p.keyboard.press('p');
  await p.locator('#pause-screen').waitFor();
  await p.keyboard.press('p');
  await p.locator('#pause-screen').waitFor({ state: 'hidden' });
  await shot('formation');
  for (let i = 0; i < 40; i++) {
    if ((await state()).squad.pilots[1].down) break;
    await p.evaluate(() => window.__AEGIS_DEBUG__.damagePlayer(1));
    await p.waitForTimeout(240);
  }
  let pilots = (await state()).squad.pilots;
  assert(pilots[1].down);
  assert.equal((await state()).mode, 'playing');
  if (Math.abs(pilots[0].x - pilots[1].x) > 64) {
    const key = pilots[0].x < pilots[1].x ? 'd' : 'a';
    await p.keyboard.down(key);
    await wait(() => {
      const a = window.__AEGIS_DEBUG__.getState().squad.pilots;
      return Math.abs(a[0].x - a[1].x) < 60;
    });
    await p.keyboard.up(key);
  }
  await wait(() => !window.__AEGIS_DEBUG__.getState().squad.pilots[1].down);
  pilots = (await state()).squad.pilots;
  assert.equal(pilots[1].hull, 1);
  assert.equal(pilots[1].rescueAvailable, false);
  await p.evaluate(() => window.__AEGIS_DEBUG__.completeMission());
  await p.locator('#story-skip-button').waitFor();
  await p.locator('#story-skip-button').click();
  await p.locator('[data-seat="0"] [data-choice="route-salvage"]').click();
  await p.setViewportSize({ width: 800, height: 450 });
  await shot('hangar-800');
  for (const [seat, id] of [
    [0, 'rapid-cycling'],
    [1, 'amplified-munitions'],
  ])
    await p.locator('[data-seat="' + seat + '"] [data-choice="buy-' + id + '"]').click();
  const key = 'aegis-vector-coop-v1';
  const saved = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  assert.equal(saved.pilots[0].credits, saved.pilots[1].credits);
  assert.deepEqual(
    saved.pilots.map((s) => s.purchased),
    [['rapid-cycling'], ['amplified-munitions']],
  );
  assert.equal(await p.evaluate(k => localStorage.getItem(k), soloKey), priorSolo);
  await p.reload();
  await p.locator('#launch-button:not([disabled])').waitFor();
  await p.locator('#two-pilots').click();
  await p.locator('#coop-resume').click();
  for (const s of [0, 1]) await p.locator('[data-seat="' + s + '"] [data-choice="ready"]').click();
  await wait(
    () =>
      window.__AEGIS_DEBUG__.getState().missionId === 'minefield' &&
      window.__AEGIS_DEBUG__.getState().mode === 'playing',
  );
  await p.goto(origin + '/?debug=1&god=1&quick=1');
  await p.locator('#launch-button:not([disabled])').waitFor();
  await p.locator('#two-pilots').click();
  await p.locator('#coop-resume').click();
  for (const seat of [0, 1]) await p.locator('[data-seat="' + seat + '"] [data-choice="ready"]').click();
  await wait(
    () =>
      window.__AEGIS_DEBUG__.getState().missionId === 'minefield' &&
      window.__AEGIS_DEBUG__.getState().mode === 'playing',
  );
  async function down(seats) {
    for (let n = 0; n < 70; n++) {
      const snapshot = await state();
      if (snapshot.mode === 'gameover' || seats.every((s) => snapshot.squad.pilots[s].down)) return;
      await p.evaluate((seats) => seats.forEach((s) => window.__AEGIS_DEBUG__.damagePlayer(s)), seats);
      await p.waitForTimeout(150);
    }
    throw Error('Expected pilot loss during test');
  }
  await down([0]);
  assert.equal((await state()).mode, 'playing');
  await shot('surviving-wingmate');
  await p.waitForFunction(
    () => {
      const s = window.__AEGIS_DEBUG__.getState();
      return s.latestWaypointId >= 1 && !s.squad.pilots[0].down;
    },
    undefined,
    { timeout: 45000 },
  );
  const checkpoint = (await state()).latestWaypointId;
  await down([0, 1]);
  await p.locator('#result-action-button').click();
  await wait(() => {
    const s = window.__AEGIS_DEBUG__.getState();
    return s.mode === 'playing' && s.squad.pilots.every((p) => !p.down);
  });
  const retry = await state();
  assert(retry.latestWaypointId >= checkpoint);
  assert(retry.squad.pilots.every((p) => p.emp >= 1 && p.shield >= 1));
  for (const mission of ['minefield', 'fortress', 'stormbreak', 'carrierSiege', 'dreadnought', 'lastLight']) {
    await wait((id) => {
      const s = window.__AEGIS_DEBUG__.getState();
      return s.missionId === id && s.mode === 'playing';
    }, mission);
    if (mission === 'minefield') await down([0]);
    await p.evaluate(() => window.__AEGIS_DEBUG__.completeMission());
    await p.locator('#story-skip-button').click();
    if (mission === 'lastLight') {
      await p.locator('#ending-screen').waitFor();
      break;
    }
    if (mission === 'fortress') {
      await p.locator('[data-seat="1"] [data-choice="route-storm"]').click();
      assert.equal(await p.locator('[data-seat="0"] [data-choice^="route-"]').count(), 0);
    }
    for (const seat of [0, 1]) {
      const card = p.locator('[data-seat="' + seat + '"]');
      for (let n = 0; n < 12 && (await card.locator('[data-choice="claim-0"]').count()); n++)
        await card.locator('[data-choice="claim-0"]').click();
      await card.locator('[data-choice="ready"]').click();
    }
  }
  const finished = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  assert(finished.pilots.every((s) => s.phase === 'victory' && s.seenStoryChapters.length === 7));
  assert.equal(await p.evaluate(k => localStorage.getItem(k), soloKey), priorSolo);
  assert.deepEqual(errors, []);
  console.log(
    'Verified independent motion, manual fire, EMP, pause, rescue, Coastal clear, split shopping, reload, P1 loss, waypoint rejoin, squad wipe, dual retry, survivor extraction, the P2 route fork, and the seven-mission ending (accelerated clears).',
  );
} finally {
  await browser.close();
}
