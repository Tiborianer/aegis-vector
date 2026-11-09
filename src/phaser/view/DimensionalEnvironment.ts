import Phaser from 'phaser';
import { CLOUD_KEY, cloudLayerVisibility, forwardSurfaceFrame, SURFACE_SEAM_BLEND_FRACTION, surfaceKey, wrappedPlaneY } from '../../game/assets/visuals';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../game/content/balance';
import { FORTRESS_PLATFORMS, STRUCTURE_CLEAR_CORRIDOR, STRUCTURE_OPACITY, STRUCTURE_TILE_HEIGHT, STRUCTURE_TILE_WIDTH, STRUCTURE_SPEED_PX_PER_SECOND, structuralGapFractionLowerBound, structuralPlaneEnabled } from '../../game/assets/structuralPlane';
import type { GraphicsQuality, MissionId } from '../../game/simulation/types';
import { AsteroidFieldView } from './AsteroidFieldView';

/** Runtime-only leading-edge feather. No source file is edited, cropped,
 * mirrored, or regenerated; the opaque tail fills behind the following tile. */
function forwardTexture(scene: Phaser.Scene, key: string, transparentEdges: boolean): string {
  const blendedKey = `${key}-forward-feather-v1${transparentEdges ? '-soft-tail' : ''}`;
  if (scene.textures.exists(blendedKey)) return blendedKey;
  const source = scene.textures.get(key).getSourceImage();
  const texture = scene.textures.createCanvas(blendedKey, source.width, source.height);
  if (!texture) return key;
  const context = texture.getContext();
  const blendHeight = source.height * SURFACE_SEAM_BLEND_FRACTION;
  context.save();
  context.drawImage(source as CanvasImageSource, 0, 0);
  context.globalCompositeOperation = 'destination-out';
  const feather = context.createLinearGradient(0, 0, 0, blendHeight);
  feather.addColorStop(0, 'rgba(0,0,0,1)');
  feather.addColorStop(.25, 'rgba(0,0,0,.84)');
  feather.addColorStop(.75, 'rgba(0,0,0,.16)');
  feather.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = feather;
  context.fillRect(0, 0, source.width, blendHeight);
  if (transparentEdges) {
    // Translucent clouds need a soft trailing edge too. Otherwise two partial
    // opacities would accumulate through the overlap then end at a hard edge.
    const tail = context.createLinearGradient(0, source.height - blendHeight, 0, source.height);
    tail.addColorStop(0, 'rgba(0,0,0,0)');
    tail.addColorStop(.25, 'rgba(0,0,0,.16)');
    tail.addColorStop(.75, 'rgba(0,0,0,.84)');
    tail.addColorStop(1, 'rgba(0,0,0,1)');
    context.fillStyle = tail;
    context.fillRect(0, source.height - blendHeight, source.width, blendHeight);
  }
  context.restore();
  texture.refresh();
  return blendedKey;
}

/** Forward-only overlap wrapping: scenery never alternates upside-down. */
export class SurfacePlane {
  private views: Phaser.GameObjects.Image[];
  private offset = 0;
  private height: number;

  constructor(private scene: Phaser.Scene, key: string, private width: number, private depth: number, private transparentEdges = false) {
    const source = scene.textures.get(key).getSourceImage();
    this.height = width * source.height / source.width;
    const renderKey = forwardTexture(scene, key, transparentEdges);
    this.views = [0, 1].map(() => scene.add.image(WORLD_WIDTH / 2, 0, renderKey)
      .setOrigin(.5, 0).setDisplaySize(width, this.height).setDepth(depth).setFlipY(false));
    this.update(0, 0);
  }

  setTexture(key: string): void {
    this.offset = 0;
    const source = this.scene.textures.get(key).getSourceImage();
    this.height = this.width * source.height / source.width;
    const renderKey = forwardTexture(this.scene, key, this.transparentEdges);
    this.views.forEach((view) => view.setTexture(renderKey).setDisplaySize(this.width, this.height).setFlipY(false));
    this.update(0, 0);
  }

  tint(color: number): this { this.views.forEach((view) => view.setTint(color)); return this; }
  alpha(value: number): this { this.views.forEach((view) => view.setAlpha(value)); return this; }
  visible(value: boolean): this { this.views.forEach((view) => view.setVisible(value)); return this; }

  update(travel: number, x: number): void {
    const stride = this.height * (1 - SURFACE_SEAM_BLEND_FRACTION);
    this.offset = (this.offset + travel) % (stride * 2);
    this.views.forEach((view, index) => {
      const frame = forwardSurfaceFrame(this.offset, this.height, index);
      view.setPosition(WORLD_WIDTH / 2 + x, frame.y).setFlipY(frame.flipY).setDepth(this.depth + frame.depthOffset);
    });
  }

