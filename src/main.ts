import Phaser from 'phaser';
import './styles.css';
import { SoundEngine, type RadioCue, type SoundCue, type SoundRequest } from './audio/SoundEngine';
import { UPGRADE_BRANCHES, UPGRADE_NODES } from './game/content/upgrades';
import { SORTIE_MODULES } from './game/content/sortieModules';
import { WEAPON_LABELS, WORLD_HEIGHT, WORLD_WIDTH } from './game/content/balance';
import { chooseArmamentOffer } from './game/content/pickups';
import { globalCarrierIndex } from './game/content/encounters';
import { CampaignModel } from './game/simulation/CampaignModel';
import { getStoryChapter, STORY_CHAPTERS } from './game/content/story';
import { droneStatus } from './game/content/drones';
import type {
  CampaignSnapshot,
  Difficulty,
  GameSnapshot,
  AudioDebugState,
  CampaignRoute,
  EnemyKind,
  MusicTrack,
  SortieModuleId,
  UpgradeBranch,
  UpgradeNodeId,
  WeaponType,
  StoryChapter,
  StoryChapterId,
} from './game/simulation/types';
import { BootScene } from './phaser/scenes/BootScene';
import { BattleScene } from './phaser/scenes/BattleScene';
import {
  INTRO_VIDEO,
  formatIntroTime,
  introCaptionAt,
  introMetadataIsValid,
  type IntroPlaybackState,
} from './ui/introVideo';

const CAMPAIGN_SAVE_KEY = 'aegis-vector-campaign-v1';
const STORY_ARCHIVE_KEY = 'aegis-vector-story-archive-v1';

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required UI element: #${id}`);
  return element as T;
};

const ui = {
  hud: required<HTMLElement>('hud'),
  start: required<HTMLElement>('start-screen'),
  hangar: required<HTMLElement>('hangar-screen'),
  pause: required<HTMLElement>('pause-screen'),
  result: required<HTMLElement>('result-screen'),
  launch: required<HTMLButtonElement>('launch-button'),
  continue: required<HTMLButtonElement>('continue-button'),
  hangarLaunch: required<HTMLButtonElement>('hangar-launch-button'),
  resume: required<HTMLButtonElement>('resume-button'),
  restart: required<HTMLButtonElement>('restart-button'),
  resultAction: required<HTMLButtonElement>('result-action-button'),
  pauseButton: required<HTMLButtonElement>('pause-button'),
  empButton: required<HTMLButtonElement>('emp-button'),
  respec: required<HTMLButtonElement>('respec-button'),
  hangarAbandon: required<HTMLButtonElement>('hangar-abandon-button'),
  pauseAbandon: required<HTMLButtonElement>('pause-abandon-button'),
  resultAbandon: required<HTMLButtonElement>('result-abandon-button'),
  audioButton: required<HTMLButtonElement>('audio-button'),
  audioPanel: required<HTMLElement>('audio-panel'),
  musicVolume: required<HTMLInputElement>('music-volume'),
  sfxVolume: required<HTMLInputElement>('sfx-volume'),
  cinematicVolume: required<HTMLInputElement>('cinematic-volume'),
  resetMix: required<HTMLButtonElement>('reset-mix-button'),
  audioStatus: required<HTMLElement>('audio-status'),
  audioError: required<HTMLElement>('audio-error'),
  hull: required<HTMLElement>('hull-pips'),
  shield: required<HTMLElement>('shield-pips'),
  shieldTimer: required<HTMLElement>('shield-timer'),
  score: required<HTMLElement>('score-value'),
  credits: required<HTMLElement>('credit-value'),
  multiplier: required<HTMLElement>('multiplier'),
  highScore: required<HTMLElement>('high-score'),
  missionLabel: required<HTMLElement>('mission-label'),
  threatLevel: required<HTMLElement>('threat-level'),
  stageProgress: required<HTMLElement>('stage-progress'),
  waypointMarker1: required<HTMLElement>('waypoint-marker-1'),
  waypointMarker2: required<HTMLElement>('waypoint-marker-2'),
  stageTime: required<HTMLElement>('stage-time'),
  bossHud: required<HTMLElement>('boss-hud'),
  bossName: required<HTMLElement>('boss-name'),
  bossProgress: required<HTMLElement>('boss-progress'),
  bossPercent: required<HTMLElement>('boss-percent'),
  weaponRack: required<HTMLElement>('weapon-rack'),
  empCount: required<HTMLElement>('emp-count'),
  effectReadout: required<HTMLElement>('effect-readout'),
  announcement: required<HTMLElement>('announcement'),
  missionClear: required<HTMLElement>('mission-clear'),
  missionClearKicker: required<HTMLElement>('mission-clear-kicker'),
  missionClearTitle: required<HTMLElement>('mission-clear-title'),
  missionClearSector: required<HTMLElement>('mission-clear-sector'),
  radioSubtitle: required<HTMLElement>('radio-subtitle'),
  radioSpeaker: required<HTMLElement>('radio-speaker'),
  radioText: required<HTMLElement>('radio-text'),
  intro: required<HTMLElement>('intro-screen'),
  introImage: required<HTMLImageElement>('intro-image'),
  introVideo: required<HTMLVideoElement>('intro-video'),
  introLoading: required<HTMLElement>('intro-loading'),
  introFallback: required<HTMLElement>('intro-fallback'),
  introCaption: required<HTMLElement>('intro-caption'),
  introCaptionSpeaker: required<HTMLElement>('intro-caption-speaker'),
  introCaptionText: required<HTMLElement>('intro-caption-text'),
  introPlay: required<HTMLButtonElement>('intro-play-button'),
  introContinue: required<HTMLButtonElement>('intro-continue-button'),
  introPause: required<HTMLButtonElement>('intro-pause-button'),
  introTime: required<HTMLElement>('intro-time'),
  introSkip: required<HTMLButtonElement>('intro-skip-button'),
  story: required<HTMLElement>('story-screen'),
  storyFrame: required<HTMLElement>('story-frame'),
  storyKicker: required<HTMLElement>('story-kicker'),
  storyTitle: required<HTMLElement>('story-title'),
  storyProgress: required<HTMLElement>('story-progress'),
  storyImage: required<HTMLImageElement>('story-image'),
  storySpeaker: required<HTMLElement>('story-speaker'),
  storyCaption: required<HTMLElement>('story-caption'),
  storyBack: required<HTMLButtonElement>('story-back-button'),
  storyPause: required<HTMLButtonElement>('story-pause-button'),
  storySkip: required<HTMLButtonElement>('story-skip-button'),
  storyNext: required<HTMLButtonElement>('story-next-button'),
  hangarKicker: required<HTMLElement>('hangar-kicker'),
  hangarCredits: required<HTMLElement>('hangar-credits'),
  reportScore: required<HTMLElement>('report-score'),
  reportKills: required<HTMLElement>('report-kills'),
  reportCredits: required<HTMLElement>('report-credits'),
  reportAccuracy: required<HTMLElement>('report-accuracy'),
  reportDamage: required<HTMLElement>('report-damage'),
  nextMissionTitle: required<HTMLElement>('next-mission-title'),
  nextMissionBriefing: required<HTMLElement>('next-mission-briefing'),
  nextThreats: required<HTMLElement>('next-threats'),
  upgradeTree: required<HTMLElement>('upgrade-tree'),
  sortieModules: required<HTMLElement>('sortie-modules'),
  routePanel: required<HTMLElement>('route-panel'),
  nextVectorPanel: required<HTMLElement>('next-vector-panel'),
  manual: required<HTMLElement>('manual-screen'),
  manualContent: required<HTMLElement>('manual-content'),
  manualClose: required<HTMLButtonElement>('manual-close-button'),
  voiceVolume: required<HTMLInputElement>('voice-volume'),
  radioSubtitles: required<HTMLInputElement>('radio-subtitles'),
  resultKicker: required<HTMLElement>('result-kicker'),
  resultTitle: required<HTMLElement>('result-title'),
  resultScoreLabel: required<HTMLElement>('result-score-label'),
  resultScore: required<HTMLElement>('result-score'),
  resultKills: required<HTMLElement>('result-kills'),
};

