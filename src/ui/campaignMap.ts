import type { CampaignRoute, CampaignSnapshot, MissionId } from '../game/simulation/types';
import { LATE_ROUTE_REWARDS, ROUTE_REWARDS } from '../game/content/routeRewards';

export interface RouteMapNode {
  id: MissionId;
  label: string;
  column: number;
  lane: number;
  route?: CampaignRoute;
}

export const ROUTE_MAP_NODES: readonly RouteMapNode[] = [
  { id: 'coastal', label: 'Coastal Intercept', column: 0, lane: 1 },
  { id: 'minefield', label: ROUTE_REWARDS.salvage.destination, column: 1, lane: 0, route: 'salvage' },
  { id: 'aurora', label: ROUTE_REWARDS.storm.destination, column: 1, lane: 2, route: 'storm' },
  { id: 'fortress', label: 'Fortress Approach', column: 2, lane: 1 },
  { id: 'graveyard', label: LATE_ROUTE_REWARDS.salvage.destination, column: 3, lane: 0, route: 'salvage' },
  { id: 'stormbreak', label: LATE_ROUTE_REWARDS.storm.destination, column: 3, lane: 2, route: 'storm' },
  { id: 'carrierSiege', label: 'Carrier Siege', column: 4, lane: 1 },
  { id: 'dreadnought', label: 'Dreadnought', column: 5, lane: 1 },
  { id: 'lastLight', label: 'Last Light', column: 6, lane: 1 },
];
export const ROUTE_MAP_EDGES: readonly (readonly [MissionId, MissionId])[] = [
  ['coastal', 'minefield'], ['coastal', 'aurora'], ['minefield', 'fortress'], ['aurora', 'fortress'],
  ['fortress', 'graveyard'], ['fortress', 'stormbreak'], ['graveyard', 'carrierSiege'], ['stormbreak', 'carrierSiege'],
  ['carrierSiege', 'dreadnought'], ['dreadnought', 'lastLight'],
];

/** Presentation only. Merely opening the map cannot advance or award anything. */
export function routeNodeStatus(node: RouteMapNode, state: CampaignSnapshot): 'current' | 'complete' | 'future' | 'bypassed' | 'choice' | 'unrecorded' {
  const current = ROUTE_MAP_NODES.find((candidate) => candidate.id === state.currentMissionId) ?? ROUTE_MAP_NODES[0];
  // Version-6 campaigns always visited Minefield, even if they chose Stormbreak
  // later. Never invent an Aurora visit from that older, late route selection.
  const earlyRoute = state.earlyRoute ?? (state.routeReward === 'aegis-bastion' || state.currentMissionId === 'aurora' || state.seenStoryChapters?.includes('aurora-key') ? 'storm'
    : state.routeReward === 'arc-resonator' || state.currentMissionId === 'minefield' || state.seenStoryChapters?.includes('warden-key') || current.column >= 2 ? 'salvage' : undefined);
  const selectedRoute = node.column === 1 ? earlyRoute : state.route;
  if (node.route && node.column < current.column && !selectedRoute) return 'unrecorded';
  if (selectedRoute && node.route && node.route !== selectedRoute) return 'bypassed';
  if (state.phase === 'route' && node.column === (current.column === 0 ? 1 : 3)) return 'choice';
  if (state.phase === 'victory') return 'complete';
  if (node.id === current.id) return state.phase === 'story' || state.phase === 'route' ? 'complete' : 'current';
  return node.column < current.column ? 'complete' : 'future';
}

export function renderCampaignMap(host: HTMLElement, state: CampaignSnapshot, destinations: HTMLElement, choose?: (route: CampaignRoute) => void): void {
  const map = document.createElement('div');
  map.className = 'campaign-map';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1080 360');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const position = (node: RouteMapNode) => ({ x: 76 + node.column * 154, y: 60 + node.lane * 120 });
  for (const [from, to] of ROUTE_MAP_EDGES) {
    const a = ROUTE_MAP_NODES.find((node) => node.id === from)!;
    const b = ROUTE_MAP_NODES.find((node) => node.id === to)!;
    const p = position(a), q = position(b);
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', `M${p.x},${p.y} C${p.x + 77},${p.y} ${q.x - 77},${q.y} ${q.x},${q.y}`);
    path.setAttribute('class', [a, b].some((node) => routeNodeStatus(node, state) === 'bypassed') ? 'map-edge bypassed' : 'map-edge');
    svg.append(path);
  }
  map.append(svg);
  for (const node of ROUTE_MAP_NODES) {
    const status = routeNodeStatus(node, state);
    const card = document.createElement('article');
    card.className = `map-node ${status}`;
    card.style.left = `${position(node).x / 1080 * 100}%`;
    card.style.top = `${position(node).y / 360 * 100}%`;
    if (status === 'current') card.setAttribute('aria-current', 'step');
    const step = document.createElement('span');
    step.className = 'map-node-number'; step.textContent = status === 'complete' ? '✓' : String(node.column + 1).padStart(2, '0');
    const label = document.createElement('strong'); label.textContent = node.label;
    const detail = document.createElement('small'); detail.textContent = status === 'bypassed' ? 'OTHER ROUTE' : status.toUpperCase();
    card.append(step, label, detail);
    map.append(card);
  }
  host.replaceChildren(map);
  destinations.replaceChildren(...[ROUTE_REWARDS, LATE_ROUTE_REWARDS].flatMap((fork, index) =>
    Object.values(fork).map(destination => {
      const currentFork = state.currentMissionId === 'fortress' ? 1 : 0;
      const card = document.createElement(choose && index === currentFork ? 'button' : 'article');
      if (card instanceof HTMLButtonElement) {
        card.type = 'button';
        card.dataset.route = destination.route;
        card.addEventListener('click', () => choose?.(destination.route));
      }
      const title = document.createElement('strong');
      title.textContent = destination.destination;
      const objective = document.createElement('p');
      objective.textContent = destination.objective;
      const reward = document.createElement('span');
      reward.className = 'destination-reward';
      reward.textContent = `On clear · ${destination.name} · ${destination.effect}`;
      card.dataset.junction = String(index + 1);
      card.append(title, objective, reward);
      return card;
    })));
}