  destroy(): void { this.views.forEach((view) => view.destroy()); }
  snapshot(): { offset: number; y: number[]; alpha: number; visible: boolean; flipY: boolean[]; orientation: string; blendHeight: number } {
    return { offset: this.offset, y: this.views.map((view) => view.y), alpha: this.views[0].alpha, visible: this.views[0].visible,
      flipY: this.views.map((view) => view.flipY), orientation: 'authored-forward', blendHeight: this.height * SURFACE_SEAM_BLEND_FRACTION };
  }
}

/** Separated industrial maintenance docks, below clouds and every combat cue. */
class StructuralPlane {
  private views: Phaser.GameObjects.Image[];
  private offset = 0;

  constructor(scene: Phaser.Scene) {
    const key = 'dimensional-fortress-maintenance-docks-v4';
    if (!scene.textures.exists(key)) {
      const view = scene.make.graphics({ x: 0, y: 0 });
      for (const platform of FORTRESS_PLATFORMS) {
        view.fillStyle(0x020810, .70).fillPoints(platform.outline.map(({ x, y }) => ({ x: x + 10, y: y + 14 })), true);
        view.fillStyle(0x1c2831, 1).fillPoints(platform.outline, true);
        view.lineStyle(2, 0x71808a, .5).strokePoints(platform.outline, true, true);
        view.fillStyle(0x28353f, 1).fillPoints(platform.deck, true);
        view.lineStyle(2, 0x151e27, 1).strokePoints(platform.deck, true, true);
        // Raised rim, riveted radial deck plates and recessed service spine.
        // All details remain on these isolated docks, never across open water.
        const center = platform.deck.reduce((sum, point) => ({ x: sum.x + point.x / platform.deck.length,
          y: sum.y + point.y / platform.deck.length }), { x: 0, y: 0 });
        platform.outline.forEach((point, i) => {
          const next = platform.outline[(i + 1) % platform.outline.length];
          const inner = (p: { x: number; y: number }) => ({ x: p.x * .93 + center.x * .07, y: p.y * .93 + center.y * .07 });
          const a = inner(point); const b = inner(next);
          view.fillStyle(i % 3 === 0 ? 0x566069 : 0x121d27, .85).fillPoints([point, next, b, a], true);
          view.fillStyle(0x8a969b, .3).fillCircle(a.x, a.y, 1.5);
        });
        platform.deck.forEach((point, i) => {
          const next = platform.deck[(i + 1) % platform.deck.length];
          view.fillStyle(i % 2 === 0 ? 0x64727a : 0x08131e, .10).fillPoints([point, next, center], true);
          view.lineStyle(1, 0x080f17, .5).lineBetween(point.x, point.y, center.x, center.y);
        });
        view.fillStyle(0x171f27, 1).fillPoints(platform.spine, true);
        view.lineStyle(1, 0x7a858b, .6).strokePoints(platform.spine, true, true);
        for (let rib = 1; rib < 9; rib++) {
          const t = rib / 9;
          const a = platform.spine[0]; const b = platform.spine[1];
          const c = platform.spine[2]; const d = platform.spine[3];
          view.lineStyle(2, 0x47515b, .65).lineBetween(a.x + (d.x - a.x) * t, a.y + (d.y - a.y) * t,
            b.x + (c.x - b.x) * t, b.y + (c.y - b.y) * t);
        }
        for (const { x, y } of platform.vents) {
          view.fillStyle(0x0c151e, 1).fillRect(x - 5, y - 2, 17, 5);
          view.lineStyle(1, 0x78868c, .5).lineBetween(x - 5, y - 3, x + 12, y - 3);
        }
        for (const { x, y } of platform.lights) {
          view.fillStyle(0x0d1821, 1).fillRect(x - 5, y - 4, 10, 8);
          view.fillStyle(0xc19b66, .8).fillRect(x - 3, y - 1, 6, 2);
        }
      }
      // No connected rails or grid spanning the screen. Native geometry is
      // baked once, with the sea surface visible through every open gap.
      view.generateTexture(key,STRUCTURE_TILE_WIDTH,STRUCTURE_TILE_HEIGHT);
      view.destroy();
    }
    this.views = [0,1].map(() => scene.add.image(0,0,key).setOrigin(0,0)
      .setDepth(-14).setAlpha(STRUCTURE_OPACITY).setVisible(false));
    this.update(0, 0);
  }

