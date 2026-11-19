// Both ends see the same ordered fire-button transitions on the existing room connection.
// A burst starts at a new press, so a rejected tap cannot offset later shot identities.
export interface WingArcState {
  session: number;
  press: number;
  volley: number;
  held: boolean;
  intervalMs: number;
  split: boolean;
  overdrive: boolean;
  helios: boolean;
  total: number;
  chargeMs?: number;
}

export type ArcPart = [id: string, pellet: number]; // -1 identifies the muzzle flash.
export const ARC_BOLT_SPEED = 940;
export const arcInterval = (base: number, scale: number) => Math.max(62, base * scale);

export type ChargeLevel = 0 | 1 | 2;
export class ArcCharge {
  elapsedMs = 0;
  get level(): ChargeLevel { return this.elapsedMs >= 1200 ? 2 : this.elapsedMs >= 450 ? 1 : 0; }
  advance(delta: number, firing: boolean): void {
    if (!firing) this.elapsedMs = Math.min(1200, this.elapsedMs + Math.max(0, delta));
  }
  spend(): ChargeLevel {
    const level = this.level;
    this.elapsedMs = 0;
    return level;
  }
}

export const isLightArcTarget = (kind: string) => kind === 'scout' || kind === 'interceptor' || kind === 'charger';
export function arcPattern(angles: number[], split: boolean, charge: ChargeLevel = 0) {
  const center = Math.floor((angles.length - 1) / 2);
  const bolts = angles.map((angle, index) => ({
    angle: index === center && charge ? 0 : angle, x: 0, y: -42, charge: index === center ? charge : 0 as ChargeLevel,
  }));
  if (split) bolts.push({ angle: 0, x: 8, y: -40, charge: 0 });
  return bolts;
}
export function chargedBoltScale(charge: ChargeLevel): [number, number] {
  return charge === 2 ? [1.95, 1.42] : charge === 1 ? [1.42, 1.2] : [1, 1];
}

export class WingArcTrigger {
  session = 0;
  press = 0;
  volley = 0;
  held = false;
  private tapped = false;
  private sounds = new Set<string>();

  connect(): void {
    this.session++;
    this.press = this.volley = 0;
    this.held = this.tapped = false;
    this.sounds.clear();
  }

  set(down: boolean, inFlight: boolean): void {
    if (this.held === down) return;
    this.held = down;
    if (down) {
      this.press++;
      this.volley = 0;
      this.tapped = inFlight;
    }
  }

  get awaitingRelease(): boolean { return this.held || this.tapped; }

  takeTap(): boolean {
    const tapped = this.tapped;
    this.tapped = false;
    return tapped;
  }

  next(session: number): string { return [session, this.press, ++this.volley].join('/'); }

  // A confirmation can precede the local animation on a slow-rendering guest.
  synchronize(state: WingArcState): void {
    if (this.press === state.press) this.volley = Math.max(this.volley, state.volley);
  }

  firstSound(id: string): boolean {
    if (this.sounds.has(id)) return false;
    this.sounds.add(id);
    if (this.sounds.size > 256) this.sounds.delete(this.sounds.values().next().value!);
    return true;
  }
}

export const wingArcTrigger = new WingArcTrigger();
