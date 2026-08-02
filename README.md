# Aegis Vector

A polished, desktop-first 2D browser arcade shooter built with Phaser, TypeScript, and Vite.

**Live game:** <https://tiborianer.github.io/aegis-vector/>

## Play locally

```bash
npm install
npm run dev
```

Open the address printed by Vite. Choose a difficulty, launch, move with WASD or the arrow keys, hold Space or Z to fire, and press Escape to pause.

## Other commands

```bash
npm test
npm run build
```

Add `?debug=1` to the local URL for a shortened 28-second stage used during browser QA. In this mode, keys 1–5 grant the four weapon upgrades and shield capacity, B summons the boss, and H applies one test hit. Add `&hitboxes=1` to show collision bodies.

## Game rules

- The AV-7 begins with three hull points and a one-point rechargeable shield.
- Shield capacity can be upgraded to three points. A damaged shield fully recharges after seven seconds without another hit.
- Colored pickups upgrade the Arc Cannon, Nova Missiles, Lance Laser, Wing Drones, or Aegis shield.
- Weapon upgrades are retained when hit.
- The normal stage lasts approximately six minutes before the dreadnought arrives.