  reset(): void { this.offset = 0; }
  visible(value: boolean): void { this.views.forEach((view) => view.setVisible(value)); }
  update(deltaMs: number, horizontalDrift: number): void {
    this.offset = (this.offset + deltaMs * STRUCTURE_SPEED_PX_PER_SECOND / 1000) % (STRUCTURE_TILE_HEIGHT * 2);
    this.views.forEach((view, index) => view.setPosition(
      (WORLD_WIDTH - STRUCTURE_TILE_WIDTH) / 2 + horizontalDrift,
      wrappedPlaneY(this.offset, STRUCTURE_TILE_HEIGHT, index),
    ));
  }
  destroy(): void { this.views.forEach((view) => view.destroy()); }
  snapshot(): object {
    return { offset: this.offset, visible: this.views[0].visible, alpha: this.views[0].alpha,
      speed: STRUCTURE_SPEED_PX_PER_SECOND, minimumGapFraction: structuralGapFractionLowerBound(),
      shape: 'separated-maintenance-docks', clearCorridorWidth: STRUCTURE_CLEAR_CORRIDOR.right - STRUCTURE_CLEAR_CORRIDOR.left };
  }
}

/** Atmospheric missions and a distinct deep-space finale share the same view contract. */
export class DimensionalEnvironment {
  private surface: SurfacePlane;
  private atmosphere: SurfacePlane;
  private nearVapor: SurfacePlane;
  private grade: Phaser.GameObjects.Rectangle;
  private structure: StructuralPlane;
  private asteroidField: AsteroidFieldView;
  private mission: MissionId = 'coastal';
  private drift = 0;
  private pointerDrift = 0;

  constructor(scene: Phaser.Scene, private quality: GraphicsQuality) {
    this.surface = new SurfacePlane(scene, surfaceKey('coastal'), WORLD_WIDTH + 100, -18).tint(0xa8b8c9);
    this.atmosphere = new SurfacePlane(scene, CLOUD_KEY, WORLD_WIDTH + 360, -12, true).alpha(.40).tint(0xb3d0df);
    this.nearVapor = new SurfacePlane(scene, CLOUD_KEY, WORLD_WIDTH + 900, 0, true).alpha(.18).tint(0xd4e7ef)
      .visible(quality !== 'low');
    this.nearVapor.update(550, 0);
    this.grade = scene.add.rectangle(WORLD_WIDTH/2,WORLD_HEIGHT/2,WORLD_WIDTH,WORLD_HEIGHT,0x020918,.18).setDepth(-11);
    this.structure = new StructuralPlane(scene);
    this.asteroidField = new AsteroidFieldView(scene, quality);
  }

  setMission(mission: MissionId): void {
    this.mission = mission;
    this.drift = 0;
    this.structure.reset();
    this.structure.visible(structuralPlaneEnabled(mission, window.location.search));
    this.asteroidField.setVisible(mission === 'lastLight');
    this.surface.visible(mission !== 'lastLight');
    this.atmosphere.visible(mission !== 'lastLight');
    this.nearVapor.visible(mission !== 'lastLight' && this.quality !== 'low');
    this.surface.setTexture(surfaceKey(mission));
    const space = mission === 'aurora' || mission === 'graveyard' || mission === 'dreadnought' || mission === 'carrierSiege' || mission === 'lastLight';
    this.surface.tint(space ? 0xb7b5c9 : 0xa8b8c9);
    this.atmosphere.tint(space ? 0xa5a6c2 : 0xb3d0df);
    this.grade.setFillStyle(space ? 0x060610 : 0x020918, space ? .12 : .18);
    if (mission === 'lastLight') {
      this.grade.setFillStyle(0x020611,.10);
    }
  }

  update(deltaMs: number, playerX: number, projectileDensity: number): void {
    const dt = Math.min(50, Math.max(0, deltaMs));
    this.drift += dt;
    const follow = (playerX-WORLD_WIDTH/2)/WORLD_WIDTH;
    this.pointerDrift += (follow-this.pointerDrift) * (1-Math.exp(-dt/700));
    // 28, 47 and 79 px/sec, enough separation to read altitude without distraction.
    this.surface.update(dt*.028, -this.pointerDrift*9);
    this.atmosphere.update(dt*.047, -this.pointerDrift*22 + Math.sin(this.drift*.00008)*18);
    this.nearVapor.update(dt*.079, -this.pointerDrift*38 + Math.sin(this.drift*.00011)*35);
    this.structure.update(dt, -this.pointerDrift*28);
    this.asteroidField.update(dt, this.pointerDrift, projectileDensity);
    const cloudVisibility = cloudLayerVisibility(this.mission, this.quality, projectileDensity);
    this.atmosphere.alpha(cloudVisibility.atmosphere);
    this.nearVapor.alpha(cloudVisibility.foreground);
  }

  destroy(): void {
    this.surface.destroy(); this.atmosphere.destroy(); this.nearVapor.destroy(); this.grade.destroy();
    this.structure.destroy(); this.asteroidField.destroy();
  }

  snapshot(): object {
    return { mission: this.mission, surface: this.surface.snapshot(), atmosphere: this.atmosphere.snapshot(), foreground: this.nearVapor.snapshot(), structure: this.structure.snapshot(), asteroidField: this.asteroidField.snapshot() };
  }
}
