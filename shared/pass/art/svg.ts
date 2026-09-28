const SVG_NS = 'http://www.w3.org/2000/svg';

type AttributeValue = string | number | null | undefined | false;
type Child = SVGElement | null | undefined | false;

/** Creates an SVG element; attributes that are null, undefined or false are left out. */
export function svg<Tag extends keyof SVGElementTagNameMap>(
  tag: Tag,
  attributes: Record<string, AttributeValue> = {},
  ...children: Child[]
): SVGElementTagNameMap[Tag] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    element.setAttribute(name, String(value));
  }
  element.append(...children.filter((child): child is SVGElement => Boolean(child)));
  return element;
}

let nextId = 0;

/** Gradients and clip paths are looked up by id across the whole page, so each drawing needs its own. */
export function uniqueId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

/** The root element for a piece of art; without a label it is hidden from screen readers. */
export function artRoot(viewBox: string, className: string, label?: string): SVGSVGElement {
  const root = svg('svg', { viewBox, class: className, focusable: 'false' });
  if (label) {
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', label);
  } else {
    root.setAttribute('aria-hidden', 'true');
  }
  return root;
}

/** Mixes two #rrggbb colours; amount 0 is `from`, 1 is `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  const mixed = a.map((channel, index) =>
    Math.round(channel + ((b[index] ?? 0) - channel) * amount),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Points around a centre whose radius follows `radiusAt(angle)`, as an SVG path. */
export function radialPath(
  cx: number,
  cy: number,
  samples: number,
  radiusAt: (angle: number) => number,
): string {
  const points: string[] = [];
  for (let index = 0; index < samples; index++) {
    const angle = -Math.PI / 2 + (index / samples) * Math.PI * 2;
    const radius = radiusAt(angle);
    points.push(
      `${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`,
    );
  }
  return `M${points.join('L')}Z`;
}
