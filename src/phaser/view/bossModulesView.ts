import Phaser from 'phaser';
import { activeTurretCount, seraphWingPoint, seraphWingRotation, SERAPH_WINGS, siegeTurretPose, SIEGE_TURRETS, type ModularBossState } from '../../game/simulation/modularBoss';

/** Independently pivoted, Blender-baked guns above the selected Crown hull.
 * One owning container ensures a defeated/retried boss cannot leave guns behind. */
export function createSiegeModules(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const overlay = scene.add.graphics();
  const turrets = SIEGE_TURRETS.map(() => scene.add.image(0, 0, 'crown-turret').setOrigin(.5).setDisplaySize(48, 48));
  return scene.add.container(0, 0, [overlay, ...turrets])
    .setData('overlay', overlay).setData('turrets', turrets);
}

export function drawSiegeModules(view: Phaser.GameObjects.Container, state: ModularBossState, time: number, warning: boolean): void {
  const g = view.getData('overlay') as Phaser.GameObjects.Graphics;
  const guns = view.getData('turrets') as Phaser.GameObjects.Image[];
  const locked = activeTurretCount(state) > 0;
  g.clear();
  // Keep the author-built plates visible; only the small shield core and module
  // health indicators are drawn here. No second silhouette over the real hull.
  g.lineStyle(locked ? 3 : 1.5, locked ? 0xab91ff : 0x64ffd3, locked ? .24 : .45).strokeEllipse(0, 0, 28, 51);
  SIEGE_TURRETS.forEach((_mount, index) => {
    const turret = state.turrets[index];
    const pose = siegeTurretPose(index, turret.rotation, 260, 210);
    const alive = turret.health > 0;
    guns[index].setPosition(pose.x, pose.y).setRotation(pose.rotation).setVisible(alive);
    if (!alive) {
      g.fillStyle(0x080c13, .88).fillCircle(pose.x, pose.y, 8);
      g.lineStyle(1.2, 0xff784b, .5).lineBetween(pose.x - 4, pose.y - 3, pose.x + 4, pose.y + 4);
      return;
    }
    g.lineStyle(1.5, 0xff9380, .75).beginPath()
      .arc(pose.x, pose.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * turret.health / turret.maxHealth).strokePath();
    // Charge glow shares the exact transformed muzzle used by the telegraph.
    // There is no cosmetic recoil that would detach the firing origin.
    if (warning) for (const muzzle of pose.muzzles) {
      g.fillStyle(0xffe2ac, .55 + Math.sin(time * .018) * .18).fillCircle(muzzle.x, muzzle.y, 2.4);
    }
  });
}

export function createSeraphModules(scene: Phaser.Scene, dimensional = true): Phaser.GameObjects.Container {
  const wings = SERAPH_WINGS.map((wing) => scene.add.image(wing.hinge[0], wing.hinge[1], dimensional ? wing.textureKey : `classic-${wing.textureKey}`)
    .setOrigin(wing.origin[0], wing.origin[1]).setDisplaySize(320, 164));
  const overlay = scene.add.graphics();
  return scene.add.container(0, 0, [...wings, overlay]).setData('wings', wings).setData('overlay', overlay);
}

export function drawSeraphModules(view: Phaser.GameObjects.Container, time: number, warning: boolean): void {
  const wings = view.getData('wings') as Phaser.GameObjects.Image[];
  const overlay = view.getData('overlay') as Phaser.GameObjects.Graphics;
  overlay.clear();
  SERAPH_WINGS.forEach((wing, index) => {
    wings[index].setRotation(seraphWingRotation(index, time));
    if (warning) {
      const muzzle = seraphWingPoint(index, { x: wing.muzzle[0], y: wing.muzzle[1] }, time);
      overlay.fillStyle(0xffefb0, .65).fillCircle(muzzle.x, muzzle.y, 2.1);
    }
  });
}