let difficulty: Difficulty = 'pilot';
let latestSnapshot: GameSnapshot | undefined;
let ready = false;
let announceTimer = 0;
let resultIsVictory = false;
let defeatStingIndex = 0;
let storyChapter: StoryChapter | undefined;
let storyPanelIndex = 0;
let storyTimer = 0;
let storyPaused = false;
let storyReplay = false;
let introTimer = 0;
let introSequenceToken = 0;
let introCompletion: (() => void) | undefined;
let introPlaybackState: IntroPlaybackState = 'preloading';
let introEnding = false;
let introVisibilityPaused = false;
let replayReturnScreen: HTMLElement = ui.start;
const GAMEPLAY_KEY_CODES = new Set([
  'Space', 'KeyZ', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyX', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape',
]);
const heldGameplayKeys = new Set<string>();
let transitionInputLatched = false;
let savedCampaign = loadCampaign();
let campaign = new CampaignModel(savedCampaign);
const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
const quickDebugMode = debugMode && new URLSearchParams(window.location.search).get('quick') === '1';
const collisionDebugMode = debugMode && new URLSearchParams(window.location.search).get('collisionDebug') === '1';
const requestedDebugTrack = new URLSearchParams(window.location.search).get('audioTrack');
const debugInitialTrack = debugMode && [
  'menu', 'hangar', 'mission-coastal', 'mission-minefield', 'mission-fortress', 'boss', 'victory', 'defeat',
].includes(requestedDebugTrack ?? '')
  ? requestedDebugTrack as MusicTrack
  : 'menu';
const audio = new SoundEngine();

ui.launch.disabled = true;
ui.launch.textContent = 'INITIALIZING…';
const initialAudio = audio.getSettings();
ui.musicVolume.value = String(Math.round(initialAudio.music * 100));
ui.sfxVolume.value = String(Math.round(initialAudio.sfx * 100));
ui.voiceVolume.value = String(Math.round(initialAudio.voice * 100));
ui.cinematicVolume.value = String(Math.round(initialAudio.cinematic * 100));
ui.radioSubtitles.checked = initialAudio.radioSubtitles;
bindIntroVideoEvents();
prepareIntroVideo(false);

document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
  button.addEventListener('click', () => {
    difficulty = button.dataset.difficulty as Difficulty;
    document.querySelectorAll('[data-difficulty]').forEach((item) => item.classList.toggle('selected', item === button));
  });
});

ui.launch.addEventListener('click', () => {
  if (!ready) return;
  void audio.unlock();
  preloadUpgradeIcons();
  campaign.startNew(difficulty);
  saveCampaign();
  showIntro(() => startCurrentMission());
});
ui.launch.addEventListener('pointerenter', () => prepareIntroVideo(true));
ui.launch.addEventListener('focus', () => prepareIntroVideo(true));
ui.launch.addEventListener('pointerdown', () => prepareIntroVideo(true));

ui.continue.addEventListener('click', () => {
  if (!ready || !savedCampaign) return;
  void audio.unlock();
  preloadUpgradeIcons();
  campaign = new CampaignModel(savedCampaign);
  const state = campaign.snapshot();
  if (state.phase === 'story' && state.pendingStoryChapter) openStory(state.pendingStoryChapter);
  else if (state.phase === 'mission' && state.activeWaypoint) startCurrentMission();
  else openHangar();
});

ui.hangarLaunch.addEventListener('click', () => startCurrentMission());
ui.pauseButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('aegis:pause')));
ui.empButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('aegis:emp')));
ui.resume.addEventListener('click', () => {
  void audio.unlock();
  window.dispatchEvent(new CustomEvent('aegis:resume'));
});
ui.restart.addEventListener('click', () => {
  campaign.failMission();
  audio.setMusicDucked(false);
  startCurrentMission();
});

ui.resultAction.addEventListener('click', () => {
  if (resultIsVictory) showStart();
  else startCurrentMission();
});

ui.respec.addEventListener('click', () => {
  if (!campaign.snapshot().respecAvailable) return;
  if (!window.confirm('Use your one free campaign respec and refund every tree purchase?')) return;
  if (campaign.respec()) {
    audio.play('purchase');
    saveCampaign();
    renderHangar();
  }
});

ui.upgradeTree.addEventListener('click', (raw) => {
  const button = (raw.target as HTMLElement).closest<HTMLButtonElement>('[data-upgrade-id]');
  if (!button) return;
  const id = button.dataset.upgradeId as UpgradeNodeId;
  if (campaign.purchase(id).ok) {
    audio.play('purchase');
    saveCampaign();
    renderHangar();
  }
});

ui.sortieModules.addEventListener('click', (raw) => {
  const button = (raw.target as HTMLElement).closest<HTMLButtonElement>('[data-sortie-module]');
  if (!button) return;
  if (campaign.purchaseSortieModule(button.dataset.sortieModule as SortieModuleId).ok) {
    audio.play('purchase');
    saveCampaign();
    renderHangar();
  }
});

ui.routePanel.addEventListener('click', (raw) => {
  const button = (raw.target as HTMLElement).closest<HTMLButtonElement>('[data-route]');
  if (!button) return;
  if (campaign.selectRoute(button.dataset.route as CampaignRoute)) {
    audio.play('purchase');
    saveCampaign();
    renderHangar();
  }
});

const openManualAt = (tab: ManualTab): void => {
  renderManual(tab);
  ui.manual.classList.remove('hidden');
};
const openManual = (): void => openManualAt('weapons');
['manual-button', 'hangar-manual-button', 'pause-manual-button'].forEach((id) => {
  required<HTMLButtonElement>(id).addEventListener('click', openManual);
});
ui.manualClose.addEventListener('click', () => ui.manual.classList.add('hidden'));
document.querySelectorAll<HTMLButtonElement>('[data-manual-tab]').forEach((button) => {
  button.addEventListener('click', () => renderManual(button.dataset.manualTab as ManualTab));
});
ui.manualContent.addEventListener('click', (raw) => {
  const introButton = (raw.target as HTMLElement).closest<HTMLElement>('[data-replay-intro]');
  if (introButton) {
    replayReturnScreen = visibleBaseScreen();
    ui.manual.classList.add('hidden');
    showIntro(() => {
      replayReturnScreen.classList.remove('hidden');
      openManualAt('archive');
    });
    return;
  }
  const chapterButton = (raw.target as HTMLElement).closest<HTMLElement>('[data-story-id]');
  if (!chapterButton || chapterButton.classList.contains('locked')) return;
  replayReturnScreen = visibleBaseScreen();
  ui.manual.classList.add('hidden');
  openStory(chapterButton.dataset.storyId as StoryChapterId, true);
});

ui.storyBack.addEventListener('click', () => setStoryPanel(storyPanelIndex - 1));
ui.storyNext.addEventListener('click', () => {
  if (!storyChapter) return;
  if (storyPanelIndex >= storyChapter.panels.length - 1) finishStory();
  else setStoryPanel(storyPanelIndex + 1);
});
ui.storyPause.addEventListener('click', () => {
  storyPaused = !storyPaused;
  ui.storyPause.textContent = storyPaused ? 'RESUME' : 'PAUSE';
  if (storyPaused) window.clearTimeout(storyTimer);
  else scheduleStoryAdvance();
});
ui.storySkip.addEventListener('click', finishStory);
ui.introSkip.addEventListener('click', () => { void finishIntro(true); });
ui.introPlay.addEventListener('click', () => { void startIntroPlayback(introSequenceToken); });
ui.introContinue.addEventListener('click', () => { void finishIntro(false); });
ui.introPause.addEventListener('click', () => {
  if (ui.introVideo.paused) void resumeIntroPlayback();
  else ui.introVideo.pause();
});

