import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = new URL(process.env.AEGIS_LOCAL_ORIGIN || 'http://127.0.0.1:4198').origin;
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Use a loopback test origin.');
const out = resolve(process.argv[2] || 'outputs/quality/two-pilots');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
  ],
});
const errors = [];
try {
  async function pilot() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
    await ctx.addInitScript(() =>
      window.addEventListener('aegis:state', (e) => {
        if (e.detail?.squad) window.squadObservation = e.detail;
      }),
    );
    const p = await ctx.newPage();
    p.setDefaultTimeout(18000);
    p.on('pageerror', (error) => {
      errors.push(error.message);
      console.error('Browser exception', error.message);
    });
    return p;
  }
  const host = await pilot(),
    guest = await pilot();
  await host.goto(origin + '/#host');
  const hostButton = host.locator('#coop-create-room');
  await hostButton.waitFor();
  if (process.env.AEGIS_TEST_RELAY) {
    await host.getByText('Internet relay address', { exact: true }).click();
    await host.getByLabel('Secure relay address', { exact: true }).fill(process.env.AEGIS_TEST_RELAY);
  }
  await hostButton.click();
  const invite = await host.locator('#coop-invite').inputValue();
  if (process.env.AEGIS_TEST_RELAY)
    assert.equal(new URLSearchParams(new URL(invite).hash.slice(1)).get('relay'), process.env.AEGIS_TEST_RELAY);
  await guest.goto(invite);
  await guest.locator('#coop-join-room').click();
  await guest.locator('#coop-deck').waitFor();
  assert(await guest.locator('[data-seat="0"] [data-choice="ready"]').isDisabled());
  assert(await host.locator('[data-seat="1"] [data-choice="ready"]').isDisabled());
  await guest.locator('[data-seat="1"] [data-choice="ready"]').click();
  await host.locator('[data-seat="0"] [data-choice="ready"]').click();
  await host.locator('#intro-skip-button').click();
  await Promise.all(
    [host, guest].map((p) => p.waitForFunction(() => window.squadObservation?.squad.pilots.length === 2)),
  );
  const before = await guest.evaluate(() => window.squadObservation.squad.pilots);
  await guest.keyboard.down('ArrowLeft');
  await guest.keyboard.down('Space');
  await host.waitForFunction((x) => {
    const a = window.squadObservation.squad.pilots;
    return a[1].x < x - 40 && a[1].shots > 2;
  }, before[1].x);
  await guest.keyboard.up('Space');
  await guest.keyboard.up('ArrowLeft');
  await guest.keyboard.press('x');
  await guest.waitForFunction(() => window.squadObservation.squad.pilots[1].emp === 0);
  if (process.env.AEGIS_TEST_RELAY) await guest.waitForTimeout(7500);
  const after = await host.evaluate(() => window.squadObservation.squad.pilots);
  assert.equal(after[0].shots, 0);
  assert.equal(after[0].emp, 1);
  await guest.keyboard.press('p');
  await host.locator('#pause-screen').waitFor();
  await guest.getByRole('button', { name: 'Resume', exact: true }).click();
  await host.locator('#pause-screen').waitFor({ state: 'hidden' });
  await guest.locator('#coop-network-screen').waitFor({ state: 'hidden' });
  await Promise.all(
    [
      [host, 'host'],
      [guest, 'guest'],
    ].map(([p, id]) =>
      p.screenshot({
        path: join(out, (process.env.AEGIS_TEST_RELAY ? 'relay-' : 'network-') + id + '.jpg'),
        quality: 85,
      }),
    ),
  );
  // Same tab retains the private seat credential across a page restart.
  await guest.goto('about:blank');
  await host.getByText('Wingmate disconnected', { exact: true }).waitFor();
  await guest.goto(invite);
  await guest.locator('#coop-join-room').click();
  await guest.waitForFunction(() => window.squadObservation?.squad.pilots[1].emp === 0);
  await host.locator('#pause-screen').waitFor({ state: 'hidden' });
  await guest.keyboard.down('Space');
  await host.waitForFunction((n) => window.squadObservation.squad.pilots[1].shots > n, after[1].shots);
  await guest.keyboard.up('Space');
  // Load an explicit between-mission fixture, then use the ordinary release UI on both seats.
  // Private preflight, flight and reconnection above all used a newly created squad.
  await guest.goto('about:blank');
  const saved = await host.evaluate(() => JSON.parse(localStorage.getItem('aegis-vector-coop-v1')));
  for (const pilot of saved.pilots)
    Object.assign(pilot, {
      phase: 'route',
      currentMissionId: 'fortress',
      missionIndex: 3,
      earlyRoute: 'salvage',
      credits: 80,
      purchased: [],
      activeWaypoint: undefined,
    });
  await host.evaluate((s) => localStorage.setItem('aegis-vector-coop-v1', JSON.stringify(s)), saved);
  await host.goto('about:blank');
  await host.goto(origin + '/#host');
  await host.locator('#coop-create-room').waitFor();
  if (process.env.AEGIS_TEST_RELAY) {
    await host.getByText('Internet relay address', { exact: true }).click();
    await host.getByLabel('Secure relay address', { exact: true }).fill(process.env.AEGIS_TEST_RELAY);
  }
  await host.locator('#coop-create-room').click();
  const nextInvite = await host.locator('#coop-invite').inputValue();
  await guest.goto(nextInvite);
  await guest.locator('#coop-join-room').click();
  await guest.locator('[data-seat="1"] [data-choice="route-storm"]').click();
  await host.locator('[data-seat="0"] [data-choice="buy-rapid-cycling"]').click();
  await guest.locator('[data-seat="1"] [data-choice="buy-amplified-munitions"]').click();
  await host.waitForFunction(() =>
    JSON.parse(localStorage.getItem('aegis-vector-coop-v1')).pilots[1].purchased.includes('amplified-munitions'),
  );
  const equipped = await host.evaluate(() => JSON.parse(localStorage.getItem('aegis-vector-coop-v1')).pilots);
  assert.deepEqual(
    equipped.map((p) => p.purchased),
    [['rapid-cycling'], ['amplified-munitions']],
  );
  assert(equipped.every((p) => p.currentMissionId === 'stormbreak' && p.credits === 20));
  assert.equal(await guest.evaluate(() => localStorage.getItem('aegis-vector-coop-v1')), null);
  await guest.locator('[data-seat="1"] [data-choice="ready"]').click();
  await host.locator('[data-seat="0"] [data-choice="ready"]').click();
  await guest.waitForFunction(() => window.squadObservation?.missionId === 'stormbreak');
  assert.deepEqual(errors, []);
  console.log(
    'Private room passed with two isolated browsers: seat permissions, preflight, remote movement, fire, EMP, shared pause, guest restart seat recovery, online route choice, separate purchases and launching Stormbreak.',
  );
} finally {
  await browser.close();
}
