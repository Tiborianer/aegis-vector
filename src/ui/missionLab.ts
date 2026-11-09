import { MISSIONS } from '../game/content/missions';
import type { Difficulty, MissionDefinition, MissionId } from '../game/simulation/types';
import type { MissionLabLoadout, MissionLabOptions } from '../game/testing/missionLab';

/** A launch surface only: campaign storage and scene state belong to the caller. */
export function mountMissionLab(
  parent: HTMLElement,
  options: MissionLabOptions,
  onLaunch: (options: MissionLabOptions) => void,
  onExit: () => void,
): HTMLElement {
  let selectedMission = MISSIONS.find((mission) => mission.id === options.mission) ?? MISSIONS[0];
  const section = document.createElement('section');
  section.id = 'mission-lab-screen';
  section.className = 'overlay mission-lab-overlay';
  section.setAttribute('aria-labelledby', 'mission-lab-title');
  section.tabIndex = -1;

  const card = document.createElement('div');
  card.className = 'menu-card mission-lab-card';
  const header = document.createElement('header');
  header.className = 'mission-lab-header';
  const headingGroup = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'KESTREL // FLIGHT SIMULATOR';
  const title = document.createElement('h2');
  title.id = 'mission-lab-title';
  title.textContent = 'MISSION LAB';
  headingGroup.append(eyebrow, title);
  const safety = document.createElement('span');
  safety.className = 'mission-lab-safety';
  safety.textContent = 'SAVES OFF';
  header.append(headingGroup, safety);

  const intro = document.createElement('p');
  intro.className = 'mission-lab-intro';
  intro.textContent = 'Try any mission independently. Your campaign, credits and high score stay untouched.';

  const content = document.createElement('div');
  content.className = 'mission-lab-content';
  const missionList = document.createElement('div');
  missionList.className = 'mission-lab-missions';
  missionList.setAttribute('role', 'group');
  missionList.setAttribute('aria-label', 'Choose a test mission');
  const missionButtons = new Map<MissionId, HTMLButtonElement>();
  const missionMeta = (mission: MissionDefinition): string => {
    if (mission.id === 'minefield') return '02 // OFFENSIVE PATH';
    if (mission.id === 'aurora') return '02 // DEFENSIVE PATH';
    if (mission.id === 'graveyard') return '04 // SALVAGE PATH';
    if (mission.id === 'stormbreak') return '04 // PURSUIT PATH';
    return `${String(mission.number).padStart(2, '0')} // ${mission.id === 'lastLight' ? 'FINAL VECTOR' : mission.finale ? 'BOSS ASSAULT' : 'CAMPAIGN MISSION'}`;
  };

  const detail = document.createElement('div');
  detail.className = 'mission-lab-detail';
  const selection = document.createElement('div');
  selection.className = 'mission-lab-selection';
  selection.setAttribute('aria-live', 'polite');
  const selectionLabel = document.createElement('span');
  selectionLabel.className = 'eyebrow';
  selectionLabel.textContent = 'SELECTED VECTOR';
  const selectionTitle = document.createElement('h3');
  selectionTitle.id = 'mission-lab-selection-title';
  const briefing = document.createElement('p');
  briefing.id = 'mission-lab-briefing';
  selection.append(selectionLabel, selectionTitle, briefing);

  const form = document.createElement('div');
  form.className = 'mission-lab-options';
  const makeSelect = (id: string, labelText: string, entries: ReadonlyArray<readonly [string, string]>): HTMLSelectElement => {
    const label = document.createElement('label');
    label.className = 'mission-lab-field';
    label.htmlFor = id;
    const name = document.createElement('span');
    name.textContent = labelText;
    const select = document.createElement('select');
    select.id = id;
    entries.forEach(([value, text]) => select.add(new Option(text, value)));
    label.append(name, select);
    form.append(label);
    return select;
  };
  const difficulty = makeSelect('mission-lab-difficulty', 'Difficulty', [
    ['cadet', 'Cadet — relaxed'], ['pilot', 'Pilot — standard'], ['ace', 'Ace — intense'],
  ]);
  difficulty.value = options.difficulty;
  const loadout = makeSelect('mission-lab-loadout', 'Starting loadout', [
    ['starter', 'Starter — basic ARC'], ['combat', 'Combat — mixed weapons'], ['max', 'Maximum — all weapons'],
  ]);
  loadout.value = options.loadout;
  const godLabel = document.createElement('label');
  godLabel.className = 'mission-lab-god';
  godLabel.htmlFor = 'mission-lab-god';
  const god = document.createElement('input');
  god.id = 'mission-lab-god';
  god.type = 'checkbox';
  god.checked = options.godMode;
  const godText = document.createElement('span');
  const godTitle = document.createElement('strong');
  godTitle.textContent = 'GOD MODE';
  const godHelp = document.createElement('small');
  godHelp.textContent = 'Invincible. Fly freely and test the enemies.';
  godText.append(godTitle, godHelp);
  godLabel.append(god, godText);
  form.append(godLabel);

  const footer = document.createElement('footer');
  footer.className = 'mission-lab-footer';
  const exit = document.createElement('button');
  exit.id = 'mission-lab-exit';
  exit.type = 'button';
  exit.className = 'secondary-button';
  exit.textContent = 'BACK TO CAMPAIGN';
  exit.addEventListener('click', onExit);
  const launch = document.createElement('button');
  launch.id = 'mission-lab-launch';
  launch.dataset.labLaunch = '';
  launch.type = 'button';
  launch.className = 'primary-button';
  launch.textContent = 'TEST MISSION';
  const arrow = document.createElement('span');
  arrow.textContent = '→';
  arrow.setAttribute('aria-hidden', 'true');
  launch.append(arrow);
  launch.addEventListener('click', () => onLaunch({
    mission: selectedMission.id,
    difficulty: difficulty.value as Difficulty,
    godMode: god.checked,
    loadout: loadout.value as MissionLabLoadout,
  }));
  footer.append(exit, launch);

  const updateSelection = (): void => {
    missionButtons.forEach((button, id) => {
      button.classList.toggle('selected', id === selectedMission.id);
      button.setAttribute('aria-pressed', String(id === selectedMission.id));
    });
    section.dataset.selectedMission = selectedMission.id;
    selectionTitle.textContent = selectedMission.title;
    briefing.textContent = selectedMission.briefing;
    launch.setAttribute('aria-label', `Test mission: ${selectedMission.title}`);
  };
  MISSIONS.forEach((mission) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mission-lab-mission';
    button.dataset.mission = mission.id;
    button.setAttribute('aria-label', `Select ${mission.title}`);
    const meta = document.createElement('span');
    meta.textContent = missionMeta(mission);
    const name = document.createElement('strong');
    name.textContent = mission.title;
    const cue = document.createElement('small');
    cue.textContent = mission.id === 'lastLight' ? 'Seraph + Obsidian Crown' : mission.newThreats[0]?.split(' // ')[0] ?? 'Full mission';
    button.append(meta, name, cue);
    button.addEventListener('click', () => { selectedMission = mission; updateSelection(); });
    missionButtons.set(mission.id, button);
    missionList.append(button);
  });

  detail.append(selection, form);
  content.append(missionList, detail);
  card.append(header, intro, content, footer);
  section.append(card);
  parent.append(section);
  updateSelection();
  return section;
}