document.addEventListener('keydown', (event) => {
  if (GAMEPLAY_KEY_CODES.has(event.code)) heldGameplayKeys.add(event.code);
  if (!ui.intro.classList.contains('hidden')) {
    if (event.key === 'Escape' && !event.repeat && !transitionInputLatched) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void finishIntro(true);
      return;
    }
    if (GAMEPLAY_KEY_CODES.has(event.code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  }
  if (!ui.missionClear.classList.contains('hidden') && GAMEPLAY_KEY_CODES.has(event.code)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (ui.story.classList.contains('hidden')) return;
  if (transitionInputLatched || event.repeat || (GAMEPLAY_KEY_CODES.has(event.code) && event.code !== 'Escape')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    finishStory();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopImmediatePropagation();
    ui.storyNext.click();
  }
}, { capture: true });

document.addEventListener('keyup', (event) => {
  heldGameplayKeys.delete(event.code);
  if (heldGameplayKeys.size === 0) transitionInputLatched = false;
}, { capture: true });

window.addEventListener('blur', () => {
  heldGameplayKeys.clear();
  transitionInputLatched = false;
});

document.addEventListener('visibilitychange', () => {
  if (ui.intro.classList.contains('hidden')) return;
  if (document.hidden && !ui.introVideo.paused) {
    introVisibilityPaused = true;
    ui.introVideo.pause();
  } else if (!document.hidden && introVisibilityPaused) {
    introVisibilityPaused = false;
    void resumeIntroPlayback();
  }
});

ui.hangarAbandon.addEventListener('click', abandonCampaign);
ui.pauseAbandon.addEventListener('click', abandonCampaign);
ui.resultAbandon.addEventListener('click', abandonCampaign);

ui.audioButton.addEventListener('click', () => {
  void audio.unlock();
  const opening = ui.audioPanel.classList.contains('hidden');
  ui.audioPanel.classList.toggle('hidden', !opening);
  ui.audioButton.setAttribute('aria-expanded', String(opening));
});
ui.musicVolume.addEventListener('input', () => audio.setMusicVolume(Number(ui.musicVolume.value) / 100));
ui.sfxVolume.addEventListener('input', () => audio.setSfxVolume(Number(ui.sfxVolume.value) / 100));
ui.voiceVolume.addEventListener('input', () => audio.setVoiceVolume(Number(ui.voiceVolume.value) / 100));
ui.cinematicVolume.addEventListener('input', () => {
  const value = Number(ui.cinematicVolume.value) / 100;
  audio.setCinematicVolume(value);
  ui.introVideo.volume = value;
});
ui.radioSubtitles.addEventListener('change', () => {
  audio.setRadioSubtitles(ui.radioSubtitles.checked);
  if (!ui.radioSubtitles.checked) ui.radioSubtitle.classList.add('hidden');
});
ui.resetMix.addEventListener('click', () => {
  const mix = audio.resetMix();
  ui.musicVolume.value = String(Math.round(mix.music * 100));
  ui.sfxVolume.value = String(Math.round(mix.sfx * 100));
  ui.voiceVolume.value = String(Math.round(mix.voice * 100));
  ui.cinematicVolume.value = String(Math.round(mix.cinematic * 100));
  ui.introVideo.volume = mix.cinematic;
  ui.radioSubtitles.checked = mix.radioSubtitles;
});

required<HTMLElement>('game-shell').addEventListener('pointerdown', () => { void audio.unlock(); }, { capture: true });

window.addEventListener('aegis:audio-state', (raw) => {
  const state = (raw as CustomEvent<AudioDebugState>).detail;
  const voiceFilesMissing = state.voiceAssetCheckComplete && state.voiceAssetsMissing > 0;
  const label = state.playbackState === 'playing' && state.currentTrack
    ? `PLAYING // ${state.currentTrack.replace('mission-', '').toUpperCase()}`
    : state.playbackState === 'loading'
      ? 'LOADING MUSIC…'
      : state.playbackState === 'unavailable'
        ? 'MUSIC UNAVAILABLE'
        : 'CLICK TO ENABLE AUDIO';
  ui.audioStatus.textContent = label;
  if (state.playbackState === 'unavailable') {
    ui.audioError.textContent = 'MUSIC UNAVAILABLE';
  } else if (voiceFilesMissing) {
    const totalVoices = state.voiceAssetsReady + state.voiceAssetsMissing;
    ui.audioError.textContent = state.voiceAssetsReady === 0
      ? `RADIO VOICES MISSING ${state.voiceAssetsMissing}/${totalVoices} // SUBTITLES ONLY`
      : `RADIO VOICES ${state.voiceAssetsReady}/${totalVoices} // ${state.voiceAssetsMissing} SUBTITLE ONLY`;
  }
  ui.audioError.classList.toggle('hidden', state.playbackState !== 'unavailable' && !voiceFilesMissing);
  ui.audioError.classList.toggle('voice-notice', state.playbackState !== 'unavailable' && voiceFilesMissing);
  ui.audioButton.classList.toggle('audio-warning', state.playbackState === 'unavailable');
  ui.audioButton.classList.toggle('voice-warning', state.playbackState !== 'unavailable' && voiceFilesMissing);
});

window.addEventListener('aegis:ready', () => {
  ready = true;
  ui.launch.disabled = false;
  ui.launch.innerHTML = 'START NEW CAMPAIGN <span>→</span>';
  refreshContinueButton();
});

window.addEventListener('aegis:state', (raw) => {
  latestSnapshot = (raw as CustomEvent<GameSnapshot>).detail;
  updateHud(latestSnapshot);
});

window.addEventListener('aegis:enemy-seen', (raw) => {
  const kind = (raw as CustomEvent<EnemyKind>).detail;
  const before = campaign.snapshot().discoveredEnemies?.length ?? 0;
  campaign.discoverEnemy(kind);
  if ((campaign.snapshot().discoveredEnemies?.length ?? 0) !== before) saveCampaign();
});

window.addEventListener('aegis:announce', (raw) => {
  const message = (raw as CustomEvent<string>).detail;
  window.clearTimeout(announceTimer);
  ui.announcement.classList.remove('show');
  void ui.announcement.offsetWidth;
  ui.announcement.textContent = message;
  ui.announcement.classList.add('show');
  announceTimer = window.setTimeout(() => ui.announcement.classList.remove('show'), 2_300);
});

if (debugMode) {
  window.addEventListener('aegis:debug-combat', (raw) => {
    ui.hud.dataset.enemies = JSON.stringify((raw as CustomEvent<unknown>).detail);
  });
}

window.addEventListener('aegis:sound', (raw) => {
  const detail = (raw as CustomEvent<SoundCue | SoundRequest>).detail;
  if (typeof detail === 'string') audio.play(detail);
  else audio.play(detail.cue, detail.pan ?? 0);
});
window.addEventListener('aegis:radio', (raw) => audio.playRadio((raw as CustomEvent<RadioCue>).detail));
window.addEventListener('aegis:radio-state', (raw) => {
  const state = (raw as CustomEvent<{ active: boolean; speaker?: string; subtitle?: string; subtitles?: boolean }>).detail;
  if (!state.active || state.subtitles === false) {
    ui.radioSubtitle.classList.add('hidden');
    return;
  }
  ui.radioSpeaker.textContent = state.speaker ?? 'ECHO-7';
  ui.radioText.textContent = state.subtitle ?? '';
  ui.radioSubtitle.dataset.speaker = state.speaker ?? 'ECHO-7';
  ui.radioSubtitle.classList.remove('hidden');
});
window.addEventListener('aegis:music', (raw) => {
  const track = (raw as CustomEvent<MusicTrack>).detail;
  const variant = track === 'boss' ? campaign.snapshot().campaignSeed ?? 0 : 0;
  void audio.playMusic(track, undefined, variant);
});

window.addEventListener('aegis:pause-state', (raw) => {
  const paused = (raw as CustomEvent<boolean>).detail;
  ui.pause.classList.toggle('hidden', !paused);
  const waypoint = latestSnapshot?.latestWaypointId;
  ui.restart.textContent = waypoint ? `RETRY FROM WAYPOINT ${waypoint}` : 'RETRY MISSION';
  audio.setMusicDucked(paused);
});

window.addEventListener('aegis:mission-clear', (raw) => {
  const detail = (raw as CustomEvent<{ missionTitle: string; finalVictory: boolean; durationMs: number }>).detail;
  transitionInputLatched = heldGameplayKeys.size > 0;
  ui.missionClear.classList.remove('hidden', 'finale');
  ui.missionClear.classList.toggle('finale', detail.finalVictory);
  ui.missionClearKicker.textContent = detail.finalVictory ? 'FINAL VECTOR COMPLETE' : 'VECTOR COMPLETE';
  ui.missionClearTitle.textContent = detail.finalVictory ? 'PELAGOS ARRAY SECURED' : 'MISSION CLEARED';
  ui.missionClearSector.textContent = detail.missionTitle;
  ui.missionClear.style.setProperty('--clear-duration', `${detail.durationMs}ms`);
  void ui.missionClear.offsetWidth;
  ui.missionClear.classList.add('show');
});

window.addEventListener('aegis:waypoint-secured', (raw) => {
  const waypoint = (raw as CustomEvent<CampaignSnapshot['activeWaypoint']>).detail;
  if (!waypoint || !campaign.saveWaypoint(waypoint)) return;
  saveCampaign();
});

window.addEventListener('aegis:mission-ended', (raw) => {
  const snapshot = (raw as CustomEvent<GameSnapshot>).detail;
  latestSnapshot = snapshot;
  audio.setMusicDucked(false);
  ui.pause.classList.add('hidden');
  ui.missionClear.classList.add('hidden');
  ui.missionClear.classList.remove('show', 'finale');
  ui.hud.classList.add('hidden');
  if (snapshot.mode === 'complete' || snapshot.mode === 'victory') {
    const state = campaign.completeMission(snapshot);
    saveCampaign();
    if (state.pendingStoryChapter) openStory(state.pendingStoryChapter);
  } else {
    campaign.failMission();
    saveCampaign();
    showFailure(snapshot);
  }
});

function showIntro(onComplete: () => void): void {
  const token = ++introSequenceToken;
  introCompletion = onComplete;
  window.clearTimeout(introTimer);
  introEnding = false;
  introVisibilityPaused = false;
  transitionInputLatched = transitionInputLatched || heldGameplayKeys.size > 0;
  ui.start.classList.add('hidden');
  ui.manual.classList.add('hidden');
  ui.intro.classList.remove('hidden');
  ui.introImage.classList.remove('hidden');
  ui.introVideo.classList.add('hidden');
  ui.introLoading.classList.remove('hidden');
  ui.introFallback.classList.add('hidden');
  ui.introPlay.classList.add('hidden');
  ui.introContinue.classList.add('hidden');
  ui.introPause.classList.add('hidden');
  ui.introSkip.classList.remove('hidden');
  ui.introCaption.classList.add('hidden');
  ui.introTime.textContent = formatIntroTime(0);
  ui.introVideo.volume = audio.getSettings().cinematic;
  audio.stopMusic(0.25);
  prepareIntroVideo(true);
  ui.intro.focus({ preventScroll: true });
  void startIntroPlayback(token);
}

function prepareIntroVideo(eager: boolean): void {
  ui.introVideo.preload = eager ? 'auto' : 'metadata';
  const source = new URL(INTRO_VIDEO.file, document.baseURI).href;
  if (ui.introVideo.src !== source) {
    introPlaybackState = 'preloading';
    ui.introVideo.src = source;
    ui.introVideo.load();
  }
}

async function startIntroPlayback(token: number): Promise<void> {
  if (token !== introSequenceToken || ui.intro.classList.contains('hidden')) return;
  prepareIntroVideo(true);
  introPlaybackState = 'buffering';
  ui.introLoading.classList.remove('hidden');
  ui.introFallback.classList.add('hidden');
  ui.introPlay.classList.add('hidden');
  ui.introVideo.volume = audio.getSettings().cinematic;
  if (ui.introVideo.ended || ui.introVideo.currentTime > 0.25) ui.introVideo.currentTime = 0;
  try {
    await ui.introVideo.play();
    if (token !== introSequenceToken || ui.intro.classList.contains('hidden')) return;
    ui.introVideo.classList.remove('hidden');
    ui.introImage.classList.add('hidden');
  } catch (error) {
    if (token !== introSequenceToken) return;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      introPlaybackState = 'ready';
      ui.introLoading.classList.add('hidden');
      ui.introPlay.classList.remove('hidden');
      ui.introPlay.focus({ preventScroll: true });
      return;
    }
    showIntroFallback();
  }
}

async function resumeIntroPlayback(): Promise<void> {
  if (ui.intro.classList.contains('hidden')) return;
  try {
    await ui.introVideo.play();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      introPlaybackState = 'ready';
      ui.introPlay.classList.remove('hidden');
    } else {
      showIntroFallback();
    }
  }
}

