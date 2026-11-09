import { describe, expect, it } from 'vitest';
import { createFlightMotion, stepFlightMotion, steerVelocity, type FlightBody } from './flightMotion';

describe('purposeful enemy flight', () => {
  it('starts combat at the exact entry position with bounded acceleration', () => {
    const body = { x: 610, y: 126, vx: 0, vy: 110 };
    const flight = createFlightMotion('strike', 7, body);
    const result = stepFlightMotion(flight, body, 16);
    expect(body).toEqual({ x: 610, y: 126, vx: 0, vy: 110 });
    expect(Math.hypot(result.vx - body.vx, result.vy - body.vy)).toBeLessThanOrEqual(2.401);
  });
  it('is deterministic and never depends on health or damage', () => {
    const body = { x: 600, y: 150, vx: 0, vy: 0 };
    const flight = createFlightMotion('command', 17, body);
    expect(stepFlightMotion(flight, body, 16)).toEqual(stepFlightMotion({ ...flight }, { ...body }, 16));
    expect(createFlightMotion('command', 18, body)).not.toEqual(flight);
  });
  it('brakes during an aiming window and resumes without a position jump', () => {
    let body = { x: 600, y: 150, vx: 50, vy: 25 };
    const flight = createFlightMotion('artillery', 4, body);
    for (let i = 0; i < 120; i++) {
      const result = stepFlightMotion(flight, body, 16, true);
      expect(result.state).toEqual(flight);
      body = { x: body.x + result.vx * .016, y: body.y + result.vy * .016, vx: result.vx, vy: result.vy };
    }
    expect(Math.hypot(body.vx, body.vy)).toBeLessThan(.001);
    const resumed = stepFlightMotion(flight, body, 16);
    expect(Math.hypot(resumed.vx, resumed.vy)).toBeLessThanOrEqual(1.361);
  });
  it('advances through the screen instead of endlessly oscillating on one line', () => {
    let body: FlightBody = { x: 600, y: 140, vx: 0, vy: 50 };
    let flight = createFlightMotion('strike', 21, body);
    for (let i = 0; i < 2500; i++) {
      const result = stepFlightMotion(flight, body, 16);
      expect(Math.hypot(result.vx - body.vx, result.vy - body.vy)).toBeLessThanOrEqual(2.401);
      flight = result.state;
      body = { x: body.x + result.vx * .016, y: body.y + result.vy * .016, vx: result.vx, vy: result.vy };
    }
    expect(body.y).toBeGreaterThan(830);
    expect(flight.leg).toBeGreaterThan(3);
  });
  it('gives command ships vertical depth changes without leaving the combat band', () => {
    let body: FlightBody = { x: 600, y: 125, vx: 0, vy: 0 };
    let flight = createFlightMotion('command', 12, body);
    let minY = body.y, maxY = body.y;
    for (let i = 0; i < 10000; i++) {
      const result = stepFlightMotion(flight, body, 16);
      flight = result.state;
      body = { x: body.x + result.vx * .016, y: body.y + result.vy * .016, vx: result.vx, vy: result.vy };
      minY = Math.min(minY, body.y); maxY = Math.max(maxY, body.y);
      expect(body.x).toBeGreaterThan(155); expect(body.x).toBeLessThan(1125);
      expect(body.y).toBeGreaterThan(100); expect(body.y).toBeLessThan(200);
    }
    expect(maxY - minY).toBeGreaterThan(20);
  });
  it('bounds a large-frame recovery and pickup pursuit velocity change', () => {
    const result = steerVelocity({ x: 400, y: 250, vx: -100, vy: 0 }, 900, 500, 4000, 120, 180);
    expect(Math.hypot(result.vx + 100, result.vy)).toBeLessThanOrEqual(9.001);
  });
  it('rounds a fast attack pass into a safe recovery without an instant reversal', () => {
    let body: FlightBody = { x: 600, y: 435, vx: 0, vy: 460 };
    let maxY = body.y;
    for (let frame = 0; frame < 500; frame++) {
      const next = steerVelocity(body, 600, 155, 16, 260, 750);
      expect(Math.hypot(next.vx - body.vx, next.vy - body.vy)).toBeLessThanOrEqual(12.001);
      body = { x: body.x + next.vx * .016, y: body.y + next.vy * .016, ...next };
      maxY = Math.max(maxY, body.y);
    }
    expect(maxY).toBeLessThan(590);
    expect(body.y).toBeGreaterThan(140);
    expect(body.y).toBeLessThan(177);
  });
  it.each(['skimmer', 'weaver', 'prism', 'leech'] as const)('keeps %s attack/reposition passes smooth and advancing', (profile) => {
    let body: FlightBody = { x: 320, y: 115, vx: 0, vy: 100 };
    let flight = createFlightMotion(profile, 87, body);
    let maxX = body.x, minX = body.x;
    for (let frame = 0; frame < 1400; frame++) {
      const result = stepFlightMotion(flight, body, 16, frame % 220 < 50);
      expect(Math.hypot(result.vx - body.vx, result.vy - body.vy)).toBeLessThanOrEqual(3.361);
      flight = result.state;
      body = { x: body.x + result.vx * .016, y: body.y + result.vy * .016, vx: result.vx, vy: result.vy };
      maxX = Math.max(maxX, body.x);
      minX = Math.min(minX, body.x);
      expect(body.x).toBeGreaterThan(70);
      expect(body.x).toBeLessThan(1210);
    }
    expect(body.y).toBeGreaterThan(280);
    expect(maxX - minX).toBeGreaterThan(100);
  });
});
