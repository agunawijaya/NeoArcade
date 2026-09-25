type AttributeValue = string | number | boolean | null | undefined;
type Child = Node | string | null | undefined | false;

/**
 * Creates an element with attributes and children. Text children are always
 * inserted as text, so catalog strings can never inject markup.
 *
 *   h('a', { class: 'button', href: '#/' }, 'Back')
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

/** Parses one of the Hall's own static SVG icons. Never pass it user or catalog text. */
export function icon(svgMarkup: string): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = svgMarkup.trim();
  const svg = template.content.firstElementChild as SVGElement;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

export function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0 && !element.closest('[hidden], [inert]');
}
