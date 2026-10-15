import { checklistById, CHECKLISTS, type ChecklistId } from '../engine/checklists';
import {
  checklistView,
  type Flight,
  type FlightSetup,
  type Level,
  type Mode,
  type Outcome,
  type TimeOfDay,
} from '../engine/flight';
import { DEPARTURE, DESTINATIONS, destinationById, type DestinationId } from '../engine/navdata';
import { phrase } from '../engine/phraseology';
import { facilitiesFor, planFlight } from '../engine/plan';
import { ilsFor } from '../engine/radios';
import { runway } from '../engine/runways';
import { generateWeather, PROGRAM_SEED, type DestinationSky } from '../engine/weather';
import type { Settings } from '../settings';
import type { Livery } from '../world/jumbo';
import { h } from './dom';

/**
 * The game's screens around the flight: the title, the briefing where a
 * flight is chosen and its plan read, the settings, the pause menu, the
 * checklists and the report at the end. Each is a function that builds
 * its DOM and calls back with what the player chose.
 */
export const LEVELS: { id: Level; name: string; blurb: string }[] = [
  {
    id: 'rules1982',
    name: '1982 Rules',
    blurb: 'The program’s own model and verdicts, bugs fixed, in the new cockpit. No autopilot.',
  },
  {
    id: 'arcade',
    name: 'Arcade',
    blurb:
      'Forgiving: flight director cues, auto-trim, flaps that follow the speed, the first officer on the radio, hints.',
  },
  {
    id: 'pilot',
    name: 'Pilot',
    blurb:
      'A real jumbo: lift, drag, thrust and trim. You work the radio; checklists are there if you want them.',
  },
  {
    id: 'captain',
    name: 'Captain',
    blurb:
      'Pilot plus procedures: limits, clearances, checklists, stable by 1,000 ft or go around. Every slip is logged.',
  },
];

const MODES: { id: Mode; name: string; blurb: string }[] = [
  {
    id: 'flight',
    name: 'Flight 312',
    blurb:
      'The whole flight: the clearance at 07:59, takeoff from Philadelphia, the cruise, and an ILS into the murk at the far end.',
  },
  {
    id: 'takeoff',
    name: 'Takeoff',
    blurb: 'The takeoff roll in a gusty crosswind and the climb-out to 3,000 ft.',
  },
  {
    id: 'approach',
    name: 'Approach',
    blurb: 'Fifteen miles out on any ILS, in the weather you choose.',
  },
];

const SKIES: { id: DestinationSky; name: string }[] = [
  { id: 'clear', name: 'Clear' },
  { id: 'low', name: 'Low cloud' },
  { id: 'minimums', name: 'Minimums' },
  { id: 'fog', name: 'Fog' },
];

const TIMES: { id: TimeOfDay; name: string }[] = [
  { id: 'morning', name: 'Morning' },
  { id: 'dusk', name: 'Dusk' },
  { id: 'night', name: 'Night' },
];

export function titleScreen(
  choose: (mode: Mode) => void,
  settings: () => void,
  hall: string,
): HTMLElement {
  return h(
    'section',
    { class: 'screen title-screen', 'aria-labelledby': 'title' },
    h(
      'header',
      { class: 'title-header' },
      h('p', { class: 'title-kicker' }, 'NeoArcade · a remake of JETSET, the 1982 IFR simulator'),
      h('h1', { id: 'title' }, 'FLIGHT 312'),
      h(
        'p',
        { class: 'title-tag' },
        'A classic jumbo, on instruments, from Philadelphia into the murk at the far end.',
      ),
    ),
    h(
      'nav',
      { class: 'title-menu', 'aria-label': 'Modes' },
      ...MODES.map((mode) =>
        h(
          'button',
          { type: 'button', class: 'menu-card', onclick: () => choose(mode.id) },
          h('strong', {}, mode.name),
          h('span', {}, mode.blurb),
        ),
      ),
      h('button', { type: 'button', class: 'menu-link', onclick: settings }, 'Settings'),
      h('a', { class: 'menu-link', href: hall }, 'Back to the Hall'),
    ),
    h(
      'p',
      { class: 'title-credit' },
      'Inspired by JETSET, an IFR Boeing 747 simulator by J. (Jean/Gene) Szymanski (1981–82, BYTE magazine; IBM PC edition 1982). The airline is invented.',
    ),
  );
}

export interface BriefingChoice {
  setup: FlightSetup;
}

