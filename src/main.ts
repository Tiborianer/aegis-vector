import Phaser from 'phaser';
import './styles.css';
import { SoundEngine, type SoundCue } from './audio/SoundEngine';
import { UPGRADE_BRANCHES, UPGRADE_NODES } from './game/content/upgrades';
import { WEAPON_LABELS, WORLD_HEIGHT, WORLD_WIDTH } from './game/content/balance';
import { CampaignModel } from './game/simulation/CampaignModel';
import type {
  CampaignSnapshot,
  Difficulty,
  GameSnapshot,
  AudioDebugState,
  MusicTrack,
  UpgradeBranch,
  UpgradeNodeId,
  WeaponType,
} from './game/simulation/types';
import { BootScene } from './phaser/scenes/BootScene';
import { BattleScene } from './phaser/scenes/BattleScene';

const CAMPAIGN_SAVE_KEY = 'aegis-vector-campaign-v1';

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
  stageTime: required<HTMLElement>('stage-time'),
  bossHud: required<HTMLElement>('boss-hud'),
  bossName: required<HTMLElement>('boss-name'),
  bossProgress: required<HTMLElement>('boss-progress'),
  bossPercent: required<HTMLElement>('boss-percent'),
  weaponRack: required<HTMLElement>('weapon-rack'),
  empCount: required<HTMLElement>('emp-count'),
  effectReadout: required<HTMLElement>('effect-readout'),
  announcement: required<HTMLElement>('announcement'),
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
let savedCampaign = loadCampaign();
let campaign = new CampaignModel(savedCampaign);
const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
const audio = new SoundEngine();

ui.launch.disabled = true;
ui.launch.textContent = 'INITIALIZING…';
const initialAudio = audio.getSettings();
ui.musicVolume.value = String(Math.round(initialAudio.music * 100));
ui.sfxVolume.value = String(Math.round(initialAudio.sfx * 100));

document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
  button.addEventListener('click', () => {
    difficulty = button.dataset.difficulty as Difficulty;
    document.querySelectorAll('[data-difficulty]').forEach((item) => item.classList.toggle('selected', item === button));
  });
});

ui.launch.addEventListener('click', () => {
  if (!ready) return;
  void audio.unlock();
  campaign.startNew(difficulty);
  saveCampaign();
  startCurrentMission();
});

