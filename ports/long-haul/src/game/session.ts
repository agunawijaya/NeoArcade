import { createRng } from '@shared/rng';
import { shortClockName } from '../engine/clock';
import { dinerFor, type Diner } from '../data/diners';
import { placeById, STATE_NAMES } from '../data/places';
import type { RegionId } from '../data/regions';
import { FATIGUE, type ConditionId, type FatigueId } from '../engine/conditions';
import { conditionSeverity } from '../engine/living-weather';
import { eventsAhead, nextDieselPrice, radarWithin, type Ahead } from '../engine/foresight';
import { clampSpeed, driveHour, type HourResult } from '../engine/hour';
import type { Season } from '../engine/living-weather';
import { pointAlong } from '../engine/position';
import type { RouteStop } from '../engine/route';
import { RULES, speedCap } from '../engine/rules';
import { openStop, type StopVisit } from '../engine/stop';
import { currentRoad, stopMile, totalMiles, weekHours, type Trip } from '../engine/trip';
import type { Landmark } from '../render/landmarks';
import type { RigPaint } from '../render/rig';
import type { DashReadings, DriveScene } from '../render/scene';
import { sunAltitude, sunArc } from '../render/sun';
import type { Settings } from '../settings';
import type { CbMessage, CbRadio } from './cb-radio';
import { copyFor, type EventCopy } from './event-copy';
import { planHour, type Beat, type HourPlay } from './playback';

/**
 * One trip on screen. The engine settles each hour at once; the session
 * plays it out at the chosen rhythm, stops the clock for the events that
 * need reading, offers the truck stops, asks for a speed at each waypoint
 * when driving leg by leg, and builds the scene the views draw. It knows
 * nothing about the DOM: the drive screen listens to its hooks.
 */
export type SessionPhase = 'rolling' | 'card' | 'offer' | 'stop' | 'planning' | 'paused' | 'done';

export interface StopOffer {
  name: string;
  dieselCents: number;
  /** Why the game is asking, in real time: a low tank, a tired driver, no spare. */
  reasons: string[];
}

/**
 * The original asked at every truck stop. In real time the sign goes by
 * unless the player pulls in, so the game still stops and asks when passing
 * it up would be risky.
 */
export function reasonsToStop(trip: Trip): string[] {
  const reasons: string[] = [];
  const share = trip.fuel / trip.rig.tankGallons;
  if (share < 0.3) reasons.push(`The tank is down to ${Math.round(share * 100)} %.`);
  if (FATIGUE[trip.fatigue].severity >= 3)
    reasons.push(`You feel ${FATIGUE[trip.fatigue].name.toLowerCase()}.`);
  if (trip.spare === 0) reasons.push('You have no spare tyre.');
  return reasons;
}

export interface LegPlan {
  /** The stop at the end of the leg. */
  to: RouteStop;
  index: number;
  miles: number;
  road: string;
  limit: number;
  cap: number;
  condition: ConditionId;
  fatigue: FatigueId;
  /** What may happen at the stop ahead, from the route's table. */
  ahead: string[];
  /** Hours until a truck stop is next offered. */
  stopIn: number;
  suggested: number;
}

export interface SessionHooks {
  card(copy: EventCopy, beat: Beat, done: () => void): void;
  quick(copy: EventCopy, beat: Beat): void;
  passed(stop: RouteStop, index: number): void;
  stopOffer(offer: StopOffer | null): void;
  askStop(offer: StopOffer, answer: (pullIn: boolean) => void): void;
  atStop(visit: StopVisit, diner: Diner, done: () => void): void;
  plan(plan: LegPlan, go: (speed: number) => void): void;
  cb(message: CbMessage): void;
  hour(result: HourResult, trip: Trip): void;
  ended(trip: Trip): void;
}

