import Phaser from 'phaser';
import { ASSET_KEYS } from '../../game/assets/manifest';
import { HOSTILE_PROJECTILE_ART } from '../../game/assets/hostileProjectiles';
import { WEAPON_LABELS } from '../../game/content/balance';
import type { PickupType, WeaponType } from '../../game/simulation/types';

const polygon = (points: Array<[number, number]>): Phaser.Geom.Point[] =>
  points.map(([x, y]) => new Phaser.Geom.Point(x, y));

export function generateTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(ASSET_KEYS.player)) return;

  const g = new Phaser.GameObjects.Graphics(scene);

  // Player AV-7: a strong white/cyan silhouette with a deliberately compact fuselage.
  g.fillStyle(0x18d8ff, 0.12).fillCircle(44, 54, 40);
  g.fillStyle(0x35e8ff, 0.24).fillTriangle(44, 1, 10, 91, 78, 91);
  g.fillStyle(0xd9f8ff, 1).fillPoints(polygon([[44, 5], [54, 42], [81, 73], [58, 69], [54, 96], [44, 83], [34, 96], [30, 69], [7, 73], [34, 42]]), true);
  g.fillStyle(0x7195a9, 0.75).fillPoints(polygon([[44, 8], [54, 43], [71, 67], [51, 55], [44, 79], [44, 23]]), true);
  g.fillStyle(0xffffff, 0.72).fillPoints(polygon([[43, 7], [43, 63], [35, 51], [35, 40]]), true);
  g.fillStyle(0x18354f, 1).fillPoints(polygon([[44, 18], [51, 47], [44, 63], [37, 47]]), true);
  g.fillStyle(0x35e8ff, 1).fillTriangle(44, 64, 51, 83, 37, 83);
  g.lineStyle(2, 0x35e8ff, 0.95).strokePoints(polygon([[12, 71], [34, 57], [44, 9], [54, 57], [76, 71]]));
  g.generateTexture(ASSET_KEYS.player, 88, 104).clear();
  drawPlayerBank(g, ASSET_KEYS.playerBanks[0], -2);
  drawPlayerBank(g, ASSET_KEYS.playerBanks[1], -1);
  drawPlayerBank(g, ASSET_KEYS.playerBanks[3], 1);
  drawPlayerBank(g, ASSET_KEYS.playerBanks[4], 2);

  // Support drone.
  g.fillStyle(0x65ffb1, 0.18).fillCircle(24, 24, 22);
  g.fillStyle(0xdfffee, 1).fillPoints(polygon([[24, 4], [32, 16], [43, 25], [31, 27], [24, 43], [17, 27], [5, 25], [16, 16]]), true);
  g.fillStyle(0x65ffb1, 1).fillCircle(24, 23, 6);
  g.generateTexture(ASSET_KEYS.drone, 48, 48).clear();
  g.fillStyle(0xffb640, 0.2).fillCircle(24, 24, 22);
  g.fillStyle(0x31343d, 1).fillPoints(polygon([[24, 4], [32, 16], [43, 25], [31, 27], [24, 43], [17, 27], [5, 25], [16, 16]]), true);
  g.lineStyle(2, 0xffb640, 1).strokePoints(polygon([[24, 4], [32, 16], [43, 25], [31, 27], [24, 43], [17, 27], [5, 25], [16, 16]]), true);
  g.fillStyle(0xfff6cf, 1).fillCircle(24, 23, 6);
  g.generateTexture(ASSET_KEYS.droneOverdrive, 48, 48).clear();
  g.fillStyle(0x65ffb1, 0.2).fillCircle(24, 24, 22);
  g.fillStyle(0xdfffee, 1).fillPoints(polygon([[24, 3], [34, 15], [45, 23], [33, 29], [28, 43], [24, 36], [20, 43], [15, 29], [3, 23], [14, 15]]), true);
  g.fillStyle(0x183d35, 1).fillCircle(19, 23, 5).fillCircle(29, 23, 5);
  g.fillStyle(0x65ffb1, 1).fillCircle(19, 23, 2).fillCircle(29, 23, 2);
  g.lineStyle(2, 0x65ffb1, 0.9).lineBetween(17, 34, 13, 45).lineBetween(31, 34, 35, 45);
  g.generateTexture(ASSET_KEYS.droneMk2, 48, 48).clear();
  g.fillStyle(0xffb640, 0.22).fillCircle(24, 24, 22);
  g.fillStyle(0x31343d, 1).fillPoints(polygon([[24, 3], [34, 15], [45, 23], [33, 29], [28, 43], [24, 36], [20, 43], [15, 29], [3, 23], [14, 15]]), true);
  g.lineStyle(2, 0xffb640, 1).strokePoints(polygon([[24, 3], [34, 15], [45, 23], [33, 29], [28, 43], [24, 36], [20, 43], [15, 29], [3, 23], [14, 15]]), true);
  g.fillStyle(0xfff6cf, 1).fillCircle(19, 23, 3).fillCircle(29, 23, 3);
  g.generateTexture(ASSET_KEYS.droneMk2Overdrive, 48, 48).clear();

  drawEnemy(g, ASSET_KEYS.scout, 64, 60, 0xff6f61, [[32, 56], [8, 13], [25, 20], [32, 3], [39, 20], [56, 13]]);
  drawEnemy(g, ASSET_KEYS.interceptor, 76, 68, 0xff9a56, [[38, 65], [4, 17], [28, 27], [38, 4], [48, 27], [72, 17]]);
  drawEnemy(g, ASSET_KEYS.bomber, 104, 78, 0xff5e73, [[52, 74], [7, 42], [5, 20], [38, 27], [52, 4], [66, 27], [99, 20], [97, 42]]);
  drawEnemy(g, ASSET_KEYS.elite, 112, 86, 0xc66cff, [[56, 82], [10, 62], [3, 27], [40, 36], [56, 4], [72, 36], [109, 27], [102, 62]]);
  drawEnemy(g, ASSET_KEYS.charger, 78, 76, 0xff3f56, [[39, 73], [8, 24], [29, 31], [39, 3], [49, 31], [70, 24]]);
  drawEnemy(g, ASSET_KEYS.sniper, 88, 70, 0xff72ca, [[44, 67], [5, 38], [28, 30], [36, 8], [44, 2], [52, 8], [60, 30], [83, 38]]);
  drawEnemy(g, ASSET_KEYS.mineLayer, 112, 74, 0xffa33f, [[56, 70], [8, 52], [4, 25], [38, 31], [56, 5], [74, 31], [108, 25], [104, 52]]);
  drawEnemy(g, ASSET_KEYS.shieldCarrier, 104, 84, 0x8b7dff, [[52, 80], [10, 59], [6, 24], [36, 33], [52, 4], [68, 33], [98, 24], [94, 59]]);
  drawBulwark(g);
  drawEnemy(g, ASSET_KEYS.phantom, 82, 68, 0x67ecff, [[41, 3], [51, 24], [77, 34], [55, 41], [49, 65], [41, 54], [33, 65], [27, 41], [5, 34], [31, 24]]);
  drawEnemy(g, ASSET_KEYS.artillery, 126, 82, 0xffc04d, [[63, 4], [76, 25], [119, 31], [110, 69], [80, 61], [63, 78], [46, 61], [16, 69], [7, 31], [50, 25]]);
  drawEnemy(g, ASSET_KEYS.reclaimer, 86, 76, 0x65ffb1, [[43, 6], [54, 25], [80, 30], [69, 56], [52, 51], [43, 70], [34, 51], [17, 56], [6, 30], [32, 25]]);
  drawEnemy(g, ASSET_KEYS.razorwing, 112, 82, 0xff557a, [[56, 3], [68, 24], [106, 18], [88, 48], [70, 54], [62, 78], [50, 78], [42, 54], [24, 48], [6, 18], [44, 24]]);
  drawEnemy(g, ASSET_KEYS.gatekeeper, 184, 104, 0xffb640, [[92, 4], [111, 27], [176, 34], [164, 81], [120, 72], [105, 100], [79, 100], [64, 72], [20, 81], [8, 34], [73, 27]]);
  drawEnemy(g, ASSET_KEYS.pursuer, 158, 96, 0xc66cff, [[79, 4], [98, 24], [151, 32], [137, 72], [103, 65], [91, 92], [67, 92], [55, 65], [21, 72], [7, 32], [60, 24]]);
  drawCarrierBoss(g);
  drawEnemy(g, ASSET_KEYS.warden, 190, 104, 0xf06cff, [[95, 99], [12, 67], [5, 30], [66, 42], [95, 4], [124, 42], [185, 30], [178, 67]]);
  // Expansion craft have their own readable Classic silhouettes, too.
  drawEnemy(g, ASSET_KEYS.skimmer, 100, 76, 0x64efe0,
    [[13, 9], [43, 18], [80, 7], [95, 30], [78, 60], [52, 72], [59, 44], [32, 42], [6, 56], [21, 29]]);
  drawEnemy(g, ASSET_KEYS.seraph, 320, 164, 0xffcc80,
    [[160, 132], [150, 104], [145, 74], [149, 44], [160, 40], [171, 44], [175, 74], [170, 104]]);
  // Always keep complete Classic modules under separate keys. Classic mode and
  // load-failure fallback must not combine a vector core with detailed PNG wings.
  for (const side of [-1, 1]) {
    const key = `classic-seraph-wing-${side < 0 ? 'left' : 'right'}`;
    if (scene.textures.exists(key)) continue;
    const outline = [[17,-14],[37,-28],[75,-36],[91,-27],[98,-8],[92,20],
      [60,50],[68,28],[79,11],[80,-13],[57,-25],[20,-5]];
    const wing = polygon(outline.map(([x,y]) => [160 + side*x,82+y] as [number,number]));
    g.fillStyle(0x231d31, 1).fillPoints(wing, true);
    g.lineStyle(2, 0xffcc80, .95).strokePoints(wing, true);
    g.lineStyle(2, 0xffcc80, .8).lineBetween(160+side*22,68,160+side*60,54);
    g.fillStyle(0xffe9b0, 1).fillRect(160+side*72-2,94,4,3);
    g.generateTexture(key,320,164).clear();
  }
  // The Weaver's central opening stays genuinely transparent.
  for (const points of [
    [[9, 15], [32, 5], [44, 28], [32, 53], [7, 58]],
    [[99, 15], [76, 5], [64, 28], [76, 53], [101, 58]],
    [[35, 60], [54, 44], [73, 60], [64, 84], [44, 84]],
  ] as Array<Array<[number, number]>>) {
    g.fillStyle(0x241b38, 1).fillPoints(polygon(points), true);
    g.lineStyle(3, 0xc6a0ff, .9).strokePoints(polygon(points), true);
  }
  g.lineStyle(3, 0x785e9a, 1).lineBetween(27, 50, 39, 64).lineBetween(81, 50, 69, 64);
  g.fillStyle(0xffe1ff, 1).fillCircle(25, 29, 4).fillCircle(83, 29, 4).fillCircle(54, 67, 4);
  g.generateTexture(ASSET_KEYS.weaver, 108, 90).clear();
  // Prism keeps three sharp optical lobes rather than Weaver's round emitters.
  for (const points of [
    [[48, 79], [34, 43], [37, 14], [48, 8], [59, 14], [62, 43]],
    [[18, 65], [5, 34], [10, 10], [23, 5], [33, 19], [30, 44]],
    [[78, 65], [66, 44], [63, 19], [73, 5], [86, 10], [91, 34]],
  ] as Array<Array<[number, number]>>) {
    g.fillStyle(0x202537, 1).fillPoints(polygon(points), true);
    g.lineStyle(2, 0x99a8cb, .9).strokePoints(polygon(points), true);
  }
  g.lineStyle(4, 0x414861, 1).lineBetween(24, 26, 42, 36).lineBetween(72, 26, 54, 36);
  g.lineStyle(2, 0x9871ff, 1).lineBetween(18, 19, 18, 34).lineBetween(78, 19, 78, 34).lineBetween(48, 22, 48, 41);
  for (const [x, y] of [[18, 47], [78, 47], [48, 61]]) {
    g.fillStyle(0xb7ffff, 1).fillPoints(polygon([[x, y + 7], [x - 4, y], [x, y - 5], [x + 4, y]]), true);
  }
  g.generateTexture(ASSET_KEYS.prism, 96, 84).clear();
  // Leech's two hooked jaws leave the lower pressure mouth genuinely open.
  const leechHull: Array<[number, number]> = [[49, 5], [21, 10], [5, 28], [7, 51], [24, 76], [39, 82],
    [26, 61], [23, 47], [30, 35], [68, 35], [75, 47], [72, 61], [59, 82], [74, 76], [91, 51], [93, 28], [77, 10]];
  g.fillStyle(0x30242e, 1).fillPoints(polygon(leechHull), true);
  g.lineStyle(3, 0x906a7e, 1).strokePoints(polygon(leechHull), true);
  g.lineStyle(2, 0x67778c, 1).lineBetween(20, 17, 33, 31).lineBetween(78, 17, 65, 31).lineBetween(13, 29, 24, 40).lineBetween(85, 29, 74, 40);
  g.fillStyle(0x151c2a, 1).fillCircle(49, 43, 14);
  g.lineStyle(3, 0xff4967, 1).strokeCircle(49, 43, 12);
  g.fillStyle(0xffc1b9, 1).fillCircle(49, 43, 5);
  g.lineStyle(2, 0xff4967, .9).lineBetween(25, 48, 30, 61).lineBetween(73, 48, 68, 61);
  g.generateTexture(ASSET_KEYS.leech, 98, 88).clear();
  // Selected Obsidian Crown: a continuous keel and six diagonal outriggers.
  // Only circular sockets live on the hull; rotating guns are separate sprites.
  const crownPoints = (p: Array<[number, number]>): Phaser.Geom.Point[] =>
    polygon(p.map(([x, y]) => [130 - x * 15.7284, 105 + y * 14.8453]));
  g.fillStyle(0x2b3544, 1).fillPoints(crownPoints([[0, 5.9], [-.6, 3.9], [-1.12, 1.4], [-1.18, -1.4], [-.68, -4.4],
    [-.48, -5], [.48, -5], [.68, -4.4], [1.18, -1.4], [1.12, 1.4], [.6, 3.9]]), true);
  for (const side of [-1, 1]) {
    for (const [y, span] of [[2.55, 3.45], [.18, 4.7], [-2.2, 3.9]]) {
      const platePoints: Array<[number, number]> = [[side * .68, y - .40], [side * 1.4, y + .25], [side * span, y + 1.35],
        [side * (span + .45), y + .84], [side * (span - .20), y - .2], [side * 1.15, y - .92]];
      g.fillStyle(side < 0 ? 0x596779 : 0x435267, 1).fillPoints(crownPoints(platePoints), true);
      g.lineStyle(1, 0x8d99a8, .8).strokePoints(crownPoints(platePoints), true);
      g.fillStyle(0x313d4e, 1).fillPoints(crownPoints([[side * (span - .3), y + .5], [side * (span + .52), y + 2],
        [side * (span + .62), y + .51], [side * (span + .2), y - .22]]), true);
    }
  }
  g.fillStyle(0x424f62, 1).fillPoints(crownPoints([[-.15, 5.4], [-.65, 1], [-.55, -3.8], [.55, -3.8], [.65, 1], [.15, 5.4]]), true);
  for (const [x, y] of [[47.4997, 41.1217], [67.1602, 5.9382], [54.5775, -29.3938],
    [-47.4997, 41.1217], [-67.1602, 5.9382], [-54.5775, -29.3938]]) {
    g.fillStyle(0x111b2b, 1).fillEllipse(130 + x, 105 + y, 13, 12);
    g.lineStyle(1, 0x85909b, .7).strokeEllipse(130 + x, 105 + y, 13, 12);
  }
  g.fillStyle(0x111825, 1).fillCircle(130, 107, 16);
  g.lineStyle(2, 0xed7066, 1).strokeCircle(130, 107, 13);
  g.fillStyle(0xffb08c, 1).fillCircle(130, 107, 3);
  g.generateTexture(ASSET_KEYS.nullArchitect, 260, 210).clear();
  if (!scene.textures.exists('crown-turret')) {
    g.fillStyle(0x657284, 1).fillPoints(polygon([[19, 20], [29, 20], [30, 25], [27, 28], [21, 28], [18, 25]]), true);
    g.fillStyle(0x14202e, 1).fillRect(21, 26, 2, 10).fillRect(25, 26, 2, 10);
    g.lineStyle(1, 0xb0b8c1, .9).lineBetween(21, 26, 21, 35).lineBetween(25, 26, 25, 35);
    g.fillStyle(0xff8a70, 1).fillCircle(24, 23, 1.2);
    g.generateTexture('crown-turret', 48, 48).clear();
  }

  g.fillStyle(0xffb640, 0.14).fillCircle(28, 28, 27);
  g.fillStyle(0x2b1724, 1).fillCircle(28, 28, 17);
  g.lineStyle(3, 0xffb640, 1).strokeCircle(28, 28, 16);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    g.lineBetween(28 + Math.cos(angle) * 17, 28 + Math.sin(angle) * 17, 28 + Math.cos(angle) * 25, 28 + Math.sin(angle) * 25);
  }
  g.fillStyle(0xfff1bd, 1).fillCircle(28, 28, 5);
  g.generateTexture(ASSET_KEYS.mine, 56, 56).clear();

  // The aerial fortress is wide, layered, and easy to read at a glance.
  g.fillStyle(0xff576f, 0.1).fillEllipse(150, 74, 280, 112);
  g.fillStyle(0x502239, 1).fillRoundedRect(20, 42, 260, 66, 18);
  g.fillStyle(0xd44f63, 1).fillPoints(polygon([[15, 57], [98, 32], [121, 7], [150, 31], [179, 7], [202, 32], [285, 57], [247, 92], [53, 92]]), true);
  g.fillStyle(0x140f25, 1).fillRoundedRect(87, 40, 126, 55, 14);
  g.fillStyle(0xffb35f, 1).fillCircle(150, 60, 15);
  g.fillStyle(0xffe7ae, 1).fillCircle(150, 60, 7);
  for (const x of [48, 75, 225, 252]) {
    g.fillStyle(0x20152b, 1).fillCircle(x, 65, 13);
    g.lineStyle(3, 0xff6f61, 1).strokeCircle(x, 65, 10);
  }
  g.lineStyle(3, 0xff7d8f, 0.9).strokeRoundedRect(22, 43, 256, 62, 16);
  g.generateTexture(ASSET_KEYS.boss, 300, 120).clear();

  // Projectiles.
  g.fillStyle(0x35e8ff, 0.2).fillRoundedRect(0, 0, 12, 30, 6);
  g.fillStyle(0x7bf3ff, 0.72).fillRoundedRect(2, 1, 8, 28, 4);
  g.fillStyle(0xf1ffff, 1).fillRoundedRect(4, 1, 4, 28, 2);
  g.generateTexture(ASSET_KEYS.playerBullet, 12, 30).clear();
  g.fillStyle(0xffb640, 0.3).fillRoundedRect(0, 0, 12, 30, 6);
  g.fillStyle(0xffd56a, 0.78).fillRoundedRect(2, 1, 8, 28, 4);
  g.fillStyle(0xfff6cf, 1).fillRoundedRect(4, 1, 4, 28, 2);
  g.generateTexture(ASSET_KEYS.playerBulletOverdrive, 12, 30).clear();

  g.fillStyle(0x65ffb1, 0.18).fillRoundedRect(0, 0, 12, 20, 5);
  g.fillStyle(0xe8fff3, 1).fillPoints(polygon([[6, 0], [10, 8], [8, 18], [6, 15], [4, 18], [2, 8]]), true);
  g.lineStyle(2, 0x65ffb1, 0.92).lineBetween(1, 8, 11, 8);
  g.generateTexture(ASSET_KEYS.wingBullet, 12, 20).clear();
  g.fillStyle(0xffb640, 0.28).fillRoundedRect(0, 0, 12, 20, 5);
  g.fillStyle(0xfff6cf, 1).fillPoints(polygon([[6, 0], [10, 8], [8, 18], [6, 15], [4, 18], [2, 8]]), true);
  g.lineStyle(2, 0x65ffb1, 0.96).lineBetween(1, 8, 11, 8);
  g.generateTexture(ASSET_KEYS.wingBulletOverdrive, 12, 20).clear();

  g.fillStyle(0xffb640, 0.2).fillCircle(10, 14, 10);
  g.fillStyle(0xffedb5, 1).fillPoints(polygon([[10, 0], [17, 17], [10, 14], [3, 17]]), true);
  g.fillStyle(0xff7b33, 1).fillTriangle(6, 16, 14, 16, 10, 29);
  g.generateTexture(ASSET_KEYS.missile, 20, 30).clear();
  g.fillStyle(0xffb640, 0.34).fillCircle(10, 14, 10);
  g.fillStyle(0xfff6cf, 1).fillPoints(polygon([[10, 0], [17, 17], [10, 14], [3, 17]]), true);
  g.lineStyle(2, 0xffb640, 1).strokePoints(polygon([[10, 0], [17, 17], [10, 14], [3, 17]]), true);
  g.fillStyle(0xffb640, 1).fillTriangle(6, 16, 14, 16, 10, 29);
  g.generateTexture(ASSET_KEYS.missileOverdrive, 20, 30).clear();

  g.fillStyle(0xf06cff, 0.18).fillRoundedRect(0, 0, 18, 86, 9);
  g.fillStyle(0xf06cff, 0.9).fillRoundedRect(4, 0, 2, 86, 1).fillRoundedRect(12, 0, 2, 86, 1);
  g.fillStyle(0xffe8ff, 1).fillRoundedRect(7, 0, 4, 86, 2);
  g.generateTexture(ASSET_KEYS.laser, 18, 86).clear();
  g.fillStyle(0xffb640, 0.28).fillRoundedRect(0, 0, 18, 86, 9);
  g.fillStyle(0xf06cff, 0.92).fillRoundedRect(3, 0, 2, 86, 1).fillRoundedRect(13, 0, 2, 86, 1);
  g.fillStyle(0xfff6cf, 1).fillRoundedRect(7, 0, 4, 86, 2);
  g.generateTexture(ASSET_KEYS.laserOverdrive, 18, 86).clear();

  generateHostileProjectileTextures(g);

  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture(ASSET_KEYS.spark, 8, 8).clear();

  drawOceanTexture(g);
  drawCloudTexture(g);
  drawAtmosphereTextures(g);
  drawMissionEnvironment(g, ASSET_KEYS.coastal, 'coastal');
  drawMissionEnvironment(g, ASSET_KEYS.aurora, 'aurora');
  drawMissionEnvironment(g, ASSET_KEYS.minefield, 'minefield');
  drawMissionEnvironment(g, ASSET_KEYS.fortress, 'fortress');
  drawMissionEnvironment(g, ASSET_KEYS.stormbreak, 'stormbreak');
  drawMissionEnvironment(g, ASSET_KEYS.graveyard, 'graveyard');
  drawMissionEnvironment(g, ASSET_KEYS.carrierSiege, 'carrierSiege');
  drawMissionEnvironment(g, ASSET_KEYS.dreadnought, 'dreadnought');

  (['spread', 'missile', 'laser', 'drone', 'ion', 'shield', 'repair', 'overdrive', 'tractor', 'emp'] as PickupType[])
    .forEach((type) => drawPickup(g, type));
  g.destroy();
}

