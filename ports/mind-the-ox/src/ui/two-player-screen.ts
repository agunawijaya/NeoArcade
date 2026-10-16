import { keysFor, type KeySetId, type Settings } from '../settings';
import { button, choiceRow, h, keyLabel } from './dom';

export interface TwoPlayerHandlers {
  settings(): Settings;
  change(style: Settings['twoPlayer']): void;
  play(): void;
  back(): void;
}

/**
 * Two players on one screen, split top and bottom: Co-op against the
 * computer's airfields on 1984's battlefield, or Versus, ten targets each
 * and the oxen in no man's land. One keyboard (two halves) or two pads.
 */
export function buildTwoPlayerScreen(handlers: TwoPlayerHandlers) {
  const style = choiceRow(
    'Game',
    [
      { value: 'coop' as const, label: 'Co-op' },
      { value: 'versus' as const, label: 'Versus' },
    ],
    () => handlers.settings().twoPlayer,
    (value) => {
      handlers.change(value);
      describe();
    },
  );
  const about = h('p', { class: 'panel__subtitle' });
  const keys = h('div', { class: 'pair-keys' });
  const takeOff = button('Take off', () => handlers.play(), 'card__button');

  const element = h(
    'section',
    { class: 'screen', 'aria-labelledby': 'pair-title', hidden: true },
    h(
      'div',
      { class: 'card card--wide' },
      h('h2', { class: 'card__title card__title--small', id: 'pair-title' }, 'Two players'),
      style.element,
      about,
      keys,
      h(
        'p',
        { class: 'card__note' },
        'Two gamepads? The first flies the top plane, the second the bottom one. Keys can be changed in Settings.',
      ),
      h('div', { class: 'card__footer' }, button('Back', handlers.back, 'chip'), takeOff),
    ),
  );

  const keyCard = (title: string, set: KeySetId) => {
    const map = keysFor(handlers.settings(), set);
    const row = (label: string, codes: string[]) =>
      h('li', {}, h('span', {}, label), h('kbd', {}, codes.map(keyLabel).join(' ')));
    return h(
      'div',
      { class: 'pair-keys__card' },
      h('h3', {}, title),
      h(
        'ul',
        {},
        row('Nose up / down', [map.pull, map.push]),
        row('Throttle', [map.slower, map.faster]),
        row('Guns', [map.fire]),
        row('Bombs', [map.bomb]),
        row('Flip', [map.flip]),
        row('Home', [map.home]),
      ),
    );
  };

  const describe = () => {
    about.textContent =
      handlers.settings().twoPlayer === 'coop'
        ? 'Fly together from two airfields against the computer’s defenders. Out of planes? Fly on as a ghost until your partner wins the round, or doesn’t.'
        : 'Ten targets each, oxen in the middle. Destroy all of the other side’s targets, or shoot your friend out of planes. Best of three.';
  };

  const refresh = () => {
    style.refresh();
    describe();
    keys.replaceChildren(keyCard('Top · player 1', 'left'), keyCard('Bottom · player 2', 'right'));
  };

  return {
    element,
    refresh,
    focusFirst() {
      takeOff.focus();
    },
  };
}
