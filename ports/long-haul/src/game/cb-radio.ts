import { createRng, type Rng } from '@shared/rng';
import type { Store } from '@shared/storage';
import { CB_LINES, SPEAKERS, type CbTopic, type Speaker } from '../data/cb-lines';
import { PLACE_LINES } from '../data/place-lines';
import { placeById } from '../data/places';
import type { RegionId } from '../data/regions';
import { CONDITIONS } from '../engine/conditions';
import { eventsAhead, nextDieselPrice, weatherAhead, type Ahead } from '../engine/foresight';
import { patrolThreshold } from '../engine/police';
import { hourOfDay, milesToGo, nextStop, currentRoad, type Trip } from '../engine/trip';

/**
 * Channel 19. Each hour someone may key the mic: a tip about the road
 * ahead, the weather, the price of diesel, or just company. Tips come from
 * the trip's real future (`foresight.ts`), told the way each speaker tells
 * things: Mama Bear is nearly always right, Hot Rod Harry about half the
 * time. Once the rig has passed the place, the tip is marked right or wrong,
 * and the record is kept between trips so the player can learn who to
 * believe.
 */
export interface Tip {
  kind: 'radar' | 'scale' | 'work' | 'diesel';
  stop: number;
  /** What the speaker said would be there. */
  claim: boolean;
  truth: boolean;
  priceClaimed?: number;
  checked: boolean;
}

export interface CbMessage {
  id: number;
  speaker: Speaker;
  text: string;
  hr: number;
  tip?: Tip;
}

export interface Track {
  right: number;
  wrong: number;
}

export interface CbContext {
  region: RegionId;
  destination: string;
  /** Events of the hour just driven, for sympathy. */
  justHappened: readonly string[];
  speed: number;
}

const TALK_CHANCE = 0.5;

export class CbRadio {
  readonly log: CbMessage[] = [];
  private nextId = 1;
  private readonly record: Record<string, Track>;

  constructor(private readonly store: Store) {
    this.record = store.get<Record<string, Track>>('cb-record', {});
  }

  /** Who has been right how often, across every trip. */
  trackOf(handle: string): Track {
    return this.record[handle] ?? { right: 0, wrong: 0 };
  }

  /** Maybe someone talks this hour. */
  hour(trip: Trip, context: CbContext): CbMessage | null {
    const rng = createRng(`${trip.seed}:cb:${trip.hourCount}`);
    if (trip.hourCount > 1 && rng.next() > TALK_CHANCE) return null;
    const night = hourOfDay(trip) >= 20 || hourOfDay(trip) < 6;
    const speaker = pickSpeaker(rng, context.region, night);
    const message = this.compose(trip, context, speaker, rng, night);
    if (message) {
      this.log.push(message);
      if (this.log.length > 40) this.log.shift();
    }
    return message;
  }

  /** Marks tips about places the rig has now passed, or the stop it has now opened. */
  settle(trip: Trip, dieselCents: number | null = null) {
    for (const message of this.log) {
      const tip = message.tip;
      if (!tip || tip.checked) continue;
      if (tip.kind === 'diesel') {
        if (dieselCents === null) continue;
        tip.checked = true;
        tip.truth = Math.abs((tip.priceClaimed ?? 0) - dieselCents) <= 3;
        this.count(message.speaker.handle, tip.truth);
      } else if (trip.next > tip.stop) {
        tip.checked = true;
        this.count(message.speaker.handle, tip.claim === tip.truth);
      }
    }
  }

  private count(handle: string, right: boolean) {
    const track = this.trackOf(handle);
    this.record[handle] = {
      right: track.right + (right ? 1 : 0),
      wrong: track.wrong + (right ? 0 : 1),
    };
    this.store.set('cb-record', this.record);
  }

