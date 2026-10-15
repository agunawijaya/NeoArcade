import { describe, expect, it } from 'vitest';
import { destinationById, STATIONS } from './navdata';
import { ilsFor } from './radios';
import { runway } from './runways';
import {
  BAND_COUNT,
  generateWeather,
  gustAt,
  skyAt,
  windAt,
  type DestinationSky,
  type WeatherRequest,
} from './weather';

const departure = runway('KPHL', '09R');
const kennedy = ilsFor(destinationById('jfk'), 'real').runway;
/** Philipsburg's VOR, well away from both ends of the trip. */
const enRoute = (STATIONS[7] as (typeof STATIONS)[number]).position;

const request = (over: Partial<WeatherRequest> = {}): WeatherRequest => ({
  seed: 312,
  style: 'realistic',
  departure: { position: departure.threshold, elevationFt: departure.elevationFt },
  destination: { position: kennedy.threshold, elevationFt: kennedy.elevationFt },
  ...over,
});

const seeds = Array.from({ length: 24 }, (_, index) => index + 1);

describe('the weather of a flight', () => {
  it('is the same for the same seed, and another seed brings another sky', () => {
    expect(generateWeather(request())).toEqual(generateWeather(request()));
    expect(generateWeather(request({ seed: 313 })).departure.wind).not.toEqual(
      generateWeather(request()).departure.wind,
    );
  });

  it('keeps the program’s fog at Philadelphia: a ceiling of 200 to 400 ft and a mile or less', () => {
    for (const seed of seeds) {
      const field = generateWeather(request({ seed })).departure;
      expect(field.ceilingFt).toBeGreaterThanOrEqual(200);
      expect(field.ceilingFt).toBeLessThanOrEqual(400);
      expect(field.visibilityMi).toBeLessThanOrEqual(1);
      expect(field.gustKt).toBe(15);
    }
  });

  it('builds the practice skies the briefing offers', () => {
    const expected: Record<DestinationSky, { ceilings: (number | null)[]; miles: number[] }> = {
      clear: { ceilings: [null], miles: [10] },
      low: { ceilings: [400, 500, 600, 700, 800], miles: [1.5, 2, 3] },
      minimums: { ceilings: [200, 300], miles: [0.5, 0.75] },
      fog: { ceilings: [100], miles: [0.25] },
    };
    for (const [sky, { ceilings, miles }] of Object.entries(expected)) {
      for (const seed of seeds) {
        const field = generateWeather(
          request({ seed, destinationSky: sky as DestinationSky }),
        ).destination;
        expect(ceilings).toContain(field.ceilingFt);
        expect(miles).toContain(field.visibilityMi);
        if (sky === 'clear') expect(field.rain).toBe(false);
      }
    }
  });

  it('gives a return to Philadelphia one weather: the one the approach asked for', () => {
    const home = generateWeather(
      request({
        destination: { position: departure.threshold, elevationFt: departure.elevationFt },
        destinationSky: 'clear',
      }),
    );
    expect(home.departure.ceilingFt).toBeNull();
    expect(home.departure.visibilityMi).toBe(10);
    expect(home.departure.position).toEqual(departure.threshold);
    const away = generateWeather(request({ destinationSky: 'clear' }));
    expect(away.departure.ceilingFt).not.toBeNull();
  });
});

describe('the winds aloft', () => {
  it('always blow from somewhere on the compass, whatever the seed and height', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const weather = generateWeather(request({ seed }));
      for (const band of weather.bands) {
        expect(band.direction).toBeGreaterThanOrEqual(0);
        expect(band.direction).toBeLessThan(360);
      }
      for (const altitudeFt of [500, 1500, 9000, 33_000]) {
        const wind = windAt(weather, kennedy.threshold, altitudeFt);
        expect(wind.direction).toBeGreaterThanOrEqual(0);
        expect(wind.direction).toBeLessThan(360);
      }
    }
  });

  it('follow the program’s table under its rules: calm at the bottom, westerlies on top', () => {
    for (const seed of seeds) {
      const bands = generateWeather(request({ seed, style: 'program' })).bands;
      expect(bands).toHaveLength(BAND_COUNT);
      expect(bands[0]?.speedKt).toBe(0);
      bands.forEach((band, index) => {
        if (index > 0) {
          expect(band.speedKt).toBeGreaterThanOrEqual(25 * (index - 1));
          expect(band.speedKt).toBeLessThanOrEqual(25 * index);
        }
        if (index >= 8) {
          expect(band.direction).toBeGreaterThanOrEqual(225);
          expect(band.direction).toBeLessThanOrEqual(315);
        }
      });
    }
  });

  it('blow hardest near the jet at 33,000 ft in the realistic sky', () => {
    for (const seed of seeds) {
      const bands = generateWeather(request({ seed })).bands;
      const jet = bands[8]?.speedKt ?? 0;
      expect(jet).toBeGreaterThan((bands[0]?.speedKt ?? 0) + 30);
      expect(jet).toBeGreaterThan(bands[10]?.speedKt ?? 0);
    }
  });

  it('turn into the field’s surface wind below 2,000 ft', () => {
    const weather = generateWeather(request());
    const field = weather.destination;
    expect(windAt(weather, field.position, field.elevationFt)).toEqual(field.wind);
    const aloft = windAt(weather, enRoute, field.elevationFt + 2000);
    expect(windAt(weather, field.position, field.elevationFt + 2000)).toEqual(aloft);
    const halfway = windAt(weather, field.position, field.elevationFt + 1000).speedKt;
    const top = windAt(weather, field.position, field.elevationFt + 1999).speedKt;
    expect(halfway).toBeGreaterThanOrEqual(Math.min(field.wind.speedKt, top));
    expect(halfway).toBeLessThanOrEqual(Math.max(field.wind.speedKt, top));
  });

  it('gust between −1 and 1, the same on every replay', () => {
    const weather = generateWeather(request());
    const again = generateWeather(request());
    for (let time = 0; time < 600; time += 0.37) {
      const gust = gustAt(weather, time);
      expect(Math.abs(gust)).toBeLessThanOrEqual(1);
      expect(gustAt(again, time)).toBe(gust);
    }
  });
});

describe('the sky outside', () => {
  const weather = generateWeather(request({ destinationSky: 'minimums' }));
  const field = weather.destination;
  const base = field.elevationFt + (field.ceilingFt ?? 0);

  it('is cloud inside the overcast and the field’s visibility under it', () => {
    expect(skyAt(weather, field.position, base + 100).inCloud).toBe(true);
    const under = skyAt(weather, field.position, base - 50);
    expect(under.inCloud).toBe(false);
    expect(under.visibilityMi).toBe(field.visibilityMi);
  });

  it('is in the broken layer at 31,000 ft but only among scattered cloud at 20,500', () => {
    expect(skyAt(weather, enRoute, 31_000).inCloud).toBe(true);
    expect(skyAt(weather, enRoute, 20_500).inCloud).toBe(false);
  });

  it('is clear and ten miles between the layers, away from the fields', () => {
    expect(skyAt(weather, enRoute, 10_000)).toEqual({
      inCloud: false,
      visibilityMi: 10,
      rain: false,
    });
  });
});
