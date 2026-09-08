import { describe, expect, it } from 'vitest';
import {
  INTRO_VIDEO,
  formatIntroTime,
  introCaptionAt,
  introMetadataIsValid,
} from './introVideo';

describe('uploaded opening cinematic', () => {
  it('maps the approved versioned MP4 and web size limit', () => {
    expect(INTRO_VIDEO.file).toBe('cinematics/video/aegis-vector-intro-v2.mp4');
    expect(INTRO_VIDEO.maximumBytes).toBe(95 * 1024 * 1024);
    expect(INTRO_VIDEO.hasBakedAudio).toBe(true);
  });

  it('formats the complete exported timeline', () => {
    expect(formatIntroTime(0)).toBe('00:00 / 01:37');
    expect(formatIntroTime(50.9)).toBe('00:50 / 01:37');
    expect(formatIntroTime(120)).toBe('01:37 / 01:37');
  });

  it('does not overlay obsolete captions on the authored edit', () => {
    expect(introCaptionAt(6.5)).toBeUndefined();
    expect(introCaptionAt(96)).toBeUndefined();
  });

  it('accepts only the approved duration and minimum resolution', () => {
    expect(introMetadataIsValid(96.87, 1280, 720)).toBe(true);
    expect(introMetadataIsValid(34.02, 1920, 1080)).toBe(false);
    expect(introMetadataIsValid(96.87, 960, 540)).toBe(false);
  });
});
