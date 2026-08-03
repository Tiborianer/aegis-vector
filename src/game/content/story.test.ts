import { describe, expect, it } from 'vitest';
import { STORY_CHAPTERS, storyChapterForMission } from './story';

describe('story campaign mapping', () => {
  it('maps exactly twenty panels across every successful mission', () => {
    expect(STORY_CHAPTERS).toHaveLength(7);
    expect(STORY_CHAPTERS.reduce((total, chapter) => total + chapter.panels.length, 0)).toBe(20);
    expect(new Set(STORY_CHAPTERS.flatMap((chapter) => chapter.panels.map((panel) => panel.id))).size).toBe(20);
  });

  it('keeps both route revelations separate and converges afterward', () => {
    expect(storyChapterForMission('stormbreak')).toBe('stillwater-directive');
    expect(storyChapterForMission('graveyard')).toBe('project-crown');
    expect(storyChapterForMission('carrierSiege')).toBe('rook-confession');
    expect(STORY_CHAPTERS.find((chapter) => chapter.id === 'stillwater-directive')?.route).toBe('storm');
    expect(STORY_CHAPTERS.find((chapter) => chapter.id === 'project-crown')?.route).toBe('salvage');
  });

  it('keeps all captions outside artwork and provides accessibility text', () => {
    for (const panel of STORY_CHAPTERS.flatMap((chapter) => chapter.panels)) {
      expect(panel.image.endsWith('.webp')).toBe(true);
      expect(panel.alt.length).toBeGreaterThan(30);
      expect(panel.caption.length).toBeGreaterThan(10);
    }
  });
});
