import type { Store } from '@shared/storage';
import { PLACE_NOTES, STATE_NOTES } from '../data/postcards';
import { placeById, STATE_NAMES } from '../data/places';

/**
 * The postcard album. Passing a town for the first time collects its card;
 * crossing into a state collects that state's "Welcome to" card. Kept in
 * the game's own store, across every mode.
 */
export interface Postcard {
  key: string;
  title: string;
  note: string;
  /** The place it shows, or for a state card the state line it was collected at. */
  place: string;
  kind: 'town' | 'state';
}

export class PostcardBook {
  private readonly collected: Set<string>;

  constructor(private readonly store: Store) {
    const stored = store.get<unknown>('postcards', []);
    this.collected = new Set(
      Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : [],
    );
  }

  has(key: string): boolean {
    return this.collected.has(key);
  }

  get count(): number {
    return this.collected.size;
  }

  keys(): string[] {
    return [...this.collected];
  }

  /**
   * The card for passing a place, collected if it is new. A state line
   * gives the card of the state entered, named by the stop beyond it.
   */
  collect(place: string, enteringState: string | null): { card: Postcard; isNew: boolean } | null {
    const card = cardFor(place, enteringState);
    if (!card) return null;
    const isNew = !this.collected.has(card.key);
    if (isNew) {
      this.collected.add(card.key);
      this.store.set('postcards', [...this.collected]);
    }
    return { card, isNew };
  }
}

export function cardFor(place: string, enteringState: string | null): Postcard | null {
  const info = placeById(place);
  if (info.kind === 'line') {
    const state = enteringState ?? info.state;
    const note = STATE_NOTES[state];
    if (!note) return null;
    return {
      key: `state:${state}`,
      title: STATE_NAMES[state] ?? state,
      note,
      place,
      kind: 'state',
    };
  }
  const note = PLACE_NOTES[place];
  if (!note) return null;
  return { key: place, title: info.name, note, place, kind: 'town' };
}

/** Every card there is to collect: one per town or landmark, one per state on the map. */
export function allCards(): Postcard[] {
  const towns = Object.keys(PLACE_NOTES)
    .map((place) => cardFor(place, null))
    .filter((card): card is Postcard => card !== null);
  const states = Object.entries(STATE_NOTES).map(([state, note]) => ({
    key: `state:${state}`,
    title: STATE_NAMES[state] ?? state,
    note,
    place: '',
    kind: 'state' as const,
  }));
  return [...towns, ...states];
}