export interface SessionOptions {
  trip: Trip;
  settings: () => Settings;
  season: Season;
  /** UTC milliseconds at departure, for the sun. */
  departureUtc: number;
  /** The rig's odometer before this trip. */
  odometerStart: number;
  paint: RigPaint;
  cb: CbRadio;
  reducedMotion: () => boolean;
  hooks: SessionHooks;
}

/** Real seconds per in-game hour, before the warp. */
const REALTIME_HOUR = 3;
const LEG_HOUR = 0.6;
/** Pixels of road per mile in the side view, and the fastest the scenery may rush. */
const PIXELS_PER_MILE = 30;
const MAX_SCROLL_PER_SECOND = 1500;
/**
 * Pixels of road a sign is kept after the cab passes it. An hour often ends
 * right at a sign (the truck stop's pole, a town's exit), and it has to slide
 * off the left edge of the widest screen before it may be forgotten.
 */
const LANDMARK_TRAIL = 4000;

export class TripSession {
  phase: SessionPhase = 'planning';
  private pausedFrom: SessionPhase = 'rolling';
  private play: HourPlay | null = null;
  private t = 0;
  private beatIndex = 0;
  private throttle: number = RULES.speedLimit;
  private scroll = 0;
  private hourStartScroll = 0;
  private pixelsPerMile = PIXELS_PER_MILE;
  private time = 0;
  private landmarks: Landmark[] = [];
  private regionNow: RegionId;
  private regionBefore: RegionId;
  private regionBlend = 1;
  private pendingStop = false;
  private offer: StopOffer | null = null;
  private hourCondition: ConditionId;
  private hourFatigue: FatigueId;
  private hourSpeed = 0;
  private fromElapsed = 0;
  private toElapsed = 0;
  private police = 0;
  private detector: DashReadings['detector'] = 'off';
  private passedThisHour = false;
  private justHappened: string[] = [];
  private lastCb: CbMessage | null = null;
  private brakeUntil = 0;

  constructor(private readonly options: SessionOptions) {
    const { trip } = options;
    this.hourCondition = trip.condition;
    this.hourFatigue = trip.fatigue;
    this.regionNow = this.regionAhead(0);
    this.regionBefore = this.regionNow;
    this.fromElapsed = trip.hr - trip.zoneShift;
    this.toElapsed = this.fromElapsed;
    this.throttle = Math.min(RULES.speedLimit, speedCap(trip.limit));
  }

  get trip(): Trip {
    return this.options.trip;
  }

  get setSpeed(): number {
    return this.throttle;
  }

  get stopPending(): boolean {
    return this.pendingStop;
  }

  get radio(): CbRadio {
    return this.options.cb;
  }

  /** The leg planner first, leg by leg; straight onto the road in real time. */
  start() {
    if (this.options.settings().rhythm === 'legs') this.planLeg();
    else this.startHour();
  }

  setThrottle(mph: number) {
    this.throttle = clampSpeed(this.trip, mph).speed;
  }

  /** Real time: take the truck stop that is coming up. */
  pullIn(wanted = true) {
    if (!this.offer) return;
    this.pendingStop = wanted;
  }

  pause() {
    if (this.phase === 'paused' || this.phase === 'done') return;
    this.pausedFrom = this.phase;
    this.phase = 'paused';
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.pausedFrom;
  }

  get paused(): boolean {
    return this.phase === 'paused';
  }

  update(dt: number) {
    this.time += dt;
    if (this.regionBlend < 1) this.regionBlend = Math.min(1, this.regionBlend + dt / 1.6);
    if (this.police > 0 && this.phase === 'rolling') this.police = Math.max(0, this.police - dt);
    if (this.phase !== 'rolling' || !this.play) return;
    const settings = this.options.settings();
    const hourSeconds = (settings.rhythm === 'legs' ? LEG_HOUR : REALTIME_HOUR) / settings.warp;
    const target = Math.min(1, this.t + dt / hourSeconds);
    const beats = this.play.beats;
    while (this.beatIndex < beats.length) {
      const beat = beats[this.beatIndex] as Beat;
      if (beat.at > target) break;
      this.beatIndex++;
      this.moveTo(beat.at);
      if (this.reveal(beat)) return;
    }
    this.moveTo(target);
    if (this.t >= 1) this.finishHour();
  }

