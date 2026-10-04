import { fatigueOf } from './conditions';
import type { TripEvent } from './events';
import { RULES } from './rules';
import { streamFor } from './streams';
import type { Trip } from './trip';
import { weatherForComingHour } from './weather';

/**
 * What the driver knows before choosing a speed (lines 1550–1630): the
 * fuel gauge, how they feel, the weather, and whether a truck stop is
 * coming up.
 */
export function lookAhead(trip: Trip): TripEvent[] {
  const events: TripEvent[] = [];
  const look = streamFor(trip.seed, 'look', trip.hourCount);
  trip.fuelGauge = Math.floor(trip.fuel - 4 + look.next() * 10);

  const fatigue = fatigueOf(trip.awake, trip.hr, trip.slept);
  if (fatigue !== trip.fatigue) {
    events.push({
      type: 'fatigue',
      from: trip.fatigue,
      to: fatigue,
      hr: trip.hr,
      mile: trip.miles,
    });
    trip.fatigue = fatigue;
  }

  const condition = weatherForComingHour(trip);
  if (condition !== trip.condition) {
    events.push({
      type: 'weather',
      from: trip.condition,
      to: condition,
      hr: trip.hr,
      mile: trip.miles,
    });
    trip.condition = condition;
  }

  trip.hoursSinceStop += 1;
  trip.stopOffered = trip.hoursSinceStop > RULES.hoursBetweenStops;
  return events;
}

/**
 * After a stop the driver and the road are judged afresh. The original
 * kept the fatigue and the weather it had worked out before the stop, so the
 * first hour after a night's sleep was still driven "exhausted", through the
 * blizzard of the evening before. A stop without sleep keeps the weather: an
 * hour over coffee does not move a storm.
 */
export function refreshAfterStop(trip: Trip, slept: boolean): TripEvent[] {
  const events: TripEvent[] = [];
  const fatigue = fatigueOf(trip.awake, trip.hr, trip.slept);
  if (fatigue !== trip.fatigue) {
    events.push({
      type: 'fatigue',
      from: trip.fatigue,
      to: fatigue,
      hr: trip.hr,
      mile: trip.miles,
    });
    trip.fatigue = fatigue;
  }
  if (slept || trip.route.weather.kind === 'living') {
    const condition = weatherForComingHour(trip, trip.stopCount);
    if (condition !== trip.condition) {
      events.push({
        type: 'weather',
        from: trip.condition,
        to: condition,
        hr: trip.hr,
        mile: trip.miles,
      });
      trip.condition = condition;
    }
  }
  return events;
}
