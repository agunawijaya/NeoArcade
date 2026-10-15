import { describe, expect, it } from 'vitest';
import { advance, bearingTrue, destination, distanceNm, localFrame } from './geo';
import { toMagnetic, toTrue, variationAt } from './magnetic';
import { DESTINATIONS, destinationById, STATIONS, stationByFrequency } from './navdata';
import { ilsFor, readMarker, readNav, readRadarAltitude, type Ils } from './radios';
import { runway, runwayPoint } from './runways';
import type { Terrain } from './terrain';
import { EARTH_RADIUS_NM, FEET_PER_NM } from './units';

const philadelphia = runway('KPHL', '09R').threshold;
const kennedy = STATIONS[0] as (typeof STATIONS)[number];

describe('places on the globe', () => {
  it('puts Kennedy 83 nm up the coast from the end of runway 09R, a little north of northeast', () => {
    expect(distanceNm(philadelphia, kennedy.position)).toBeCloseTo(83, 0);
    expect(bearingTrue(philadelphia, kennedy.position)).toBeGreaterThan(50);
    expect(bearingTrue(philadelphia, kennedy.position)).toBeLessThan(60);
  });

  it('measures great circles as the haversine does', () => {
    const radians = Math.PI / 180;
    const { lat: lat1, lon: lon1 } = philadelphia;
    const { lat: lat2, lon: lon2 } = kennedy.position;
    const a =
      Math.sin(((lat2 - lat1) * radians) / 2) ** 2 +
      Math.cos(lat1 * radians) *
        Math.cos(lat2 * radians) *
        Math.sin(((lon2 - lon1) * radians) / 2) ** 2;
    const reference = 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    expect(distanceNm(philadelphia, kennedy.position)).toBeCloseTo(reference, 9);
  });

  it('comes back to the same place after going out along a bearing', () => {
    const out = destination(philadelphia, 312, 120);
    expect(distanceNm(philadelphia, out)).toBeCloseTo(120, 6);
    expect(bearingTrue(philadelphia, out)).toBeCloseTo(312, 6);
  });

  it('makes a flat frame that turns a place into feet and back', () => {
    const frame = localFrame(philadelphia);
    const local = frame.toLocal(kennedy.position);
    const back = frame.toLatLon(local.north, local.east);
    expect(back.lat).toBeCloseTo(kennedy.position.lat, 10);
    expect(back.lon).toBeCloseTo(kennedy.position.lon, 10);
  });

  it('moves a nautical mile north as a minute of latitude', () => {
    const moved = advance(philadelphia, FEET_PER_NM, 0);
    expect((moved.lat - philadelphia.lat) * 60).toBeCloseTo(1, 2);
    expect(moved.lon).toBe(philadelphia.lon);
  });
});

describe('the magnetic variation', () => {
  it('is west everywhere, from about 2° at Joliet to 15° at Boston', () => {
    for (const station of STATIONS) {
      const variation = variationAt(station.position);
      expect(variation).toBeLessThan(-1.5);
      expect(variation).toBeGreaterThan(-16);
      expect(Math.abs(variation - station.variation)).toBeLessThan(1);
    }
  });

  it('reads 076 true as 088 at Philadelphia', () => {
    const variation = variationAt(philadelphia);
    expect(variation).toBeCloseTo(-12, 0);
    expect(toMagnetic(76, -12)).toBe(88);
    expect(toTrue(88, -12)).toBe(76);
  });

  it('changes smoothly across the region, without steps at the grid lines', () => {
    const boston = STATIONS[2] as (typeof STATIONS)[number];
    let previous = variationAt(philadelphia);
    for (let step = 1; step <= 200; step++) {
      const t = step / 200;
      const here = variationAt({
        lat: philadelphia.lat + (boston.position.lat - philadelphia.lat) * t,
        lon: philadelphia.lon + (boston.position.lon - philadelphia.lon) * t,
      });
      expect(Math.abs(here - previous)).toBeLessThan(0.15);
      previous = here;
    }
  });
});

describe('the radio world', () => {
  it('has sixteen stations, each with its own identifier and frequency', () => {
    expect(STATIONS.map((station) => station.index)).toEqual([...Array(16).keys()]);
    expect(new Set(STATIONS.map((station) => station.ident)).size).toBe(16);
    expect(new Set(STATIONS.map((station) => station.frequency)).size).toBe(16);
    expect(stationByFrequency(115.9)?.ident).toBe('JFK');
    expect(stationByFrequency(108.0)).toBeUndefined();
  });

  it('carries every station the en-route chart labels', () => {
    const idents = STATIONS.map((station) => station.ident);
    for (const ident of ['FNT', 'CRL', 'DJB', 'BUF', 'ALB', 'PSB', 'JFK', 'RBV', 'OOD', 'EMI'])
      expect(idents).toContain(ident);
  });

  it('gives each ILS a localizer frequency of its own, clear of the VORs', () => {
    const localizers = DESTINATIONS.map((destination) => destination.localizer);
    expect(new Set(localizers).size).toBe(localizers.length);
    for (const frequency of localizers) {
      expect(frequency).toBeGreaterThanOrEqual(108);
      expect(frequency).toBeLessThan(112);
      // Localizers live on the odd tenths.
      expect(Math.round(frequency * 10) % 2).toBe(1);
      expect(stationByFrequency(frequency)).toBeUndefined();
    }
  });

  it('pairs each destination with a station near its airport', () => {
    for (const destination of DESTINATIONS) {
      const station = STATIONS[destination.station] as (typeof STATIONS)[number];
      const threshold = ilsFor(destination, 'real').runway.threshold;
      expect(distanceNm(station.position, threshold)).toBeLessThan(20);
    }
  });
});