function showIntroFallback(): void {
  if (ui.intro.classList.contains('hidden') || introEnding) return;
  introPlaybackState = 'fallback';
  ui.introVideo.pause();
  ui.introVideo.classList.add('hidden');
  ui.introImage.classList.remove('hidden');
  ui.introLoading.classList.add('hidden');
  ui.introPlay.classList.add('hidden');
  ui.introContinue.classList.add('hidden');
  ui.introPause.classList.add('hidden');
  ui.introCaption.classList.add('hidden');
  ui.introFallback.classList.remove('hidden');
  window.clearTimeout(introTimer);
  introTimer = window.setTimeout(() => { void finishIntro(false); }, 2_000);
}

async function finishIntro(fadeAudio: boolean): Promise<void> {
  if (ui.intro.classList.contains('hidden') || introEnding) return;
  introEnding = true;
  window.clearTimeout(introTimer);
  introSequenceToken += 1;
  if (fadeAudio && !ui.introVideo.paused) await fadeIntroVideoVolume(0.16);
  ui.introVideo.pause();
  ui.introVideo.removeAttribute('src');
  ui.introVideo.load();
  ui.introVideo.volume = audio.getSettings().cinematic;
  ui.introCaption.classList.add('hidden');
  ui.introContinue.classList.add('hidden');
  ui.intro.classList.add('hidden');
  introPlaybackState = 'complete';
  const callback = introCompletion;
  introCompletion = undefined;
  introEnding = false;
  callback?.();
}

function completeIntroPlayback(): void {
  if (ui.intro.classList.contains('hidden') || introEnding) return;
  introPlaybackState = 'complete';
  ui.introVideo.classList.remove('hidden');
  ui.introImage.classList.add('hidden');
  ui.introLoading.classList.add('hidden');
  ui.introFallback.classList.add('hidden');
  ui.introPlay.classList.add('hidden');
  ui.introPause.classList.add('hidden');
  ui.introSkip.classList.add('hidden');
  ui.introCaption.classList.add('hidden');
  ui.introTime.textContent = formatIntroTime(ui.introVideo.duration, ui.introVideo.duration);
  ui.introContinue.classList.remove('hidden');
  ui.introContinue.focus({ preventScroll: true });
}

