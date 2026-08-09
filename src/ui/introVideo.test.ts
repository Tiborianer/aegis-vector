import { describe, expect, it } from 'vitest';
import {
  INTRO_VIDEO,
  formatIntroTime,
  introCaptionAt,
  introMetadataIsValid,
} from './introVideo';

describe('uploaded opening cinematic', () => {
  it('maps the approved versioned MP4 and web size limit', () => {
    expect(INTRO_VIDEO.file).toBe('cinematics/video/aegis-vector-intro-v1.mp4');
    expect(INTRO_VIDEO.maximumBytes).toBe(50 * 1024 * 1024);
    expect(INTRO_VIDEO.hasBakedAudio).toBe(true);
  });

  it('formats the complete exported timeline', () => {
    expect(formatIntroTime(0)).toBe('00:00 / 00:34');
    expect(formatIntroTime(12.9)).toBe('00:12 / 00:34');
    expect(formatIntroTime(50)).toBe('00:34 / 00:34');
  });

  it('shows the known Rook caption only during its cue', () => {
    expect(introCaptionAt(6.5)?.speaker).toBe('ROOK');
    expect(introCaptionAt(6.5)?.text).toContain('CROWN is awake');
    expect(introCaptionAt(5.9)).toBeUndefined();
    expect(introCaptionAt(9)).toBeUndefined();
  });

  it('accepts only the approved duration and minimum resolution', () => {
    expect(introMetadataIsValid(34.02, 1920, 1080)).toBe(true);
    expect(introMetadataIsValid(26.03, 1920, 1080)).toBe(false);
    expect(introMetadataIsValid(34.02, 1280, 720)).toBe(false);
  });
});
