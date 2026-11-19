import { publicAssetUrl } from '../game/assets/publicAsset';
import { ROADMAP_ART } from '../game/assets/fleetArt';

const partNames = ['ARC barrels', 'LANCE emitters', 'NOVA pods', 'WING docks', 'ION coils'];
let sheets: Promise<HTMLImageElement> | undefined;
function hangarSheet(): Promise<HTMLImageElement> {
  return sheets ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { sheets = undefined; reject(new Error('Kestrel inspection image unavailable')); };
    image.src = publicAssetUrl(ROADMAP_ART + 'kestrel-hangar.webp');
  });
}
export function closeEquipmentInspection(): void {
  document.querySelector<HTMLDialogElement>('dialog.equipment-closeup[open]')?.close();
}

function inspect(canvas: HTMLCanvasElement, description: string, wing: boolean): void {
  closeEquipmentInspection();
  const dialog = document.createElement('dialog');
  dialog.className = 'equipment-closeup';
  dialog.setAttribute('aria-label', wing ? 'Wingmate equipment inspection' : 'Kestrel equipment inspection');
  const title = document.createElement('h2');
  title.textContent = wing ? 'Wingmate' : 'Kestrel';
  const enlarged = document.createElement('canvas');
  enlarged.width = canvas.width; enlarged.height = canvas.height;
  enlarged.getContext('2d')?.drawImage(canvas, 0, 0);
  const fit = document.createElement('p');
  fit.textContent = description;
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Close inspection';
  close.onclick = () => dialog.close();
  dialog.append(title, enlarged, fit, close);
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.addEventListener('keyup', e => e.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}

export function equipmentPreview(rows: readonly number[], wing = false): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'equipment-inspection';
  const canvas = document.createElement('canvas');
  canvas.width = 352; canvas.height = 416;
  const caption = document.createElement('figcaption');
  const title = document.createElement('strong');
  title.textContent = 'Installed equipment';
  const description = document.createElement('span');
  const valid = rows.filter(row => Number.isInteger(row) && row >= 0 && row < 17);
  description.textContent = valid.map(row => row === 15 ? 'Shield emitters' : row === 16 ? 'Reactor vents'
    : partNames[Math.floor(row / 3)] + ' ' + ['I', 'II', 'III'][row % 3]).join(' · ');
  caption.append(title, description);
  const inspectButton = document.createElement('button');
  inspectButton.type = 'button'; inspectButton.className = 'equipment-inspect-button';
  inspectButton.title = wing ? 'Inspect Wingmate equipment' : 'Inspect Kestrel equipment';
  inspectButton.setAttribute('aria-label', inspectButton.title);
  inspectButton.setAttribute('aria-haspopup', 'dialog'); inspectButton.disabled = true;
  inspectButton.addEventListener('click', () => inspect(canvas, description.textContent ?? '', wing));
  inspectButton.append(canvas);
  figure.append(inspectButton, caption);
  void hangarSheet().then(sheet => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const layer = (row: number) => ctx.drawImage(sheet, row % 6 * width, Math.floor(row / 6) * height,
      width, height, 0, 0, width, height);
    layer(17);
    if (wing) {
      ctx.globalCompositeOperation = 'source-atop';
      const stripe = ctx.createLinearGradient(0, 50, 0, 380);
      stripe.addColorStop(0, 'rgba(255,161,55,.40)'); stripe.addColorStop(1, 'rgba(60,104,169,.26)');
      ctx.fillStyle = stripe; ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
    }
    valid.forEach(layer);
    canvas.dataset.rendered = 'true'; inspectButton.disabled = false;
  }).catch(() => canvas.hidden = true);
  return figure;
}
