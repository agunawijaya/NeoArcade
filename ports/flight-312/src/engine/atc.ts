import { angleDifference } from './exact-math';
import {
  CALLSIGN,
  phrase,
  readbackFor,
  say,
  type Controller,
  type PhraseKey,
  type PhraseValues,
  type Spoken,
} from './phraseology';
import type { Facilities } from './plan';

/**
 * Air traffic control as the engine sees it: who says what, when, on which
 * frequency, and what the crew must read back. Every decision and every
 * timing lives here and depends only on the flight; the voices in the game
 * only render these transmissions, so speech can never change a flight.
 *
 * Transmissions never overlap: each waits for the frequency to clear. A
 * controller hands the flight to the next one with a frequency; the crew
 * tunes it and checks in, and only then does the new controller speak. A
 * call made on a frequency the crew is not listening to goes unheard and
 * is tried again. At the Arcade level and under the 1982 rules the first
 * officer works the radio; at Pilot and Captain the player chooses each
 * readback and tunes the radio, and at Captain a wrong or missing readback
 * draws a correction or a "how do you read?" from the controller.
 */
export type AtcStage =
  | 'clearance'
  | 'toTower'
  | 'takeoff'
  | 'departure'
  | 'climb'
  | 'center'
  | 'cruise'
  | 'descent'
  | 'approachHandoff'
  | 'vectors'
  | 'approach'
  | 'towerHandoff'
  | 'final'
  | 'goAround'
  | 'done';

/** The ground stations of a flight, in the order it meets them. */
export type Facility = 'clearance' | 'tower' | 'departure' | 'center' | 'approach' | 'arrivalTower';

export interface Transmission {
  id: number;
  at: number;
  speaker: Controller;
  frequency: number;
  key: PhraseKey | 'readback';
  values: PhraseValues;
  text: Spoken;
  airtime: number;
  heard: boolean;
}

export interface ReadbackChoice {
  id: 'correct' | 'wrong' | 'sayAgain';
  text: Spoken;
}

export interface PendingReadback {
  transmission: Transmission;
  choices: ReadbackChoice[];
  deadline: number;
  attempt: number;
}

export interface Clearance {
  takeoff: boolean;
  /** The altitude the flight may climb or descend to, feet. */
  altitudeFt: number;
  /** Magnetic, or null when the flight navigates on its own. */
  heading: number | null;
  approach: boolean;
  landing: boolean;
}

interface Speech {
  kind: 'speech';
  at: number;
  speaker: Controller;
  frequency: number;
  key: PhraseKey | 'readback';
  values: PhraseValues;
  text: Spoken;
  /** Whether the crew owes a readback for it. */
  readback: boolean;
  /** How many times it went out before: after an unheard call or a missed readback. */
  attempt: number;
}

interface Tuning {
  kind: 'tune';
  at: number;
  frequency: number;
}

export interface AtcState {
  stage: AtcStage;
  log: Transmission[];
  queue: (Speech | Tuning)[];
  /** The frequency is in use until then. */
  busyUntil: number;
  nextId: number;
  /** The facility that has the flight, and the one it was handed to but has not called yet. */
  workingWith: Facility;
  handedTo: Facility | null;
  handoff: Speech | null;
  handedAt: number;
  pending: PendingReadback | null;
  cleared: Clearance;
  /** When the last heading was given, so the vectors are kept up to date but not nagged. */
  vectoredAt: number;
  /** A call nobody heard, and when the controller will try it again. */
  unheard: Speech | null;
  retryAt: number;
  missedReadbacks: number;
  wrongReadbacks: number;
}

/** Who works the radio: the first officer, or the player at the Pilot or the Captain level. */
export type AtcCrew = 'firstOfficer' | 'pilot' | 'captain';

/** What ATC needs to know about the flight, computed by it each step. */
export interface AtcSituation {
  time: number;
  /** The frequency the crew listens to. */
  comm: number;
  /** It is 08:00 and the tower may clear the takeoff. */
  takeoffTime: boolean;
  airborne: boolean;
  heightFt: number;
  altitudeFt: number;
  fromDepartureNm: number;
  toDestinationNm: number;
  /** Where the descent should begin, nautical miles from the destination. */
  descentNm: number;
  /** Close to the point the vectors lead to, ready for the turn onto the localizer. */
  nearInterceptPoint: boolean;
  /** Heading to fly towards that point, and to intercept from it, magnetic. */
  vectorHeading: number;
  interceptHeading: number;
  established: boolean;
  finalNm: number;
  stopped: boolean;
  goingAround: boolean;
}