  private compose(
    trip: Trip,
    context: CbContext,
    speaker: Speaker,
    rng: Rng,
    night: boolean,
  ): CbMessage | null {
    const ahead = eventsAhead(trip, 3).filter(
      (event) =>
        event.kind === 'radar' || event.kind === 'weigh-station' || event.kind === 'construction',
    );
    const weights: [() => CbMessage | null, number][] = [];
    const say =
      (topic: CbTopic, fill: Record<string, string> = {}) =>
      () =>
        this.message(
          trip,
          speaker,
          fillIn(rng.pick(CB_LINES[topic]), {
            ...fill,
            handle: speaker.handle,
            road: currentRoad(trip),
            city: placeById(context.destination).name,
          }),
        );

    if (ahead.length > 0)
      weights.push([() => this.tipAbout(trip, speaker, rng, rng.pick(ahead)), 5]);
    if (trip.stopOffered || trip.hoursSinceStop >= 2)
      weights.push([() => this.dieselTip(trip, speaker, rng), 2]);
    const forecast = weatherAhead(trip, 90, Math.max(40, context.speed));
    if (forecast && forecast !== trip.condition) {
      const place = nextStop(trip).name;
      if (CONDITIONS[forecast].risk >= 5)
        weights.push([
          say('weather-bad', { place, weather: CONDITIONS[forecast].name.toLowerCase() }),
          3,
        ]);
      else if (forecast === 'clear') weights.push([say('weather-clear', { place }), 1]);
    }
    if (['tired', 'fatigued', 'exhausted'].includes(trip.fatigue)) weights.push([say('tired'), 3]);
    if (context.speed > patrolThreshold(trip)) weights.push([say('fast'), 2]);
    else if (context.speed > 0 && context.speed < 45 && trip.condition === 'clear')
      weights.push([say('slow'), 1]);
    if (trip.condition === 'rain' || trip.condition === 'wet') weights.push([say('rain'), 2]);
    if (trip.condition === 'light-snow' || trip.condition === 'blizzard')
      weights.push([say('snow'), 3]);
    if (trip.condition === 'fog') weights.push([say('fog'), 3]);
    weights.push([say(night ? 'night' : 'day'), 2]);
    const regional = regionalTopic(context.region);
    if (regional) weights.push([say(regional), 1.2]);
    weights.push([
      say(trip.cargo === 'oranges' ? 'oranges' : trip.cargo === 'mail' ? 'mail' : 'freight'),
      0.6,
    ]);
    if (milesToGo(trip) < 80) weights.push([say('nearly-there'), 3]);
    if (context.justHappened.includes('pulled-over')) weights.push([say('ticket'), 4]);
    if (context.justHappened.includes('blowout')) weights.push([say('blowout'), 3]);
    const placeLines = PLACE_LINES[nextStop(trip).place];
    if (placeLines) weights.push([() => this.message(trip, speaker, rng.pick(placeLines)), 1.5]);
    weights.push([say('hello'), trip.hourCount < 3 ? 4 : 0.8]);
    weights.push([say('jokes'), 0.8]);

    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = rng.next() * total;
    for (const [make, weight] of weights) {
      roll -= weight;
      if (roll < 0) return make();
    }
    return null;
  }

  private tipAbout(trip: Trip, speaker: Speaker, rng: Rng, ahead: Ahead): CbMessage {
    const honest = rng.next() < speaker.reliability;
    const claim = honest ? ahead.live : !ahead.live;
    const kind =
      ahead.kind === 'radar' ? 'radar' : ahead.kind === 'weigh-station' ? 'scale' : 'work';
    const topic: CbTopic =
      kind === 'radar'
        ? claim
          ? 'radar-yes'
          : 'radar-no'
        : kind === 'scale'
          ? claim
            ? 'scale-open'
            : 'scale-closed'
          : claim
            ? 'work-yes'
            : 'work-no';
    const text = fillIn(rng.pick(CB_LINES[topic]), { place: ahead.name, handle: speaker.handle });
    return this.message(trip, speaker, text, {
      kind,
      stop: ahead.stop,
      claim,
      truth: ahead.live,
      checked: false,
    });
  }

  private dieselTip(trip: Trip, speaker: Speaker, rng: Rng): CbMessage {
    const actual = nextDieselPrice(trip);
    const honest = rng.next() < speaker.reliability;
    const claimed = honest
      ? actual
      : Math.max(85, Math.min(125, actual + (rng.chance(0.5) ? 1 : -1) * rng.int(8, 22)));
    const topic: CbTopic = claimed < 100 ? 'diesel-cheap' : 'diesel-dear';
    const text = fillIn(rng.pick(CB_LINES[topic]), { price: `$${(claimed / 100).toFixed(2)}` });
    return this.message(trip, speaker, text, {
      kind: 'diesel',
      stop: trip.next,
      claim: true,
      truth: honest,
      priceClaimed: claimed,
      checked: false,
    });
  }

  private message(trip: Trip, speaker: Speaker, text: string, tip?: Tip): CbMessage {
    return { id: this.nextId++, speaker, text, hr: trip.hr, ...(tip ? { tip } : {}) };
  }
}

function pickSpeaker(rng: Rng, region: RegionId, night: boolean): Speaker {
  const here = SPEAKERS.filter(
    (speaker) =>
      (speaker.regions.length === 0 || speaker.regions.includes(region)) &&
      (!speaker.nightOnly || night),
  );
  return rng.pick(here.length > 0 ? here : SPEAKERS);
}

function regionalTopic(region: RegionId): CbTopic | null {
  if (
    ['mojave', 'sonoran', 'mesas', 'high-plains', 'west-texas', 'great-basin', 'red-rock'].includes(
      region,
    )
  )
    return 'west';
  if (['deep-south', 'bayou', 'piedmont', 'florida', 'upland-south'].includes(region))
    return 'south';
  if (['farmland', 'great-lakes', 'northwoods'].includes(region)) return 'midwest';
  if (['jersey', 'manhattan', 'new-england', 'mid-atlantic', 'turnpike'].includes(region))
    return 'northeast';
  if (['prairie', 'panhandle', 'northern-plains'].includes(region)) return 'plains';
  if (['rockies', 'sierra', 'ponderosa', 'appalachian', 'northwest'].includes(region))
    return 'mountains';
  return null;
}

function fillIn(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