  private moveTo(t: number) {
    this.t = Math.max(this.t, t);
    const play = this.play;
    if (!play) return;
    const fraction =
      play.visibleMiles < play.result.speed
        ? Math.min(this.t, play.visibleMiles / Math.max(1, play.result.speed))
        : this.t;
    this.scroll = this.hourStartScroll + this.pixelsPerMile * play.result.speed * fraction;
    const region = this.regionAhead(this.displayMile);
    if (region !== this.regionNow) {
      this.regionBefore = this.regionNow;
      this.regionNow = region;
      this.regionBlend = 0;
    }
  }

  /** Shows an event; true when it stopped the clock. */
  private reveal(beat: Beat): boolean {
    const { event } = beat;
    this.justHappened.push(event.type);
    if (event.type === 'passed') {
      this.passedThisHour = true;
      const stop = this.trip.route.stops[event.stop];
      if (stop) this.options.hooks.passed(stop, event.stop);
      this.options.cb.settle(this.trip);
      return false;
    }
    if (event.type === 'pulled-over') this.police = 4;
    if (event.type === 'radar' && event.ticketed) this.police = 4;
    const copy = copyFor(event, this.options.settings().units);
    if (!copy || beat.weight === 'quiet') return false;
    if (beat.weight === 'quick') {
      this.options.hooks.quick(copy, beat);
      return false;
    }
    this.brakeUntil = this.time + 1.2;
    this.phase = 'card';
    this.options.hooks.card(copy, beat, () => {
      if (this.phase === 'card') this.phase = 'rolling';
    });
    return true;
  }

  private finishHour() {
    const { trip } = this;
    this.hourCondition = trip.condition;
    this.hourFatigue = trip.fatigue;
    if (trip.status !== 'driving') {
      this.phase = 'done';
      this.options.hooks.stopOffer(null);
      this.options.hooks.ended(trip);
      return;
    }
    const legs = this.options.settings().rhythm === 'legs';
    if (trip.stopOffered && this.offer) {
      const settings = this.options.settings();
      const reasons = reasonsToStop(trip);
      const ask =
        legs || (!this.pendingStop && (settings.eventPause === 'all' || reasons.length > 0));
      if (ask) {
        this.offer.reasons = reasons;
        this.phase = 'offer';
        const offer = this.offer;
        this.options.hooks.askStop(offer, (pullIn) => {
          if (pullIn) this.openTruckStop();
          else this.afterHour();
        });
        return;
      }
      if (this.pendingStop) {
        this.openTruckStop();
        return;
      }
    }
    this.afterHour();
  }

  /** Leg by leg, a waypoint or a turn in the weather calls for a new speed. */
  private afterHour() {
    if (
      this.options.settings().rhythm === 'legs' &&
      (this.passedThisHour || this.conditionsWorsened())
    ) {
      this.planLeg();
      return;
    }
    this.startHour();
  }

  private conditionsWorsened(): boolean {
    const play = this.play;
    if (!play) return false;
    return play.result.events.some(
      (event) =>
        (event.type === 'weather' && conditionSeverity(event.to) > conditionSeverity(event.from)) ||
        (event.type === 'fatigue' &&
          FATIGUE[event.to].severity >= 3 &&
          FATIGUE[event.to].severity > FATIGUE[event.from].severity),
    );
  }

