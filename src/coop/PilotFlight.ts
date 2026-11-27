import type Phaser from 'phaser';
import type { KestrelEquipment } from '../phaser/view/KestrelEquipment';
import { GameModel } from '../game/simulation/GameModel';
import type { PlayerShieldView } from '../phaser/view/PlayerShieldView';
import { ArcCharge } from './wingArc';
import type { Seat } from './campaign';

export class PilotFlight {
  readonly model: GameModel;
  player!: Phaser.Physics.Arcade.Sprite;
  equipment?: KestrelEquipment;
  playerShadow!: Phaser.GameObjects.Ellipse;
  playerShield?: PlayerShieldView;
  contrails!: Phaser.GameObjects.Graphics;
  drones: Phaser.GameObjects.Sprite[] = [];
  marker?: Phaser.GameObjects.Text;
  escapePod?: Phaser.GameObjects.Image;
  stripes?: Phaser.GameObjects.Graphics;
  playerBank = 0;
  readonly arcCharge = new ArcCharge();
  arcFiring = false;
  nextPrimaryAt = 0;
  nextMissileAt = 0;
  nextLaserAt = 0;
  nextDroneAt = 0;
  nextIonAt = 0;
  droneVolleyIndex = 0;
  primaryVolleyIndex = 0;
  resonanceHits = 0;
  hullCriticalAnnounced = false;
  down = false;
  rescueAvailable = true;
  rescueMs = 0;
  constructor(
    readonly seat: Seat,
    highScore = 0,
  ) {
    this.model = new GameModel(highScore);
  }
  reset(): void {
    this.playerBank = 0;
    this.arcCharge.spend();
    this.arcFiring = false;
    this.nextPrimaryAt = 0;
    this.nextMissileAt = 0;
    this.nextLaserAt = 0;
    this.nextDroneAt = 0;
    this.nextIonAt = 0;
    this.droneVolleyIndex = 0;
    this.primaryVolleyIndex = 0;
    this.resonanceHits = 0;
    this.hullCriticalAnnounced = false;
    this.down = false;
    this.rescueAvailable = true;
    this.rescueMs = 0;
  }
}
