import { describe, expect, it } from 'vitest';
import { DESKTOP_PUBLIC_ASSETS, isDesktopAsset } from './desktop-assets.mjs';
import { MUSIC_ASSETS, VOICE_ASSETS } from '../src/audio/SoundEngine';
import { getStoryChapter, STORY_CHAPTERS } from '../src/game/content/story';
import { SHIP_SIZES, ENVIRONMENT_IDS, environmentAsset } from '../src/game/assets/visuals';
import { UPGRADE_NODES } from '../src/game/content/upgrades';
import { SORTIE_MODULES } from '../src/game/content/sortieModules';
import { INTRO_VIDEO } from '../src/ui/introVideo';
import radioFiles from '../src/audio/radio-files.json';
import { REQUIRED_RADIO_FILES } from './verify-radio-audio.mjs';

const clean = (file) => file.replace(/^\.\//, '');
const uniqueSorted = (files) => [...new Set(files.map(clean))].sort();

describe('desktop asset contract against actual runtime catalogues', () => {
  it('contains exactly the currently mapped story panels, including both route cuts and legacy Archive replay', () => {
    const story = uniqueSorted(STORY_CHAPTERS.flatMap((chapter) => [undefined, 'storm', 'salvage']
      .flatMap((route) => getStoryChapter(chapter.id, route).panels.map((panel) => panel.image))));
    expect(story).toHaveLength(46);
    expect(DESKTOP_PUBLIC_ASSETS.filter((file) => file.startsWith('story')).sort()).toEqual(story);
  });

  it('ships the new Aurora route visuals and six approved scores without retained originals', () => {
    const newFiles = [
      ...['aurora-arrival', 'aurora-hana', 'aurora-vale', 'fortress-breach', 'fortress-shield'].map((name) => `story-v6/${name}.webp`),
      'graphics-v2/environments/aurora.webp', 'graphics-v2/ships/prism.png', 'graphics-v2/ships/leech.png',
      'graphics-v2/modules/crown-turret.png',
      'graphics-v2/modules/crown-turret.json',
      'graphics-v2/modules/seraph-wing-left.png', 'graphics-v2/modules/seraph-wing-right.png', 'graphics-v2/modules/seraph-wings.json',
    ];
    expect(newFiles).toHaveLength(13);
    for (const file of newFiles) expect(isDesktopAsset(file), file).toBe(true);
    for (const mission of ['stormbreak', 'graveyard', 'carrier-siege', 'dreadnought', 'last-light']) {
      expect(isDesktopAsset(`audio/missions/mission-${mission}-v1.mp3`)).toBe(false);
      expect(isDesktopAsset(`audio/missions/mission-${mission}-v2.mp3`)).toBe(true);
    }
    expect(isDesktopAsset('audio/missions/mission-aurora-v1.mp3')).toBe(true);
    expect(isDesktopAsset('audio/missions/mission-aurora-review.mp3')).toBe(false);
  });

  it('covers the real music, intro, ships, environments and reused upgrade icons', () => {
    const required = uniqueSorted([
      ...Object.values(MUSIC_ASSETS).flatMap((track) => track.files),
      INTRO_VIDEO.file, INTRO_VIDEO.poster,
      ...Object.keys(SHIP_SIZES).map((kind) => `graphics-v2/ships/${kind}.png`),
      ...ENVIRONMENT_IDS.map(environmentAsset), 'graphics-v2/environments/cirrus.webp',
      ...UPGRADE_NODES.map((node) => node.icon), ...SORTIE_MODULES.map((module) => module.icon),
    ]);
    expect(required.filter((file) => !DESKTOP_PUBLIC_ASSETS.includes(file))).toEqual([]);
    expect(DESKTOP_PUBLIC_ASSETS.filter((file) => file.startsWith('audio/') && file.endsWith('.mp3')).sort())
      .toEqual(uniqueSorted(Object.values(MUSIC_ASSETS).flatMap((track) => track.files)));
    expect(DESKTOP_PUBLIC_ASSETS.filter((file) => file.startsWith('ui/upgrades/')).sort())
      .toEqual(uniqueSorted([...UPGRADE_NODES.map((node) => node.icon), ...SORTIE_MODULES.map((module) => module.icon)]));
  });

  it('requires one new versioned recording for every radio cue without shipping held originals', () => {
    expect(DESKTOP_PUBLIC_ASSETS.filter((file) => file.startsWith('audio/voice')).sort())
      .toEqual(Object.values(VOICE_ASSETS).map((voice) => voice.file).sort());
    expect(Object.values(VOICE_ASSETS).map((voice) => voice.file).sort()).toEqual(Object.values(radioFiles).sort());
    expect([...REQUIRED_RADIO_FILES].sort()).toEqual(Object.values(radioFiles).sort());
    expect(DESKTOP_PUBLIC_ASSETS).toContain('audio/voice-v3/arc-upgraded.wav');
    expect(DESKTOP_PUBLIC_ASSETS).toContain('audio/voice-v4/ion-upgraded.wav');
    expect(DESKTOP_PUBLIC_ASSETS).toContain('audio/voice-v5/shield-hit.wav');
    expect(DESKTOP_PUBLIC_ASSETS).not.toContain('audio/voice-v2/ion-upgraded.wav');
    expect(DESKTOP_PUBLIC_ASSETS).not.toContain('audio/voice-v2/arc-upgraded.wav');
    expect(DESKTOP_PUBLIC_ASSETS).not.toContain('audio/voice-v3/ion-upgraded.wav');
    expect(Object.values(VOICE_ASSETS).filter((voice) => voice.speaker === 'Vale')).toHaveLength(6);
    expect(Object.values(VOICE_ASSETS).filter((voice) => voice.speaker === 'ECHO-7')).toHaveLength(5);
    expect(DESKTOP_PUBLIC_ASSETS.some((file) => file.startsWith('audio/voice/'))).toBe(false);
  });
});