/** The flight's fixed facts: set once at the start. */
export interface AtcContext {
  crew: AtcCrew;
  rules: 'program' | 'real';
  practice: 'flight' | 'takeoff' | 'approach';
  facilities: Facilities;
  destinationName: string;
  arrivalCity: string;
  departureRunway: string;
  arrivalRunway: string;
  /** Heading to maintain to 3,000 ft: the program's 075, or the runway's. */
  departureHeading: number;
  initialAltitudeFt: number;
  cruiseAltitudeFt: number;
  descentAltitudeFt: number;
  interceptAltitudeFt: number;
  goAroundAltitudeFt: number;
  departureWind: { direction: number; speedKt: number; gustKt: number };
  arrivalWind: { direction: number; speedKt: number; gustKt: number };
  arrivalAltimeter: number;
  squawk: string;
}

export type AtcEvent =
  | { kind: 'transmission'; transmission: Transmission }
  | { kind: 'readbackWanted'; transmission: Transmission }
  | { kind: 'tune'; frequency: number };

const WORDS_PER_SECOND = 2.7;
/** The key click before a transmission and the pause after it. */
const KEY_SECONDS = 0.6;
const GAP_SECONDS = 1.2;
const READBACK_SECONDS = 12;
const RETRY_SECONDS = 22;
/** A controller repeats a handoff the crew has not acted on after this long. */
const HANDOFF_REMINDER_SECONDS = 60;
/** Unheard twice, the third call goes out on whatever frequency the crew has: a relay. */
const RETRIES_BEFORE_RELAY = 2;
/** Vectors are corrected when the flight's heading no longer leads where it should, at most this often. */
const REVECTOR_SECONDS = 25;
const REVECTOR_DEGREES = 10;

const HANDOFFS: Partial<Record<PhraseKey, Facility>> = {
  contactTower: 'tower',
  contactDeparture: 'departure',
  contactCenter: 'center',
  contactApproach: 'approach',
  contactArrivalTower: 'arrivalTower',
};

export function frequencyOf(facilities: Facilities, facility: Facility): number {
  switch (facility) {
    case 'clearance':
      return facilities.clearance;
    case 'tower':
      return facilities.tower;
    case 'departure':
      return facilities.departure;
    case 'center':
      return facilities.center;
    case 'approach':
      return facilities.approach;
    case 'arrivalTower':
      return facilities.arrivalTower;
  }
}

/** "Philadelphia Departure", "Boston Approach", "Kennedy Tower". */
export function facilityName(facilities: Facilities, facility: Facility): string {
  switch (facility) {
    case 'clearance':
      return 'Philadelphia Clearance';
    case 'tower':
      return 'Philadelphia Tower';
    case 'departure':
      return `${facilities.departureName} Departure`;
    case 'center':
      return `${facilities.centerName} Center`;
    case 'approach':
      return `${facilities.approachName} Approach`;
    case 'arrivalTower':
      return `${facilities.arrivalTowerName} Tower`;
  }
}

export function startAtc(context: AtcContext): AtcState {
  const state: AtcState = {
    stage: 'clearance',
    log: [],
    queue: [],
    busyUntil: 0,
    nextId: 1,
    workingWith: 'clearance',
    handedTo: null,
    handoff: null,
    handedAt: 0,
    pending: null,
    cleared: { takeoff: false, altitudeFt: 3000, heading: null, approach: false, landing: false },
    vectoredAt: 0,
    unheard: null,
    retryAt: 0,
    missedReadbacks: 0,
    wrongReadbacks: 0,
  };
  if (context.practice === 'takeoff') {
    // Cleared at the gate already; the crew calls the tower from the runway.
    state.stage = 'takeoff';
    state.handedTo = 'tower';
    state.cleared.heading = context.departureHeading;
  } else if (context.practice === 'approach') {
    state.stage = 'vectors';
    state.workingWith = 'approach';
    state.cleared.altitudeFt = context.interceptAltitudeFt;
  }
  return state;
}

export function airtime(text: Spoken): number {
  const words = text.spoken.split(/\s+/).filter(Boolean).length;
  return KEY_SECONDS + words / WORDS_PER_SECOND;
}

