import { describe, expect, it } from 'vitest';
import { allCards, cardFor } from '../game/postcards';
import { CB_LINES, SPEAKERS } from './cb-lines';
import { CORRIDORS } from './corridors';
import { dinerFor } from './diners';
import { PLACE_LINES } from './place-lines';
import { PLACE_NOTES, STATE_NOTES } from './postcards';
import { PLACES, STATE_NAMES } from './places';
import { REGION_IDS } from './regions';
import { createRng } from '@shared/rng';

/** Every place a corridor or an original route passes through. */
function placesOnRoads(): Set<string> {
  return new Set(CORRIDORS.flatMap((corridor) => corridor.rows.map((row) => row[1])));
}

describe('the authored data', () => {
  it('writes postcard notes only for places that exist, and states on the map', () => {
    for (const place of Object.keys(PLACE_NOTES)) expect(PLACES.has(place), place).toBe(true);
    for (const state of Object.keys(STATE_NOTES)) expect(STATE_NAMES[state], state).toBeDefined();
  });

  it('has a postcard for every town and landmark on the network', () => {
    for (const id of placesOnRoads()) {
      const place = PLACES.get(id);
      if (!place || place.kind === 'line') continue;
      expect(PLACE_NOTES[id], `${id} needs a postcard note`).toBeTruthy();
    }
  });

  it('keeps postcard notes to two modest sentences', () => {
    for (const [place, note] of Object.entries({ ...PLACE_NOTES, ...STATE_NOTES })) {
      // "St. Louis" and "U.S. 58" do not end a sentence.
      const sentences = note
        .split(/(?<=[.!?])(?<!\b(?:St|Mt|Ft|v|U\.S|D\.C)\.)\s+(?=[A-Z0-9])/)
        .filter(Boolean);
      expect(sentences.length, place).toBeLessThanOrEqual(2);
      expect(note.length, place).toBeLessThan(260);
    }
  });

  it('turns a state line into the welcome card of the state ahead', () => {
    const line = [...PLACES.values()].find((place) => place.kind === 'line');
    if (!line) throw new Error('No state line in the data.');
    const card = cardFor(line.id, 'NM');
    expect(card?.key).toBe('state:NM');
    expect(card?.kind).toBe('state');
    const keys = allCards().map((each) => each.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives CB chatter only to known places and speakers', () => {
    for (const place of Object.keys(PLACE_LINES)) expect(PLACES.has(place), place).toBe(true);
    const handles = new Set(SPEAKERS.map((speaker) => speaker.handle));
    expect(handles.size).toBe(SPEAKERS.length);
    for (const speaker of SPEAKERS) {
      expect(speaker.reliability).toBeGreaterThan(0);
      expect(speaker.reliability).toBeLessThanOrEqual(1);
    }
  });

  it('has several hundred CB lines, and keeps the original’s jokes', () => {
    const lines = [...Object.values(CB_LINES).flat(), ...Object.values(PLACE_LINES).flat()];
    expect(lines.length).toBeGreaterThanOrEqual(250);
    const all = lines.join('\n');
    expect(all).toContain('DUMMY');
    expect(all).toContain('washing dishes');
    expect(all).not.toMatch(/\b(idiot|stupid|loser)\b/i);
  });

  it('names a diner for every landscape', () => {
    for (const region of REGION_IDS) {
      const diner = dinerFor(createRng(region), region);
      expect(diner.name.length).toBeGreaterThan(3);
      expect(diner.neon).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
