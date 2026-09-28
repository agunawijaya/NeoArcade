import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../engine/ai';
import { PLAYER_ACCENTS } from '../render/gorilla';
import { defaultSettings, type Settings } from '../settings';
import { RIVALS } from '../tour/rivals';
import { stageById, type Stage } from '../tour/stages';
import { DEFAULT_OUTFITS } from '../wardrobe/items';
import { quickMatchSetup, tourName, tourSetup } from './setup';

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings(),
  ...overrides,
});

describe('a Quick Match', () => {
  it('pits you against the plain CPU at the chosen level, in the classic city', () => {
    const setup = quickMatchSetup(settings({ cpuLevel: 'hard' }), 5, DEFAULT_OUTFITS, []);
    expect(setup.players[0]).toMatchObject({ name: 'Player 1', cpu: null, rival: null });
    expect(setup.players[1]).toMatchObject({
      name: 'CPU',
      cpu: { level: 'hard', style: DEFAULT_STYLE },
      rival: null,
    });
    expect(setup.players.map((player) => player.look.accent)).toEqual([...PLAYER_ACCENTS]);
    expect(setup.scenery.kit.id).toBe('classic');
    expect(setup.tourStage).toBeNull();
    expect(setup.match.twists).toBeUndefined();
  });

  it('brings in a rival once they have been beaten on the tour', () => {
    const chosen = settings({ players: 'humanVsCpu', rival: 'summit' });
    const before = quickMatchSetup(chosen, 5, DEFAULT_OUTFITS, []);
    expect(before.players[1].rival).toBeNull();
    const after = quickMatchSetup(chosen, 5, DEFAULT_OUTFITS, ['summit']);
    expect(after.players[1]).toMatchObject({
      name: 'Summit',
      cpu: { level: RIVALS.summit.level, style: RIVALS.summit.style },
    });
    expect(after.players[1].look.accent).toBe(RIVALS.summit.colour);
  });

  it('keeps a rival out of a two-player match', () => {
    const setup = quickMatchSetup(
      settings({ players: 'humanVsHuman', rival: 'summit' }),
      5,
      DEFAULT_OUTFITS,
      ['summit'],
    );
    expect(setup.players.every((player) => player.cpu === null)).toBe(true);
  });
});

describe('a World Tour stage', () => {
  const dubai = stageById('dubai') as Stage;

  it('plays the stage’s rules and twists against its rival, with no balloons', () => {
    const setup = tourSetup(dubai, settings(), 9, DEFAULT_OUTFITS[0]);
    expect(setup.match).toMatchObject({
      seed: 9,
      world: 'earth',
      points: 2,
      format: 'firstTo',
      powerUps: [],
      twists: ['supertall', 'jetStream'],
    });
    expect(setup.players[1]).toMatchObject({ name: 'Summit', rival: RIVALS.summit });
    expect(setup.scenery.kit.id).toBe('dubai');
    expect(setup.scenery.timeOfDay(3)).toBe(dubai.timeOfDay);
    expect(setup.tourStage).toBe(dubai);
  });

  it('brings a returning rival back at the stage’s own level', () => {
    const redCanyon = stageById('red-canyon') as Stage;
    expect(tourSetup(redCanyon, settings(), 1, DEFAULT_OUTFITS[0]).players[1].cpu?.level).toBe(
      'hard',
    );
    expect(RIVALS.mirage.level).toBe('easy');
  });

  it('calls you "You" until you have a name of your own', () => {
    expect(tourName(settings())).toBe('You');
    expect(tourName(settings({ names: ['Ada', 'Grace'] }))).toBe('Ada');
  });
});