/** One directional family for every graphics mode; legacy keys cannot revive the old orbs. */
export function generateHostileProjectileTextures(g: Phaser.GameObjects.Graphics): void {
  for (const [kind, art] of Object.entries(HOSTILE_PROJECTILE_ART)) {
    const { width: w, height: h, edge, shade, core } = art;
    const shape = (points: Array<[number, number]>): Phaser.Geom.Point[] =>
      polygon(points.map(([x, y]) => [x * w, y * h]));
    // Tapered, translucent wake above a nose-down faceted shard. No circular halos.
    g.fillStyle(edge, .07).fillPoints(shape([[.5, .015], [.84, .46], [.76, .68], [.5, .985], [.24, .68], [.16, .46]]), true);
    g.fillStyle(edge, .13).fillPoints(shape([[.5, .06], [.72, .43], [.69, .64], [.5, .94], [.31, .64], [.28, .43]]), true);
    g.fillStyle(shade, .95).fillPoints(shape([[.29, .34], [.71, .34], [.76, .55], [.5, .9], [.24, .55]]), true);
    g.fillStyle(edge, .95).fillPoints(shape([[.32, .32], [.5, .42], [.5, .9], [.25, .55]]), true);
    g.fillStyle(edge, .64).fillPoints(shape([[.68, .32], [.75, .55], [.5, .9], [.5, .42]]), true);
    g.fillStyle(core, 1).fillPoints(shape([[.46, .26], [.54, .26], [.59, .57], [.5, .84], [.41, .57]]), true);
    g.lineStyle(1, core, .82).lineBetween(w * .32, h * .38, w * .29, h * .53);
    // Preserve stable Classic asset keys for any external consumers, with identical art.
    g.generateTexture(art.key, w, h);
    if (kind === 'standard') g.generateTexture(ASSET_KEYS.enemyBullet, w, h);
    if (kind === 'heavy') g.generateTexture(ASSET_KEYS.enemyBulletHeavy, w, h);
    g.clear();
  }
}