/** The radio's first words, for the briefing: the program's brief under its rules, a clearance otherwise. */
function briefText(level: Level, destinationName: string, squawk: string): string {
  if (level === 'rules1982') return phrase('programBrief', {}).written;
  return phrase('clearance', {
    destination: destinationName,
    heading: 88,
    frequency: 124.35,
    squawk,
  }).written;
}

export function briefingScreen(
  mode: Mode,
  last: Partial<FlightSetup>,
  start: (setup: FlightSetup) => void,
  back: () => void,
): HTMLElement {
  let level: Level = last.level ?? 'arcade';
  let destination: DestinationId = last.destination ?? 'jfk';
  let sky: DestinationSky = last.sky ?? 'minimums';
  let timeOfDay: TimeOfDay = last.timeOfDay ?? 'morning';
  let programSky = last.programSky ?? false;
  let seed = last.seed ?? Math.floor(Math.random() * 1_000_000);
  let windDirection = last.wind?.direction ?? 40;
  let windSpeed = last.wind?.speedKt ?? 10;
  let fuelLb: number | undefined = last.fuelLb;

  const plan = h('div', { class: 'brief-plan', 'aria-live': 'polite' });
  const root = h('section', { class: 'screen briefing', 'aria-labelledby': 'brief-title' });

  const setup = (): FlightSetup => ({
    mode,
    level,
    destination,
    seed,
    programSky: level === 'rules1982' && programSky,
    ...(mode === 'approach'
      ? {
          sky,
          timeOfDay,
          wind: {
            direction: windDirection,
            speedKt: windSpeed,
            gustKt: windSpeed > 12 ? windSpeed + 8 : 0,
          },
        }
      : {}),
    ...(level === 'captain' && mode === 'flight' && fuelLb ? { fuelLb } : {}),
  });

  const refresh = () => {
    const chosen = destinationById(destination);
    const departure = runway(DEPARTURE.airport, DEPARTURE.runway);
    const ils = ilsFor(chosen, 'real');
    const weather = generateWeather({
      seed: level === 'rules1982' && programSky ? PROGRAM_SEED : seed,
      style: level === 'rules1982' ? 'program' : 'realistic',
      departure: { position: departure.threshold, elevationFt: departure.elevationFt },
      destination: { position: ils.runway.threshold, elevationFt: ils.runway.elevationFt },
      destinationSky: mode === 'approach' ? sky : undefined,
    });
    const flightPlan = planFlight(departure.threshold, chosen, weather);
    const facilities = facilitiesFor(chosen.id);
    const field = weather.destination;
    const ceiling = field.ceilingFt === null ? 'no ceiling' : `ceiling ${field.ceilingFt} ft`;
    const rows = flightPlan.legs.map((leg) =>
      h(
        'tr',
        {},
        h('td', {}, leg.station.ident),
        h('td', {}, leg.station.name),
        h('td', {}, leg.station.frequency.toFixed(1)),
        h('td', {}, String(Math.round(leg.course)).padStart(3, '0')),
        h('td', {}, `${Math.round(leg.distanceNm)} nm`),
      ),
    );
    if (mode === 'flight' && level === 'captain' && fuelLb === undefined)
      fuelLb = flightPlan.blockFuelLb;
    plan.replaceChildren(
      h('h3', {}, `${chosen.city} · ${chosen.airport} runway ${chosen.runway}`),
      h('p', { class: 'brief-note' }, chosen.note),
      mode !== 'flight'
        ? ''
        : h(
            'table',
            { class: 'brief-legs' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', {}, 'VOR'),
                h('th', {}, 'Station'),
                h('th', {}, 'MHz'),
                h('th', {}, 'Course'),
                h('th', {}, 'Leg'),
              ),
            ),
            h('tbody', {}, ...rows),
          ),
      h(
        'dl',
        { class: 'brief-facts' },
        ...(mode === 'flight'
          ? [
              h('dt', {}, 'Distance'),
              h('dd', {}, `${Math.round(flightPlan.totalNm)} nm, about ${flightPlan.minutes} min`),
              h('dt', {}, 'Cruise'),
              h(
                'dd',
                {},
                flightPlan.cruiseAltitudeFt >= 18_000
                  ? `FL${flightPlan.cruiseAltitudeFt / 100}`
                  : `${flightPlan.cruiseAltitudeFt.toLocaleString('en-US')} ft`,
              ),
              h('dt', {}, 'Fuel'),
              h(
                'dd',
                {},
                level === 'rules1982'
                  ? '200,000 lb (the program’s load)'
                  : `${flightPlan.blockFuelLb.toLocaleString('en-US')} lb block (trip ${flightPlan.tripFuelLb.toLocaleString('en-US')}, reserve ${flightPlan.reserveFuelLb.toLocaleString('en-US')})`,
              ),
              h('dt', {}, 'Wind aloft'),
              h(
                'dd',
                {},
                `${String(Math.round(flightPlan.expectedWind.direction)).padStart(3, '0')}° at ${Math.round(flightPlan.expectedWind.speedKt)} kt`,
              ),
            ]
          : []),
        h('dt', {}, 'At the field'),
        h(
          'dd',
          {},
          `${ceiling}, visibility ${field.visibilityMi} mi${field.rain ? ', rain' : ''}, altimeter ${field.qnh.toFixed(2)}`,
        ),
        h('dt', {}, 'ILS'),
        h(
          'dd',
          {},
          `${chosen.localizerIdent} ${chosen.localizer.toFixed(1)} · approach ${facilities.approach.toFixed(2)} · tower ${facilities.arrivalTower.toFixed(2)}`,
        ),
      ),
      mode !== 'approach'
        ? h('blockquote', { class: 'brief-radio' }, briefText(level, chosen.city, '6111'))
        : '',
    );
  };

  const group = (title: string, ...children: (Node | null)[]) =>
    h('fieldset', { class: 'brief-group' }, h('legend', {}, title), ...children);
  const radios = <T extends string>(
    name: string,
    options: { id: T; name: string; blurb?: string }[],
    current: T,
    change: (value: T) => void,
  ) =>
    h(
      'div',
      { class: 'brief-options', role: 'radiogroup' },
      ...options.map((option) => {
        const input = h('input', {
          type: 'radio',
          name,
          value: option.id,
          checked: option.id === current,
        });
        input.addEventListener('change', () => {
          change(option.id);
          refresh();
        });
        return h(
          'label',
          { class: 'brief-option' },
          input,
          h('strong', {}, option.name),
          option.blurb ? h('span', {}, option.blurb) : null,
        );
      }),
    );

  const seedInput = h('input', {
    type: 'number',
    min: 0,
    max: 999999,
    value: seed,
    class: 'brief-seed',
    'aria-label': 'Weather seed',
  });
  seedInput.addEventListener('change', () => {
    seed = Math.max(0, Math.min(999_999, Number(seedInput.value) || 0));
    refresh();
  });
  const programToggle = h('input', { type: 'checkbox', checked: programSky });
  programToggle.addEventListener('change', () => {
    programSky = programToggle.checked;
    refresh();
  });
  const wind = h('input', {
    type: 'number',
    min: 1,
    max: 360,
    value: windDirection,
    'aria-label': 'Wind from, degrees',
  });
  wind.addEventListener('change', () => (windDirection = Number(wind.value) || 360));
  const windKt = h('input', {
    type: 'number',
    min: 0,
    max: 40,
    value: windSpeed,
    'aria-label': 'Wind speed, knots',
  });
  windKt.addEventListener(
    'change',
    () => (windSpeed = Math.max(0, Math.min(40, Number(windKt.value) || 0))),
  );

  root.append(
    h(
      'header',
      { class: 'screen-header' },
      h('button', { type: 'button', class: 'menu-link', onclick: back }, '← Back'),
      h('h2', { id: 'brief-title' }, `${MODES.find((m) => m.id === mode)?.name} · briefing`),
    ),
    h(
      'div',
      { class: 'brief-columns' },
      h(
        'div',
        { class: 'brief-choices' },
        group(
          'Realism',
          radios('level', LEVELS, level, (value) => (level = value)),
        ),
        group(
          'Destination',
          radios(
            'destination',
            DESTINATIONS.map((d) => ({ id: d.id, name: `${d.city} (${d.airport} ${d.runway})` })),
            destination,
            (value) => (destination = value),
          ),
        ),
        mode === 'approach'
          ? group(
              'Weather at the field',
              radios('sky', SKIES, sky, (value) => (sky = value)),
              h('label', { class: 'brief-inline' }, 'Wind from ', wind, '° at ', windKt, ' kt'),
              radios('time', TIMES, timeOfDay, (value) => (timeOfDay = value)),
            )
          : group(
              'Weather',
              h('label', { class: 'brief-inline' }, 'Seed ', seedInput),
              h(
                'label',
                { class: 'brief-inline' },
                programToggle,
                ' 1982 Rules: fly the program’s one sky (RANDOMIZE 57.2958)',
              ),
            ),
      ),
      plan,
    ),
    h(
      'footer',
      { class: 'screen-footer' },
      h(
        'button',
        { type: 'button', class: 'primary', onclick: () => start(setup()) },
        'Start the flight',
      ),
    ),
  );
  refresh();
  return root;
}