export function stepAtc(state: AtcState, situation: AtcSituation, context: AtcContext): AtcEvent[] {
  const events: AtcEvent[] = [];
  retryUnheard(state, situation);
  readbackTimeout(state, situation, context);
  if (
    state.queue.length === 0 &&
    !state.pending &&
    !state.unheard &&
    situation.time >= state.busyUntil
  ) {
    if (!checkIn(state, situation, context) && !remindHandoff(state, situation)) {
      advanceStage(state, situation, context);
    }
  }
  air(state, situation, context, events);
  return events;
}

function speech(
  speaker: Controller,
  frequency: number,
  key: PhraseKey | 'readback',
  values: PhraseValues,
  text: Spoken,
  readback: boolean,
  at: number,
  attempt = 0,
): Speech {
  return { kind: 'speech', at, speaker, frequency, key, values, text, readback, attempt };
}

/** A controller's call: the words come from the phrase book. */
function instruct(
  state: AtcState,
  from: Facility,
  key: PhraseKey,
  values: PhraseValues,
  now: number,
  c: AtcContext,
) {
  const readback = readbackFor(key, values) !== null;
  state.queue.push(
    speech(
      from,
      frequencyOf(c.facilities, from),
      key,
      values,
      phrase(key, values),
      readback,
      now + 1,
    ),
  );
}

const crewVoice = (c: AtcContext): Controller =>
  c.crew === 'firstOfficer' ? 'firstOfficer' : 'captain';

/** Once the crew is on the new frequency, it calls the controller it was handed to. */
function checkIn(state: AtcState, s: AtcSituation, c: AtcContext): boolean {
  const facility = state.handedTo;
  if (!facility) return false;
  const frequency = frequencyOf(c.facilities, facility);
  if (!sameFrequency(s.comm, frequency)) return false;
  const name = facilityName(c.facilities, facility);
  let key: PhraseKey = 'checkIn';
  let values: PhraseValues = {
    facility: name,
    passingFt: s.altitudeFt,
    altitudeFt: state.cleared.altitudeFt,
  };
  if (facility === 'tower') {
    key = 'checkInReady';
    values = { facility: name, runway: c.departureRunway };
  } else if (facility === 'arrivalTower') {
    key = 'checkInFinal';
    values = { facility: name, runway: c.arrivalRunway };
  }
  state.queue.push(
    speech(crewVoice(c), frequency, key, values, phrase(key, values), false, s.time + 1),
  );
  state.workingWith = facility;
  state.handedTo = null;
  state.handoff = null;
  return true;
}

/** "Brightwater 312, contact New York Center 128.5" — again, when the crew never called. */
function remindHandoff(state: AtcState, s: AtcSituation): boolean {
  if (!state.handoff || s.time - state.handedAt < HANDOFF_REMINDER_SECONDS) return false;
  state.queue.push({ ...state.handoff, at: s.time + 1, attempt: state.handoff.attempt + 1 });
  state.handedAt = s.time;
  return true;
}

