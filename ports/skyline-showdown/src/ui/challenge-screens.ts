import type { ChallengeOutcome, ChallengeProblem } from '../challenge/challenge';
import { NICKNAME_LIMIT } from '../challenge/link';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { buildShareBox } from './share-box';

/**
 * The screens around a challenge link: making one (with an optional
 * nickname, the only personal thing a link can carry), being challenged,
 * the verdict, and a kind word when a link cannot be played.
 */
export interface ChallengeDraft {
  /** What the friend will face, in a line. */
  summary: string;
  /** The message to send, link included, signed with the nickname if there is one. */
  message(nickname: string | null): string;
}

export interface ChallengeMaker {
  element: HTMLElement;
  open(draft: ChallengeDraft): void;
  close(): void;
}

export function buildChallengeMaker(handlers: { close(): void }): ChallengeMaker {
  const summary = h('p', { class: 'panel__note' });
  const nickname = h('input', {
    class: 'field challenge__nickname',
    type: 'text',
    maxlength: NICKNAME_LIMIT,
    placeholder: 'Sign it (optional)',
    autocomplete: 'off',
    'aria-label': 'Nickname for this challenge (optional)',
    'data-focus-key': 'nickname',
  });
  const done = h('button', { class: 'button button--quiet', type: 'button' }, 'Done');
  done.addEventListener('click', handlers.close);
  const share = buildShareBox('Your challenge, ready to send', [done]);
  const element = h(
    'section',
    {
      class: 'overlay overlay--challenge',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'challenge-maker-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel challenge' },
      h(
        'h2',
        { class: 'panel__title', id: 'challenge-maker-title' },
        icon(ICONS.swords),
        ' Challenge a friend',
      ),
      summary,
      h(
        'label',
        { class: 'challenge__sign' },
        h('span', {}, 'Your nickname'),
        nickname,
        h('small', {}, 'Links carry no names unless you type one here.'),
      ),
      share.element,
    ),
  );
  let draft: ChallengeDraft | null = null;
  const render = () => {
    if (draft) share.show(draft.message(nickname.value.trim() || null));
  };
  nickname.addEventListener('input', render);

  return {
    element,
    open(next) {
      draft = next;
      summary.textContent = next.summary;
      nickname.value = '';
      render();
      element.hidden = false;
      element.querySelector<HTMLElement>('[data-share="copy"]')?.focus();
    },
    close() {
      element.hidden = true;
      draft = null;
    },
  };
}

export interface ChallengeIntro {
  element: HTMLElement;
  show(from: string | null, where: string): void;
  hide(): void;
}

export function buildChallengeIntro(handlers: { play(): void; decline(): void }): ChallengeIntro {
  const title = h('h2', { class: 'results__title', id: 'challenge-intro-title' });
  const where = h('p', { class: 'card__chapter' });
  const play = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Watch their shot',
  );
  play.addEventListener('click', handlers.play);
  const decline = h('button', { class: 'button button--quiet', type: 'button' }, 'Not now');
  decline.addEventListener('click', handlers.decline);
  const element = h(
    'section',
    {
      class: 'overlay overlay--challenge',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'challenge-intro-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel results challenge challenge--intro' },
      h('div', { class: 'challenge__emblem', 'aria-hidden': 'true' }, icon(ICONS.swords)),
      where,
      title,
      h(
        'p',
        { class: 'panel__note' },
        'Watch their shot, then you get one throw from the very same spot: hit what they hit, or land closer.',
      ),
      h('div', { class: 'menu menu--row' }, decline, play),
    ),
  );
  return {
    element,
    show(from, place) {
      title.textContent = from ? `${from} challenges you!` : 'A friend challenges you!';
      where.textContent = place;
      element.hidden = false;
      play.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}

export interface ChallengeScore {
  outcome: ChallengeOutcome;
  copycat: boolean;
  from: string | null;
  theirs: string;
  yours: string;
  xp: number;
}

export interface ChallengeResult {
  element: HTMLElement;
  show(score: ChallengeScore): void;
  hide(): void;
}

const VERDICTS: Record<ChallengeOutcome, string> = {
  matched: 'Matched!',
  beaten: 'Beaten!',
  lost: 'Not this time',
};

export function buildChallengeResult(handlers: {
  reply(): void;
  retry(): void;
  menu(): void;
}): ChallengeResult {
  const title = h('h2', { class: 'results__title', id: 'challenge-result-title' });
  const lines = h('ul', { class: 'results__goals challenge__lines' });
  const notes = h('div', { class: 'results__notes' });
  const reply = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.share),
    'Send a reply',
  );
  reply.addEventListener('click', handlers.reply);
  const retry = h('button', { class: 'button', type: 'button' }, icon(ICONS.retry), 'Try again');
  retry.addEventListener('click', handlers.retry);
  const menu = h('button', { class: 'button button--quiet', type: 'button' }, 'Main menu');
  menu.addEventListener('click', handlers.menu);
  const element = h(
    'section',
    {
      class: 'overlay overlay--solve',
      role: 'dialog',
      'aria-labelledby': 'challenge-result-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel results challenge' },
      title,
      lines,
      notes,
      h('div', { class: 'menu menu--row' }, reply, retry, menu),
    ),
  );
  return {
    element,
    show(score) {
      element.dataset.outcome = score.outcome;
      title.textContent = VERDICTS[score.outcome];
      lines.replaceChildren(
        h(
          'li',
          { class: 'results__goal results__goal--done' },
          h('span', {}, '◆'),
          `${score.from ?? 'Their'} shot: ${score.theirs}`,
        ),
        h(
          'li',
          { class: 'results__goal results__goal--done' },
          h('span', {}, '◆'),
          `Your shot: ${score.yours}`,
        ),
      );
      notes.replaceChildren(
        ...[
          score.copycat ? 'Copycat! Your banana came down right where theirs did.' : null,
          score.xp > 0 ? `+${score.xp} XP on your Arcade Pass` : null,
        ]
          .filter((text): text is string => text !== null)
          .map((text) => h('p', {}, text)),
      );
      element.hidden = false;
      reply.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}

const PROBLEMS: Record<ChallengeProblem, { title: string; text: string }> = {
  damaged: {
    title: 'This link has lost its way',
    text: 'Part of the challenge seems to be missing or changed. Ask your friend to send it again, whole.',
  },
  olderRules: {
    title: 'A challenge from an older Skyline',
    text: 'It was made with an earlier version of the game, whose bananas flew a little differently, so it cannot be replayed fairly here. Ask your friend for a fresh link.',
  },
  newer: {
    title: 'A challenge from the future',
    text: 'It was made with a newer version of the game than this page. Reload to get the latest, then open the link again.',
  },
};

export interface ChallengeProblemNote {
  element: HTMLElement;
  show(problem: ChallengeProblem): void;
  hide(): void;
}

export function buildChallengeProblem(handlers: { menu(): void }): ChallengeProblemNote {
  const title = h('h2', { class: 'panel__title', id: 'challenge-problem-title' });
  const text = h('p', { class: 'panel__note' });
  const menu = h('button', { class: 'button button--primary', type: 'button' }, 'Main menu');
  menu.addEventListener('click', handlers.menu);
  const element = h(
    'section',
    {
      class: 'overlay overlay--challenge',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'challenge-problem-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel panel--menu challenge' },
      title,
      text,
      h('div', { class: 'menu' }, menu),
    ),
  );
  return {
    element,
    show(problem) {
      title.textContent = PROBLEMS[problem].title;
      text.textContent = PROBLEMS[problem].text;
      element.hidden = false;
      menu.focus();
    },
    hide() {
      element.hidden = true;
    },
  };
}
