import { createArcadePass } from '@shared/pass';
import { describe, expect, it } from 'vitest';
import { findThrow } from '../../e2e/helpers';
import manifest from '../../pass.manifest';
import { createMatch, takeTurn, type MatchState, type TurnAim } from '../engine/match';
import { recordStage } from '../tour/progress';
import { emptyTour } from '../tour/save';
import { stageById, type Stage } from '../tour/stages';
import { PassReporter, XP } from './pass-reporter';

function setUp(seed = 6) {
  const arcade = createArcadePass({ backend: null, watchOtherTabs: false });
  const pass = arcade.forGame(manifest);
  const reporter = new PassReporter(pass, 0);
  const state = createMatch({ seed, world: 'earth', points: 3, format: 'firstTo', powerUps: [] });
  return { arcade, pass, reporter, state };
}

function throwAndReport(
  reporter: PassReporter,
  state: MatchState,
  aim: TurnAim,
  firstThrow = false,
) {
  const round = state.round;
  const result = takeTurn(state, aim);
  reporter.throwMade({ result, round, firstThrow });
  return result;
}

describe('PassReporter', () => {
  it('counts throws, craters and sun hits for the player who owns the Pass', () => {
    const { pass, reporter, state } = setUp();
    const miss = findThrow(
      state,
      (shot) => shot.victim === null && shot.events.some((event) => event.type === 'explosion'),
    );
    if (!miss) throw new Error('No miss found.');
    throwAndReport(reporter, state, miss);
    expect(pass.statOf('throws')).toBe(1);
    expect(pass.statOf('craters')).toBe(1);
    expect(pass.progressOf('demolition')).toBe(1);
  });

  it('ignores the opponent’s throws, but counts its points against the owner', () => {
    const { pass, reporter, state } = setUp();
    state.turn = 1;
    const hit = findThrow(state, (shot) => shot.victim === 0);
    if (!hit) throw new Error('No hit found.');
    throwAndReport(reporter, state, hit);
    expect(pass.statOf('throws')).toBeUndefined();
    expect(pass.hasBadge('first-banana')).toBe(false);
  });

  it('awards the first-throw badges and the first round', () => {
    const { pass, reporter, state } = setUp();
    const hit = findThrow(state, (shot) => shot.victim === 1);
    if (!hit) throw new Error('No hit found.');
    throwAndReport(reporter, state, hit, true);
    expect(pass.hasBadge('first-banana')).toBe(true);
    expect(pass.hasBadge('sharpshooter')).toBe(true);
    expect(pass.statOf('hits')).toBe(1);
    expect(pass.statOf('longestHit')).toBeGreaterThan(10);
  });

  it('catches the funny ones', () => {
    const { pass, reporter, state } = setUp();
    throwAndReport(reporter, state, { angle: 45, velocity: 1 });
    expect(pass.hasBadge('oops')).toBe(true);
    expect(pass.hasBadge('butterfingers')).toBe(true);
  });

  it('pays for a finished match, and a Quick Match win on top', () => {
    const { arcade, reporter } = setUp();
    reporter.matchOver({
      won: true,
      mode: 'quick',
      cpu: { level: 'brutal', rival: null },
      rivalsBeaten: [],
    });
    expect(arcade.profile.xp).toBe(XP.matchPlayed + XP.quickMatchWon + 150);
    expect(arcade.profile.games['skyline-showdown']?.badges['brutal-honesty']).toBeDefined();
  });

  it('pays for a tour stage: the win, new stars and a rival’s first defeat', () => {
    const { arcade, pass, reporter } = setUp();
    const jakarta = stageById('jakarta') as Stage;
    const recorded = recordStage(emptyTour(), jakarta, {
      won: true,
      throws: 3,
      timesHit: 0,
      aimAssist: false,
    });
    reporter.stageRecorded(jakarta, recorded);
    const bronze = 25;
    expect(arcade.profile.xp).toBe(XP.stageWon + 3 * XP.newStar + XP.rivalFirstDefeat + bronze);
    expect(pass.hasBadge('singing-in-the-rain')).toBe(true);
    expect(pass.statOf('stars')).toBe(3);
    expect(pass.statOf('rivalsBeaten')).toBe(1);
  });
});