/** The controllers' side of the flight: what to say next, as the flight gets there. */
function advanceStage(state: AtcState, s: AtcSituation, c: AtcContext) {
  const now = s.time;
  const say = (from: Facility, key: PhraseKey, values: PhraseValues = {}) =>
    instruct(state, from, key, values, now, c);
  const f = c.facilities;
  const working = state.workingWith;

  if (s.goingAround && ['approach', 'towerHandoff', 'final'].includes(state.stage)) {
    say(working, 'goAround', { altitudeFt: c.goAroundAltitudeFt });
    state.stage = 'goAround';
    return;
  }

  switch (state.stage) {
    case 'clearance':
      if (now < 3) return;
      if (c.rules === 'program') say('clearance', 'programBrief');
      else {
        say('clearance', 'clearance', {
          destination: c.destinationName,
          heading: c.departureHeading,
          frequency: f.departure,
          squawk: c.squawk,
        });
      }
      state.stage = 'toTower';
      return;
    case 'toTower':
      say('clearance', 'contactTower', { facility: 'Philadelphia', frequency: f.tower });
      state.stage = 'takeoff';
      return;
    case 'takeoff':
      if (working !== 'tower' || !s.takeoffTime) return;
      say('tower', 'takeoff', { runway: c.departureRunway, wind: c.departureWind });
      state.stage = 'departure';
      return;
    case 'departure':
      if (!s.airborne || s.heightFt < 800) return;
      say('tower', 'contactDeparture', { frequency: f.departure });
      state.stage = 'climb';
      return;
    case 'climb':
      if (working !== 'departure') return;
      say('departure', 'radarContact', {
        facility: f.departureName,
        altitudeFt: c.practice === 'takeoff' ? 3000 : c.initialAltitudeFt,
      });
      state.stage = c.practice === 'takeoff' ? 'done' : c.rules === 'program' ? 'cruise' : 'center';
      return;
    case 'center':
      if (s.fromDepartureNm < 30 && s.altitudeFt < c.initialAltitudeFt - 1500) return;
      say('departure', 'contactCenter', { facility: f.centerName, frequency: f.center });
      state.stage = 'cruise';
      return;
    case 'cruise':
      if (c.rules === 'program') {
        // The program has no controllers en route: the tower speaks once the ILS is captured.
        if (!s.established) return;
        state.workingWith = 'arrivalTower';
        say('arrivalTower', 'landing', { runway: c.arrivalRunway, wind: c.arrivalWind });
        state.stage = 'final';
        return;
      }
      if (working !== 'center') return;
      if (state.cleared.altitudeFt < c.cruiseAltitudeFt && s.toDestinationNm > s.descentNm) {
        say('center', 'centerClimb', { facility: f.centerName, altitudeFt: c.cruiseAltitudeFt });
        return;
      }
      if (s.toDestinationNm > s.descentNm) return;
      say('center', 'descend', {
        altitudeFt: c.descentAltitudeFt,
        facility: c.arrivalCity,
        altimeter: c.arrivalAltimeter,
      });
      state.stage = 'descent';
      return;
    case 'descent':
      if (s.toDestinationNm > 45 && s.altitudeFt > c.descentAltitudeFt + 3000) return;
      say('center', 'contactApproach', { facility: f.approachName, frequency: f.approach });
      state.stage = 'approachHandoff';
      return;
    case 'approachHandoff':
      if (working !== 'approach') return;
      say('approach', 'vector', {
        facility: f.approachName,
        heading: s.vectorHeading,
        altitudeFt: c.interceptAltitudeFt,
        runway: c.arrivalRunway,
      });
      state.vectoredAt = now;
      state.stage = 'vectors';
      return;
    case 'vectors':
      if (!s.nearInterceptPoint && !s.established) {
        revector(state, s, c);
        return;
      }
      say('approach', 'approachClearance', {
        heading: s.interceptHeading,
        altitudeFt: c.interceptAltitudeFt,
        runway: c.arrivalRunway,
      });
      state.stage = 'approach';
      return;
    case 'approach':
      if (!(s.established && s.finalNm < 9) && s.finalNm > 6) return;
      say('approach', 'contactArrivalTower', {
        facility: f.arrivalTowerName,
        frequency: f.arrivalTower,
      });
      state.stage = 'towerHandoff';
      return;
    case 'towerHandoff':
      if (working !== 'arrivalTower') return;
      say('arrivalTower', 'landing', { runway: c.arrivalRunway, wind: c.arrivalWind });
      state.stage = 'final';
      return;
    case 'final':
      if (!s.stopped) return;
      say('arrivalTower', 'welcome', { destination: c.arrivalCity });
      state.stage = 'done';
      return;
    case 'goAround':
      if (s.heightFt < 1500) return;
      // Back to the approach controller for another try; a flight still with him just stays.
      if (working === 'arrivalTower') {
        say('arrivalTower', 'contactApproach', { facility: f.approachName, frequency: f.approach });
      }
      state.stage = 'approachHandoff';
      return;
    case 'done':
      return;
  }
}

/** "Turn left heading 270": the wind and the turns have taken the flight off the line to the base point. */
function revector(state: AtcState, s: AtcSituation, c: AtcContext) {
  const assigned = state.cleared.heading;
  if (assigned === null || s.time - state.vectoredAt < REVECTOR_SECONDS) return;
  const change = angleDifference(s.vectorHeading, assigned);
  if (Math.abs(change) < REVECTOR_DEGREES) return;
  const heading = Math.round(s.vectorHeading);
  instruct(state, 'approach', 'turn', { heading, turn: change > 0 ? 'right' : 'left' }, s.time, c);
  state.vectoredAt = s.time;
}

const sameFrequency = (a: number, b: number) => Math.abs(a - b) < 0.005;

