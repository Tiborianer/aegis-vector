# Soundtrack files

The campaign uses these supplied ElevenLabs exports:

- `menu.mp3`
- `hangar.mp3`
- `mission-coastal.mp3`
- `mission-minefield.mp3`
- `mission-fortress.mp3`
- `boss.mp3`
- `boss-mech-tyrants.mp3`
- `victory-coastal.mp3`
- `victory-minefield.mp3`
- `victory-fortress.mp3`
- `victory-campaign.mp3`
- `defeat-signal.mp3`
- `defeat-debrief.mp3`

The browser build loads MP3 files for broad hosting compatibility. Long-form tracks loop and crossfade. The two boss tracks are selected deterministically from the campaign seed, keeping retries consistent while varying new campaigns. Victory stings bridge mission-complete screens into the hangar, and defeat stings alternate per failed attempt. Every mapped file is required: production builds fail when one is missing or empty, while runtime loading errors leave SFX working and report `MUSIC UNAVAILABLE` instead of playing a synthesized hum.