  private openTruckStop() {
    const { trip } = this;
    const { visit } = openStop(trip);
    this.options.cb.settle(trip, visit.dieselCents);
    const diner = dinerFor(createRng(`${trip.seed}:diner:${visit.number}`), this.regionNow);
    this.pendingStop = false;
    this.offer = null;
    this.options.hooks.stopOffer(null);
    this.phase = 'stop';
    this.brakeUntil = this.time + 1.5;
    this.options.hooks.atStop(visit, diner, () => {
      this.hourCondition = trip.condition;
      this.hourFatigue = trip.fatigue;
      this.fromElapsed = trip.hr - trip.zoneShift;
      this.toElapsed = this.fromElapsed;
      if (this.options.settings().rhythm === 'legs') this.planLeg();
      else this.startHour();
    });
  }

  private planLeg() {
    const { trip } = this;
    const index = Math.min(trip.next, trip.route.stops.length - 1);
    const to = trip.route.stops[index] as RouteStop;
    const plan: LegPlan = {
      to,
      index,
      miles: Math.max(0, stopMile(trip, index) - trip.miles),
      road: currentRoad(trip),
      limit: trip.limit,
      cap: speedCap(trip.limit),
      condition: trip.condition,
      fatigue: trip.fatigue,
      ahead: describeStopEvents(to, trip.cargo === 'oranges'),
      stopIn: Math.max(0, RULES.hoursBetweenStops + 1 - trip.hoursSinceStop),
      suggested: Math.min(this.throttle, speedCap(trip.limit)),
    };
    this.phase = 'planning';
    this.options.hooks.plan(plan, (speed) => {
      this.setThrottle(speed);
      this.startHour();
    });
  }

  private startHour() {
    const { trip } = this;
    if (trip.status !== 'driving') return;
    this.hourCondition = trip.condition;
    this.hourFatigue = trip.fatigue;
    this.justHappened = [];
    this.passedThisHour = false;
    this.pendingStop = false;
    this.offer = null;
    this.options.hooks.stopOffer(null);
    const zoneBefore = trip.zoneShift;
    const result = driveHour(trip, this.throttle);
    this.hourSpeed = result.speed;
    const settings = this.options.settings();
    this.play = planHour(trip, result, settings.eventPause === 'all');
    this.fromElapsed = result.fromHr - zoneBefore;
    this.toElapsed = trip.hr - trip.zoneShift;
    const hourSeconds = (settings.rhythm === 'legs' ? LEG_HOUR : REALTIME_HOUR) / settings.warp;
    this.pixelsPerMile = Math.min(
      PIXELS_PER_MILE,
      (MAX_SCROLL_PER_SECOND * hourSeconds) / Math.max(20, result.speed),
    );
    this.hourStartScroll = this.scroll;
    this.landmarks = [...this.landmarksBehind(), ...this.landmarksFor(this.play)];
    this.t = 0;
    this.beatIndex = 0;
    this.phase = 'rolling';
    if (trip.status === 'driving' && trip.stopOffered) {
      this.offer = { name: '', dieselCents: nextDieselPrice(trip), reasons: [] };
      const diner = dinerFor(
        createRng(`${trip.seed}:diner:${trip.stopCount + 1}`),
        this.regionAhead(trip.miles),
      );
      this.offer.name = diner.name;
      this.options.hooks.stopOffer(this.offer);
      this.landmarks.push({
        // Passed-up stops are offered again every hour, so the hour keeps each pole its own.
        id: `${trip.hourCount}-truck-stop`,
        kind: 'truck-stop',
        u: this.hourStartScroll + this.pixelsPerMile * result.speed * 0.98,
        label: diner.name,
        detail: `${(this.offer.dieselCents / 100).toFixed(2)}`,
      });
    }
    this.detector = trip.rig.radarDetector
      ? radarWithin(trip, this.throttle)
        ? 'alert'
        : 'quiet'
      : 'off';
    const message = this.options.cb.hour(trip, {
      region: this.regionNow,
      destination: trip.route.to,
      justHappened: result.events.map((event) => event.type),
      speed: this.throttle,
    });
    if (message) {
      this.lastCb = message;
      this.options.hooks.cb(message);
    }
    this.options.hooks.hour(result, trip);
  }