function drawBulwark(g: Phaser.GameObjects.Graphics): void {
  const width = 140;
  const height = 96;
  g.fillStyle(0xff9b43, 0.13).fillEllipse(width / 2, height / 2, width, height * 0.74);
  g.fillStyle(0x351821, 1).fillPoints(polygon([[70, 3], [84, 25], [132, 35], [124, 75], [92, 67], [82, 92], [58, 92], [48, 67], [16, 75], [8, 35], [56, 25]]), true);
  g.fillStyle(0x111a2b, 0.92).fillRoundedRect(49, 23, 42, 58, 10);
  g.lineStyle(3, 0xff9b43, 0.95).strokePoints(polygon([[70, 3], [84, 25], [132, 35], [124, 75], [92, 67], [82, 92], [58, 92], [48, 67], [16, 75], [8, 35], [56, 25]]), true);
  for (const x of [30, 110]) {
    g.fillStyle(0x132825, 1).fillCircle(x, 52, 11);
    g.lineStyle(3, 0x65ffb1, 1).strokeCircle(x, 52, 9);
    g.fillStyle(0xf0fff5, 1).fillCircle(x, 52, 4);
  }
  g.fillStyle(0xffb640, 1).fillCircle(70, 45, 8);
  g.fillStyle(0xfff6cf, 1).fillCircle(70, 45, 3);
  g.generateTexture(ASSET_KEYS.bulwark, width, height).clear();
}

