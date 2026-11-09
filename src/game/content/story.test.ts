import { describe, expect, it } from 'vitest';
import {
  STORY_CHAPTERS,
  STORY_FIRST_PANEL_GUARD_MS,
  STORY_PANEL_GUARD_MS,
  STORY_SPEAKER_LABELS,
  storyAdvanceGuardMs,
  storyChapterForMission,
  getStoryChapter,
} from './story';
import { STORY_V5_FRAMES, storyV5Frame } from './storyV5';
import shotBriefs from '../../../docs/story/v5/image-prompts.json';

describe('story campaign mapping', () => {
  it('maps forty-five panels across every successful mission including Aurora and Last Light', () => {
    expect(STORY_CHAPTERS).toHaveLength(9);
    expect(STORY_CHAPTERS.reduce((total, chapter) => total + chapter.panels.length, 0)).toBe(45);
    expect(new Set(STORY_CHAPTERS.flatMap((chapter) => chapter.panels.map((panel) => panel.id))).size).toBe(45);
    expect(storyChapterForMission('lastLight')).toBe('homeward');
    expect(STORY_CHAPTERS.find((chapter) => chapter.id === 'homeward')?.musicTrack).toBe('ending');
    expect(STORY_CHAPTERS.find((chapter) => chapter.id === 'first-signal')?.panels).toHaveLength(6);
    expect(STORY_CHAPTERS.find((chapter) => chapter.id === 'warden-key')?.panels).toHaveLength(7);
  });
  it('authors distinct route visuals without mutating canonical or legacy chapters', () => {
    const before = JSON.stringify(STORY_CHAPTERS);
    expect(storyChapterForMission('aurora')).toBe('aurora-key');
    for (const id of ['forked-truth', 'rook-confession', 'last-vector', 'homeward'] as const) {
      const offense = getStoryChapter(id, 'salvage')!;
      const defense = getStoryChapter(id, 'storm')!;
      expect(offense.panels.map((p) => p.image)).not.toEqual(defense.panels.map((p) => p.image));
      expect(offense.panels.map((p) => p.id)).toEqual(defense.panels.map((p) => p.id));
      expect(offense.panels.map((p) => p.durationMs)).toEqual(defense.panels.map((p) => p.durationMs));
    }
    for (const route of ['salvage', 'storm'] as const) {
      expect(getStoryChapter('forked-truth', route)!.panels.some((p) => p.caption.includes('Choose your route'))).toBe(true);
    }
    expect(JSON.stringify(STORY_CHAPTERS)).toBe(before);
  });

  it.each([
    ['storm', 'storm'], ['storm', 'salvage'], ['salvage', 'storm'], ['salvage', 'salvage'],
  ] as const)('matches the %s reward history and independent %s evidence in all later chapters', (earlyRoute, evidenceRoute) => {
    const routes = { earlyRoute, evidenceRoute };
    const fork = getStoryChapter('forked-truth', routes);
    expect(fork.panels[0].image).toBe(earlyRoute === 'storm' ? 'story-v6/fortress-shield.webp' : 'story-v6/fortress-breach.webp');
    expect(fork.panels[0].caption).toContain(earlyRoute === 'storm' ? 'Aurora frequency' : 'ARC Resonator');
    expect(fork.panels[4].caption).toContain('Choose your route in the hangar');
    expect(fork.panels[4].caption).toContain('Stormbreak');
    expect(fork.panels[4].caption).toContain('Graveyard');
    expect(fork.panels.map((panel) => panel.caption).join(' ')).not.toContain('route is already open');
    expect(getStoryChapter('rook-confession', routes).panels[0].caption).toContain(evidenceRoute === 'storm' ? 'courier packet' : 'memory you recovered');
    const lastVector = getStoryChapter('last-vector', routes).panels[1];
    expect(lastVector.caption).toContain(evidenceRoute === 'storm' ? 'live directive' : 'recovered memory');
    expect(lastVector.image).toBe(fork.panels[0].image);
    const home = getStoryChapter('homeward', routes).panels[1];
    expect(home.caption).toContain(evidenceRoute === 'storm' ? 'intercepted order' : 'old command memory');
    expect(home.image).toBe(earlyRoute === 'storm' ? 'story-v6/aurora-vale.webp' : 'story-v5/warden-key/05.webp');
    if (earlyRoute === 'salvage') expect(`${home.caption} ${home.alt} ${home.location}`).not.toContain('Aurora');
  });

  it('does not invent an earned early reward for legacy late-route stories', () => {
    const routes = { evidenceRoute: 'storm' as const };
    expect(getStoryChapter('forked-truth', routes)).toEqual(getStoryChapter('forked-truth'));
    expect(getStoryChapter('last-vector', routes).panels[1].image).toBe(getStoryChapter('last-vector').panels[1].image);
    expect(getStoryChapter('rook-confession', routes).panels[0].caption).toContain('courier packet');
  });

  it('keeps both route revelations separate and converges afterward', () => {
    expect(storyChapterForMission('stormbreak')).toBe('stillwater-directive');
    expect(storyChapterForMission('graveyard')).toBe('project-crown');
    expect(storyChapterForMission('carrierSiege')).toBe('rook-confession');
    expect(STORY_CHAPTERS.find((chapter) => chapter.id === 'stillwater-directive')?.route).toBe('storm');
    expect(STORY_CHAPTERS.find((chapter) => chapter.id === 'project-crown')?.route).toBe('salvage');
  });

  it('names the selected Obsidian Crown consistently before and after the finale on every route', () => {
    for (const route of [undefined, 'salvage', 'storm'] as const) {
      expect(getStoryChapter('last-vector', route).panels[2].caption).toContain('Seraph guards Obsidian Crown');
      expect(getStoryChapter('homeward', route).panels[0].caption).toContain('Obsidian Crown’s signal is gone');
      for (const chapter of STORY_CHAPTERS) {
        const displayed = getStoryChapter(chapter.id, route);
        expect(displayed.panels.map((panel) => `${panel.caption} ${panel.alt}`).join(' '))
          .not.toMatch(/Null Architect|the Architect’s/i);
      }
    }
  });

  it('keeps text in accessible DOM bubbles and provides image descriptions', () => {
    for (const panel of STORY_CHAPTERS.flatMap((chapter) => chapter.panels)) {
      expect(panel.image.endsWith('.webp') || panel.image.endsWith('.jpg')).toBe(true);
      expect(panel.alt.length).toBeGreaterThan(30);
      expect(panel.caption.length).toBeGreaterThan(40);
      expect(panel.durationMs).toBeGreaterThanOrEqual(5_500);
    }
  });

  it('gives the first two chapters a discovery, reveal, and next objective', () => {
    const first = STORY_CHAPTERS.find((chapter) => chapter.id === 'first-signal')!;
    const second = STORY_CHAPTERS.find((chapter) => chapter.id === 'warden-key')!;
    expect(first.panels[0].caption).toContain('rescue');
    expect(first.panels.at(-1)!.caption).toContain('minefield');
    expect(second.panels[2].caption).toContain('missing conscience');
    expect(second.panels.at(-1)!.caption).toContain('fortress archive');
    expect(new Set(first.panels.map((panel) => panel.motion)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(second.panels.map((panel) => panel.motion)).size).toBeGreaterThanOrEqual(4);
  });

  it('uses the canonical Hana / Vale cast and never a narrator or retired identity', () => {
    const speakers = STORY_CHAPTERS.flatMap((chapter) => chapter.panels.map((panel) => panel.speaker));
    expect(new Set(speakers)).toEqual(new Set(['Hana', 'Vale', 'ECHO-7']));
    expect(speakers).not.toContain('Narrator');
    expect(STORY_SPEAKER_LABELS.Hana).toBe('HANA // VECTOR');
    expect(STORY_SPEAKER_LABELS.Vale).toBe('COMMANDER VALE');
    for (const chapter of STORY_CHAPTERS) {
      expect(chapter.title).not.toMatch(/\b(?:Mara|Rook|AV-7)\b/i);
      for (const panel of chapter.panels) {
        expect(`${panel.speaker} ${panel.caption} ${panel.alt} ${panel.location ?? ''}`)
          .not.toMatch(/\b(?:Mara|Rook|AV-7)\b/i);
        expect(panel.caption).not.toMatch(/Vector, Hana here|Vector and Hana|Hana and Vector|Mara\. Hana\./i);
      }
    }
  });

  it('makes Hana the player and Vale responsible for extraction without duplicating the reveal', () => {
    const fork = STORY_CHAPTERS.find((chapter) => chapter.id === 'forked-truth')!;
    const storm = STORY_CHAPTERS.find((chapter) => chapter.id === 'stillwater-directive')!;
    const salvage = STORY_CHAPTERS.find((chapter) => chapter.id === 'project-crown')!;
    const second = STORY_CHAPTERS.find((chapter) => chapter.id === 'warden-key')!;
    const confession = STORY_CHAPTERS.find((chapter) => chapter.id === 'rook-confession')!;
    const ending = STORY_CHAPTERS.find((chapter) => chapter.id === 'homeward')!;
    expect(fork.panels[0].caption).toContain('I am inside');
    expect(storm.panels[0].caption).toContain('My last pass');
    expect(salvage.panels[1].caption).toContain('Vale’s extraction');
    expect(second.panels[4].speaker).toBe('Vale');
    expect(second.panels[4].caption).toContain('I removed it');
    expect(confession.title).toBe("VALE'S CONFESSION");
    expect(confession.panels[1].caption).toContain('without telling you');
    expect(ending.panels[0].speaker).toBe('Hana');
    expect(ending.panels[0].caption).toContain('This is Vector, coming home');
  });

  it('ships all nineteen replacements with stable IDs and pacing', () => {
    const plannedChapters = ['first-signal', 'warden-key', 'rook-confession', 'last-vector'];
    const upgradedChapters = STORY_CHAPTERS.filter((chapter) => plannedChapters.includes(chapter.id));
    const currentPanels = upgradedChapters
      .flatMap((chapter) => chapter.panels);
    expect(shotBriefs.sceneJobs).toHaveLength(19);
    expect(new Set(shotBriefs.sceneJobs.map((job) => job.panelId)))
      .toEqual(new Set(currentPanels.map((panel) => panel.id)));
    expect(new Set(shotBriefs.sceneJobs.map((job) => job.output)).size).toBe(19);
    expect(Object.keys(STORY_V5_FRAMES)).toHaveLength(19);
    for (const chapter of upgradedChapters) {
      expect(chapter.presentation).toBe('cinematic');
      expect(chapter.musicTrack).toMatch(/^story-/);
    }
    for (const job of shotBriefs.sceneJobs) {
      const current = currentPanels.find((panel) => panel.id === job.panelId)!;
      expect(job.durationMs).toBe(current.durationMs);
      expect(job.output).toMatch(/^story-v5\/.+\/[0-9]{2}\.webp$/);
      expect(current.image).toBe(job.output);
      expect(current).toMatchObject(storyV5Frame(job.panelId));
      expect(current.location!.length).toBeGreaterThan(15);
      expect(current.transition).toBe('dissolve');
      expect(job.prompt.length).toBeGreaterThan(300);
      expect(job.prompt).not.toMatch(/\b(?:Mara|Rook|AV-7)\b/i);
      expect(job.refs.every((ref) => ref in shotBriefs.referenceLibrary)).toBe(true);
    }
  });

  it('never silently falls back to an old plate for a missing V5 frame', () => {
    expect(() => storyV5Frame('unknown-panel')).toThrow('Missing V5 frame metadata');
    expect(STORY_CHAPTERS.flatMap((chapter) => chapter.panels)
      .every((panel) => !panel.image.startsWith('story/') && !panel.image.startsWith('story-v2/'))).toBe(true);
  });

  it('keeps Hana remote in the bridge scene without changing its saved panel identity', () => {
    const fork = STORY_CHAPTERS.find((chapter) => chapter.id === 'forked-truth')!;
    expect(fork.panels.map((panel) => panel.id)).toEqual([
      'forked-truth-v3-01', 'forked-truth-v3-02', 'forked-truth-v3-04',
      'forked-truth-v3-03', 'forked-truth-v3-05', 'forked-truth-v3-06',
    ]);
    const bridge = fork.panels[3];
    expect(bridge.image).toBe('story-v3/forked-truth/03-v5.webp');
    expect(bridge.alt).toContain('translucent blue communications hologram');
    expect(bridge.speaker).toBe('Vale');
    expect(bridge.durationMs).toBe(11_000);
    expect(bridge.motion).toBe('drift-left');
  });

  it('protects mission transitions and subsequent panels from click-through', () => {
    expect(storyAdvanceGuardMs(0)).toBe(STORY_FIRST_PANEL_GUARD_MS);
    expect(storyAdvanceGuardMs(1)).toBe(STORY_PANEL_GUARD_MS);
    expect(STORY_FIRST_PANEL_GUARD_MS).toBeGreaterThan(STORY_PANEL_GUARD_MS);
    expect(STORY_PANEL_GUARD_MS).toBeGreaterThanOrEqual(600);
  });

  it('gives Mission 3 and BOTH Mission 4 routes new art, shot variety and longer reading time', () => {
    const chapters = STORY_CHAPTERS.filter((chapter) => ['fortress', 'stormbreak', 'graveyard'].includes(chapter.afterMission));
    expect(chapters.map((chapter) => chapter.afterMission)).toEqual(['fortress', 'stormbreak', 'graveyard']);
    for (const chapter of chapters) {
      expect(chapter.panels).toHaveLength(6);
      expect(chapter.musicTrack).toMatch(/^story-/);
      expect(chapter.panels.reduce((sum, panel) => sum + panel.durationMs, 0)).toBe(66_000);
      expect(new Set(chapter.panels.map((panel) => panel.shot)).size).toBeGreaterThanOrEqual(4);
      expect(new Set(chapter.panels.map((panel) => panel.motion)).size).toBe(4);
      chapter.panels.forEach((panel, index) => {
        expect(panel.image.startsWith(`story-v3/${chapter.id}/`)).toBe(true);
        expect(panel.location!.length).toBeGreaterThan(15);
        if (index > 0) expect(panel.shot).not.toBe(chapter.panels[index - 1].shot);
      });
    }
  });

  it('leaves route choice in the hangar and converges both revelations on the carrier', () => {
    const fork = STORY_CHAPTERS.find((chapter) => chapter.id === 'forked-truth')!;
    expect(fork.panels.some((panel) => panel.caption.includes('Choose your route in the hangar'))).toBe(true);
    for (const id of ['stillwater-directive', 'project-crown']) {
      expect(STORY_CHAPTERS.find((chapter) => chapter.id === id)!.panels.at(-1)!.caption.toLowerCase()).toContain('carrier');
    }
  });
});
