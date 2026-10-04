type AttributeValue = string | number | boolean | null | undefined;
type Child = Node | string | null | undefined | false;

/**
 * Creates an element with attributes and children. Text always goes in as
 * text, never as markup.
 */
export function h<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Record<string, AttributeValue> = {},
  ...children: Child[]
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    // ARIA states are spelled out: aria-pressed="false" means something, a missing one does not.
    if (name.startsWith('aria-') && typeof value === 'boolean') {
      element.setAttribute(name, String(value));
      continue;
    }
    if (value === false || value === null || value === undefined) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  element.append(...children.filter((child): child is Node | string => Boolean(child)));
  return element;
}

/** Parses one of the game's own static SVG icons. */
export function icon(svgMarkup: string): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = svgMarkup.trim();
  const svg = template.content.firstElementChild as SVGElement;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

export function button(
  label: string | Node,
  onClick: () => void,
  className = 'button',
  attributes: Record<string, AttributeValue> = {},
  ...extra: Child[]
): HTMLButtonElement {
  const element = h('button', { class: className, type: 'button', ...attributes }, ...extra, label);
  element.addEventListener('click', onClick);
  return element;
}

/** Replaces an element's children. */
export function fill(element: Element, ...children: Child[]) {
  element.replaceChildren(...children.filter((child): child is Node | string => Boolean(child)));
}

/** A canvas that keeps its backing store matched to its CSS size and the screen's density. */
export class SizedCanvas {
  readonly element = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  pixelRatio = 1;

  constructor(
    className: string,
    private readonly maxRatio = 2,
  ) {
    this.element.className = className;
    const ctx = this.element.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available.');
    this.ctx = ctx;
  }

  /** Call before drawing; returns true when the size changed. */
  fit(): boolean {
    const ratio = Math.min(this.maxRatio, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.element.clientWidth));
    const height = Math.max(1, Math.round(this.element.clientHeight));
    if (width === this.width && height === this.height && ratio === this.pixelRatio) return false;
    this.width = width;
    this.height = height;
    this.pixelRatio = ratio;
    this.element.width = Math.round(width * ratio);
    this.element.height = Math.round(height * ratio);
    return true;
  }
}