function drawCarrierBoss(g: Phaser.GameObjects.Graphics): void {
  const width = 244;
  const height = 116;
  g.fillStyle(0xffb640, 0.12).fillEllipse(width / 2, 62, 238, 98);
  g.fillStyle(0x301a25, 1).fillPoints(polygon([[122, 5], [154, 31], [233, 43], [218, 94], [156, 83], [122, 111], [88, 83], [26, 94], [11, 43], [90, 31]]), true);
  g.fillStyle(0x101a2b, 1).fillRoundedRect(82, 28, 80, 64, 15);
  g.lineStyle(3, 0xffb640, 0.95).strokePoints(polygon([[122, 5], [154, 31], [233, 43], [218, 94], [156, 83], [122, 111], [88, 83], [26, 94], [11, 43], [90, 31]]), true);
  for (const x of [49, 195]) {
    g.fillStyle(0x201126, 1).fillCircle(x, 62, 16);
    g.lineStyle(4, 0xf06cff, 1).strokeCircle(x, 62, 12);
    g.fillStyle(0xffffff, 1).fillCircle(x, 62, 5);
  }
  g.fillStyle(0xff8f4b, 1).fillCircle(122, 58, 15);
  g.fillStyle(0xfff6cf, 1).fillCircle(122, 58, 6);
  g.generateTexture(ASSET_KEYS.carrierBoss, width, height).clear();
}

