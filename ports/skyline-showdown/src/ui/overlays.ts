import type { MatchSummary } from '../game/session';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface PauseHandlers {
  resume(): void;
  restart(): void;
  /** Back to Quick Match's settings, or to the World Tour map. */
  leave(): void;
}

/** What the pause menu offers depends on where the match came from; a scored daily cannot restart. */
export interface PauseLabels {
  restart: string | null;
  leave: string;
}

export function buildPauseMenu(handlers: PauseHandlers, howToPlayHref: string, hallHref: string) {
  const resume = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Resume',
  );
  resume.addEventListener('click', handlers.resume);
  const restart = h('button', { class: 'button', type: 'button' }, 'Restart match');
  restart.addEventListener('click', handlers.restart);
  const leave = h('button', { class: 'button', type: 'button' }, 'Match settings');
  leave.addEventListener('click', handlers.leave);
  const note = h('p', { class: 'panel__note' });

  const element = h(
    'section',
    {
      class: 'overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'pause-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel panel--menu' },
      h('h2', { class: 'panel__title', id: 'pause-title' }, 'Paused'),
      note,
      h(
        'div',
        { class: 'menu' },
        resume,
        restart,
        leave,
        h('a', { class: 'button button--quiet', href: howToPlayHref }, 'How to play'),
        h('a', { class: 'button button--quiet', href: hallHref }, 'Back to the Hall'),
      ),
    ),
  );
  return {
    element,
    open(labels: PauseLabels, message: string | null = null) {
      restart.textContent = labels.restart ?? '';
      restart.hidden = labels.restart === null;
      leave.textContent = labels.leave;
      note.textContent = message ?? '';
      note.hidden = !message;
      element.hidden = false;
      resume.focus();
    },
    close() {
      element.hidden = true;
    },
  };
}

export interface VictoryHandlers {
  rematch(): void;
  settings(): void;
  challenge(): void;
}

/** A rival's parting words under the result. */
export interface PartingLine {
  text: string;
  speaker: string;
}

export function buildVictoryScreen(handlers: VictoryHandlers, hallHref: string) {
  const title = h('h2', { class: 'victory__title', id: 'victory-title' });
  const score = h('p', { class: 'victory__score' });
  const parting = h('blockquote', { class: 'victory__line' });
  const rematch = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Rematch',
  );
  rematch.addEventListener('click', handlers.rematch);
  const settings = h('button', { class: 'button', type: 'button' }, 'Match settings');
  settings.addEventListener('click', handlers.settings);
  const challenge = h(
    'button',
    { class: 'button', type: 'button' },
    icon(ICONS.swords),
    'Challenge a friend',
  );
  challenge.addEventListener('click', handlers.challenge);

  const element = h(
    'section',
    {
      class: 'overlay overlay--victory',
      role: 'dialog',
      'aria-labelledby': 'victory-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'victory' },
      title,
      score,
      parting,
      h(
        'div',
        { class: 'menu menu--row' },
        rematch,
        challenge,
        settings,
        h('a', { class: 'button button--quiet', href: hallHref }, 'Back to the Hall'),
      ),
    ),
  );
  return {
    element,
    /** `challengeable`: a person's hit this match can be sent to a friend. */
    show(summary: MatchSummary, line: PartingLine | null, challengeable: boolean) {
      challenge.hidden = !challengeable;
      const { names, scores, winner, accents } = summary;
      title.textContent = winner === null ? 'A draw!' : `${names[winner]} wins!`;
      element.style.setProperty('--accent', winner === null ? '#ffffff' : accents[winner]);
      score.textContent = `${names[0]} ${scores[0]} – ${scores[1]} ${names[1]}`;
      parting.hidden = line === null;
      parting.textContent = line ? `“${line.text}” — ${line.speaker}` : '';
      element.hidden = false;
      rematch.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}

/** A polite nudge on phones held upright: the city is wide. */
export function buildRotateHint(): HTMLElement {
  const dismiss = h('button', { class: 'button button--quiet', type: 'button' }, 'Play anyway');
  const element = h(
    'div',
    { class: 'rotate-hint', role: 'note' },
    h('div', { class: 'rotate-hint__phone', 'aria-hidden': 'true' }),
    h('p', {}, 'Turn your phone sideways — the city is wide.'),
    dismiss,
  );
  dismiss.addEventListener('click', () => document.body.classList.add('rotate-dismissed'));
  return element;
}
