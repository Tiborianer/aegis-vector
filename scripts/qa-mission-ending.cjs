const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = new URL(process.env.AEGIS_LOCAL_ORIGIN || 'http://127.0.0.1:4213');
assert(['localhost', '127.0.0.1'].includes(origin.hostname));

async function run() {
  const browser = await chromium.launch({channel: 'chrome', args: ['--enable-unsafe-swiftshader']});
  try {
    for (const mission of ['coastal', 'lastLight']) {
      const page = await browser.newPage({viewport: {width: 1280, height: 720}});
      await page.goto(new URL('/?lab=1&god=1&mission=' + mission, origin).href);
      await page.waitForFunction(() => window.__AEGIS_DEBUG__?.getState().mode === 'playing', null, {timeout: 60000});
      await page.evaluate(async () => {
        const module = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/BattleScene.ts'));
        const {BattleScene} = await import(module.name);
        const original = BattleScene.prototype.teamSnapshot;
        BattleScene.prototype.teamSnapshot = function (...args) {
          window.scene = this;
          return original.apply(this, args);
        };
        try { window.__AEGIS_DEBUG__.getState(); } finally { BattleScene.prototype.teamSnapshot = original; }
        window.scene.game.loop.sleep();
      });
      if (mission === 'coastal') {
        const observed = await page.evaluate(() => {
          const s = window.scene, m = s.model;
          m.stageElapsedMs = m.stageDurationMs - 6001;
          const survivor = s.spawnEnemy('scout', 620, 230, 0);
          const queued = s.spawnEnemy('scout', 700, -400, 0);
          s.commandSpawned = true;
          s.commandRemaining = 1;
          survivor.setData('commandTarget', true).setData('carrierIndex', 3).setData('nextFire', 0);
          m.stageElapsedMs++;
          const rejected = !s.spawnEnemy('scout', 700, -400, 1);
          const previous = new Set(s.enemyBullets.getChildren());
          s.updateEnemies(s.combatNow, 1);
          const shot = s.enemyBullets.getChildren().find(b => !previous.has(b));
          const fired = survivor.getData('nextFire') > s.combatNow && !!shot;
          m.stageElapsedMs = m.stageDurationMs + 1;
          s.updateWaveDirector(s.combatNow);
          const waiting = !s.missionEnding;
          s.destroyEnemy(survivor);
          s.updateWaveDirector(s.combatNow);
          const pair = s.pickups.getChildren().filter(p => p.active && p.getData('pairId') !== undefined);
          s.game.renderer && s.game.scene.render(s.game.renderer);
          window.choice = pair[0];
          return {rejected, queuedGone: !queued.active, fired, shotRetained: !!shot?.active,
            waiting, remaining: s.commandRemaining, choices: pair.length, collecting: !s.missionEnding};
        });
        assert.deepEqual(observed, {rejected:true, queuedGone:true, fired:true, shotRetained:true,
          waiting:true, remaining:0, choices:2, collecting:true});
        if (process.env.AEGIS_SCREENSHOT) await page.screenshot({path: process.env.AEGIS_SCREENSHOT});
        const extracted = await page.evaluate(() => {
          const s = window.scene;
          s.lead.player.body.reset(window.choice.x, window.choice.y);
          s.physics.world.step(1/60);
          s.updateWaveDirector(s.combatNow);
          return !s.hasActiveArmamentPair() && s.missionEnding;
        });
        assert.equal(extracted, true);
      } else {
        const stages = await page.evaluate(() => {
          const s = window.scene;
          s.spawnBoss();
          const first = s.boss.getData('kind');
          const queued = s.spawnEnemy('scout', 600, -90, 0);
          s.destroyEnemy(s.boss);
          const closed = !s.spawnEnemy('scout', 640, -90, 0);
          let now = s.game.loop.now;
          let enteredDuringHandoff = false;
          for (let i = 0; i < 170; i++) {
            s.game.step(now += 1000/60, 1000/60);
            if (queued.active && s.visibleEnemy(queued)) enteredDuringHandoff = true;
          }
          const second = s.boss.getData('kind');
          s.destroyEnemy(s.boss);
          return {stages: [first, closed, second, s.missionEnding, !s.spawnEnemy('scout', 640, -90, 0)], enteredDuringHandoff};
        });
        assert.deepEqual(stages.stages, ['seraph', true, 'nullArchitect', true, true]);
        assert.equal(stages.enteredDuringHandoff, false, 'Queued escort entered after Seraph died');
      }
      console.log(mission, 'passed');
      await page.close();
    }
  } finally { await browser.close(); }
}
run().catch(error => {console.error(error); process.exitCode = 1;});