function drawEnemy(
  g: Phaser.GameObjects.Graphics,
  key: string,
  width: number,
  height: number,
  color: number,
  points: Array<[number, number]>,
): void {
  drawEnemyFrame(g, key, width, height, color, points);
  const banked = (direction: -1 | 1): Array<[number, number]> => points.map(([x, y]) => [
    width / 2 + (x - width / 2) * 0.84 + direction * (y / height - 0.46) * 8,
    y,
  ]);
  drawEnemyFrame(g, `${key}-bank-left`, width, height, color, banked(-1));
  drawEnemyFrame(g, `${key}-bank-right`, width, height, color, banked(1));
}

function drawEnemyFrame(
  g: Phaser.GameObjects.Graphics,
  key: string,
  width: number,
  height: number,
  color: number,
  points: Array<[number, number]>,
): void {
  g.fillStyle(color, 0.13).fillEllipse(width / 2, height / 2, width, height * 0.7);
  g.fillStyle(0x351528, 1).fillPoints(polygon(points), true);
  const rightSide = points.map(([x, y]) => [Math.max(width / 2, x), y] as [number, number]);
  g.fillStyle(0x0c1528, 0.6).fillPoints(polygon(rightSide), true);
  g.lineStyle(3, color, 1).strokePoints(polygon(points), true);
  g.fillStyle(color, 1).fillCircle(width / 2, height * 0.48, 7);
  g.fillStyle(0xffddbb, 1).fillCircle(width / 2, height * 0.48, 3);
  g.generateTexture(key, width, height).clear();
}

