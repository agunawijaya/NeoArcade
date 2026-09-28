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