ui.continue.addEventListener('click', () => {
  if (!ready || !savedCampaign) return;
  void audio.unlock();
  campaign = new CampaignModel(savedCampaign);
  openHangar();
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
ui.resetMix.addEventListener('click', () => {
  const mix = audio.resetMix();
  ui.musicVolume.value = String(Math.round(mix.music * 100));
  ui.sfxVolume.value = String(Math.round(mix.sfx * 100));
});

required<HTMLElement>('game-shell').addEventListener('pointerdown', () => { void audio.unlock(); }, { capture: true });

window.addEventListener('aegis:audio-state', (raw) => {
  const state = (raw as CustomEvent<AudioDebugState>).detail;
  const label = state.playbackState === 'playing' && state.currentTrack
    ? `PLAYING // ${state.currentTrack.replace('mission-', '').toUpperCase()}`
    : state.playbackState === 'loading'
      ? 'LOADING MUSIC…'
      : state.playbackState === 'unavailable'
        ? 'MUSIC UNAVAILABLE'
        : 'CLICK TO ENABLE AUDIO';
  ui.audioStatus.textContent = label;
  ui.audioError.classList.toggle('hidden', state.playbackState !== 'unavailable');
  ui.audioButton.classList.toggle('audio-warning', state.playbackState === 'unavailable');
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

window.addEventListener('aegis:announce', (raw) => {
  const message = (raw as CustomEvent<string>).detail;
  window.clearTimeout(announceTimer);
  ui.announcement.classList.remove('show');
  void ui.announcement.offsetWidth;
  ui.announcement.textContent = message;
  ui.announcement.classList.add('show');
  announceTimer = window.setTimeout(() => ui.announcement.classList.remove('show'), 2_300);
});

window.addEventListener('aegis:sound', (raw) => audio.play((raw as CustomEvent<SoundCue>).detail));
window.addEventListener('aegis:music', (raw) => {
  const track = (raw as CustomEvent<MusicTrack>).detail;
  const variant = track === 'boss' ? campaign.snapshot().campaignSeed ?? 0 : 0;
  void audio.playMusic(track, undefined, variant);
});

window.addEventListener('aegis:pause-state', (raw) => {
  const paused = (raw as CustomEvent<boolean>).detail;
  ui.pause.classList.toggle('hidden', !paused);
  audio.setMusicDucked(paused);
});

window.addEventListener('aegis:mission-ended', (raw) => {
  const snapshot = (raw as CustomEvent<GameSnapshot>).detail;
  latestSnapshot = snapshot;
  audio.setMusicDucked(false);
  ui.pause.classList.add('hidden');
  ui.hud.classList.add('hidden');
  if (snapshot.mode === 'complete' || snapshot.mode === 'victory') {
    const state = campaign.completeMission(snapshot);
    if (state.phase === 'victory') showVictory(state, snapshot);
    else {
      saveCampaign();
      openHangar(snapshot.missionNumber - 1);
    }
  } else {
    campaign.failMission();
    saveCampaign();
    showFailure(snapshot);
  }
});

function startCurrentMission(): void {
  if (!ready) return;
  void audio.unlock();
  const debugDurationMs = debugMode ? 24_000 : undefined;
  const config = campaign.beginMission(debugDurationMs);
  saveCampaign();
  resultIsVictory = false;
  ui.start.classList.add('hidden');
  ui.hangar.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
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
  renderUpgradeTree(state);
}

function renderUpgradeTree(state: CampaignSnapshot): void {
  ui.upgradeTree.replaceChildren(...UPGRADE_BRANCHES.map((branch) => {
    const column = document.createElement('section');
    column.className = `upgrade-branch branch-${branch}`;
    const heading = document.createElement('h3');
    heading.innerHTML = `<span>${branchIcon(branch)}</span>${branch.toUpperCase()}`;
    column.append(heading);
    for (const tier of [1, 2, 3, 4] as const) {
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
        button.innerHTML = `<span class="node-status">${status}</span><b>${node.name}</b><p>${node.description}</p>`;
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
  ui.resultKicker.textContent = 'MISSION FAILED // CHECKPOINT RESTORED';
  ui.resultTitle.textContent = 'FIGHTER DOWN';
  ui.resultTitle.style.color = 'var(--danger)';
  ui.resultScore.textContent = formatScore(snapshot.score);
  ui.resultScoreLabel.textContent = 'ATTEMPT SCORE';
  ui.resultKills.textContent = String(snapshot.kills);
  ui.resultAction.innerHTML = `RETRY ${snapshot.missionTitle} <span>→</span>`;
  ui.resultAbandon.classList.remove('hidden');
  void audio.playMusic('defeat', undefined, defeatStingIndex);
  defeatStingIndex = (defeatStingIndex + 1) % 2;
}

function showVictory(state: CampaignSnapshot, snapshot: GameSnapshot): void {
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
  latestSnapshot = snapshot;
  void audio.playMusic('victory', undefined, 3);
}

function showStart(): void {
  ui.start.classList.remove('hidden');
  ui.hangar.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
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
  ui.missionLabel.textContent = snapshot.missionNumber === 4 ? 'FINAL VECTOR' : `M${snapshot.missionNumber} // ${snapshot.missionTitle}`;
  ui.threatLevel.textContent = `THREAT ${snapshot.threatLevel}`;
  ui.threatLevel.dataset.level = String(snapshot.threatLevel);

  const progress = Math.min(1, snapshot.stageElapsedMs / snapshot.stageDurationMs);
  ui.stageProgress.style.width = `${progress * 100}%`;
  const remainingSeconds = Math.max(0, Math.ceil((snapshot.stageDurationMs - snapshot.stageElapsedMs) / 1_000));
  ui.stageTime.textContent = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  ui.bossHud.classList.toggle('hidden', !snapshot.bossActive);
  ui.bossName.textContent = snapshot.bossName || 'COMMAND TARGET';
  ui.bossProgress.style.width = `${snapshot.bossHealthRatio * 100}%`;
  ui.bossPercent.textContent = `${Math.ceil(snapshot.bossHealthRatio * 100)}%`;
  ui.empCount.textContent = `${snapshot.empCharges} / ${snapshot.empMax}`;
  ui.empButton.disabled = snapshot.empCharges <= 0;
  const effects: string[] = [];
  if (snapshot.overdriveRemainingMs > 0) effects.push(`OVERDRIVE ${(snapshot.overdriveRemainingMs / 1_000).toFixed(1)}s`);
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
  const signature = weaponTypes.map((type) => snapshot.weapons[type]).join(':');
  if (ui.weaponRack.dataset.signature === signature) return;
  ui.weaponRack.dataset.signature = signature;
  ui.weaponRack.replaceChildren(...weaponTypes.map((type) => {
    const data = WEAPON_LABELS[type];
    const level = snapshot.weapons[type];
    const chip = document.createElement('div');
    chip.className = `weapon-chip${level > 0 ? ' active' : ''}`;
    chip.style.setProperty('--weapon', data.css);
    chip.innerHTML = `<b>${data.short}</b><span>${[1, 2, 3, 4, 5].map((dot) => `<i class="level-dot${dot <= level ? ' on' : ''}"></i>`).join('')}</span>`;
    return chip;
  }));
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
  if (savedCampaign) ui.continue.textContent = `RESUME // MISSION ${savedCampaign.missionIndex + 1}`;
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
      debug: new URLSearchParams(window.location.search).get('hitboxes') === '1',
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

void audio.playMusic('menu');