function retryUnheard(state: AtcState, s: AtcSituation) {
  const call = state.unheard;
  if (!call || s.time < state.retryAt) return;
  state.unheard = null;
  const attempt = call.attempt + 1;
  if (attempt > RETRIES_BEFORE_RELAY) {
    state.queue.push({ ...call, frequency: s.comm, at: s.time + 1, attempt });
    return;
  }
  const hello = phrase('howDoYouRead', {});
  state.queue.push(
    speech(call.speaker, call.frequency, 'howDoYouRead', {}, hello, false, s.time + 1, attempt),
  );
  state.queue.push({ ...call, at: s.time + 4, attempt });
}

/** No readback in time: at Captain the controller asks, otherwise the first officer answers. */
function readbackTimeout(state: AtcState, s: AtcSituation, c: AtcContext) {
  const pending = state.pending;
  if (!pending || s.time < pending.deadline) return;
  state.pending = null;
  state.missedReadbacks++;
  const call = pending.transmission;
  if (c.crew === 'captain' && pending.attempt === 0) {
    const hello = phrase('howDoYouRead', {});
    state.queue.push(
      speech(call.speaker, call.frequency, 'howDoYouRead', {}, hello, false, s.time + 1, 1),
    );
    state.queue.push(
      speech(call.speaker, call.frequency, call.key, call.values, call.text, true, s.time + 4, 1),
    );
    return;
  }
  readBack(state, call, 'firstOfficer', s.time, c);
}

function readBack(
  state: AtcState,
  call: Transmission,
  speaker: Controller,
  now: number,
  c: AtcContext,
  text?: Spoken,
) {
  const words = text ?? (call.key === 'readback' ? null : readbackFor(call.key, call.values));
  if (!words) return;
  state.queue.push(
    speech(speaker, call.frequency, 'readback', call.values, words, false, now + 0.8),
  );
  // The first officer reads back a handoff, then sets the new frequency.
  const next = call.key === 'readback' ? undefined : HANDOFFS[call.key];
  if (next && c.crew === 'firstOfficer') {
    state.queue.push({ kind: 'tune', at: now + 0.8, frequency: frequencyOf(c.facilities, next) });
  }
}

/** Puts the next item of the queue on the air, if the frequency is free and its time has come. */
function air(state: AtcState, s: AtcSituation, c: AtcContext, events: AtcEvent[]) {
  if (s.time < state.busyUntil || state.pending) return;
  const next = state.queue[0];
  if (!next || s.time < next.at) return;
  state.queue.shift();

  if (next.kind === 'tune') {
    events.push({ kind: 'tune', frequency: next.frequency });
    return;
  }

  const crewSpeaking = next.speaker === 'firstOfficer' || next.speaker === 'captain';
  if (!crewSpeaking && c.crew === 'firstOfficer' && !sameFrequency(s.comm, next.frequency)) {
    events.push({ kind: 'tune', frequency: next.frequency });
  }
  const transmission: Transmission = {
    id: state.nextId++,
    at: s.time,
    speaker: next.speaker,
    frequency: next.frequency,
    key: next.key,
    values: next.values,
    text: next.text,
    airtime: airtime(next.text),
    heard: crewSpeaking || c.crew === 'firstOfficer' || sameFrequency(s.comm, next.frequency),
  };
  state.log.push(transmission);
  state.busyUntil = s.time + transmission.airtime + GAP_SECONDS;
  events.push({ kind: 'transmission', transmission });

  if (!transmission.heard) {
    state.unheard = next;
    state.retryAt = s.time + RETRY_SECONDS;
    return;
  }
  if (crewSpeaking) return;
  applyClearance(state, transmission, c, next);
  if (!next.readback) return;
  if (c.crew === 'firstOfficer') {
    readBack(state, transmission, 'firstOfficer', state.busyUntil - GAP_SECONDS, c);
    return;
  }
  state.pending = {
    transmission,
    choices: readbackChoices(transmission),
    deadline: state.busyUntil + READBACK_SECONDS,
    attempt: next.attempt,
  };
  events.push({ kind: 'readbackWanted', transmission });
}