  /** Signs from the hours before that may still be on screen, so they drift away behind the rig. */
  private landmarksBehind(): Landmark[] {
    return this.landmarks.filter((landmark) => landmark.u > this.scroll - LANDMARK_TRAIL);
  }

  /** Roadside things for this hour: each event's landmark at its moment, and a sign before each town. */
  private landmarksFor(play: HourPlay): Landmark[] {
    const at = (fraction: number) =>
      this.hourStartScroll + this.pixelsPerMile * play.result.speed * fraction;
    const marks: Landmark[] = [];
    for (const beat of play.beats) {
      const { event } = beat;
      const id = `${this.trip.hourCount}-${event.type}-${beat.at.toFixed(3)}`;
      switch (event.type) {
        case 'passed': {
          const place = placeById(event.place);
          if (place.kind === 'line') {
            const ahead = this.trip.route.stops[event.stop + 1];
            const state = ahead ? placeById(ahead.place).state : place.state;
            marks.push({ id, kind: 'welcome', u: at(beat.at) + 40, label: stateName(state) });
          } else {
            marks.push({
              id: `${id}-guide`,
              kind: 'guide',
              u: at(Math.max(0, beat.at - 0.12)),
              label: place.name,
              detail: 'NEXT EXIT',
            });
          }
          break;
        }
        case 'toll':
          marks.push({
            id,
            kind: 'toll',
            u: at(beat.at),
            label: `$${(event.cents / 100).toFixed(2)}`,
          });
          break;
        case 'construction':
          marks.push({ id, kind: 'construction', u: at(beat.at) });
          break;
        case 'weigh-station':
          marks.push({ id, kind: 'scale', u: at(beat.at), detail: 'open' });
          break;
        case 'radar':
          marks.push({ id, kind: 'radar', u: at(beat.at) - 120 });
          break;
        case 'rock-slide':
          marks.push({ id, kind: 'slide', u: at(beat.at) + 60 });
          break;
        case 'arrived':
          marks.push({
            id,
            kind: 'dock',
            u: at(beat.at) + 40,
            label: placeById(this.trip.route.to).name,
          });
          break;
        default:
          break;
      }
    }
    return marks;
  }

  get displayMile(): number {
    const play = this.play;
    if (!play) return this.trip.miles;
    const fraction =
      play.result.speed > 0 ? Math.min(this.t, play.visibleMiles / play.result.speed) : 0;
    return Math.min(totalMiles(this.trip), play.result.fromMile + play.result.speed * fraction);
  }

  /** The trip clock as shown: it runs smoothly through the hour being played. */
  get displayHr(): number {
    const play = this.play;
    if (!play || this.phase === 'stop' || this.phase === 'planning') return this.trip.hr;
    return play.result.fromHr + (play.result.toHr - play.result.fromHr) * this.t;
  }

  get hourProgress(): number {
    return this.t;
  }

  private regionAhead(mile: number): RegionId {
    const { trip } = this;
    for (let index = 0; index < trip.route.stops.length; index++) {
      if (stopMile(trip, index) > mile) {
        const stop = trip.route.stops[index] as RouteStop;
        return stop.region ?? placeById(stop.place).region;
      }
    }
    const last = trip.route.stops.at(-1);
    return last ? (last.region ?? placeById(last.place).region) : 'mojave';
  }

  /** 0–1: how near a big city is, by road. */
  private cityNearness(mile: number): number {
    const { trip } = this;
    let best = 0;
    const consider = (place: string, at: number) => {
      const kind = placeById(place).kind;
      if (kind !== 'hub' && kind !== 'city') return;
      const away = Math.abs(at - mile);
      const reach = kind === 'hub' ? 45 : 20;
      if (away < reach) best = Math.max(best, (1 - away / reach) * (kind === 'hub' ? 1 : 0.55));
    };
    consider(trip.route.from, 0);
    trip.route.stops.forEach((stop, index) => consider(stop.place, stopMile(trip, index)));
    return best;
  }

