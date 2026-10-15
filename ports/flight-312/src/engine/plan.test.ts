import { describe, expect, it } from 'vitest';
import { DESTINATIONS, destinationById } from './navdata';
import { cruiseAltitudeFor, facilitiesFor, planFlight, route } from './plan';
import { runway } from './runways';
import { generateWeather } from './weather';

const departure = runway('KPHL', '09R');
const weather = generateWeather({
  seed: 1,
  style: 'realistic',
  departure: { position: departure.threshold, elevationFt: 20 },
  destination: { position: departure.threshold, elevationFt: 20 },
});

describe('the flight plan', () => {
  it.each(DESTINATIONS.map((destination) => [destination.id, destination] as const))(
    'reaches %s station by station, each leg within radio range',
    (_id, destination) => {
      const plan = planFlight(departure.threshold, destination, weather);
      expect(plan.legs.at(-1)?.station.index).toBe(destination.station);
      for (const leg of plan.legs) expect(leg.distanceNm).toBeLessThanOrEqual(220);
      expect(plan.blockFuelLb).toBeGreaterThan(plan.tripFuelLb + plan.reserveFuelLb);
      expect(plan.minutes).toBeGreaterThan(10);
    },
  );

  it('flies the program’s round trip home by Robbinsville and Woodstown', () => {
    expect(
      route(departure.threshold, destinationById('phl')).map((station) => station.ident),
    ).toEqual(['RBV', 'OOD']);
  });

  it('climbs higher for longer trips', () => {
    expect(cruiseAltitudeFor(90)).toBe(12_000);
    expect(cruiseAltitudeFor(250)).toBe(24_000);
    expect(cruiseAltitudeFor(600)).toBe(35_000);
  });

  it('gives every controller a frequency in the VHF airband', () => {
    for (const destination of DESTINATIONS) {
      const facilities = facilitiesFor(destination.id);
      for (const value of [
        facilities.clearance,
        facilities.tower,
        facilities.departure,
        facilities.center,
        facilities.approach,
        facilities.arrivalTower,
      ]) {
        expect(value).toBeGreaterThanOrEqual(118);
        expect(value).toBeLessThan(137);
      }
    }
  });
});