function applyClearance(state: AtcState, transmission: Transmission, c: AtcContext, call: Speech) {
  const v = transmission.values;
  const cleared = state.cleared;
  const handedTo = transmission.key === 'readback' ? undefined : HANDOFFS[transmission.key];
  if (handedTo) {
    state.handedTo = handedTo;
    state.handoff = call;
    state.handedAt = transmission.at;
  }
  switch (transmission.key) {
    case 'clearance':
    case 'programBrief':
      cleared.altitudeFt = 3000;
      cleared.heading = c.departureHeading;
      break;
    case 'takeoff':
      cleared.takeoff = true;
      break;
    case 'radarContact':
    case 'centerClimb':
    case 'descend':
      cleared.altitudeFt = v.altitudeFt ?? cleared.altitudeFt;
      cleared.heading = null;
      break;
    case 'vector':
      cleared.altitudeFt = v.altitudeFt ?? cleared.altitudeFt;
      cleared.heading = v.heading ?? null;
      break;
    case 'turn':
      cleared.heading = v.heading ?? cleared.heading;
      break;
    case 'approachClearance':
      cleared.approach = true;
      cleared.heading = v.heading ?? null;
      break;
    case 'landing':
      cleared.landing = true;
      break;
    case 'goAround':
      cleared.landing = false;
      cleared.approach = false;
      cleared.altitudeFt = v.altitudeFt ?? 3000;
      cleared.heading = null;
      break;
    default:
      break;
  }
}

/** The right readback, one with a number misheard, and asking again. */
export function readbackChoices(transmission: Transmission): ReadbackChoice[] {
  if (transmission.key === 'readback') return [];
  const correct = readbackFor(transmission.key, transmission.values);
  if (!correct) return [];
  return [
    { id: 'correct', text: correct },
    { id: 'wrong', text: misheard(transmission.key, transmission.values, correct) },
    { id: 'sayAgain', text: say('Say again, ', CALLSIGN, '.') },
  ];
}

/** The readback with the first number that matters slipped: an altitude, a frequency, a heading, a runway. */
function misheard(key: PhraseKey, values: PhraseValues, correct: Spoken): Spoken {
  const slips: PhraseValues[] = [];
  if (values.altitudeFt !== undefined) {
    slips.push({
      ...values,
      altitudeFt: values.altitudeFt + (values.altitudeFt >= 18_000 ? 2000 : 1000),
    });
  }
  if (values.frequency !== undefined) slips.push({ ...values, frequency: values.frequency + 0.2 });
  if (values.heading !== undefined) slips.push({ ...values, heading: (values.heading + 20) % 360 });
  if (values.runway) {
    const runway = values.runway.endsWith('R')
      ? values.runway.replace('R', 'L')
      : `${values.runway}L`;
    slips.push({ ...values, runway });
  }
  for (const slip of slips) {
    const text = readbackFor(key, slip);
    if (text && text.written !== correct.written) return text;
  }
  return correct;
}

/** "Brightwater 312, negative, I say again: climb and maintain FL350." */
function correction(call: Transmission): Spoken {
  const instruction = call.text;
  const drop = (text: string, callsign: string) => text.replace(`${callsign}, `, '');
  return say(CALLSIGN, ', negative, I say again: ', {
    written: drop(instruction.written, CALLSIGN.written),
    spoken: drop(instruction.spoken, CALLSIGN.spoken),
  });
}

/**
 * The player picks a readback. A wrong one is caught: by the controller at
 * the Captain level, who says the instruction again and wants it read back;
 * by the first officer at the Pilot level, who corrects it on the spot.
 */
export function answerReadback(
  state: AtcState,
  context: AtcContext,
  choice: ReadbackChoice['id'],
  now: number,
) {
  const pending = state.pending;
  if (!pending) return;
  const picked = pending.choices.find((candidate) => candidate.id === choice);
  if (!picked) return;
  state.pending = null;
  const call = pending.transmission;
  readBack(state, call, 'captain', now, context, picked.text);
  if (choice === 'sayAgain') {
    state.queue.push(
      speech(
        call.speaker,
        call.frequency,
        call.key,
        call.values,
        call.text,
        true,
        now + 3,
        pending.attempt,
      ),
    );
    return;
  }
  if (choice !== 'wrong') return;
  state.wrongReadbacks++;
  if (context.crew === 'captain') {
    const words = correction(call);
    state.queue.push(
      speech(
        call.speaker,
        call.frequency,
        call.key,
        call.values,
        words,
        true,
        now + 3,
        pending.attempt + 1,
      ),
    );
    return;
  }
  const right = readbackFor(call.key as PhraseKey, call.values);
  if (right)
    readBack(state, call, 'firstOfficer', now + 2, context, say('Correction, ', lowerFirst(right)));
}

const lowerFirst = (text: Spoken): Spoken => ({
  written: text.written.charAt(0).toLowerCase() + text.written.slice(1),
  spoken: text.spoken.charAt(0).toLowerCase() + text.spoken.slice(1),
});