/** The cosmetics the Arcade Pass has unlocked, for the settings that use them. */
export interface UnlockedCosmetics {
  liveries: Livery[];
  cap: boolean;
}

const LIVERY_NAMES: Record<Livery, string> = {
  brightwater: 'Brightwater',
  sunrise: 'Sunrise',
  silver: 'Silver jet',
  night: 'Night blue',
};

export function settingsScreen(
  settings: Settings,
  change: (settings: Settings) => void,
  back: () => void,
  unlocked: UnlockedCosmetics,
): HTMLElement {
  const current = { ...settings };
  const update = (patch: Partial<Settings>) => {
    Object.assign(current, patch);
    change({ ...current });
  };
  const select = <K extends keyof Settings>(
    key: K,
    label: string,
    options: [Settings[K], string][],
  ) => {
    const element = h('select', { 'aria-label': label });
    for (const [value, name] of options)
      element.append(h('option', { value: String(value), selected: value === current[key] }, name));
    element.addEventListener('change', () => {
      const chosen = options.find(([value]) => String(value) === element.value);
      if (chosen) update({ [key]: chosen[0] } as Partial<Settings>);
    });
    return h('label', { class: 'setting' }, h('span', {}, label), element);
  };
  const toggle = (
    key: 'atcVoice' | 'subtitles' | 'hints' | 'pauseOnHints' | 'invertPitch' | 'glareshieldCap',
    label: string,
  ) => {
    const element = h('input', { type: 'checkbox', checked: current[key] });
    element.addEventListener('change', () => update({ [key]: element.checked }));
    return h('label', { class: 'setting setting-toggle' }, element, h('span', {}, label));
  };
  const slider = (key: 'voiceVolume' | 'effectsVolume', label: string) => {
    const element = h('input', {
      type: 'range',
      min: 0,
      max: 100,
      value: Math.round(current[key] * 100),
    });
    element.addEventListener('input', () => update({ [key]: Number(element.value) / 100 }));
    return h('label', { class: 'setting' }, h('span', {}, label), element);
  };
  return h(
    'section',
    { class: 'screen settings', 'aria-labelledby': 'settings-title' },
    h(
      'header',
      { class: 'screen-header' },
      h('button', { type: 'button', class: 'menu-link', onclick: back }, '← Back'),
      h('h2', { id: 'settings-title' }, 'Settings'),
    ),
    h(
      'div',
      { class: 'settings-grid' },
      select('controls', 'Keyboard', [
        ['modern', 'Modern'],
        ['singleFile', '1982 keys — single-file listing (U/D pitch, C flare)'],
        ['ibm', '1982 keys — IBM PC edition (keypad 2/8 pitch, 6 flare)'],
      ]),
      toggle('atcVoice', 'Air traffic control speaks (this device’s own voices only)'),
      slider('voiceVolume', 'Voice volume'),
      slider('effectsVolume', 'Engines and effects volume'),
      toggle('subtitles', 'Radio subtitles'),
      select('speakingRate', 'Speaking rate', [
        ['slow', 'Slow'],
        ['normal', 'Normal'],
        ['fast', 'Fast'],
      ]),
      toggle('hints', 'Hints at the Pilot level (always on at Arcade, never at Captain)'),
      toggle('pauseOnHints', 'Pause when a hint appears (Arcade)'),
      select('menuTheme', 'Menus', [
        ['auto', 'Follow this device'],
        ['light', 'Light'],
        ['dark', 'Dark'],
      ]),
      select('cockpitLighting', 'Cockpit lighting', [
        ['auto', 'Follow the sky'],
        ['day', 'Day'],
        ['dusk', 'Dusk'],
        ['night', 'Night'],
      ]),
      select('detail', 'Detail', [
        ['high', 'High'],
        ['low', 'Low (older computers and phones)'],
      ]),
      toggle('invertPitch', 'Invert pitch'),
      select(
        'livery',
        'Livery (seen in the replay)',
        unlocked.liveries.map((livery) => [livery, LIVERY_NAMES[livery]]),
      ),
      ...(unlocked.cap ? [toggle('glareshieldCap', 'Captain’s cap on the glareshield')] : []),
    ),
    unlocked.liveries.length < Object.keys(LIVERY_NAMES).length || !unlocked.cap
      ? h(
          'p',
          { class: 'settings-note' },
          'More liveries and a cap for the glareshield come with the Arcade Pass.',
        )
      : null,
  );
}

