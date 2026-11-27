import { publicAssetUrl } from '../game/assets/publicAsset';
import { ACTIONS, keyLabel, squadInput, type Action } from './input';
import { SEATS, type Kit, type Pair, type Seat, type SquadCampaign } from './campaign';
import { equipmentRows } from '../game/assets/fleetArt';
import { closeEquipmentInspection, equipmentPreview } from '../ui/equipmentPreview';
import { buildCombatModifiers, UPGRADE_NODES } from '../game/content/upgrades';
import { SORTIE_MODULES } from '../game/content/sortieModules';
import { destinationsAfter, sortiePrice } from '../game/content/routeRewards';
import type { CampaignRoute, SortieModuleId, UpgradeBranch, UpgradeNodeId } from '../game/simulation/types';

export interface Choice {
  id: string;
  label: string;
  note?: string;
  disabled?: boolean;
  selected?: boolean;
}
export interface PilotCard {
  equipment?: number[];
  title: string;
  summary: string;
  ready: boolean;
  choices: Choice[];
  cursor: number;
}
export interface DeckView {
  page: 'preflight' | 'hangar';
  title: string;
  detail: string;
  cards: Pair<PilotCard>;
}
export const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const labels: Record<string, string> = {
  spread: 'ARC',
  missile: 'NOVA',
  laser: 'LANCE',
  drone: 'WING',
  ion: 'ION',
  shield: 'Shield cell',
};
const tabs = ['weapons', 'defense', 'systems', 'module'] as const;
const names = ['Kestrel', 'Wingmate'];
export class FlightDeck {
  readonly panel = element('section', 'coop-screen hidden');
  readonly hud = element('div', 'coop-hud hidden');
  private view?: DeckView;
  private cards: Pair<HTMLElement> = [element('div'), element('div')];
  private keys: Pair<Kit> = ['precision', 'coverage'];
  private ready: Pair<boolean> = [false, false];
  private cursors: Pair<number> = [0, 0];
  private branches: Pair<number> = [0, 0];
  private squad?: SquadCampaign;
  private captureSeat?: Seat;
  private demoPosition: Pair<{ x: number; y: number }> = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  private demoFrame = 0;
  private message = '';
  private guest = false;
  private testing = false;
  onView?: (view: DeckView) => void;
  onGuestAction?: (action: Action | string) => void;
  constructor(
    shell: HTMLElement,
    private launch: (kits: Pair<Kit>) => void,
    private save: () => void,
    private leave: () => void,
  ) {
    this.panel.style.setProperty(
      '--coop-ship',
      'url("' + new URL(publicAssetUrl('graphics-v2/ships/player.png'), document.baseURI).href + '")',
    );
    this.panel.id = 'coop-deck';
    this.hud.id = 'coop-hud';
    shell.append(this.panel, this.hud);
    squadInput.onAction = (seat, action, down) => {
      if (this.panel.classList.contains('hidden') || !this.view) return;
      if (this.testing) {
        this.updateIndicators();
        return;
      }
      if (down && !this.guest) this.navigate(seat, action);
    };
  }
  preflight(): void {
    this.guest = false;
    this.squad = undefined;
    this.reset();
    this.render();
  }
  hangar(squad: SquadCampaign): void {
    this.guest = false;
    this.squad = squad;
    this.reset();
    this.render();
  }
  private reset(): void {
    this.ready = [false, false];
    this.cursors = [0, 0];
    this.branches = [0, 0];
    this.message = '';
    this.captureSeat = undefined;
    this.testing = false;
    squadInput.clear();
    squadInput.active = true;
  }
  hide(): void {
    closeEquipmentInspection();
    cancelAnimationFrame(this.demoFrame);
    this.panel.classList.add('hidden');
    this.view = undefined;
    this.testing = false;
    squadInput.capturing = undefined;
  }
  remote(view: DeckView): void {
    this.guest = true;
    this.draw(view);
  }
  navigate(seat: Seat, action: Action): void {
    if (!this.view || this.panel.classList.contains('hidden')) return;
    const choices = this.view.cards[seat].choices;
    if (action === 'emp') {
      this.ready[seat] = false;
      this.cursors[seat] = 0;
    } else if (action === 'fire') {
      const option = choices[this.cursors[seat]];
      if (option) this.choose(seat, option.id);
      return;
    } else if (choices.length) {
      const step = action === 'up' || action === 'left' ? -1 : 1;
      let next = this.cursors[seat];
      for (let n = 0; n < choices.length; n++) {
        next = (next + step + choices.length) % choices.length;
        if (!choices[next].disabled) break;
      }
      this.cursors[seat] = next;
    }
    this.render();
    this.cards[seat].querySelector('.cursor')?.scrollIntoView({ block: 'nearest' });
  }
  choose(seat: Seat, id: string): void {
    if (!this.view || !this.view.cards[seat].choices.some((c) => c.id === id && !c.disabled)) return;
    if (id === 'ready') this.ready[seat] = !this.ready[seat];
    else if (id.startsWith('kit-')) this.keys[seat] = id === 'kit-coverage' ? 'coverage' : 'precision';
    else if (id.startsWith('tab-')) {
      this.branches[seat] = Number(id.slice(4));
      this.cursors[seat] = 0;
    } else if (this.squad) {
      const pilot = this.squad.pilots[seat];
      let installed = false;
      if (id.startsWith('route-')) this.squad.chooseRoute(seat, id.slice(6) as CampaignRoute);
      else if (id.startsWith('claim-')) this.squad.claim(seat, Number(id.slice(6)), () => { installed = true; });
      else if (id.startsWith('buy-')) installed = pilot.purchase(id.slice(4) as UpgradeNodeId).ok;
      else if (id.startsWith('mod-')) installed = pilot.purchaseSortieModule(id.slice(4) as SortieModuleId).ok;
      else if (id === 'respec') pilot.respec();
      if (installed) window.dispatchEvent(new CustomEvent('aegis:sound', { detail: { cue: 'install', pan: seat ? .28 : -.28 } }));
      this.save();
    }
    if (this.ready.every(Boolean)) {
      this.hide();
      squadInput.clear();
      this.launch([...this.keys]);
      return;
    }
    this.render();
  }
  private pilotCard(seat: Seat): PilotCard {
    const choices: Choice[] = [];
    const card: PilotCard = {
      title: 'P' + (seat + 1) + '  /  ' + names[seat],
      summary: '',
      ready: this.ready[seat],
      choices,
      cursor: this.cursors[seat],
    };
    if (!this.squad) {
      card.summary = this.keys[seat] === 'precision' ? 'ARC + LANCE' : 'ARC + WING';
      choices.push(
        {
          id: 'kit-precision',
          label: 'Precision',
          note: 'LANCE adds concentrated forward fire.',
          selected: this.keys[seat] === 'precision',
        },
        {
          id: 'kit-coverage',
          label: 'Coverage',
          note: 'A WING drone fires in the adjacent lane.',
          selected: this.keys[seat] === 'coverage',
        },
      );
    } else {
      const p = this.squad.pilots[seat],
        state = p.snapshot(),
        offers = this.squad.offers[seat];
      card.equipment = equipmentRows(state.weapons, state.shieldBaseMax + Number(state.routeReward === 'aegis-bastion'), buildCombatModifiers(state.purchased));
      card.summary = state.credits + ' C  ·  ' + state.purchased.length + ' modifications';
      if (state.phase === 'route' && (state.currentMissionId === 'fortress' ? 1 : 0) === seat) {
        for (const route of ['salvage', 'storm'] as const) {
          const destination = destinationsAfter(state.currentMissionId)[route];
          choices.push({ id: 'route-' + route, label: destination.destination,
            note: `${destination.objective} On clear · ${destination.name} · ${destination.effect}` });
        }
      }
      if (offers.length)
        offers[0].forEach((type, i) =>
          choices.push({
            id: 'claim-' + i,
            label: 'Claim ' + labels[type],
            note: 'Armament carrier · ' + offers.length + ' choice(s) remaining',
          }),
        );
      tabs.forEach((tab, i) =>
        choices.push({ id: 'tab-' + i, label: tab.toUpperCase(), selected: this.branches[seat] === i }),
      );
      const tab = tabs[this.branches[seat]];
      if (tab === 'module')
        for (const module of SORTIE_MODULES) {
          const price = sortiePrice(module.cost, state.lateRouteReward);
          choices.push({
            id: 'mod-' + module.id,
            label: module.name + ' · ' + price + ' C',
            note: module.description,
            disabled: !!state.sortieModule || state.credits < price || state.phase === 'route',
          });
        }
      else {
        const branch = UPGRADE_NODES.filter((n) => n.branch === (tab as UpgradeBranch));
        const tier = branch.find(
          (n) => !branch.some((s) => s.tier === n.tier && state.purchased.includes(s.id)),
        )?.tier;
        for (const node of branch.filter((n) => n.tier === tier))
          choices.push({
            id: 'buy-' + node.id,
            label: node.name + ' · ' + node.cost + ' C',
            note: node.description,
            disabled: !p.canPurchase(node.id).ok,
          });
      }
      if (state.purchased.length && state.respecAvailable)
        choices.push({ id: 'respec', label: 'Refund build', note: 'Uses this pilot’s one free respec.' });
    }
    if (card.ready) choices.splice(0);
    choices.push({
      id: 'ready',
      label: card.ready ? 'Ready · undo' : 'Ready to launch',
      disabled:
        !!this.squad && (this.squad.pilots[0].snapshot().phase === 'route' || this.squad.offers[seat].length > 0),
    });
    card.cursor = Math.min(this.cursors[seat], choices.length - 1);
    this.cursors[seat] = card.cursor;
    return card;
  }
  private render(): void {
    const state = this.squad?.pilots[0].snapshot();
    const report = state?.lastReport;
    const view: DeckView = {
      page: state ? 'hangar' : 'preflight',
      title: state ? 'Rearm & redeploy' : 'Choose your fighters',
      detail: state
        ? (state.phase === 'route'
            ? 'Route choice belongs to P' + (state.currentMissionId === 'fortress' ? '2' : '1')
            : 'Next · ' + this.squad!.pilots[0].currentMission().title) +
          (report ? '   /   ' + report.kills + ' kills · +' + report.creditsEarned + ' C each' : '')
        : 'Choose a kit for each seat, then mark both pilots ready.',
      cards: [this.pilotCard(0), this.pilotCard(1)],
    };
    this.draw(view);
    this.onView?.(view);
  }
  private draw(view: DeckView): void {
    cancelAnimationFrame(this.demoFrame);
    this.view = view;
    this.panel.classList.remove('hidden');
    this.panel.replaceChildren();
    const wrap = element('div', 'coop-wrap');
    const header = element('header', 'coop-header');
    header.append(
      element('small', '', 'KESTREL FLIGHT CONTROL   /   TWO PILOTS'),
      element('h2', '', view.title),
      element('p', '', view.detail),
    );
    wrap.append(header);
    const grid = element('div', 'coop-grid');
    for (const seat of SEATS) {
      const data = view.cards[seat],
        card = element('section', 'coop-card seat-' + seat);
      card.dataset.seat = String(seat);
      card.append(element('h3', '', data.title), element('strong', 'wallet', data.summary));
      if (view.page === 'hangar' && data.equipment) card.append(equipmentPreview(data.equipment, seat === 1));
      if (view.page === 'preflight') {
        const bay = element('div', 'coop-bay'),
          jet = element('div', 'coop-jet');
        jet.dataset.jet = String(seat);
        jet.append(element('i', 'wing-bars'));
        bay.append(jet);
        card.append(bay);
      }
      const list = element('div', 'coop-list'),
        tabsRow = element('div', 'coop-tabs');
      for (const [i, c] of data.choices.entries()) {
        const b = element(
          'button',
          'coop-choice' +
            (i === data.cursor ? ' cursor' : '') +
            (c.selected ? ' selected' : '') +
            (c.id === 'ready' ? ' ready-choice' : ''),
        );
        b.type = 'button';
        b.dataset.choice = c.id;
        b.disabled = !!c.disabled || (squadInput.onlineSeat !== undefined && squadInput.onlineSeat !== seat);
        if (c.selected !== undefined) b.setAttribute('aria-pressed', String(c.selected));
        b.append(element('b', '', c.label + (c.selected && c.id.startsWith('kit-') ? ' ✓' : '')));
        if (c.note) b.append(element('small', '', c.note));
        b.onclick = () => {
          if (this.guest) this.onGuestAction?.('choose:' + c.id);
          else this.choose(seat, c.id);
        };
        if (c.id.startsWith('tab-')) tabsRow.append(b);
        else if (c.id === 'ready') card.append(b);
        else list.append(b);
      }
      const readyButton = card.querySelector('.ready-choice');
      card.insertBefore(tabsRow, readyButton);
      card.insertBefore(list, readyButton);
      this.cards[seat] = card;
      grid.append(card);
    }
    wrap.append(grid);
    const footer = element('footer', 'coop-footer');
    const button = (name: string, fn: () => void) => {
      const b = element('button', 'text-button', name);
      b.onclick = fn;
      footer.append(b);
    };
    if (view.page === 'preflight' && !this.guest && squadInput.onlineSeat === undefined) {
      button(this.testing ? 'Finish key test' : 'Test keyboard', () => {
        this.testing = !this.testing;
        this.captureSeat = undefined;
        this.render();
      });
      for (const seat of SEATS)
        button('Remap P' + (seat + 1), () => {
          this.captureSeat = this.captureSeat === seat ? undefined : seat;
          this.testing = false;
          this.render();
        });
    }
    if (!this.guest) button('Return to title', this.leave);
    wrap.append(footer);
    if (this.captureSeat !== undefined) {
      const seat = this.captureSeat,
        row = element('div', 'coop-keyboard');
      for (const a of ACTIONS) {
        const b = element('button', 'coop-key', a + ' · ' + keyLabel(squadInput.keys[seat][a]));
        b.onclick = () => {
          this.message = 'Press a new key for ' + a;
          this.render();
          squadInput.capturing = (code) => {
            this.message = squadInput.bind(seat, a, code)
              ? 'Binding saved'
              : 'Key unavailable or already assigned';
            squadInput.capturing = undefined;
            this.render();
          };
        };
        row.append(b);
      }
      wrap.append(row);
    }
    if (this.testing || view.page === 'preflight') {
      const row = element('div', 'coop-keys');
      for (const seat of SEATS) {
        const group = element('div', 'seat-' + seat);
        group.append(element('b', '', 'P' + (seat + 1) + ' '));
        if (squadInput.onlineSeat !== undefined)
          group.append(element('span', '', 'WASD / arrows · Space fire · X EMP'));
        else
          for (const a of ACTIONS) {
            const key = element(
              'kbd',
              '',
              (a === 'fire' ? 'Fire ' : a === 'emp' ? 'EMP ' : '') + keyLabel(squadInput.keys[seat][a]),
            );
            key.dataset.key = seat + '-' + a;
            key.title = a;
            group.append(key);
          }
        row.append(group);
      }
      wrap.append(row);
      if (this.testing)
        wrap.append(
          element('p', '', 'Both pilots: move diagonally and hold fire together. Lit keys are reaching the game.'),
        );
    }
    if (this.message) wrap.append(element('p', '', this.message));
    this.panel.append(wrap);
    this.updateIndicators();
    if (this.testing) {
      let last = performance.now();
      const animate = (now: number) => {
        const dt = Math.min(40, now - last) / 1000;
        last = now;
        for (const seat of SEATS) {
          const pos = this.demoPosition[seat],
            axis = squadInput.axes(seat),
            jet = this.panel.querySelector<HTMLElement>('[data-jet="' + seat + '"]');
          pos.x = Math.max(-85, Math.min(85, pos.x + axis.x * 120 * dt));
          pos.y = Math.max(-14, Math.min(14, pos.y + axis.y * 80 * dt));
          if (jet) {
            jet.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px) rotate(' + axis.x * 8 + 'deg)';
            jet.classList.toggle('firing', axis.fire);
          }
        }
        this.demoFrame = requestAnimationFrame(animate);
      };
      this.demoFrame = requestAnimationFrame(animate);
    }
  }
  private updateIndicators(): void {
    for (const s of SEATS)
      for (const a of ACTIONS)
        this.panel
          .querySelector('[data-key="' + s + '-' + a + '"]')
          ?.classList.toggle('lit', squadInput.isDown(s, a));
  }
}
