import Phaser from 'phaser';
import { ASSET_KEYS } from '../../game/assets/manifest';
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

  drawEnemy(g, ASSET_KEYS.scout, 64, 60, 0xff6f61, [[32, 56], [8, 13], [25, 20], [32, 3], [39, 20], [56, 13]]);
  drawEnemy(g, ASSET_KEYS.interceptor, 76, 68, 0xff9a56, [[38, 65], [4, 17], [28, 27], [38, 4], [48, 27], [72, 17]]);
  drawEnemy(g, ASSET_KEYS.bomber, 104, 78, 0xff5e73, [[52, 74], [7, 42], [5, 20], [38, 27], [52, 4], [66, 27], [99, 20], [97, 42]]);
  drawEnemy(g, ASSET_KEYS.elite, 112, 86, 0xc66cff, [[56, 82], [10, 62], [3, 27], [40, 36], [56, 4], [72, 36], [109, 27], [102, 62]]);
  drawEnemy(g, ASSET_KEYS.charger, 78, 76, 0xff3f56, [[39, 73], [8, 24], [29, 31], [39, 3], [49, 31], [70, 24]]);
  drawEnemy(g, ASSET_KEYS.sniper, 88, 70, 0xff72ca, [[44, 67], [5, 38], [28, 30], [36, 8], [44, 2], [52, 8], [60, 30], [83, 38]]);
  drawEnemy(g, ASSET_KEYS.mineLayer, 112, 74, 0xffa33f, [[56, 70], [8, 52], [4, 25], [38, 31], [56, 5], [74, 31], [108, 25], [104, 52]]);
  drawEnemy(g, ASSET_KEYS.shieldCarrier, 104, 84, 0x8b7dff, [[52, 80], [10, 59], [6, 24], [36, 33], [52, 4], [68, 33], [98, 24], [94, 59]]);
  drawBulwark(g);
  drawEnemy(g, ASSET_KEYS.warden, 190, 104, 0xf06cff, [[95, 99], [12, 67], [5, 30], [66, 42], [95, 4], [124, 42], [185, 30], [178, 67]]);

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
  g.fillStyle(0xdfffff, 1).fillRoundedRect(4, 1, 4, 26, 2);
  g.generateTexture(ASSET_KEYS.playerBullet, 12, 30).clear();
  g.fillStyle(0xffb640, 0.32).fillRoundedRect(0, 0, 12, 30, 6);
  g.fillStyle(0xfff6cf, 1).fillRoundedRect(4, 1, 4, 26, 2);
  g.generateTexture(ASSET_KEYS.playerBulletOverdrive, 12, 30).clear();

  g.fillStyle(0xffb640, 0.2).fillCircle(10, 14, 10);
  g.fillStyle(0xffedb5, 1).fillPoints(polygon([[10, 0], [17, 17], [10, 14], [3, 17]]), true);
  g.fillStyle(0xff7b33, 1).fillTriangle(6, 16, 14, 16, 10, 29);
  g.generateTexture(ASSET_KEYS.missile, 20, 30).clear();
  g.fillStyle(0xffb640, 0.34).fillCircle(10, 14, 10);
  g.fillStyle(0xfff6cf, 1).fillPoints(polygon([[10, 0], [17, 17], [10, 14], [3, 17]]), true);
  g.lineStyle(2, 0xffb640, 1).strokePoints(polygon([[10, 0], [17, 17], [10, 14], [3, 17]]), true);
  g.fillStyle(0xffb640, 1).fillTriangle(6, 16, 14, 16, 10, 29);
  g.generateTexture(ASSET_KEYS.missileOverdrive, 20, 30).clear();

  g.fillStyle(0xf06cff, 0.22).fillRoundedRect(0, 0, 18, 54, 9);
  g.fillStyle(0xffdfff, 1).fillRoundedRect(7, 0, 4, 54, 2);
  g.generateTexture(ASSET_KEYS.laser, 18, 54).clear();
  g.fillStyle(0xffb640, 0.32).fillRoundedRect(0, 0, 18, 54, 9);
  g.fillStyle(0xfff6cf, 1).fillRoundedRect(7, 0, 4, 54, 2);
  g.generateTexture(ASSET_KEYS.laserOverdrive, 18, 54).clear();

  g.fillStyle(0xff6f61, 0.18).fillCircle(11, 11, 11);
  g.fillStyle(0xffdfad, 1).fillCircle(11, 11, 5);
  g.generateTexture(ASSET_KEYS.enemyBullet, 22, 22).clear();

  g.fillStyle(0xf06cff, 0.2).fillCircle(16, 16, 16);
  g.lineStyle(3, 0xf06cff, 0.9).strokeCircle(16, 16, 11);
  g.fillStyle(0xffffff, 1).fillCircle(16, 16, 5);
  g.generateTexture(ASSET_KEYS.enemyBulletHeavy, 32, 32).clear();

  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture(ASSET_KEYS.spark, 8, 8).clear();

  drawOceanTexture(g);
  drawCloudTexture(g);
  drawAtmosphereTextures(g);
  drawMissionEnvironment(g, ASSET_KEYS.coastal, 'coastal');
  drawMissionEnvironment(g, ASSET_KEYS.minefield, 'minefield');
  drawMissionEnvironment(g, ASSET_KEYS.fortress, 'fortress');
  drawMissionEnvironment(g, ASSET_KEYS.dreadnought, 'dreadnought');

  (['spread', 'missile', 'laser', 'drone', 'ion', 'shield', 'repair', 'overdrive', 'tractor', 'emp'] as PickupType[])
    .forEach((type) => drawPickup(g, type));
  g.destroy();
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
  profile: 'coastal' | 'minefield' | 'fortress' | 'dreadnought',
): void {
  if (profile === 'coastal') {
    g.fillStyle(0x07191e, 0.72).fillEllipse(115, 150, 220, 76).fillEllipse(505, 440, 300, 92);
    g.lineStyle(2, 0x33d9cc, 0.3).strokeEllipse(115, 150, 235, 85).strokeEllipse(505, 440, 318, 102);
    g.fillStyle(0x8defff, 0.13).fillTriangle(625, 40, 560, 310, 690, 310);
    g.fillStyle(0xeaffff, 0.7).fillCircle(625, 58, 4);
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
    g.strokeCircle(30, 30, 14).strokeCircle(30, 30, 6);
    g.lineBetween(30, 8, 30, 16).lineBetween(30, 44, 30, 52).lineBetween(8, 30, 16, 30).lineBetween(44, 30, 52, 30);
  } else {
    g.strokeCircle(30, 30, 15);
    g.lineBetween(22, 21, 38, 39).lineBetween(38, 21, 22, 39);
  }
  g.generateTexture(`${ASSET_KEYS.pickupPrefix}${type}`, 60, 60).clear();
}