function drawPlayerBank(g: Phaser.GameObjects.Graphics, key: string, bank: -2 | -1 | 1 | 2): void {
  const strength = Math.abs(bank) / 2;
  const direction = Math.sign(bank);
  const transform = ([x, y]: [number, number]): [number, number] => [
    44 + (x - 44) * (1 - strength * 0.24) + direction * (y / 104 - 0.45) * 7 * strength,
    y,
  ];
  const body = ([[44, 5], [54, 42], [81, 73], [58, 69], [54, 96], [44, 83], [34, 96], [30, 69], [7, 73], [34, 42]] as Array<[number, number]>).map(transform);
  g.fillStyle(0x18d8ff, 0.12).fillEllipse(44, 54, 72 - strength * 12, 82);
  g.fillStyle(0xd9f8ff, 1).fillPoints(polygon(body), true);
  g.fillStyle(direction < 0 ? 0xffffff : 0x5b7b91, 0.72).fillTriangle(44, 8, transform([13, 72])[0], 72, 44, 79);
  g.fillStyle(direction > 0 ? 0xffffff : 0x5b7b91, 0.72).fillTriangle(44, 8, transform([75, 72])[0], 72, 44, 79);
  g.fillStyle(0x18354f, 1).fillPoints(polygon(([[44, 18], [51, 47], [44, 63], [37, 47]] as Array<[number, number]>).map(transform)), true);
  g.fillStyle(0x35e8ff, 1).fillTriangle(transform([44, 64])[0], 64, transform([51, 83])[0], 83, transform([37, 83])[0], 83);
  g.lineStyle(2, 0x35e8ff, 0.95).strokePoints(polygon(([[12, 71], [34, 57], [44, 9], [54, 57], [76, 71]] as Array<[number, number]>).map(transform)));
  g.generateTexture(key, 88, 104).clear();
}

