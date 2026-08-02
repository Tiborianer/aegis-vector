import Phaser from 'phaser';
import { generateTextures } from '../view/generateTextures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    generateTextures(this);
    this.scene.start('battle');
  }
}
