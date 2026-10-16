import { goalLabel, type ChapterCard } from '../game/campaign';
import { isChapterOpen, starsOf, totalStars, type Progress } from '../progress';
import { THEMES, type ThemeCopy, type ThemeId } from '../themes';
import { button, h } from './dom';

export interface CampaignHandlers {
  progress: Progress;
  theme(): ThemeId;
  play(chapter: ChapterCard): void;
  back(): void;
}

/** One campaign as its screen shows it: the land campaign's chapters, or the At Sea missions. */
export interface CampaignBook {
  id: string;
  title: string;
  /** What each one is called: a chapter, a mission. */
  unit: string;
  chapters: readonly ChapterCard[];
  /** The line under the title, after the stars. */
  blurb: string;
  firstStar: string;
  /** A line of advice for the briefing, if the chapter has one. */
  advice?(chapter: ChapterCard, theme: ThemeCopy): string | null;
}

function starRow(stars: readonly boolean[]): HTMLElement {
  return h(
    'span',
    { class: 'stars', 'aria-label': `${stars.filter(Boolean).length} of 3 stars` },
    ...stars.map((earned) => h('span', { class: earned ? 'star star--earned' : 'star' }, '★')),
  );
}

/**
 * A campaign's eight chapters (or missions): each with its twist and stars,
 * opening one after another. Choosing one shows its briefing, in the
 * theme's voice, and what the second and third stars ask.
 */
export function buildCampaignScreen(book: CampaignBook, handlers: CampaignHandlers) {
  const { chapters } = book;
  const list = h('ol', { class: 'chapters' });
  const briefing = h('div', { class: 'briefing' });
  const total = h('p', { class: 'panel__subtitle' });
  let chosen = chapters[0] as ChapterCard;

  const element = h(
    'section',
    { class: 'screen', 'aria-labelledby': `${book.id}-title`, hidden: true },
    h(
      'div',
      { class: 'card card--wide' },
      h('h2', { class: 'card__title card__title--small', id: `${book.id}-title` }, book.title),
      total,
      h('div', { class: 'campaign' }, list, briefing),
      h('div', { class: 'card__footer' }, button('Back', handlers.back, 'chip')),
    ),
  );

  const showBriefing = (chapter: ChapterCard) => {
    chosen = chapter;
    const theme = THEMES[handlers.theme()];
    const index = chapters.indexOf(chapter);
    const stars = starsOf(handlers.progress, chapter.id);
    const advice = book.advice?.(chapter, theme) ?? null;
    briefing.replaceChildren(
      h('p', { class: 'briefing__kicker' }, `${book.unit} ${index + 1} · ${chapter.twistLabel}`),
      h('h3', { class: 'briefing__title' }, chapter.title[theme.id]),
      h('p', { class: 'briefing__text' }, chapter.briefing[theme.id]),
      ...(advice ? [h('p', { class: 'briefing__advice' }, advice)] : []),
      h(
        'ul',
        { class: 'goals' },
        h('li', { class: stars[0] ? 'goal goal--earned' : 'goal' }, `★ ${book.firstStar}`),
        ...chapter.stars.map((goal, star) =>
          h(
            'li',
            { class: stars[star + 1] ? 'goal goal--earned' : 'goal' },
            `★ ${goalLabel(goal, theme)}`,
          ),
        ),
      ),
      button('Take off', () => handlers.play(chapter), 'card__button', {
        'data-action': 'take-off',
      }),
    );
    for (const item of list.querySelectorAll('button')) {
      item.setAttribute('aria-current', String(item.dataset.chapter === chapter.id));
    }
  };

  const refresh = () => {
    const theme = handlers.theme();
    total.textContent = `★ ${totalStars(handlers.progress, chapters)} of ${chapters.length * 3} · ${book.blurb}`;
    list.replaceChildren(
      ...chapters.map((chapter, index) => {
        const open = isChapterOpen(handlers.progress, index, chapters);
        const entry = button(
          h(
            'span',
            { class: 'chapter__name' },
            h('span', { class: 'chapter__number' }, String(index + 1)),
            open ? chapter.title[theme] : 'Locked',
          ),
          () => showBriefing(chapter),
          'chapter',
          { 'data-chapter': chapter.id, disabled: !open },
          h(
            'span',
            { class: 'chapter__twist' },
            open ? chapter.twistLabel : `Win the ${book.unit.toLowerCase()} before`,
          ),
          starRow(starsOf(handlers.progress, chapter.id)),
        );
        return h('li', {}, entry);
      }),
    );
    // Open on the furthest chapter the player can play.
    const furthest = [...chapters]
      .reverse()
      .find((_, reversed) =>
        isChapterOpen(handlers.progress, chapters.length - 1 - reversed, chapters),
      );
    showBriefing(furthest ?? chosen);
  };

  return {
    element,
    refresh,
    /** Shows one chapter's briefing, if the player has reached it: a way back from the Hall. */
    open(chapterId: string | undefined) {
      const index = chapters.findIndex((chapter) => chapter.id === chapterId);
      const chapter = chapters[index];
      if (chapter && isChapterOpen(handlers.progress, index, chapters)) showBriefing(chapter);
    },
    focusFirst() {
      briefing.querySelector<HTMLElement>('[data-action="take-off"]')?.focus();
    },
  };
}