describe('a VOR receiver', () => {
  const east = destination(kennedy.position, 90, 20);

  it('reads the magnetic radial, FROM, and the slant distance', () => {
    const reading = readNav({ frequency: 115.9, course: 103 }, east, 10_000, 'real', []);
    expect(reading.kind).toBe('vor');
    expect(reading.ident).toBe('JFK');
    expect(reading.radial).toBeCloseTo(90 - kennedy.variation, 3);
    expect(reading.toFrom).toBe('from');
    const height = (10_000 - kennedy.elevationFt) / FEET_PER_NM;
    expect(reading.dmeNm).toBeCloseTo(Math.sqrt(20 * 20 + height * height), 6);
  });

  it('reads TO with the reciprocal course, and swings the needle the way to fly', () => {
    const inbound = readNav({ frequency: 115.9, course: 283 }, east, 10_000, 'real', []);
    expect(inbound.toFrom).toBe('to');
    const program = (course: number) =>
      readNav({ frequency: 115.9, course }, east, 10_000, 'program', []).deviation;
    // Outbound on the 087 radial's course, the aircraft is right of it: the course lies to the left.
    expect(program(87)).toBeCloseTo(-3, 3);
    expect(program(93)).toBeCloseTo(3, 3);
    expect(program(110)).toBe(5);
  });

  it('hears a station only within line of sight, though the program heard 300 miles', () => {
    const far = destination(kennedy.position, 270, 150);
    expect(readNav({ frequency: 115.9, course: 0 }, far, 500, 'real', []).kind).toBe('none');
    expect(readNav({ frequency: 115.9, course: 0 }, far, 35_000, 'real', []).kind).toBe('vor');
    expect(readNav({ frequency: 115.9, course: 0 }, far, 500, 'program', []).kind).toBe('vor');
  });

  it('reads nothing on a frequency nobody transmits on', () => {
    expect(readNav({ frequency: 108.05, course: 0 }, east, 10_000, 'real', []).kind).toBe('none');
  });
});

describe('the ILS receiver', () => {
  const ils = ilsFor(destinationById('jfk'), 'real');
  const radians = Math.PI / 180;

  /** A place `milesOut` before the threshold, `acrossFt` right of the centreline, on the slope plus `aboveDeg`. */
  function onApproach(milesOut: number, acrossFt = 0, aboveDeg = 0, receiver: Ils = ils) {
    const along = -milesOut * FEET_PER_NM;
    const position = runwayPoint(receiver.runway, along, acrossFt);
    const altitudeFt =
      receiver.runway.elevationFt +
      Math.tan((receiver.glideslopeDeg + aboveDeg) * radians) * (receiver.glidePointFt - along);
    return { position, altitudeFt };
  }

  const read = (milesOut: number, acrossFt = 0, aboveDeg = 0) => {
    const { position, altitudeFt } = onApproach(milesOut, acrossFt, aboveDeg);
    return readNav(
      { frequency: ils.destination.localizer, course: 44 },
      position,
      altitudeFt,
      'real',
      [ils],
    );
  };

  it('centres both needles on the extended centreline on a 3° path', () => {
    const reading = read(6);
    expect(reading.kind).toBe('localizer');
    expect(reading.ident).toBe('IJFK');
    expect(reading.deviation).toBeCloseTo(0, 6);
    expect(reading.glideslope).toBeCloseTo(0, 6);
  });

  it('shows the course to the left when right of the centreline, pegging at full scale', () => {
    expect(read(5, 500).deviation).toBeLessThan(0);
    expect(read(5, -500).deviation).toBeGreaterThan(0);
    expect(read(3, 3000).deviation).toBe(-2.5);
  });

  it('shows above and below the slope, pegging at 0.7°', () => {
    expect(read(5, 0, -0.2).glideslope).toBeCloseTo(-0.2, 6);
    expect(read(5, 0, 0.3).glideslope).toBeCloseTo(0.3, 6);
    expect(read(5, 0, 1).glideslope).toBe(0.7);
  });

  it('loses the glideslope beyond 12 miles and the localizer beyond 25', () => {
    const outside = read(15);
    expect(outside.kind).toBe('localizer');
    expect(outside.glideslope).toBeNull();
    expect(read(30).kind).toBe('none');
  });

  it('lights the outer and middle markers over their fans, and nothing between', () => {
    const marker = (alongFt: number, heightFt: number) =>
      readMarker(ils, runwayPoint(ils.runway, alongFt, 0), ils.runway.elevationFt + heightFt);
    expect(marker(-ils.outerMarkerFt, 1800)).toBe('outer');
    expect(marker(-ils.middleMarkerFt, 250)).toBe('middle');
    expect(marker(-15_000, 800)).toBeNull();
    expect(readMarker(null, philadelphia, 1000)).toBeNull();
  });
});

describe('the radar altimeter', () => {
  const flatAt100 = { elevationFt: () => 100 } as unknown as Terrain;

  it('reads the wheels above the ground up to 2,500 ft, and nothing above', () => {
    expect(readRadarAltitude(flatAt100, philadelphia, 2100)).toBe(2000);
    expect(readRadarAltitude(flatAt100, philadelphia, 2700)).toBeNull();
    expect(readRadarAltitude(flatAt100, philadelphia, 90)).toBe(0);
  });
});
