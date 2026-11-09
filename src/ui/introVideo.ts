export interface IntroVideoDefinition {
  file: string;
  poster: string;
  expectedDurationSeconds: number;
  maximumBytes: number;
  hasBakedAudio: true;
}

export type IntroPlaybackState =
  | 'preloading'
  | 'buffering'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'fallback'
  | 'complete';

export interface IntroCaption {
  startsAtSeconds: number;
  endsAtSeconds: number;
  speaker: 'VALE';
  text: string;
}

export const INTRO_VIDEO: IntroVideoDefinition = {
  file: 'cinematics/video/aegis-vector-intro-v2.mp4',
  poster: 'cinematics/keyframes/scene-01-start.webp',
  expectedDurationSeconds: 96.87,
  maximumBytes: 95 * 1024 * 1024,
  hasBakedAudio: true,
};

// The new authored edit contains its own complete dialogue and titles. Add
// timed DOM captions here only after an exact transcript has been approved.
export const INTRO_CAPTIONS: readonly IntroCaption[] = [] as const;

export function formatIntroTime(currentSeconds: number, durationSeconds = INTRO_VIDEO.expectedDurationSeconds): string {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : INTRO_VIDEO.expectedDurationSeconds;
  const safeCurrent = Math.min(safeDuration, Math.max(0, Number.isFinite(currentSeconds) ? currentSeconds : 0));
  const format = (rounded: number): string => {
    return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
  };
  const totalDisplay = Math.round(safeDuration);
  const currentDisplay = safeCurrent >= safeDuration - 0.5 ? totalDisplay : Math.floor(safeCurrent);
  return `${format(currentDisplay)} / ${format(totalDisplay)}`;
}

export function introCaptionAt(seconds: number): IntroCaption | undefined {
  return INTRO_CAPTIONS.find((caption) => seconds >= caption.startsAtSeconds && seconds < caption.endsAtSeconds);
}

export function introMetadataIsValid(durationSeconds: number, width: number, height: number): boolean {
  return durationSeconds >= 96.6
    && durationSeconds <= 97.2
    && width >= 1280
    && height >= 720;
}