function fadeIntroVideoVolume(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const initial = ui.introVideo.volume;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, seconds * 1_000));
      ui.introVideo.volume = initial * (1 - progress);
      if (progress < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function bindIntroVideoEvents(): void {
  ui.introVideo.addEventListener('loadedmetadata', () => {
    const valid = introMetadataIsValid(ui.introVideo.duration, ui.introVideo.videoWidth, ui.introVideo.videoHeight);
    if (!valid && !ui.intro.classList.contains('hidden')) showIntroFallback();
    else introPlaybackState = 'ready';
    ui.introTime.textContent = formatIntroTime(0, ui.introVideo.duration);
  });
  ui.introVideo.addEventListener('loadeddata', () => {
    if (ui.intro.classList.contains('hidden')) return;
    ui.introVideo.classList.remove('hidden');
    ui.introImage.classList.add('hidden');
  });
  ui.introVideo.addEventListener('timeupdate', () => {
    const duration = Number.isFinite(ui.introVideo.duration) ? ui.introVideo.duration : INTRO_VIDEO.expectedDurationSeconds;
    ui.introTime.textContent = formatIntroTime(ui.introVideo.currentTime, duration);
    const caption = audio.getSettings().radioSubtitles ? introCaptionAt(ui.introVideo.currentTime) : undefined;
    ui.introCaption.classList.toggle('hidden', !caption);
    if (caption) {
      ui.introCaptionSpeaker.textContent = caption.speaker;
      ui.introCaptionText.textContent = caption.text;
    }
  });
  ui.introVideo.addEventListener('waiting', () => {
    if (ui.intro.classList.contains('hidden')) return;
    introPlaybackState = 'buffering';
    ui.introLoading.classList.remove('hidden');
  });
  ui.introVideo.addEventListener('playing', () => {
    if (ui.intro.classList.contains('hidden')) return;
    introPlaybackState = 'playing';
    ui.introVideo.classList.remove('hidden');
    ui.introImage.classList.add('hidden');
    ui.introLoading.classList.add('hidden');
    ui.introPlay.classList.add('hidden');
    ui.introPause.classList.remove('hidden');
    ui.introPause.textContent = 'PAUSE';
  });
  ui.introVideo.addEventListener('pause', () => {
    if (ui.intro.classList.contains('hidden') || introEnding || ui.introVideo.ended) return;
    introPlaybackState = 'paused';
    ui.introPause.textContent = 'RESUME';
  });
  ui.introVideo.addEventListener('ended', completeIntroPlayback);
  ui.introVideo.addEventListener('error', () => {
    if (!ui.intro.classList.contains('hidden') && !introEnding) showIntroFallback();
  });
}

function openStory(id: StoryChapterId, replay = false): void {
  storyChapter = getStoryChapter(id);
  storyReplay = replay;
  storyPaused = false;
  storyPanelIndex = 0;
  ui.storyPause.textContent = 'PAUSE';
  ui.start.classList.add('hidden');
  ui.hangar.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.manual.classList.add('hidden');
  ui.story.classList.remove('hidden');
  transitionInputLatched = transitionInputLatched || heldGameplayKeys.size > 0;
  ui.storyTitle.textContent = storyChapter.title;
  ui.storyKicker.textContent = `PELAGOS ARCHIVE // ${storyChapter.afterMission.toUpperCase()}`;
  if (!replay) {
    const variant = storyChapter.afterMission === 'dreadnought' ? 3 : Math.max(0, (campaign.currentMission().number - 1) % 3);
    void audio.playMusic('victory', undefined, variant);
  }
  setStoryPanel(0);
  ui.story.focus({ preventScroll: true });
}

function setStoryPanel(index: number): void {
  if (!storyChapter) return;
  storyPanelIndex = Math.max(0, Math.min(storyChapter.panels.length - 1, index));
  const panel = storyChapter.panels[storyPanelIndex];
  window.clearTimeout(storyTimer);
  ui.storyFrame.dataset.transition = panel.transition;
  ui.storyFrame.dataset.speaker = panel.speaker;
  ui.storyImage.src = panel.image;
  ui.storyImage.alt = panel.alt;
  const speakerLabels = { Mara: 'MARA // VECTOR', Rook: 'COMMANDER ROOK', 'ECHO-7': 'ECHO-7 // AV-7' } as const;
  ui.storySpeaker.textContent = speakerLabels[panel.speaker];
  ui.storyCaption.textContent = panel.caption;
  ui.storyProgress.textContent = `${String(storyPanelIndex + 1).padStart(2, '0')} / ${String(storyChapter.panels.length).padStart(2, '0')}`;
  ui.storyBack.disabled = storyPanelIndex === 0;
  ui.storyNext.innerHTML = storyPanelIndex === storyChapter.panels.length - 1 ? 'COMPLETE CHAPTER <span>→</span>' : 'NEXT <span>→</span>';
  void ui.storyImage.offsetWidth;
  const next = storyChapter.panels[storyPanelIndex + 1];
  if (next) {
    const image = new Image();
    image.decoding = 'async';
    image.src = next.image;
  }
  scheduleStoryAdvance();
}

function scheduleStoryAdvance(): void {
  window.clearTimeout(storyTimer);
  if (!storyChapter || storyPaused) return;
  storyTimer = window.setTimeout(() => {
    if (!storyChapter || storyPanelIndex >= storyChapter.panels.length - 1) return;
    setStoryPanel(storyPanelIndex + 1);
  }, storyChapter.panels[storyPanelIndex].durationMs);
}

function finishStory(): void {
  if (!storyChapter) return;
  window.clearTimeout(storyTimer);
  ui.story.classList.add('hidden');
  if (storyReplay) {
    storyChapter = undefined;
    storyReplay = false;
    replayReturnScreen.classList.remove('hidden');
    openManualAt('archive');
    return;
  }
  storyChapter = undefined;
  const state = campaign.completeStoryChapter();
  rememberStoryChapter(state.seenStoryChapters ?? []);
  saveCampaign();
  if (state.phase === 'victory') showVictory(state, latestSnapshot);
  else openHangar();
}

function startCurrentMission(): void {
  if (!ready) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  transitionInputLatched = false;
  void audio.unlock();
  const debugDurationMs = quickDebugMode ? 24_000 : undefined;
  const config = campaign.beginMission(debugDurationMs);
  saveCampaign();
  resultIsVictory = false;
  ui.start.classList.add('hidden');
  ui.hangar.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.story.classList.add('hidden');
  ui.intro.classList.add('hidden');
  ui.missionClear.classList.add('hidden');
  ui.missionClear.classList.remove('show', 'finale');
  ui.hud.classList.remove('hidden');
  window.dispatchEvent(new CustomEvent('aegis:start-mission', { detail: config }));
}

function openHangar(victoryVariant?: number): void {
  resultIsVictory = false;
  ui.start.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.hangar.classList.remove('hidden');
  renderHangar();
  if (victoryVariant === undefined) void audio.playMusic('hangar');
  else void audio.playMusic('victory', 'hangar', victoryVariant);
}

function renderHangar(): void {
  const state = campaign.snapshot();
  const mission = campaign.currentMission();
  ui.hangarKicker.textContent = state.lastReport ? 'AEGIS HANGAR // MISSION REPORT' : 'AEGIS HANGAR // CAMPAIGN CHECKPOINT';
  ui.hangarCredits.textContent = String(state.credits);
  const choosingRoute = state.phase === 'route';
  ui.routePanel.classList.toggle('hidden', !choosingRoute);
  ui.nextVectorPanel.classList.toggle('hidden', choosingRoute);
  ui.hangarLaunch.classList.toggle('hidden', choosingRoute);
  ui.nextMissionTitle.textContent = `${mission.sector} // ${mission.title}`;
  ui.nextMissionBriefing.textContent = mission.briefing;
  ui.nextThreats.replaceChildren(...mission.newThreats.map((threat) => {
    const chip = document.createElement('span');
    chip.textContent = threat;
    return chip;
  }));
  ui.hangarLaunch.innerHTML = `${mission.finale ? 'BEGIN FINAL ASSAULT' : `LAUNCH MISSION ${mission.number}`} <span>→</span>`;
  ui.respec.disabled = !state.respecAvailable;
  ui.respec.textContent = state.respecAvailable ? 'FREE RESPEC AVAILABLE' : 'RESPEC USED';

  const report = state.lastReport;
  ui.reportScore.textContent = report ? formatScore(report.score) : '—';
  ui.reportKills.textContent = report ? String(report.kills) : '—';
  ui.reportCredits.textContent = report ? `+${report.creditsEarned}` : '—';
  ui.reportAccuracy.textContent = report ? `${report.accuracy}%` : '—';
  ui.reportDamage.textContent = report ? String(report.damageTaken) : '—';
  renderSortieModules(state);
  renderUpgradeTree(state);
}

function renderSortieModules(state: CampaignSnapshot): void {
  const mission = campaign.currentMission();
  ui.sortieModules.replaceChildren(...SORTIE_MODULES.map((module) => {
    const equipped = state.sortieModule === module.id;
    const occupied = Boolean(state.sortieModule && !equipped);
    const button = document.createElement('button');
    button.dataset.sortieModule = module.id;
    button.disabled = equipped || occupied || state.phase === 'route' || state.credits < module.cost;
    button.className = `sortie-module${equipped ? ' equipped' : ''}`;
    const scannerOffer = equipped && module.id === 'armament-scanner'
      ? chooseArmamentOffer(state.weapons, state.shieldBaseMax, state.campaignSeed ?? 1, globalCarrierIndex(mission.id, 0), [], undefined).options
      : undefined;
    button.innerHTML = `<img src="${module.icon}" alt="" aria-hidden="true"><span><b>${module.name}</b><small>${scannerOffer ? `FIRST OFFER: ${scannerOffer.map(upgradeName).join(' / ')}` : module.description}</small></span><em>${equipped ? 'EQUIPPED' : `${module.cost} C`}</em>`;
    return button;
  }));
}

function renderUpgradeTree(state: CampaignSnapshot): void {
  ui.upgradeTree.replaceChildren(...UPGRADE_BRANCHES.map((branch) => {
    const column = document.createElement('section');
    column.className = `upgrade-branch branch-${branch}`;
    const heading = document.createElement('h3');
    heading.innerHTML = `<span>${branchIcon(branch)}</span>${branch.toUpperCase()}`;
    column.append(heading);
    for (const tier of [1, 2, 3, 4, 5, 6] as const) {
      const tierElement = document.createElement('div');
      tierElement.className = 'upgrade-tier';
      tierElement.dataset.tier = String(tier);
      const label = document.createElement('small');
      label.textContent = `TIER ${tier}`;
      tierElement.append(label);
      const pair = document.createElement('div');
      pair.className = 'upgrade-pair';
      UPGRADE_NODES.filter((node) => node.branch === branch && node.tier === tier).forEach((node) => {
        const owned = state.purchased.includes(node.id);
        const availability = campaign.canPurchase(node.id);
        const button = document.createElement('button');
        button.dataset.upgradeId = node.id;
        button.className = `upgrade-node${owned ? ' owned' : ''}${availability.reason === 'locked' ? ' locked' : ''}`;
        button.disabled = !owned && !availability.ok;
        const status = owned ? 'INSTALLED' : availability.reason === 'locked' ? 'LOCKED' : `${node.cost} C`;
        const statusElement = document.createElement('span');
        statusElement.className = 'node-status';
        statusElement.textContent = status;
        const icon = document.createElement('img');
        icon.className = 'upgrade-icon';
        icon.src = node.icon;
        icon.alt = '';
        icon.setAttribute('aria-hidden', 'true');
        icon.decoding = 'async';
        const copy = document.createElement('span');
        copy.className = 'node-copy';
        const name = document.createElement('b');
        name.textContent = node.name;
        const description = document.createElement('p');
        description.textContent = node.description;
        copy.append(name, description);
        button.append(statusElement, icon, copy);
        pair.append(button);
      });
      tierElement.append(pair);
      column.append(tierElement);
    }
    return column;
  }));
}

function showFailure(snapshot: GameSnapshot): void {
  resultIsVictory = false;
  ui.result.classList.remove('hidden');
  const waypoint = snapshot.latestWaypointId;
  ui.resultKicker.textContent = waypoint
    ? `MISSION FAILED // WAYPOINT ${waypoint} RESTORED`
    : 'MISSION FAILED // SORTIE RESET';
  ui.resultTitle.textContent = 'FIGHTER DOWN';
  ui.resultTitle.style.color = 'var(--danger)';
  ui.resultScore.textContent = formatScore(snapshot.score);
  ui.resultScoreLabel.textContent = 'ATTEMPT SCORE';
  ui.resultKills.textContent = String(snapshot.kills);
  ui.resultAction.innerHTML = waypoint
    ? `RETRY FROM WAYPOINT ${waypoint} <span>→</span>`
    : `RETRY ${snapshot.missionTitle} <span>→</span>`;
  ui.resultAbandon.classList.remove('hidden');
  void audio.playMusic('defeat', undefined, defeatStingIndex);
  defeatStingIndex = (defeatStingIndex + 1) % 2;
}

function showVictory(state: CampaignSnapshot, snapshot?: GameSnapshot): void {
  resultIsVictory = true;
  clearCampaignSave();
  ui.result.classList.remove('hidden');
  ui.resultKicker.textContent = 'CAMPAIGN COMPLETE // PELAGOS ARRAY';
  ui.resultTitle.textContent = 'SKY SECURED';
  ui.resultTitle.style.color = 'var(--cyan)';
  ui.resultScore.textContent = formatScore(state.score);
  ui.resultScoreLabel.textContent = 'CAMPAIGN SCORE';
  ui.resultKills.textContent = String(state.campaignKills);
  ui.resultAction.innerHTML = 'NEW CAMPAIGN <span>→</span>';
  ui.resultAbandon.classList.add('hidden');
  if (snapshot) latestSnapshot = snapshot;
  void audio.playMusic('victory', undefined, 3);
}

function showStart(): void {
  ui.start.classList.remove('hidden');
  ui.hangar.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.story.classList.add('hidden');
  ui.intro.classList.add('hidden');
  refreshContinueButton();
  void audio.playMusic('menu');
}

function abandonCampaign(): void {
  if (!window.confirm('Abandon this campaign and reset all campaign upgrades and credits?')) return;
  clearCampaignSave();
  campaign.startNew(difficulty);
  audio.setMusicDucked(false);
  showStart();
}

function updateHud(snapshot: GameSnapshot): void {
  renderPips(ui.hull, snapshot.hullMax, snapshot.hull, 'hull');
  renderPips(ui.shield, snapshot.shieldMax, snapshot.shield, 'shield');
  ui.shieldTimer.textContent = snapshot.shieldRechargeRemainingMs > 0
    ? `${(snapshot.shieldRechargeRemainingMs / 1_000).toFixed(1)}s`
    : 'READY';
  ui.score.textContent = formatScore(snapshot.score);
  ui.credits.textContent = String(campaign.snapshot().credits + snapshot.creditsEarned);
  ui.multiplier.textContent = `×${snapshot.multiplier}`;
  ui.highScore.textContent = `BEST ${formatScore(snapshot.highScore)}`;
  const finaleApproach = snapshot.missionId === 'dreadnought' && snapshot.finalePhase === 'approach';
  const finaleBoss = snapshot.missionId === 'dreadnought' && snapshot.finalePhase === 'boss';
  ui.missionLabel.textContent = finaleApproach
    ? 'FINAL VECTOR // APPROACH'
    : finaleBoss
      ? 'FINAL VECTOR // DREADNOUGHT'
      : `M${snapshot.missionNumber} // ${snapshot.missionTitle}`;
  ui.threatLevel.textContent = finaleApproach ? 'ESCORT' : finaleBoss ? 'CORE' : `THREAT ${snapshot.threatLevel}`;
  ui.threatLevel.dataset.level = String(snapshot.threatLevel);

  const timedDuration = finaleApproach ? 30_000 : snapshot.stageDurationMs;
  const timedElapsed = finaleBoss ? Math.max(0, snapshot.stageElapsedMs - 30_000) : snapshot.stageElapsedMs;
  const progress = finaleApproach ? Math.min(1, timedElapsed / timedDuration) : Math.min(1, snapshot.stageElapsedMs / snapshot.stageDurationMs);
  ui.stageProgress.style.width = `${progress * 100}%`;
  ui.waypointMarker1.classList.toggle('secured', (snapshot.latestWaypointId ?? 0) >= 1);
  ui.waypointMarker2.classList.toggle('secured', (snapshot.latestWaypointId ?? 0) >= 2);
  const remainingSeconds = Math.max(0, Math.ceil(((finaleApproach ? 30_000 : snapshot.stageDurationMs) - (finaleApproach ? timedElapsed : snapshot.stageElapsedMs)) / 1_000));
  ui.stageTime.textContent = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  ui.bossHud.classList.toggle('hidden', !snapshot.bossActive);
  ui.bossName.textContent = snapshot.bossName || 'COMMAND TARGET';
  ui.bossProgress.style.width = `${snapshot.bossHealthRatio * 100}%`;
  ui.bossPercent.textContent = `${Math.ceil(snapshot.bossHealthRatio * 100)}%`;
  ui.empCount.textContent = `${snapshot.empCharges} / ${snapshot.empMax}`;
  ui.empButton.disabled = snapshot.empCharges <= 0;
  const effects: string[] = [];
  if (snapshot.weaponOverdriveState !== 'inactive') {
    const label = snapshot.weaponOverdriveState === 'stacked'
      ? 'OVERDRIVE ×2'
      : snapshot.weaponOverdriveState === 'reactor'
        ? 'REACTOR OVERDRIVE'
        : 'OVERDRIVE';
    const remaining = Math.max(snapshot.overdriveRemainingMs, snapshot.reactorOverdriveRemainingMs);
    effects.push(`${label} ${(remaining / 1_000).toFixed(1)}s`);
  }
  if (snapshot.tractorRemainingMs > 0) effects.push(`TRACTOR ${(snapshot.tractorRemainingMs / 1_000).toFixed(1)}s`);
  if (snapshot.chronoRemainingMs > 0) effects.push(`CHRONO ${(snapshot.chronoRemainingMs / 1_000).toFixed(1)}s`);
  if (snapshot.reserveShieldAvailable) effects.push('RESERVE SHIELD');
  ui.effectReadout.replaceChildren(...effects.map((effect) => {
    const span = document.createElement('span');
    span.textContent = effect;
    return span;
  }));
  renderWeapons(snapshot);
}

function renderPips(container: HTMLElement, max: number, value: number, type: 'hull' | 'shield'): void {
  const signature = `${type}:${max}:${value}`;
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.replaceChildren(...Array.from({ length: max }, (_, index) => {
    const pip = document.createElement('i');
    pip.className = `pip ${type}${index < value ? ' active' : ''}`;
    return pip;
  }));
}

function renderWeapons(snapshot: GameSnapshot): void {
  const weaponTypes = Object.keys(WEAPON_LABELS) as WeaponType[];
  const signature = `${weaponTypes.map((type) => snapshot.weapons[type]).join(':')}:${snapshot.weaponOverdriveState}`;
  if (ui.weaponRack.dataset.signature === signature) return;
  ui.weaponRack.dataset.signature = signature;
  ui.weaponRack.replaceChildren(...weaponTypes.map((type) => {
    const data = WEAPON_LABELS[type];
    const level = snapshot.weapons[type];
    const chip = document.createElement('div');
    chip.className = `weapon-chip${level > 0 ? ' active' : ''}${level > 0 && snapshot.weaponOverdriveState !== 'inactive' ? ' overdrive' : ''}`;
    chip.style.setProperty('--weapon', data.css);
    const status = type === 'drone' && level > 0 ? droneStatus(level) : '';
    chip.title = status || `${data.name} level ${level}`;
    chip.innerHTML = `<b>${data.short}</b><span>${[1, 2, 3, 4, 5].map((dot) => `<i class="level-dot${dot <= level ? ' on' : ''}"></i>`).join('')}</span>${status ? `<em>${status}</em>` : ''}`;
    return chip;
  }));
}

function preloadUpgradeIcons(): void {
  [...UPGRADE_NODES, ...SORTIE_MODULES].forEach((node) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = node.icon;
  });
}