function drawOceanTexture(g: Phaser.GameObjects.Graphics): void {
  const colors = [0x050c1b, 0x071426, 0x09192d, 0x061221];
  for (let y = 0; y < 512; y += 32) {
    g.fillStyle(colors[(y / 32) % colors.length], 1).fillRect(0, y, 512, 32);
  }
  g.lineStyle(1, 0x1c7090, 0.2);
  for (let y = 12; y < 512; y += 38) {
    g.lineBetween(0, y, 512, y + 26);
  }
  g.lineStyle(1, 0x47c5df, 0.08);
  for (let x = 0; x < 512; x += 64) g.lineBetween(x, 0, x + 86, 512);
  g.generateTexture(ASSET_KEYS.ocean, 512, 512).clear();
}

function drawCloudTexture(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x9bd8e6, 0.035).fillEllipse(120, 72, 250, 48);
  g.fillStyle(0xc5f1f5, 0.025).fillEllipse(235, 62, 340, 68);
  g.fillStyle(0x74b2cb, 0.03).fillEllipse(410, 86, 310, 54);
  g.fillStyle(0xb5edf2, 0.025).fillEllipse(665, 204, 280, 45);
  g.fillStyle(0x6eafc8, 0.025).fillEllipse(525, 233, 390, 66);
  g.fillStyle(0xb9e8f0, 0.02).fillEllipse(140, 276, 310, 48);
  g.generateTexture(ASSET_KEYS.cloud, 768, 320).clear();
}

function drawAtmosphereTextures(g: Phaser.GameObjects.Graphics): void {
  const gradientBands = [0.015, 0.025, 0.045, 0.065, 0.045, 0.025];
  gradientBands.forEach((alpha, index) => {
    g.fillStyle(0x66dcf2, alpha).fillRect(0, index * 54, 768, 55);
  });
  g.lineStyle(2, 0x8eefff, 0.05).lineBetween(0, 225, 768, 225);
  for (let x = 20; x < 768; x += 69) g.fillStyle(0xa7f5ff, 0.12).fillCircle(x, 220 + (x % 4) * 6, 2);
  g.generateTexture(ASSET_KEYS.haze, 768, 320).clear();

  g.fillStyle(0xcdf9ff, 0.05).fillEllipse(70, 80, 190, 48);
  g.fillStyle(0x9edce8, 0.04).fillEllipse(710, 190, 230, 62);
  g.fillStyle(0xdafcff, 0.035).fillEllipse(35, 275, 160, 42);
  g.lineStyle(2, 0xb9f5ff, 0.1);
  for (let x = 36; x < 760; x += 155) g.lineBetween(x, 30, x - 55, 180);
  g.generateTexture(ASSET_KEYS.foreground, 768, 320).clear();
}

function drawMissionEnvironment(
  g: Phaser.GameObjects.Graphics,
  key: string,
  profile: 'coastal' | 'aurora' | 'minefield' | 'fortress' | 'stormbreak' | 'graveyard' | 'carrierSiege' | 'dreadnought',
): void {
  if (profile === 'coastal') {
    g.fillStyle(0x07191e, 0.72).fillEllipse(115, 150, 220, 76).fillEllipse(505, 440, 300, 92);
    g.lineStyle(2, 0x33d9cc, 0.3).strokeEllipse(115, 150, 235, 85).strokeEllipse(505, 440, 318, 102);
    g.fillStyle(0x8defff, 0.13).fillTriangle(625, 40, 560, 310, 690, 310);
    g.fillStyle(0xeaffff, 0.7).fillCircle(625, 58, 4);
  } else if (profile === 'aurora') {
    // Legacy layer initializes before ClassicSpaceEnvironment takes over.
    // A subdued matching fallback prevents a missing-texture flash or warning.
    g.fillStyle(0x090e27, .9).fillRect(0, 0, 768, 720);
    for (let index = 0; index < 7; index += 1) {
      const x = 60 + index * 108;
      g.lineStyle(18, index % 2 ? 0x6a53b5 : 0x2bbcac, .06)
        .lineBetween(x, 0, x + 105, 720);
    }
  } else if (profile === 'minefield') {
    g.lineStyle(1, 0x55ff9c, 0.13);
    for (let x = 25; x < 768; x += 72) g.lineBetween(x, 0, x, 720);
    for (let y = 10; y < 720; y += 72) g.lineBetween(0, y, 768, y);
    for (let index = 0; index < 8; index += 1) {
      const x = 54 + (index * 137) % 680;
      const y = 55 + index * 79;
      g.fillStyle(0xffb640, 0.35).fillCircle(x, y, 5);
      g.lineStyle(2, 0xffb640, 0.18).strokeCircle(x, y, 14);
    }
    g.fillStyle(0x203c3e, 0.65).fillTriangle(220, 260, 330, 310, 180, 335).fillTriangle(610, 510, 735, 565, 570, 610);
  } else if (profile === 'fortress') {
    for (let y = 80; y < 720; y += 220) {
      g.fillStyle(0x17152e, 0.8).fillRoundedRect(45, y, 235, 78, 12).fillRoundedRect(470, y + 70, 250, 86, 12);
      g.lineStyle(2, 0x9c76ff, 0.3).strokeRoundedRect(45, y, 235, 78, 12).strokeRoundedRect(470, y + 70, 250, 86, 12);
      g.lineStyle(4, 0xff536d, 0.24).lineBetween(78, y + 20, 245, y + 20).lineBetween(500, y + 94, 690, y + 94);
    }
    g.fillStyle(0xf4eeff, 0.09).fillTriangle(145, 20, 40, 360, 250, 360).fillTriangle(620, 280, 500, 680, 740, 680);
  } else if (profile === 'stormbreak') {
    g.fillStyle(0x081326, 0.7).fillRect(0, 0, 768, 720);
    for (let y = 35; y < 720; y += 105) {
      g.fillStyle(0x4a3b76, 0.12).fillEllipse(170 + (y % 260), y, 430, 70);
      g.lineStyle(2, 0x80eaff, 0.09).lineBetween(0, y + 35, 768, y - 10);
    }
    g.lineStyle(3, 0xb9f8ff, 0.18).strokePoints(polygon([[620, 0], [560, 115], [605, 108], [535, 245]]));
  } else if (profile === 'graveyard') {
    g.fillStyle(0x071916, 0.72).fillRect(0, 0, 768, 720);
    for (let index = 0; index < 9; index += 1) {
      const x = 45 + (index * 173) % 690;
      const y = 48 + index * 76;
      g.fillStyle(0x263b3c, 0.72).fillPoints(polygon([[x, y], [x + 82, y + 18], [x + 54, y + 52], [x - 24, y + 39]]), true);
      g.lineStyle(2, 0x65ffb1, 0.14).strokeCircle(x + 28, y + 28, 17);
    }
  } else if (profile === 'carrierSiege') {
    g.fillStyle(0x100c20, 0.76).fillRect(0, 0, 768, 720);
    for (let y = 50; y < 720; y += 150) {
      g.fillStyle(0x25213c, 0.9).fillRoundedRect(35, y, 698, 78, 12);
      g.lineStyle(2, 0xffb640, 0.22).strokeRoundedRect(35, y, 698, 78, 12);
      g.lineStyle(5, 0xf06cff, 0.15).lineBetween(100, y + 25, 668, y + 25);
    }
  } else {
    g.fillStyle(0x170914, 0.82).fillRect(0, 0, 768, 720);
    for (let x = 20; x < 768; x += 128) {
      g.fillStyle(0x321326, 0.9).fillRoundedRect(x, 0, 80, 720, 8);
      g.lineStyle(3, 0xff3f56, 0.28).lineBetween(x + 18, 0, x + 18, 720);
      g.lineStyle(1, 0xffb15e, 0.2).lineBetween(x + 27, 0, x + 27, 720);
    }
    for (let y = 70; y < 720; y += 155) g.fillStyle(0xff536d, 0.15).fillRect(0, y, 768, 8);
  }
  g.generateTexture(key, 768, 720).clear();
}

