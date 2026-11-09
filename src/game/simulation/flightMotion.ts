/** Intentional flight legs, not a position oscillator. Damage is not an input. */
export type FlightProfile = 'sweep' | 'strike' | 'escort' | 'mine-run' | 'artillery' | 'command' | 'ace' | 'skimmer' | 'weaver' | 'prism' | 'leech';
export interface FlightMotion {
  profile: FlightProfile;
  seed: number;
  leg: number;
  targetX: number;
  targetY: number;
  waitingMs: number;
}
export interface FlightBody { x: number; y: number; vx: number; vy: number }
const PROFILES = {
  sweep: { speed: 165, acceleration: 230, reach: 180, advance: 230, dwell: 0 },
  strike: { speed: 105, acceleration: 150, reach: 210, advance: 140, dwell: 650 },
  escort: { speed: 76, acceleration: 110, reach: 150, advance: 105, dwell: 700 },
  'mine-run': { speed: 115, acceleration: 150, reach: 320, advance: 100, dwell: 400 },
  artillery: { speed: 58, acceleration: 85, reach: 140, advance: 48, dwell: 1500 },
  command: { speed: 72, acceleration: 85, reach: 260, advance: 0, dwell: 1100 },
  ace: { speed: 130, acceleration: 210, reach: 310, advance: 0, dwell: 550 },
  skimmer: { speed: 155, acceleration: 210, reach: 440, advance: 210, dwell: 120 },
  weaver: { speed: 72, acceleration: 100, reach: 290, advance: 125, dwell: 550 },
  prism: { speed: 110, acceleration: 155, reach: 270, advance: 165, dwell: 200 },
  leech: { speed: 68, acceleration: 90, reach: 185, advance: 145, dwell: 850 },
} as const;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const sample = (seed: number, salt: number): number => {
  const value = Math.sin(seed * 31.73 + salt * 73.17) * 43758.5453;
  return value - Math.floor(value);
};

function nextTarget(state: FlightMotion, body: FlightBody): FlightMotion {
  const config = PROFILES[state.profile];
  const direction = sample(state.seed, state.leg * 5) > .5 ? 1 : -1;
  const reach = config.reach * (.65 + sample(state.seed, state.leg * 5 + 1) * .35);
  // Change heading only at deliberate destinations; a near-edge craft turns inward.
  const inward = body.x < 220 ? 1 : body.x > 1060 ? -1 : direction;
  const stationed = state.profile === 'command' || state.profile === 'ace';
  return { ...state, leg: state.leg + 1, waitingMs: -1,
    targetX: clamp(body.x + reach * inward, stationed ? 180 : 90, stationed ? 1100 : 1190),
    targetY: stationed
      ? 115 + sample(state.seed, state.leg * 5 + 2) * (state.profile === 'ace' ? 100 : 65)
      : body.y + config.advance * (.8 + sample(state.seed, state.leg * 5 + 3) * .4),
  };
}

export function createFlightMotion(profile: FlightProfile, seed: number, body: FlightBody): FlightMotion {
  return nextTarget({ profile, seed, leg: 0, targetX: body.x, targetY: body.y, waitingMs: -1 }, body);
}

/** Acceleration is vector-bounded; this never teleports or resets a position. */
export function steerVelocity(body: FlightBody, targetX: number, targetY: number,
  deltaMs: number, speed: number, acceleration: number, hold = false): { vx: number; vy: number } {
  const dt = clamp(deltaMs, 0, 50) / 1000;
  const dx = targetX - body.x, dy = targetY - body.y;
  const distance = Math.hypot(dx, dy);
  const desiredSpeed = hold ? 0 : Math.min(speed, distance * 1.25);
  const vx = distance > .01 ? dx / distance * desiredSpeed : 0;
  const vy = distance > .01 ? dy / distance * desiredSpeed : 0;
  const change = Math.hypot(vx - body.vx, vy - body.vy);
  const factor = change > 0 ? Math.min(1, acceleration * dt / change) : 0;
  return { vx: body.vx + (vx - body.vx) * factor, vy: body.vy + (vy - body.vy) * factor };
}

export function stepFlightMotion(state: FlightMotion, body: FlightBody, deltaMs: number,
  hold = false, speedScale = 1): { state: FlightMotion; vx: number; vy: number } {
  const config = PROFILES[state.profile];
  let next = state;
  if (!hold) {
    if (state.waitingMs >= 0) {
      next = { ...state, waitingMs: Math.max(0, state.waitingMs - Math.max(0, deltaMs)) };
      if (next.waitingMs === 0) next = nextTarget(next, body);
    } else if (Math.hypot(body.x - state.targetX, body.y - state.targetY) < 18) {
      next = config.dwell ? { ...state, waitingMs: config.dwell } : nextTarget(state, body);
    }
  }
  const velocity = steerVelocity(body, next.targetX, next.targetY, deltaMs,
    config.speed * speedScale, config.acceleration * speedScale, hold || next.waitingMs >= 0);
  return { state: next, ...velocity };
}
