import { placeById } from '../data/places';
import { REGION_IDS, REGIONS, type RegionId } from '../data/regions';
import { allCards, type Postcard } from '../game/postcards';
import { paintPostcard, regionOfCard, type PostcardArt } from '../render/postcard-art';
import { button, fill, h, icon } from './dom';
import { ICONS } from './icons';

/**
 * The postcard album: one card for every town and landmark passed, one for
 * every state entered, kept by landscape. A collected card turns over to
 * its note; the rest wait as blanks with the place's name.
 */
export interface AlbumScreenOptions {
  collected: () => ReadonlySet<string>;
  back: () => void;
}

interface Group {
  id: string;
  title: string;
  blurb: string;
  cards: Postcard[];
}

const THUMB_WIDTH = 300;
const THUMB_HEIGHT = 190;

export class AlbumScreen {
  readonly element: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly viewer: HTMLElement;
  private observer: IntersectionObserver | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly options: AlbumScreenOptions) {
    this.inner = h('div', { class: 'screen__inner album' });
    this.viewer = h('div', {
      class: 'album__viewer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Postcard',
      hidden: true,
    });
    this.viewer.addEventListener('click', (event) => {
      if (event.target === this.viewer) this.closeCard();
    });
    this.viewer.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeCard();
      }
    });
    this.element = h(
      'section',
      { class: 'screen', 'aria-label': 'Postcards', hidden: true },
      this.inner,
      this.viewer,
    );
  }

  show() {
    this.render();
    this.element.hidden = false;
    this.element.scrollTop = 0;
    this.inner.querySelector<HTMLButtonElement>('.button')?.focus();
  }

  hide() {
    this.closeCard();
    this.element.hidden = true;
  }

  private render() {
    const collected = this.options.collected();
    const groups = groupCards(allCards());
    const total = groups.reduce((sum, group) => sum + group.cards.length, 0);
    const have = groups.reduce(
      (sum, group) => sum + group.cards.filter((card) => collected.has(card.key)).length,
      0,
    );
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const canvas = entry.target as HTMLCanvasElement;
          this.observer?.unobserve(canvas);
          const ctx = canvas.getContext('2d');
          const art = artOf(canvas.dataset);
          if (ctx && art) paintPostcard(ctx, canvas.width, canvas.height, art);
        }
      },
      { root: this.element, rootMargin: '300px' },
    );

    const sections = groups
      .filter((group) => group.cards.length > 0)
      .map((group) => {
        const count = group.cards.filter((card) => collected.has(card.key)).length;
        return h(
          'section',
          { class: 'album__group' },
          h(
            'div',
            { class: 'album__group-head' },
            h('h2', { class: 'panel__title' }, group.title),
            h('span', { class: 'chip' }, `${count} / ${group.cards.length}`),
          ),
          h('p', { class: 'muted album__blurb' }, group.blurb),
          h(
            'div',
            { class: 'album__cards' },
            ...group.cards.map((card) => this.tile(card, collected.has(card.key))),
          ),
        );
      });

    fill(
      this.inner,
      h(
        'div',
        { class: 'screen__head' },
        button(icon(ICONS.back), () => this.options.back(), 'button button--small button--icon', {
          'aria-label': 'Back to the title',
        }),
        h('h1', { class: 'sign' }, h('span', { class: 'sign__small' }, 'Album'), 'Postcards'),
        h('span', { class: 'spacer' }),
        h('span', { class: 'chip' }, `${have} of ${total} collected`),
      ),
      h(
        'p',
        { class: 'muted' },
        'Pass a town for the first time and its card is yours; cross into a state and you get its welcome card. Every card is the same in every mode.',
      ),
      ...sections,
    );
  }

  private tile(card: Postcard, owned: boolean): HTMLElement {
    if (!owned) {
      return h(
        'div',
        { class: 'album__tile album__tile--blank', title: 'Not collected yet' },
        h('span', { class: 'album__blank-mark', 'aria-hidden': 'true' }, '?'),
        h('span', { class: 'album__name' }, card.title),
      );
    }
    const canvas = h('canvas', {
      class: 'album__thumb',
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      'aria-hidden': 'true',
      'data-kind': card.kind,
      'data-subject': subjectOf(card),
      'data-title': card.title,
    }) as HTMLCanvasElement;
    this.observer?.observe(canvas);
    return button(
      h('span', { class: 'album__name' }, card.title),
      () => this.openCard(card),
      'album__tile',
      { 'aria-label': `Postcard: ${card.title}` },
      canvas,
    );
  }

  private openCard(card: Postcard) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    const front = h('canvas', {
      class: 'album__front',
      width: 900,
      height: 570,
      'aria-hidden': 'true',
    }) as HTMLCanvasElement;
    const ctx = front.getContext('2d');
    if (ctx)
      paintPostcard(ctx, front.width, front.height, {
        kind: card.kind,
        subject: subjectOf(card),
        title: card.title,
      });
    const where = card.kind === 'town' ? placeById(card.place) : null;
    const close = button(
      icon(ICONS.close),
      () => this.closeCard(),
      'button button--small button--icon album__close',
      { 'aria-label': 'Close' },
    );
    fill(
      this.viewer,
      h(
        'div',
        { class: 'album__card' },
        front,
        h(
          'div',
          { class: 'album__back paper' },
          h(
            'div',
            { class: 'album__note' },
            h(
              'p',
              { class: 'album__note-title' },
              card.kind === 'state'
                ? `Welcome to ${card.title}`
                : `Greetings from ${card.title}${where ? `, ${where.state}` : ''}`,
            ),
            h('p', {}, card.note),
          ),
          h(
            'div',
            { class: 'album__address' },
            h(
              'div',
              { class: 'album__stamp', 'aria-hidden': 'true' },
              h('span', {}, '20¢'),
              h('span', {}, 'USA'),
            ),
            h('div', { class: 'album__postmark', 'aria-hidden': 'true' }, h('span', {}, '1982')),
            h('p', { class: 'album__lines' }, 'Wish you were here.'),
          ),
        ),
        close,
      ),
    );
    this.viewer.hidden = false;
    close.focus();
  }

  closeCard() {
    if (this.viewer.hidden) return;
    this.viewer.hidden = true;
    this.returnFocus?.focus();
  }

  get viewing(): boolean {
    return !this.viewer.hidden;
  }
}

function subjectOf(card: Postcard): string {
  return card.kind === 'state' ? card.key.slice('state:'.length) : card.place;
}

function artOf(data: DOMStringMap): PostcardArt | null {
  const { kind, subject, title } = data;
  if ((kind !== 'town' && kind !== 'state') || !subject || !title) return null;
  return { kind, subject, title };
}

/** Town cards by landscape, in the order of the regions; state cards together at the end. */
function groupCards(cards: readonly Postcard[]): Group[] {
  const byRegion = new Map<RegionId, Postcard[]>();
  const states: Postcard[] = [];
  for (const card of cards) {
    if (card.kind === 'state') {
      states.push(card);
      continue;
    }
    const region = regionOfCard({ kind: 'town', subject: card.place, title: card.title });
    const list = byRegion.get(region) ?? [];
    list.push(card);
    byRegion.set(region, list);
  }
  const groups: Group[] = REGION_IDS.filter((id) => byRegion.has(id)).map((id) => ({
    id,
    title: REGIONS[id].name,
    blurb: REGIONS[id].blurb,
    cards: (byRegion.get(id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
  }));
  groups.push({
    id: 'states',
    title: 'Welcome to…',
    blurb: 'One card for every state line crossed.',
    cards: states.sort((a, b) => a.title.localeCompare(b.title)),
  });
  return groups;
}
