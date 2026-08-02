# Aegis Vector

A polished, desktop-first 2D browser arcade campaign built with Phaser, TypeScript, and Vite.

**Live game:** <https://tiborianer.github.io/aegis-vector/>

## Play locally

```bash
npm install
npm run dev
```

Open the address printed by Vite. Choose a difficulty, launch, move with WASD or the arrow keys, hold Space or Z to fire, press X to discharge an EMP, and press Escape to pause.

## Other commands

```bash
npm test
npm run build
```

Add `?debug=1` to the local URL for shortened 24-second missions used during browser QA. In this mode, keys 1–5 grant the four weapon upgrades and shield capacity, 6 grants an EMP cell, N cycles specialist spawns, V summons the Warden, B summons the Dreadnought, H applies one test hit, and C completes the active mission with test salvage. Add `&hitboxes=1` to show collision bodies.

## Game rules

- A campaign contains three 3–4 minute missions and a separate Dreadnought finale.
- Destroyed enemies award Aegis Credits that can be spent in the between-mission upgrade tree.
- Weapon and shield pickups carry across the current campaign; Repair, Overdrive, Tractor, and EMP pickups provide tactical support.
- The one-hit rechargeable shield can grow to three points and normally recharges after seven seconds without damage.
- Failed missions restore the pre-mission checkpoint, preventing failed-attempt credit farming.
- Campaign progress is saved locally between missions and restored after a refresh.

## Optional ElevenLabs music

The game looks for the following optional files in `public/audio/`:

```text
menu.mp3
mission.mp3
boss.mp3
victory.mp3
defeat.mp3
```

Until those files are added, the audio engine automatically uses the built-in synthesized music bed and sound effects. Ready-to-paste generation prompts are in `ELEVENLABS_PROMPTS.md`.