  scene(): DriveScene {
    const { trip } = this;
    const mile = this.displayMile;
    const point = pointAlong(trip.route, mile, (index) => stopMile(trip, index));
    const elapsed =
      this.fromElapsed +
      (this.toElapsed - this.fromElapsed) *
        (this.phase === 'rolling' || this.phase === 'card' ? this.t : 1);
    const utc = this.options.departureUtc + elapsed * 3_600_000;
    const rolling = this.phase === 'rolling';
    const condition = rolling || this.phase === 'card' ? this.hourCondition : trip.condition;
    const fatigue = rolling || this.phase === 'card' ? this.hourFatigue : trip.fatigue;
    const season = this.options.season;
    const snowyLandscape =
      season === 'winter' &&
      [
        'rockies',
        'sierra',
        'northern-plains',
        'northwoods',
        'great-lakes',
        'new-england',
        'great-basin',
        'farmland',
        'appalachian',
        'turnpike',
        'ponderosa',
      ].includes(this.regionNow);
    const hr = this.displayHr;
    const clockHours = trip.startClock + hr;
    return {
      time: this.time,
      scroll: this.scroll,
      speed: rolling ? this.hourSpeed : 0,
      region: this.regionNow,
      previousRegion: this.regionBefore,
      regionBlend: this.regionBlend,
      season,
      snow: snowyLandscape || condition === 'light-snow' || condition === 'blizzard',
      condition,
      sunAltitude: sunAltitude(point.lat, point.lon, utc),
      sunArc: sunArc(point.lat, point.lon, utc),
      fatigue: FATIGUE[fatigue].severity,
      cargo: trip.cargo,
      paint: this.options.paint,
      landmarks: this.landmarks,
      city: this.cityNearness(mile),
      police: this.police > 0,
      braking: this.time < this.brakeUntil,
      stopped: !rolling,
      reducedMotion: this.options.reducedMotion(),
      dash: {
        fuel: trip.fuel,
        tank: trip.rig.tankGallons,
        odometer: this.options.odometerStart + mile,
        clock: shortClockName(Math.floor(clockHours)).toUpperCase(),
        minutes: Math.round((((clockHours % 24) + 24) % 24) * 60),
        cbChannel: 19,
        cbLine: this.lastCb?.text ?? '',
        cbSpeaker: this.lastCb?.speaker.handle ?? '',
        units: this.options.settings().units,
        setSpeed: this.throttle,
        limit: trip.limit,
        detector: this.detector,
      },
    };
  }

  /** Known events at the next few stops, for the route strip's icons. */
  ahead(): Ahead[] {
    return eventsAhead(this.trip, 6);
  }

  /** Local time now, as hours since Monday 00:00. */
  get weekHours(): number {
    return weekHours(this.trip) - this.trip.hr + this.displayHr;
  }
}

function stateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

/** What the original table says may happen at a stop, in plain words. */
export function describeStopEvents(stop: RouteStop, oranges: boolean): string[] {
  return stop.events.flatMap((event) => {
    switch (event.kind) {
      case 'time-zone':
        return [event.hours > 0 ? 'Clocks go ahead an hour' : 'Clocks go back an hour'];
      case 'toll':
        return [`Toll $${(event.cents / 100).toFixed(2)}`];
      case 'construction':
        return [`Road work: ${Math.round(event.chance * 100)} % chance`];
      case 'radar':
        return [`Radar: ${Math.round(event.chance * 100)} % chance`];
      case 'weigh-station':
        return [
          `Weigh station: ${Math.round(event.chance * 100)} % open${event.barrier ? `, ${event.barrier.state} turns away overweight rigs` : ''}`,
        ];
      case 'rock-slide':
        return [`Rock slides at ${event.where}: ${Math.round(event.chance * 100)} %`];
      case 'reefer':
        return oranges ? [`Reefer trouble: ${Math.round(event.chance * 100)} %`] : [];
    }
  });
}