type ManualTab = 'weapons' | 'enemies' | 'systems' | 'archive';

const MANUAL_ENTRIES: Record<ManualTab, Array<{ name: string; tag: string; description: string }>> = {
  weapons: [
    { name: 'ARC CANNON', tag: 'SPREAD', description: 'Your rapid primary gun. Higher levels add bolts, tighten the fan, and raise damage. Best against close formations.' },
    { name: 'NOVA MISSILES', tag: 'HOMING', description: 'Tracks priority targets and weak points. Advanced warheads add extra missiles and blast damage.' },
    { name: 'LANCE LASER', tag: 'PRECISION', description: 'Straight, high-speed pulses that reward lining up enemies. Later levels add wider triple beams.' },
    { name: 'WING DRONES', tag: 'SUPPORT', description: 'L1: one escort. L2: two escorts. L3: two Mk II drones with rapid volleys. L4: three-drone triangle. L5: four-drone chevron.' },
    { name: 'ION CONDUCTOR', tag: 'CHAIN', description: 'Electrical discharge jumps to different nearby enemies. Against bosses it concentrates into one fair damage strike.' },
  ],
  enemies: [
    { name: 'CHARGER', tag: 'RAMMER', description: 'Marks a narrow lane, then dives. Leave the warning lane before it commits.' },
    { name: 'SNIPER', tag: 'BEAM', description: 'Tracks briefly, freezes its aim line, then fires. The locked line no longer follows you—sidestep during the final warning.' },
    { name: 'MINE LAYER', tag: 'AREA DENIAL', description: 'Drops destructible mines. They flash as they arm and disappear after six seconds.' },
    { name: 'SHIELD CARRIER', tag: 'SUPPORT', description: 'Reduces damage to nearby enemies. Break the carrier first or lure its escorts outside the visible field.' },
    { name: 'BULWARK', tag: 'ARMORED', description: 'Its core resists damage while wing reactors survive. Target either glowing reactor to break the armor.' },
    { name: 'PHANTOM', tag: 'PHASE STRIKER', description: 'Drifts in and out of visibility before firing crossing volleys. Stay in the center gap, then counterattack.' },
    { name: 'ARTILLERY', tag: 'BARRAGE', description: 'Paints two blast circles on your position. Escape the circles or hit its bright targeting sensor to interrupt the strike.' },
    { name: 'RECLAIMER', tag: 'SALVAGER', description: 'Steals unattended utility pickups. Destroy it to recover the stolen item.' },
    { name: 'BASTION CARRIER', tag: 'COMMAND', description: 'A carrier miniboss with two destructible turrets. Removing them greatly reduces its aimed volleys.' },
    { name: 'RAZORWING ACE', tag: 'COMMAND ACE', description: 'Telegraphs lateral passes and angled bursts, then adds a two-step dive below half health.' },
    { name: 'GATEKEEPER FRIGATE', tag: 'COMMAND FRIGATE', description: 'Its destructible wing turrets fire mirrored curtains. Hold the central escape lane and break each turret.' },
    { name: 'CROWN PURSUER', tag: 'ROUTE COMMAND', description: 'Adapts to the chosen fourth vector with marked storm passes or warned debris and mine volleys.' },
  ],
  systems: [
    { name: 'AEGIS SHIELD', tag: 'DEFENSE', description: 'Absorbs hits before hull and recharges after avoiding damage. Battlefield shield cores increase capacity up to three.' },
    { name: 'EMP', tag: 'X / SHIFT', description: 'Press X or either Shift key to clear nearby bullets and mines, damage enemies, and temporarily disrupt Bulwark armor.' },
    { name: 'WAYPOINTS', tag: 'RESTART', description: 'Two automatic waypoints preserve mission progress. A retry restores full shields, at least two hull, and at least one EMP without restoring used one-shot defenses.' },
    { name: 'OVERDRIVE', tag: 'UTILITY', description: 'Fires every weapon faster. White-hot gold projectiles show when Overdrive is active.' },
    { name: 'ARMAMENT CARRIER', tag: 'CHOICE', description: 'Gold-marked targets drop two permanent campaign upgrades. Collect one before the offer expires.' },
    { name: 'SORTIE MODULE', tag: 'CONSUMABLE', description: 'A hangar purchase used for the next mission only. Failed attempts restore it with the mission checkpoint.' },
    { name: 'THREAT LEVEL', tag: 'ESCALATION', description: 'Each mission climbs through five deterministic pressure bands. Warning times never become shorter.' },
    { name: 'PAUSE', tag: 'P / ESC', description: 'Press P or Escape during active combat to pause or resume. Pause is disabled during cinematics, story chapters, extraction, and menus.' },
  ],
  archive: [],
};

