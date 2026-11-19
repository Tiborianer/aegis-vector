import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL(process.argv[2] || 'http://127.0.0.1:4272/');
const out = path.resolve(process.argv[3] || 'outputs/quality/coop-release');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    window.addEventListener('aegis:state', event => { window.observedFlight = event.detail; });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const shot = name => page.screenshot({ path: path.join(out, name + '.jpg'), quality: 85 });
  const releaseResponse = await ctx.request.get(new URL('release.json', url).href);
  assert(releaseResponse.ok());
  const release = await releaseResponse.json();
  if (process.env.AEGIS_EXPECT_REVISION) assert.equal(release.revision, process.env.AEGIS_EXPECT_REVISION);

  await page.goto(url.href);
  await page.locator('#launch-button:not([disabled])').waitFor();
  await page.locator('#two-pilots').waitFor();
  await shot('live-menu');
  await page.locator('#two-pilots').click();
  // The lobby can connect to a same-origin LAN service or the configured public relay.
  await page.locator('#coop-create-room, #coop-lobby .coop-room-controls p').first().waitFor();
  const relayInput = page.getByLabel('Secure relay address', { exact: true });
  const configuredRelay = await relayInput.count() > 0 && (await relayInput.inputValue()).startsWith('wss://');
  if (url.hostname.endsWith('.github.io')) {
    assert.equal(await page.locator('#coop-create-room').isEnabled(), configuredRelay);
  }
  await page.locator('#coop-new').click();
  await page.getByRole('button', { name: 'Test keyboard', exact: true }).waitFor();
  const art = await ctx.request.get(new URL('graphics-v2/ships/player.png', url).href);
  assert(art.ok() && art.headers()['content-type']?.includes('image/png'));
  await shot('live-fighters');
  for (const seat of [0, 1]) await page.locator('[data-seat="' + seat + '"] [data-choice="ready"]').click();
  await page.locator('#intro-skip-button').click();
  await page.waitForFunction(() => window.observedFlight?.mode === 'playing' && window.observedFlight.squad?.pilots.length === 2);
  const before = await page.evaluate(() => window.observedFlight.squad.pilots);
  assert(before.every(p => p.shots === 0));
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.observedFlight.squad.pilots[0].shots >= 3);
  assert.equal(await page.evaluate(() => window.observedFlight.squad.pilots[1].shots), 0);
  await page.keyboard.down('j');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(x => {
    const p = window.observedFlight.squad.pilots[1];
    return p.shots >= 3 && p.x > x + 20;
  }, before[1].x);
  await shot('live-flight');
  for (const key of ['f', 'j', 'ArrowRight']) await page.keyboard.up(key);
  await page.keyboard.press('k');
  await page.waitForFunction(() => window.observedFlight.squad.pilots[1].emp === 0);
  assert.equal(await page.evaluate(() => window.observedFlight.squad.pilots[0].emp), before[0].emp);
  await page.keyboard.press('p');
  await page.locator('#pause-screen').waitFor();
  await page.keyboard.press('p');
  await page.locator('#pause-screen').waitFor({ state: 'hidden' });
  await page.reload();
  await page.locator('#launch-button:not([disabled])').waitFor();
  await page.locator('#two-pilots').click();
  await page.locator('#coop-resume').click();
  await page.waitForFunction(() => window.observedFlight?.mode === 'playing' && window.observedFlight.squad?.pilots.length === 2);

  // Legacy development URLs must still enter the public solo campaign.
  for (const query of ['?lab=1&mission=lastLight&god=1', '?debug=1&graphics=1&mission=fortress&god=1']) {
    await page.goto(new URL(query, url).href);
    await page.locator('#launch-button:not([disabled])').waitFor();
    assert.equal(await page.evaluate(() => typeof window.__AEGIS_DEBUG__), 'undefined');
    assert.equal(await page.locator('#mission-lab-button:visible').count(), 0);
  }
  await page.locator('#launch-button').click();
  await page.locator('#intro-skip-button').click();
  await page.waitForFunction(() => window.observedFlight?.missionId === 'coastal' && window.observedFlight.mode === 'playing');
  assert.equal(await page.evaluate(() => Boolean(window.observedFlight.squad)), false);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.observedFlight.shotsFired > 2);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.observedFlight.damageTaken > 0, undefined, { timeout: 65_000 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ revision: release.revision, configuredRelay, coOpFlight: true, soloFlight: true, errors }));
} finally {
  await browser.close();
}
