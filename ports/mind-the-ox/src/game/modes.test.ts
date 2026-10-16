import { describe, expect, it } from 'vitest';
import { MAX_CRASHES } from '../engine/constants';
import { createMatch } from '../engine/match';
import { SEA_CHAPTERS } from './at-sea';
import { CHAPTERS } from './campaign';
import { isNavalDay } from './daily';
import { planMode, type ModeRequest, type PlanOptions } from './modes';
import { SORTIE_MISSIONS } from './sortie';

const OPTIONS: PlanOptions = { seed: 31, flight: 'smooth', autoRoll: true, secretWeapons: true };
/** A day on land, and one at sea (its seed divides by three). */
const DAY = { key: '2026-10-20', number: 6, seed: 987655 };
const NAVAL_DAY = { key: '2026-10-21', number: 7, seed: 987654 };

describe('the modes', () => {
  const requests: ModeRequest[] = [
    { kind: 'classic' },
    ...CHAPTERS.map((chapter) => ({ kind: 'campaign' as const, chapter: chapter.id })),
    { kind: 'dogfight', opponents: 1, level: 'normal' },
    { kind: 'dogfight', opponents: 3, level: 'brutal' },
    { kind: 'two-player', style: 'coop' },
    { kind: 'two-player', style: 'versus' },
    { kind: 'daily', day: DAY, practice: false },
  ];

  it.each(requests.map((request) => [JSON.stringify(request), request] as const))(
    'plans a match that starts: %s',
    (_name, request) => {
      const plan = planMode(request, OPTIONS);
      const match = createMatch(plan.setup);
      expect(match.world.planes).toHaveLength(plan.seats.length);
      for (const seat of plan.humans) expect(plan.seats[seat]?.pilot.kind).toBe('human');
      // Every seat has an airfield of its own: two planes never share a runway.
      expect(new Set(plan.seats.map((seat) => seat.base)).size).toBe(plan.seats.length);
    },
  );

  const seaRequests: ModeRequest[] = [
    ...SEA_CHAPTERS.map((chapter) => ({ kind: 'at-sea' as const, chapter: chapter.id })),
    ...SORTIE_MISSIONS.map((mission) => ({
      kind: 'sortie' as const,
      options: {
        base: 'carrier' as const,
        mission: mission.id,
        enemy: 'both' as const,
        seaState: 1 as const,
        hour: 'dusk' as const,
        level: 'hard' as const,
        theme: 'airshow' as const,
        seed: 77,
      },
    })),
    { kind: 'daily', day: NAVAL_DAY, practice: false },
  ];

  it.each(seaRequests.map((request) => [JSON.stringify(request), request] as const))(
    'plans a mission at sea that starts, flown from our carrier: %s',
    (_name, request) => {
      const plan = planMode(request, OPTIONS);
      const match = createMatch(plan.setup);
      expect(match.world.planes).toHaveLength(plan.seats.length);
      expect(match.world.map.sea).not.toBeNull();
      expect(plan.setup.objectives?.length).toBeGreaterThan(0);
      // Planes may share a deck, parked one behind another; never a runway.
      for (const plane of match.world.planes) {
        const sharing = match.world.planes.filter((other) => other.base === plane.base);
        if (sharing.length > 1) expect(plane.base.carrier).toBeDefined();
      }
    },
  );

  it('follows the mission’s difficulty for the landing assist unless told otherwise', () => {
    const easy = planMode({ kind: 'at-sea', chapter: 'deck-trials' }, OPTIONS);
    const hard = planMode({ kind: 'at-sea', chapter: 'night-recovery' }, OPTIONS);
    expect(easy.setup.rules.landingAssist).toBe(true);
    expect(hard.setup.rules.landingAssist).toBe(false);
    const always = planMode(
      { kind: 'at-sea', chapter: 'night-recovery' },
      { ...OPTIONS, landingAssist: 'on' },
    );
    expect(always.setup.rules.landingAssist).toBe(true);
    const torpedo = planMode({ kind: 'at-sea', chapter: 'shipping-strike' }, OPTIONS);
    expect(torpedo.seats[0]?.loadout).toBe('torpedo');
    const bombs = planMode(
      { kind: 'at-sea', chapter: 'shipping-strike' },
      { ...OPTIONS, loadout: 'bombs' },
    );
    expect(bombs.seats[0]?.loadout).toBe('bombs');
  });

  it('flies Classic 1984 on sixteen headings with 1984’s rules, whatever the setting', () => {
    const plan = planMode({ kind: 'classic' }, { ...OPTIONS, flight: 'classic' });
    expect(plan.setup.rules.flight).toBe('classic');
    expect(plan.setup.rules.autoRoll).toBe(false);
    expect(plan.setup.rounds).toBe(Number.POSITIVE_INFINITY);
    expect(plan.seats.filter((seat) => seat.side === 1)).toHaveLength(3);
  });

  it('plays chapter n at round n’s speeds, with its twist', () => {
    const night = planMode({ kind: 'campaign', chapter: 'lantern-raid' }, OPTIONS);
    expect(night.setup.firstRound).toBe(3);
    expect(night.setup.rules.searchlights).toBe(true);
    expect(night.night).toBe(true);
    const ace = planMode({ kind: 'campaign', chapter: 'the-ace' }, OPTIONS);
    const aceSeat = ace.seats.find((seat) => seat.look === 'ace');
    expect(aceSeat?.pilot).toMatchObject({ level: 'brutal', territory: null });
  });

  it('gives Dogfight its own goal and lives', () => {
    const one = planMode({ kind: 'dogfight', opponents: 1, level: 'hard' }, OPTIONS);
    expect(one.setup.goal).toBe('planes');
    expect(one.seats[1]?.maxCrashes).toBe(MAX_CRASHES);
    const three = planMode({ kind: 'dogfight', opponents: 3, level: 'easy' }, OPTIONS);
    expect(three.seats.filter((seat) => seat.side === 1).map((seat) => seat.maxCrashes)).toEqual([
      2, 2, 2,
    ]);
    expect(createMatch(one.setup).world.targets).toHaveLength(0);
  });

  it('seats two players: side by side in Co-op, as ghosts when out; face to face in Versus', () => {
    const coop = planMode({ kind: 'two-player', style: 'coop' }, OPTIONS);
    expect(coop.humans).toEqual([0, 1]);
    expect(coop.seats.slice(0, 2).every((seat) => seat.side === 0 && seat.ghostWhenOut)).toBe(true);
    const versus = planMode({ kind: 'two-player', style: 'versus' }, OPTIONS);
    expect(versus.seats.map((seat) => seat.side)).toEqual([0, 1]);
    expect(versus.setup.rules.lossPenalties).toBe(false);
    expect(versus.setup.roundsToWin).toBe(2);
  });

  it('flies the Daily Sortie the same for everyone, whatever their settings', () => {
    const request: ModeRequest = { kind: 'daily', day: DAY, practice: false };
    const mine = planMode(request, OPTIONS);
    const theirs = planMode(request, {
      seed: 5,
      flight: 'classic',
      autoRoll: false,
      secretWeapons: true,
    });
    expect(theirs.setup.rules).toEqual(mine.setup.rules);
    expect(theirs.setup.rules.secretWeapons).toBe(false);
    expect(theirs.setup.rules.flight).toBe('smooth');
    expect(createMatch(theirs.setup).world.map.heights).toEqual(
      createMatch(mine.setup).world.map.heights,
    );
  });

  it('flies some days at sea from the third on, the same for everyone; the first days stay on land', () => {
    expect(isNavalDay({ key: '2026-10-15', number: 1, seed: 3 })).toBe(false);
    expect(isNavalDay({ key: '2026-10-16', number: 2, seed: 3 })).toBe(false);
    expect(isNavalDay(NAVAL_DAY)).toBe(true);
    expect(isNavalDay(DAY)).toBe(false);
    const request: ModeRequest = { kind: 'daily', day: NAVAL_DAY, practice: false };
    const mine = planMode(request, OPTIONS);
    const theirs = planMode(request, {
      ...OPTIONS,
      seed: 5,
      flight: 'classic',
      landingAssist: 'off',
      loadout: 'torpedo',
    });
    expect(mine.sortie).not.toBeNull();
    expect(theirs.setup.rules).toEqual(mine.setup.rules);
    expect(theirs.seats[0]?.loadout).toBe(mine.seats[0]?.loadout);
    expect(theirs.setup.rules.landingAssist).toBe(true);
  });
});
