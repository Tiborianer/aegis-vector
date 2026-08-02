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

Add `?debug=1` to the local URL to enable browser QA controls while preserving full mission pacing and ordinary player damage. In this mode, keys 1–5 grant ARC, NOVA, LANCE, WING, and shield capacity, I grants ION, O grants Overdrive, 6 grants an EMP cell, N cycles every specialist including the Bulwark, V summons the Warden, B summons the Dreadnought, H applies one test hit, and C completes the active mission with test salvage. Add `&quick=1` only when a shortened 24-second mission is needed, `&collisionDebug=1` to show compound collision zones, or `&god=1` for focused invulnerability testing. Add `&quality=high`, `balanced`, or `low` to override adaptive graphics quality. The debug-only `&audioTrack=mission-coastal` selector can hold a mapped soundtrack on the menu for loop diagnostics.

## Game rules

- A campaign contains three 3–4 minute missions and a separate Dreadnought finale.
- Destroyed enemies award Aegis Credits that can be spent in the between-mission upgrade tree.
- Five-level ARC, NOVA, LANCE, WING, and ION systems carry across the campaign. Rare gold Armament Carriers drop deterministic two-choice upgrades; normal enemies drop only tactical utilities.
- The one-hit rechargeable shield can grow to three points and normally recharges after seven seconds without damage.
- Every mission rises through five deterministic threat levels while attack warnings keep their full readable timing. Minefield Run introduces the armored Bulwark Gunship and its destructible wing reactors.
- Failed missions restore the pre-mission checkpoint, preventing failed-attempt credit farming.
- Campaign progress is saved locally between missions and restored after a refresh.

## ElevenLabs music

The supplied soundtrack is mapped by campaign state:

```text
menu.mp3                 title screen
hangar.mp3               between-mission hangar
mission-coastal.mp3      Mission 1
mission-minefield.mp3    Mission 2
mission-fortress.mp3     Mission 3
boss.mp3                 Dreadnought finale
boss-mech-tyrants.mp3    Alternate Dreadnought finale
victory-coastal.mp3      Mission 1 completion
victory-minefield.mp3    Mission 2 completion
victory-fortress.mp3     Mission 3 completion
victory-campaign.mp3     Campaign victory
defeat-signal.mp3        Alternating failure sting
defeat-debrief.mp3       Alternating failure sting
```

All long-form tracks loop and crossfade in Web Audio. The two Dreadnought tracks alternate deterministically with the campaign seed, so retries preserve the same musical identity while new campaigns provide variation. Mission victory stings continue over the hangar report before blending into hangar music, while defeat stings alternate between failed attempts. The production build fails if a mapped file is absent, and a runtime loading error is shown as `MUSIC UNAVAILABLE` without playing a synthesized hum. The debug-only `?audioSynth=1` option retains a quiet oscillator fallback for diagnostics. Ready-to-paste regeneration prompts are in `ELEVENLABS_PROMPTS.md`.