export function pauseMenu(actions: {
  resume(): void;
  chart(): void;
  checklist(): void;
  settings(): void;
  restart(): void;
  quit(): void;
}): HTMLElement {
  const button = (label: string, run: () => void, primary = false) =>
    h('button', { type: 'button', class: primary ? 'primary' : 'menu-link', onclick: run }, label);
  return h(
    'div',
    { class: 'overlay pause', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
    h(
      'div',
      { class: 'overlay-card' },
      h('h2', {}, 'Paused'),
      button('Resume', actions.resume, true),
      button('En-route chart', actions.chart),
      button('Checklists', actions.checklist),
      button('Settings', actions.settings),
      button('Restart this flight', actions.restart),
      button('Leave the flight', actions.quit),
    ),
  );
}

/** The checklists: items tick themselves as the aircraft is set; the crew calls each list complete. */
export function checklistPanel(
  flight: Flight,
  complete: (id: ChecklistId) => void,
  close: () => void,
): { element: HTMLElement; refresh(): void } {
  const body = h('div', { class: 'checklists' });
  const element = h(
    'div',
    { class: 'overlay checklist-overlay', role: 'dialog', 'aria-label': 'Checklists' },
    h(
      'div',
      { class: 'overlay-card wide' },
      h('h2', {}, 'Checklists'),
      body,
      h('button', { type: 'button', class: 'primary', onclick: close }, 'Close'),
    ),
  );
  const refresh = () => {
    const view = checklistView(flight);
    body.replaceChildren(
      ...CHECKLISTS.map((list) => {
        const done = flight.procedures.completed[list.id] !== null;
        const ready = list.items.every((item) => item.done(view));
        return h(
          'section',
          { class: `checklist${done ? ' done' : ''}` },
          h('h3', {}, list.title),
          h(
            'ul',
            {},
            ...checklistById(list.id).items.map((item) =>
              h(
                'li',
                { class: item.done(view) ? 'ticked' : '' },
                h('span', {}, item.challenge),
                h('span', {}, item.response),
              ),
            ),
          ),
          done
            ? h('p', { class: 'checklist-done' }, 'Complete')
            : h(
                'button',
                { type: 'button', disabled: !ready, onclick: () => complete(list.id) },
                `${list.title} checklist complete`,
              ),
        );
      }),
    );
  };
  refresh();
  return { element, refresh };
}

export function reportScreen(
  outcome: Outcome,
  actions: { replay(): void; again(): void; brief(): void; title(): void },
): HTMLElement {
  const report = outcome.report;
  return h(
    'div',
    {
      class: `overlay report report-${report.severity}`,
      role: 'dialog',
      'aria-labelledby': 'report-title',
    },
    h(
      'div',
      { class: 'overlay-card report-card' },
      h('p', { class: 'report-kind' }, report.title),
      h('h2', { id: 'report-title' }, report.headline),
      h('p', { class: 'report-where' }, report.where),
      h('div', { class: 'report-story' }, ...report.story.map((line) => h('p', {}, line))),
      h(
        'dl',
        { class: 'report-numbers' },
        ...report.numbers.flatMap((line) => [h('dt', {}, line.label), h('dd', {}, line.value)]),
      ),
      outcome.violations.length > 0
        ? h(
            'div',
            { class: 'report-violations' },
            h('h3', {}, 'In the book'),
            h('ul', {}, ...outcome.violations.map((violation) => h('li', {}, violation.text))),
          )
        : null,
      h('p', { class: 'report-advice' }, report.advice),
      h(
        'div',
        { class: 'report-actions' },
        h(
          'button',
          { type: 'button', class: 'menu-link', onclick: actions.replay },
          'Watch the replay',
        ),
        h('button', { type: 'button', class: 'primary', onclick: actions.again }, 'Fly it again'),
        h(
          'button',
          { type: 'button', class: 'menu-link', onclick: actions.brief },
          'Change the flight',
        ),
        h('button', { type: 'button', class: 'menu-link', onclick: actions.title }, 'Title'),
      ),
    ),
  );
}
