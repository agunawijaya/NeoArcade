import type { Category } from './categories';
import { icon } from './dom';
import { machineSvg, type MachineId } from './machines';

/** A category's emblem, stroked in currentColor; CSS colours it with the category. */
export function categoryEmblem(category: Category): SVGElement {
  return icon(
    `<svg class="emblem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${category.emblem}</svg>`,
  );
}

export function machineSilhouette(id: MachineId): SVGElement {
  return icon(machineSvg(id));
}
