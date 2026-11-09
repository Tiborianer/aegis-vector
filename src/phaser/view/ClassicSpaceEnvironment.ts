import type Phaser from 'phaser';
import { WORLD_WIDTH } from '../../game/content/balance';
import type { GraphicsQuality, MissionId } from '../../game/simulation/types';
import { AsteroidFieldView } from './AsteroidFieldView';
import { SurfacePlane } from './DimensionalEnvironment';
import { surfaceKey } from '../../game/assets/visuals';

interface ClassicLayer { visible: boolean; setVisible(visible: boolean): unknown }

/** The finale's space setting is shared by both art styles. Classic's existing
 * scenery is borrowed, never destroyed or restyled, and restored on mission exit. */
export class ClassicSpaceEnvironment {
  private readonly layers: Array<{ view: ClassicLayer; visible: boolean }>;
  private field?: AsteroidFieldView;
  private aurora?: SurfacePlane;
  private active = false;
  private follow = 0;
  private mission: MissionId = 'coastal';

  constructor(private scene: Phaser.Scene, private quality: GraphicsQuality, layers: readonly ClassicLayer[]) {
    this.layers = layers.map((view) => ({ view, visible: view.visible }));
  }

  setMission(mission: MissionId): void {
    this.mission = mission;
    this.active = mission === 'lastLight' || mission === 'aurora';
    this.follow = 0;
    this.layers.forEach(({ view, visible }) => view.setVisible(this.active ? false : visible));
    // No texture generation or extra sprites for Classic's ordinary missions.
    if (mission === 'lastLight') this.field ??= new AsteroidFieldView(this.scene, this.quality);
    this.field?.setVisible(mission === 'lastLight');
    if (mission === 'aurora') this.aurora ??= new SurfacePlane(this.scene, surfaceKey('aurora'), WORLD_WIDTH + 100, -18);
    this.aurora?.visible(mission === 'aurora');
  }

  /** True means the shared space field rendered this frame; skip legacy scroll. */
  update(deltaMs: number, playerX: number, projectileDensity: number): boolean {
    if (!this.active) return false;
    const dt = Math.min(50, Math.max(0, deltaMs));
    const target = (playerX - WORLD_WIDTH / 2) / WORLD_WIDTH;
    this.follow += (target - this.follow) * (1 - Math.exp(-dt / 700));
    if (this.mission === 'lastLight') this.field?.update(dt, this.follow, projectileDensity);
    else this.aurora?.update(dt * .028, -this.follow * 9);
    return true;
  }

  destroy(): void { this.field?.destroy(); this.aurora?.destroy(); }

  snapshot(): object {
    return { mission: this.mission, classicLayers: this.layers.map(({ view }) => view.visible),
      asteroidField: this.field?.snapshot(), aurora: this.aurora?.snapshot() };
  }
}
