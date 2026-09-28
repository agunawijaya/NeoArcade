import {
  cleanName,
  drawAvatar,
  HALL_THEMES,
  isLookUnlocked,
  LOOK_OPTIONS,
  LOOK_SLOT_NAMES,
  NAME_MAX_LENGTH,
  type ArcadePass,
  type LookSlot,
  type PlayerLook,
} from '@shared/pass';
import { h, icon, isVisible } from './dom';
import { ICONS } from './icons';
import { applyHallTheme, buildNamePlate } from './pass-look';
import { nearestInDirection, type Direction } from './spatial-nav';
import type { HallTheme } from './theme';

/**
 * Edit profile: the name, every part of the avatar, the name plate's frame
 * and the Hall's colours. Changes preview live (the Hall theme too) and are
 * only kept on Save. Locked parts stay visible with the level that unlocks
 * them, so there is always something to look forward to.
 */
export interface ProfileEditor {
  open(onClosed?: () => void): void;
}

const SLOTS = Object.keys(LOOK_OPTIONS) as LookSlot[];
const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function createProfileEditor(pass: ArcadePass, hallTheme: HallTheme): ProfileEditor {
  const dialog = h('dialog', { class: 'sheet editor', 'aria-labelledby': 'editor-title' });
  document.body.append(dialog);

  let draft: PlayerLook = { ...pass.profile.look };
  let slot: LookSlot = 'face';
  let onClosed: (() => void) | undefined;

  const preview = h('div', { class: 'editor__avatar' });
  const platePreview = h('div', { class: 'editor__plate' });
  const nameField = h('input', {
    class: 'editor__name-field',
    type: 'text',
    maxlength: NAME_MAX_LENGTH,
    autocomplete: 'nickname',
    spellcheck: 'false',
    'aria-describedby': 'editor-name-hint',
  });
  const tabs = h('div', { class: 'editor__tabs', role: 'tablist', 'aria-label': 'Parts' });
  const options = h('div', { class: 'editor__options', role: 'radiogroup' });
  const saveButton = h(
    'button',
    { class: 'button button--play', type: 'button' },
    icon(ICONS.check),
    'Save',
  );
  const cancelButton = h('button', { class: 'button', type: 'button' }, 'Cancel');
  const closeButton = h(
    'button',
    { class: 'sheet__close', type: 'button', 'aria-label': 'Close without saving' },
    icon(ICONS.close),
  );

  dialog.append(
    h(
      'div',
      { class: 'sheet__panel editor__panel' },
      closeButton,
      h('h2', { class: 'sheet__title', id: 'editor-title' }, 'Edit profile'),
      h(
        'div',
        { class: 'editor__body' },
        h(
          'div',
          { class: 'editor__preview' },
          preview,
          platePreview,
          h(
            'label',
            { class: 'editor__name' },
            h('span', {}, 'Name'),
            nameField,
            h(
              'span',
              { class: 'editor__name-hint', id: 'editor-name-hint' },
              `Up to ${NAME_MAX_LENGTH} characters`,
            ),
          ),
        ),
        h(
          'div',
          { class: 'editor__parts' },
          tabs,
          options,
          h(
            'p',
            { class: 'editor__hint' },
            'Locked parts show the level that unlocks them. Keep playing!',
          ),
        ),
      ),
      h('div', { class: 'sheet__actions' }, cancelButton, saveButton),
    ),
  );

  const level = () => pass.level;

  const renderPreview = () => {
    preview.replaceChildren(drawAvatar(draft, { label: 'Your avatar' }));
    platePreview.replaceChildren(buildNamePlate(cleanName(nameField.value), draft.frame));
    applyHallTheme(draft.hallTheme, hallTheme.theme);
  };

  const renderTabs = () => {
    tabs.replaceChildren(
      ...SLOTS.map((candidate) => {
        const tab = h(
          'button',
          {
            class: 'editor__tab',
            type: 'button',
            role: 'tab',
            id: `editor-tab-${candidate}`,
            'aria-selected': String(candidate === slot),
            tabindex: candidate === slot ? 0 : -1,
          },
          LOOK_SLOT_NAMES[candidate],
        );
        tab.addEventListener('click', () => selectSlot(candidate, false));
        return tab;
      }),
    );
  };

  const renderOptions = () => {
    options.setAttribute('aria-labelledby', `editor-tab-${slot}`);
    options.dataset.slot = slot;
    options.replaceChildren(
      ...LOOK_OPTIONS[slot].map((option) => {
        const unlocked = isLookUnlocked(slot, option.id, level());
        const selected = draft[slot] === option.id;
        const button = h(
          'button',
          {
            class: `part${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`,
            type: 'button',
            role: 'radio',
            'aria-checked': String(selected),
            'aria-disabled': unlocked ? false : 'true',
            'aria-label': unlocked
              ? option.name
              : `${option.name}, unlocks at level ${option.level}`,
            tabindex: selected ? 0 : -1,
          },
          h('span', { class: 'part__art' }, partPreview(slot, option.id)),
          h('span', { class: 'part__name' }, option.name),
          unlocked
            ? null
            : h('span', { class: 'part__lock' }, icon(ICONS.lock), `Level ${option.level}`),
        );
        button.addEventListener('click', () => {
          if (!unlocked) return;
          draft = { ...draft, [slot]: option.id };
          renderPreview();
          renderOptions();
          options.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
        });
        return button;
      }),
    );
  };

  /** A small preview of one choice: the avatar wearing it, the frame on a plate, or the theme's colours. */
  const partPreview = (part: LookSlot, id: string): Node => {
    if (part === 'frame') return buildNamePlate('Aa', id as PlayerLook['frame'], 'span');
    if (part === 'hallTheme') {
      const theme = HALL_THEMES.find((option) => option.id === id) ?? HALL_THEMES[0];
      const [primary, secondary] = theme[hallTheme.theme];
      return h(
        'span',
        { class: 'part__swatch', style: `--primary: ${primary}; --secondary: ${secondary}` },
        h('span', {}, 'Neo'),
        h('span', {}, 'Arcade'),
      );
    }
    return drawAvatar({ ...draft, [part]: id } as PlayerLook);
  };

  const selectSlot = (next: LookSlot, focusTab: boolean) => {
    slot = next;
    renderTabs();
    renderOptions();
    if (focusTab) tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  };

  tabs.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    selectSlot(SLOTS[(SLOTS.indexOf(slot) + step + SLOTS.length) % SLOTS.length] ?? 'face', true);
  });

  options.addEventListener('keydown', (event) => {
    const direction = ARROWS[event.key];
    const from = (event.target as HTMLElement).closest<HTMLElement>('.part');
    if (!direction || !from) return;
    event.preventDefault();
    const parts = [...options.querySelectorAll<HTMLElement>('.part')].filter(isVisible);
    const next = nearestInDirection(
      from.getBoundingClientRect(),
      parts.map((part) => Object.assign(part.getBoundingClientRect().toJSON(), { part })),
      direction,
    )?.part;
    if (!next) return;
    for (const part of parts) part.tabIndex = part === next ? 0 : -1;
    next.focus();
  });

  nameField.addEventListener('input', renderPreview);

  const close = () => dialog.close();
  saveButton.addEventListener('click', () => {
    pass.rename(nameField.value);
    pass.dressUp(draft);
    close();
  });
  cancelButton.addEventListener('click', close);
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    // Whatever was previewed but not saved goes back to what the Pass holds.
    applyHallTheme(pass.profile.look.hallTheme, hallTheme.theme);
    onClosed?.();
  });

  return {
    open(closed) {
      onClosed = closed;
      draft = { ...pass.profile.look };
      nameField.value = pass.profile.name;
      slot = 'face';
      renderPreview();
      renderTabs();
      renderOptions();
      dialog.showModal();
      nameField.focus();
    },
  };
}
