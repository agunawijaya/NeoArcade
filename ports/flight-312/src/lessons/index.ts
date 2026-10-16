import { parseLesson, type Lesson } from '../engine/lesson';
import cockpitTour from './01-cockpit-tour.json' with { type: 'json' };
import takeoffRoll from './02-takeoff-roll.json' with { type: 'json' };
import rotationClimb from './03-rotation-climb.json' with { type: 'json' };
import turnsHeading from './04-turns-heading.json' with { type: 'json' };
import vorRadial from './05-vor-radial.json' with { type: 'json' };
import dmePosition from './06-dme-position.json' with { type: 'json' };
import descentPlanning from './07-descent-planning.json' with { type: 'json' };
import ilsCapture from './08-ils-capture.json' with { type: 'json' };
import glideslope from './09-glideslope.json' with { type: 'json' };
import flareTouchdown from './10-flare-touchdown.json' with { type: 'json' };
import crosswindLanding from './11-crosswind-landing.json' with { type: 'json' };
import missedApproach from './12-missed-approach.json' with { type: 'json' };
import checkRide from './13-check-ride.json' with { type: 'json' };

/**
 * The flight school's lessons, in the order they are taught: each one a
 * data file beside this one, checked as it is loaded.
 */
export const LESSONS: readonly Lesson[] = [
  cockpitTour,
  takeoffRoll,
  rotationClimb,
  turnsHeading,
  vorRadial,
  dmePosition,
  descentPlanning,
  ilsCapture,
  glideslope,
  flareTouchdown,
  crosswindLanding,
  missedApproach,
  checkRide,
].map(parseLesson);

export const lessonById = (id: string) => LESSONS.find((lesson) => lesson.id === id);
