import { h } from './dom';

/**
 * The controls the Quick Match and Settings screens are built from. Every
 * control carries a `data-focus-key`, so a screen can re-render and put
 * keyboard focus back where it was.
 */
export interface Choice<T extends string> {
  value: T;
  label: string;
  note?: string;
}

export function group(label: string, control: HTMLElement): HTMLElement {
  return h(
    'fieldset',
    { class: 'setting' },
    h('legend', { class: 'setting__label' }, label),
    control,
  );
}

export function segmented<T extends string>(
  name: string,
  current: T,
  choices: Choice<T>[],
  choose: (value: T) => void,
  disabled = false,
): HTMLElement {
  return h(
    'div',
    {
      class: 'segmented',
      role: 'radiogroup',
      'aria-label': name,
      'aria-disabled': String(disabled),
    },
    ...choices.map((choice) => {
      const button = h(
        'button',
        {
          class: 'segmented__option',
          type: 'button',
          role: 'radio',
          'aria-checked': String(choice.value === current),
          disabled,
          'data-value': choice.value,
          'data-focus-key': `${name}-${choice.value}`,
        },
        h('span', {}, choice.label),
        choice.note ? h('small', {}, choice.note) : null,
      );
      button.addEventListener('click', () => choose(choice.value));
      return button;
    }),
  );
}

export function toggle(label: string, on: boolean, change: (on: boolean) => void): HTMLElement {
  const button = h(
    'button',
    {
      class: 'toggle',
      type: 'button',
      role: 'switch',
      'aria-checked': String(on),
      'data-focus-key': `toggle-${label}`,
    },
    h(
      'span',
      { class: 'toggle__track', 'aria-hidden': 'true' },
      h('span', { class: 'toggle__thumb' }),
    ),
    label,
  );
  button.addEventListener('click', () => change(!on));
  return button;
}

export function slider(label: string, value: number, change: (value: number) => void): HTMLElement {
  const input = h('input', {
    class: 'slider',
    type: 'range',
    min: 0,
    max: 100,
    value: Math.round(value * 100),
    'aria-label': `${label} volume`,
  });
  input.addEventListener('input', () => change(Number(input.value) / 100));
  return h('label', { class: 'settings__slider' }, h('span', {}, label), input);
}

/** Re-renders a screen's body while keeping keyboard focus on the same control. */
export function keepingFocus(body: HTMLElement, render: () => void) {
  const focused = document.activeElement?.getAttribute('data-focus-key');
  render();
  if (focused) body.querySelector<HTMLElement>(`[data-focus-key="${focused}"]`)?.focus();
}