function renderManual(tab: ManualTab): void {
  document.querySelectorAll<HTMLButtonElement>('[data-manual-tab]').forEach((button) => button.classList.toggle('selected', button.dataset.manualTab === tab));
  ui.manualContent.classList.toggle('archive-content', tab === 'archive');
  if (tab === 'archive') {
    const unlocked = unlockedStoryChapters();
    const intro = document.createElement('article');
    intro.dataset.replayIntro = 'true';
    intro.innerHTML = `<img src="cinematics/keyframes/scene-01-start.webp" alt=""><div><span>OPENING CINEMATIC</span><h3>PROJECT CROWN AWAKENS</h3><p>Replay the complete twenty-six-second Pelagos campaign introduction.</p></div>`;
    const chapters = STORY_CHAPTERS.map((chapter) => {
      const article = document.createElement('article');
      const available = unlocked.has(chapter.id);
      article.dataset.storyId = chapter.id;
      article.classList.toggle('locked', !available);
      article.innerHTML = `<img src="${chapter.panels[0].image}" alt=""><div><span>${available ? chapter.afterMission.toUpperCase() : 'ENCRYPTED'}</span><h3>${available ? chapter.title : 'LOCKED ARCHIVE'}</h3><p>${available ? `${chapter.panels.length} recovered panels. Select to replay.` : 'Complete the associated mission to decrypt this chapter.'}</p></div>`;
      return article;
    });
    ui.manualContent.replaceChildren(intro, ...chapters);
    return;
  }
  ui.manualContent.replaceChildren(...MANUAL_ENTRIES[tab].map((entry) => {
    const article = document.createElement('article');
    article.innerHTML = `<div><span>${entry.tag}</span><h3>${entry.name}</h3></div><p>${entry.description}</p>`;
    return article;
  }));
}