function drawPickup(g: Phaser.GameObjects.Graphics, type: PickupType): void {
  const color = type === 'shield'
    ? 0x63a8ff
    : type === 'repair'
      ? 0xff667c
      : type === 'overdrive'
        ? 0xffb640
        : type === 'tractor'
          ? 0x65ffb1
          : type === 'emp'
            ? 0x8b7dff
            : WEAPON_LABELS[type as WeaponType].color;
  g.fillStyle(color, 0.16).fillCircle(30, 30, 29);
  g.lineStyle(3, color, 1).strokeCircle(30, 30, 22);
  g.lineStyle(2, 0xffffff, 0.85);

  if (type === 'spread') {
    g.lineBetween(30, 42, 18, 18).lineBetween(30, 42, 30, 13).lineBetween(30, 42, 42, 18);
  } else if (type === 'missile') {
    g.strokeTriangle(30, 10, 18, 42, 30, 35).strokeTriangle(30, 10, 42, 42, 30, 35);
  } else if (type === 'laser') {
    g.strokeRoundedRect(25, 10, 10, 40, 4);
  } else if (type === 'drone') {
    g.strokeCircle(30, 30, 8).strokeCircle(15, 30, 4).strokeCircle(45, 30, 4);
    g.lineBetween(19, 30, 22, 30).lineBetween(38, 30, 41, 30);
  } else if (type === 'ion') {
    g.strokePoints(polygon([[19, 15], [34, 24], [25, 31], [42, 44]]));
    g.strokeCircle(18, 15, 4).strokeCircle(43, 45, 4);
  } else if (type === 'shield') {
    g.strokePoints(polygon([[30, 9], [47, 18], [43, 40], [30, 51], [17, 40], [13, 18]]), true);
    g.lineBetween(30, 18, 30, 41);
  } else if (type === 'repair') {
    g.lineBetween(30, 16, 30, 44).lineBetween(16, 30, 44, 30);
  } else if (type === 'overdrive') {
    g.strokePoints(polygon([[34, 10], [20, 31], [30, 31], [25, 50], [42, 25], [31, 25]]), true);
  } else if (type === 'tractor') {
    g.lineStyle(1, 0x65ffb1, .5).strokeCircle(30, 30, 20);
    g.lineStyle(2, 0xffffff, .95).strokeCircle(30, 30, 7);
    // Four inward salvage arrows read as collection rather than a targeting reticle.
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const tipX = 30 + dx * 12, tipY = 30 + dy * 12;
      g.lineBetween(30 + dx * 25, 30 + dy * 25, tipX, tipY);
      g.lineBetween(tipX, tipY, 30 + dx * 18 - dy * 5, 30 + dy * 18 + dx * 5);
      g.lineBetween(tipX, tipY, 30 + dx * 18 + dy * 5, 30 + dy * 18 - dx * 5);
    }
  } else {
    g.strokeCircle(30, 30, 15);
    g.lineBetween(22, 21, 38, 39).lineBetween(38, 21, 22, 39);
  }
  g.generateTexture(`${ASSET_KEYS.pickupPrefix}${type}`, 60, 60).clear();
}
