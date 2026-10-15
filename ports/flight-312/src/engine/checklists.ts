import type { Clearance } from './atc';
import { flapLeverDegrees, type Panel } from './panel';
import type { Readout } from './readout';

/**
 * The crew's checklists, shortened to the items this cockpit can show. An
 * item ticks itself when the aircraft is set that way; the crew calls the
 * whole list complete. Captain requires each list by its point in the
 * flight; the other levels offer them.
 */
export type ChecklistId = 'beforeTakeoff' | 'afterTakeoff' | 'approach' | 'landing';

export interface ChecklistView {
  panel: Panel;
  readout: Readout;
  cleared: Clearance;
  departureQnh: number;
  arrivalQnh: number;
  localizer: number;
  runwayCourse: number;
  referenceSpeedKt: number;
  /** NAV 1 is tuned to one of the stations, or to a localizer. */
  navTuned: boolean;
}

export interface ChecklistItem {
  challenge: string;
  response: string;
  done: (view: ChecklistView) => boolean;
}

export interface Checklist {
  id: ChecklistId;
  title: string;
  items: ChecklistItem[];
}

const setTo = (setting: number, wanted: number) => Math.abs(setting - wanted) < 0.015;

export const CHECKLISTS: readonly Checklist[] = [
  {
    id: 'beforeTakeoff',
    title: 'Before takeoff',
    items: [
      {
        challenge: 'Flaps',
        response: '10 or 20',
        done: (v) => [10, 20].includes(flapLeverDegrees(v.panel)),
      },
      { challenge: 'Speedbrake', response: 'Down', done: (v) => v.panel.speedbrake === 'down' },
      {
        challenge: 'Altimeters',
        response: 'Set',
        done: (v) => setTo(v.panel.altimeterInHg, v.departureQnh),
      },
      { challenge: 'NAV radios', response: 'Tuned', done: (v) => v.navTuned },
      { challenge: 'Takeoff clearance', response: 'Received', done: (v) => v.cleared.takeoff },
    ],
  },
  {
    id: 'afterTakeoff',
    title: 'After takeoff',
    items: [
      {
        challenge: 'Landing gear',
        response: 'Up',
        done: (v) => !v.panel.gearDown && v.readout.gear < 0.01,
      },
      {
        challenge: 'Flaps',
        response: 'Up',
        done: (v) => flapLeverDegrees(v.panel) === 0 && v.readout.flapsDeg < 0.5,
      },
    ],
  },
  {
    id: 'approach',
    title: 'Approach',
    items: [
      {
        challenge: 'Altimeters',
        response: 'Set',
        done: (v) => setTo(v.panel.altimeterInHg, v.arrivalQnh),
      },
      {
        challenge: 'NAV 1',
        response: 'Localizer',
        done: (v) => Math.abs(v.panel.nav[0].frequency - v.localizer) < 0.005,
      },
      {
        challenge: 'Course',
        response: 'Set',
        done: (v) => Math.abs(((v.panel.nav[0].course - v.runwayCourse + 540) % 360) - 180) <= 3,
      },
      {
        challenge: 'Speed bug',
        response: 'Vref',
        done: (v) => Math.abs(v.panel.speedBugKt - v.referenceSpeedKt) <= 3,
      },
    ],
  },
  {
    id: 'landing',
    title: 'Landing',
    items: [
      {
        challenge: 'Landing gear',
        response: 'Down, three green',
        done: (v) => v.panel.gearDown && v.readout.gear > 0.99,
      },
      {
        challenge: 'Flaps',
        response: '25 or 30',
        done: (v) => [25, 30].includes(flapLeverDegrees(v.panel)),
      },
      { challenge: 'Speedbrake', response: 'Armed', done: (v) => v.panel.speedbrake === 'armed' },
      { challenge: 'Landing clearance', response: 'Received', done: (v) => v.cleared.landing },
    ],
  },
];

export const checklistById = (id: ChecklistId) =>
  CHECKLISTS.find((list) => list.id === id) as Checklist;

export const checklistReady = (id: ChecklistId, view: ChecklistView) =>
  checklistById(id).items.every((item) => item.done(view));