function visibleBaseScreen(): HTMLElement {
  return [ui.hangar, ui.pause, ui.result, ui.start].find((screen) => !screen.classList.contains('hidden')) ?? ui.start;
}

function unlockedStoryChapters(): Set<StoryChapterId> {
  const campaignSeen = campaign.snapshot().seenStoryChapters ?? [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORY_ARCHIVE_KEY) ?? '[]') as StoryChapterId[];
    return new Set([...stored, ...campaignSeen]);
  } catch {
    return new Set(campaignSeen);
  }
}

function rememberStoryChapter(ids: StoryChapterId[]): void {
  try {
    const existing = unlockedStoryChapters();
    ids.forEach((id) => existing.add(id));
    localStorage.setItem(STORY_ARCHIVE_KEY, JSON.stringify([...existing]));
  } catch { /* optional */ }
}

function upgradeName(type: string): string {
  if (type === 'shield') return 'AEGIS';
  return WEAPON_LABELS[type as WeaponType]?.name.toUpperCase() ?? type.toUpperCase();
}

function branchIcon(branch: UpgradeBranch): string {
  if (branch === 'weapons') return '◆';
  if (branch === 'defense') return '⬡';
  return '◈';
}

function formatScore(score: number): string {
  return Math.max(0, Math.round(score)).toString().padStart(6, '0');
}

function saveCampaign(): void {
  try {
    savedCampaign = campaign.exportSave();
    localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(savedCampaign));
  } catch {
    // A denied localStorage write should not prevent play.
  }
  refreshContinueButton();
}

function loadCampaign(): CampaignSnapshot | undefined {
  try {
    const raw = localStorage.getItem(CAMPAIGN_SAVE_KEY);
    return raw ? JSON.parse(raw) as CampaignSnapshot : undefined;
  } catch {
    return undefined;
  }
}

function clearCampaignSave(): void {
  savedCampaign = undefined;
  try {
    localStorage.removeItem(CAMPAIGN_SAVE_KEY);
  } catch {
    // Storage is optional.
  }
  refreshContinueButton();
}

function refreshContinueButton(): void {
  ui.continue.classList.toggle('hidden', !savedCampaign || savedCampaign.phase === 'victory');
  if (savedCampaign) ui.continue.textContent = savedCampaign.phase === 'story'
    ? 'RESUME // STORY TRANSMISSION'
    : savedCampaign.phase === 'mission' && savedCampaign.activeWaypoint
      ? `RESUME // ${savedCampaign.currentMissionId?.toUpperCase()} WAYPOINT ${savedCampaign.activeWaypoint.waypointId}`
    : `RESUME // MISSION ${savedCampaign.missionIndex + 1}`;
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  parent: 'game-canvas',
  backgroundColor: '#050b19',
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: collisionDebugMode,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    keyboard: {
      capture: [
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.X,
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
      ],
    },
  },
  scene: [BootScene, BattleScene],
};

new Phaser.Game(config);

Object.defineProperty(window, '__AEGIS_LAST_STATE__', {
  get: () => latestSnapshot,
  configurable: true,
});
Object.defineProperty(window, '__AEGIS_CAMPAIGN__', {
  get: () => campaign.snapshot(),
  configurable: true,
});
Object.defineProperty(window, '__AEGIS_AUDIO__', {
  get: () => audio.getDebugState(),
  configurable: true,
});
Object.defineProperty(window, '__AEGIS_INTRO__', {
  get: () => ({
    state: introPlaybackState,
    currentTime: ui.introVideo.currentTime,
    duration: ui.introVideo.duration,
    paused: ui.introVideo.paused,
    videoWidth: ui.introVideo.videoWidth,
    videoHeight: ui.introVideo.videoHeight,
    errorCode: ui.introVideo.error?.code,
  }),
  configurable: true,
});

if (debugMode) {
  window.setInterval(() => {
    const state = audio.getDebugState();
    ui.audioPanel.dataset.contextState = state.contextState;
    ui.audioPanel.dataset.playbackState = state.playbackState;
    ui.audioPanel.dataset.desiredTrack = state.desiredTrack ?? '';
    ui.audioPanel.dataset.currentTrack = state.currentTrack ?? '';
    ui.audioPanel.dataset.positionSeconds = state.positionSeconds.toFixed(3);
    ui.audioPanel.dataset.logicalStarts = String(state.logicalStartCount);
    ui.audioPanel.dataset.queuedSources = String(state.queuedSources);
    ui.audioPanel.dataset.loopIteration = String(state.loopIteration);
    ui.audioPanel.dataset.musicGain = state.musicGain.toFixed(3);
    ui.audioPanel.dataset.cinematicGain = state.cinematicGain.toFixed(3);
    ui.audioPanel.dataset.voicePlaybackState = state.voicePlaybackState;
    ui.audioPanel.dataset.radioTrimDb = state.radioTrimDb.toFixed(1);
    ui.audioPanel.dataset.radioTrimGain = state.radioTrimGain.toFixed(3);
    ui.audioPanel.dataset.voiceAssetsReady = String(state.voiceAssetsReady);
    ui.audioPanel.dataset.voiceAssetsMissing = String(state.voiceAssetsMissing);
    ui.audioPanel.dataset.activeRadioCue = state.activeRadioCue ?? '';
    ui.audioPanel.dataset.lastVoiceError = state.lastVoiceError ?? '';
    ui.audioPanel.dataset.loopRegion = state.loopRegion
      ? `${state.loopRegion.startSeconds.toFixed(3)}-${state.loopRegion.endSeconds.toFixed(3)}`
      : '';
    ui.audioPanel.dataset.lastError = state.lastError ?? '';
    if (latestSnapshot) {
      ui.hud.dataset.mode = latestSnapshot.mode;
      ui.hud.dataset.mission = latestSnapshot.missionId;
      ui.hud.dataset.overdrive = latestSnapshot.weaponOverdriveState;
      ui.hud.dataset.threat = String(latestSnapshot.threatLevel);
    }
  }, 500);
}

void audio.playMusic(debugInitialTrack);
