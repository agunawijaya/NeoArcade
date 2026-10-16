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

export function button(
  label: string | Node,
  onClick: () => void,
  className = 'button',
  attributes: Record<string, AttributeValue> = {},
  ...extra: Child[]
): HTMLButtonElement {
  const element = h('button', { class: className, type: 'button', ...attributes }, label, ...extra);
  element.addEventListener('click', onClick);
  return element;
}

/**
 * A row of mutually exclusive choices, like radio buttons but tappable:
 * the chosen one is pressed. Calls back with the new value.
 */
export function choiceRow<Value extends string | number | boolean>(
  label: string,
  options: readonly { value: Value; label: string }[],
  current: () => Value,
  choose: (value: Value) => void,
): { element: HTMLElement; refresh(): void } {
  const buttons = options.map((option) =>
    button(
      option.label,
      () => {
        choose(option.value);
        refresh();
      },
      'chip',
    ),
  );
  const refresh = () => {
    buttons.forEach((element, index) =>
      element.setAttribute('aria-pressed', String(options[index]?.value === current())),
    );
  };
  refresh();
  const element = h(
    'div',
    { class: 'choice', role: 'group', 'aria-label': label },
    h('span', { class: 'choice__label' }, label),
    h('span', { class: 'choice__options' }, ...buttons),
  );
  return { element, refresh };
}

/** A key's name as it is printed on the key, from its KeyboardEvent.code. */
export function keyLabel(code: string): string {
  const named: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    Space: 'Space',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    Enter: 'Enter',
    Backspace: 'Backspace',
  };
  return named[code] ?? code.replace(/^(Key|Digit|Numpad)/, '');
}
