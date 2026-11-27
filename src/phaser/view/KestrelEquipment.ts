import type Phaser from 'phaser';
import type { GameModel } from '../../game/simulation/GameModel';
import { equipmentRows, KESTREL_EQUIPMENT } from '../../game/assets/fleetArt';

export class KestrelEquipment {
  readonly layers: Phaser.GameObjects.Image[] = [];
  private key = '';
  private rows: number[] = [];

  constructor(private scene: Phaser.Scene) {}

  update(ship: Phaser.Physics.Arcade.Sprite, model: GameModel): void {
    const { spread, laser, missile, drone, ion } = model.weapons;
    const signature = [spread, laser, missile, drone, ion, model.shieldBaseMax, model.shieldMax].join('/');
    // Modifiers can change between flights without a weapon-rank change.
    if (this.key !== signature || this.modifiers !== model.modifiers) {
      this.key = signature;
      this.modifiers = model.modifiers;
      this.rows = equipmentRows(model.weapons, model.shieldBaseMax, model.modifiers);
      while (this.layers.length < this.rows.length) {
        this.layers.push(this.scene.add.image(ship.x, ship.y, KESTREL_EQUIPMENT).setDepth(ship.depth + .035));
      }
    }
    const bank = Number(ship.frame.name);
    for (const [i, image] of this.layers.entries()) {
      const row = this.rows[i];
      image.setVisible(ship.visible && ship.active && row !== undefined);
      if (image.visible) image.setFrame(row * 16 + bank).setPosition(ship.x, ship.y).setRotation(ship.rotation)
        .setScale(ship.scaleX, ship.scaleY).setAlpha(ship.alpha);
    }
  }
  private modifiers?: GameModel['modifiers'];
  hide(): void { this.layers.forEach(image => image.setVisible(false)); }
}
