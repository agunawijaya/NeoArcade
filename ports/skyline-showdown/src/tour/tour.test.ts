import { describe, expect, it } from 'vitest';
import { CPU_LEVELS } from '../engine/ai';
import { TWIST_KINDS } from '../engine/twists';
import { WORLDS } from '../engine/worlds';
import { itemById, SLOTS } from '../wardrobe/items';
import {
  chapterGate,
  chapterUnlocked,
  MAX_STARS,
  nextStage,
  recordStage,
  rivalsForQuickMatch,
  stageUnlocked,
  starsFor,
  totalStars,
  type StageOutcome,
} from './progress';
import { RIVAL_IDS, RIVALS } from './rivals';
import { emptyTour, loadTour, TOUR_VERSION, type TourSave } from './save';
import { CHAPTERS, STAGES, stageById, stagesIn, type Stage } from './stages';

const win = (overrides: Partial<StageOutcome> = {}): StageOutcome => ({
  won: true,
  throws: 5,
  timesHit: 0,
  aimAssist: false,
  ...overrides,
});
const stage = (id: string) => stageById(id) as Stage;

/** Wins every stage of the tour in order with the given stars' worth of play. */
function playThrough(until: string, outcome = win()): TourSave {
  let save = emptyTour();
  for (const each of STAGES) {
    save = recordStage(save, each, outcome).save;
    if (each.id === until) break;
  }
  return save;
}

describe('the tour itself', () => {
  it('has fifteen stages in four chapters, in order', () => {
    expect(STAGES.map((each) => each.number)).toEqual(STAGES.map((_, index) => index + 1));
    expect(CHAPTERS.map((chapter) => stagesIn(chapter.id).length)).toEqual([6, 3, 3, 3]);
  });

  it('ends each chapter with a first-to-3 boss; every other stage is first to 2', () => {
    for (const chapter of CHAPTERS) {
      const stages = stagesIn(chapter.id);
      stages.forEach((each, index) => {
        const last = index === stages.length - 1;
        expect(each.boss, each.id).toBe(last);
        expect(each.points, each.id).toBe(last ? 3 : 2);
      });
    }
  });

  it('plays each chapter on its own world, with known twists', () => {
    for (const each of STAGES) {
      const chapter = CHAPTERS.find((candidate) => candidate.id === each.chapter);
      expect(each.world).toBe(chapter?.world);
      expect(WORLDS[each.world]).toBeDefined();
      for (const twist of each.twists) expect(TWIST_KINDS).toContain(twist);
      expect(each.twist.line.length).toBeLessThan(160);
    }
  });

  it('gives every Earth city a twist of its own, and every space chapter at least one new one', () => {
    const seen = new Set<string>();
    for (const each of stagesIn('earth').filter((candidate) => !candidate.boss)) {
      expect(each.twists.length, each.id).toBeGreaterThan(0);
      for (const twist of each.twists) {
        expect(seen.has(twist), `${each.id} repeats ${twist}`).toBe(false);
        seen.add(twist);
      }
    }
    for (const chapter of ['moon', 'mars', 'jupiter'] as const) {
      const fresh = stagesIn(chapter)
        .flatMap((each) => each.twists)
        .filter((twist) => !seen.has(twist));
      expect(fresh.length, chapter).toBeGreaterThan(0);
      for (const twist of fresh) seen.add(twist);
    }
  });

  it('has ten rivals, each met on the tour, getting tougher towards a Brutal final boss', () => {
    expect(RIVAL_IDS).toHaveLength(10);
    const met = new Set(STAGES.map((each) => each.rival));
    for (const id of RIVAL_IDS) expect(met.has(id), id).toBe(true);
    const order = ['easy', 'normal', 'hard', 'brutal'];
    const levels = STAGES.map((each) => order.indexOf(each.rivalLevel ?? RIVALS[each.rival].level));
    expect(levels.at(-1)).toBe(3);
    expect(levels.slice(0, 6).every((level) => level <= 2)).toBe(true);
    for (let index = 1; index < levels.length; index++) {
      expect(levels[index]).toBeGreaterThanOrEqual((levels[index - 1] ?? 0) - 1);
    }
    for (const rival of Object.values(RIVALS)) expect(CPU_LEVELS[rival.level]).toBeDefined();
  });

  it('dresses every rival in real wardrobe items', () => {
    for (const rival of Object.values(RIVALS)) {
      for (const slot of SLOTS) expect(itemById(rival.outfit[slot])?.slot, rival.id).toBe(slot);
      expect(rival.lines.taunt.length).toBeGreaterThanOrEqual(2);
      expect(rival.lines.hit.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('stars', () => {
  const jakarta = stage('jakarta');

  it('are one for the win, one for the throw budget and one for not being hit', () => {
    expect(starsFor(jakarta, win()).stars).toBe(3);
    expect(starsFor(jakarta, win({ throws: jakarta.throwBudget + 1 })).stars).toBe(2);
    expect(starsFor(jakarta, win({ timesHit: 1 })).stars).toBe(2);
    expect(starsFor(jakarta, win({ throws: 99, timesHit: 1 })).stars).toBe(1);
    expect(starsFor(jakarta, win({ won: false })).stars).toBe(0);
  });

  it('stop at one with aim assist, and say so', () => {
    expect(starsFor(jakarta, win({ aimAssist: true }))).toMatchObject({ stars: 1, capped: true });
    expect(starsFor(jakarta, win({ aimAssist: true, throws: 99, timesHit: 2 }))).toMatchObject({
      stars: 1,
      capped: false,
    });
  });
});

describe('progress', () => {
  it('opens stages one after another, starting with Jakarta', () => {
    const save = emptyTour();
    expect(nextStage(save)?.id).toBe('jakarta');
    expect(stageUnlocked(save, stage('jakarta'))).toBe(true);
    expect(stageUnlocked(save, stage('tokyo'))).toBe(false);
    const after = recordStage(save, stage('jakarta'), win()).save;
    expect(stageUnlocked(after, stage('tokyo'))).toBe(true);
    expect(nextStage(after)?.id).toBe('tokyo');
  });

  it('keeps a lost stage open to retry', () => {
    const lost = recordStage(emptyTour(), stage('jakarta'), win({ won: false })).save;
    expect(nextStage(lost)?.id).toBe('jakarta');
    expect(lost.stages.jakarta).toMatchObject({ won: false, stars: 0, plays: 1 });
  });

  it('opens a chapter only with enough stars and its gatekeeper beaten', () => {
    const moon = CHAPTERS[1]!;
    const oneStarEach = playThrough('new-york', win({ throws: 99, timesHit: 1 }));
    expect(totalStars(oneStarEach)).toBe(6);
    expect(chapterUnlocked(oneStarEach, moon)).toBe(false);
    expect(chapterGate(oneStarEach, moon)).toEqual({ stars: moon.starsToUnlock - 6, boss: null });

    const allStars = playThrough('new-york');
    expect(chapterUnlocked(allStars, moon)).toBe(true);

    const noBoss = playThrough('rio');
    expect(chapterGate(noBoss, moon).boss?.id).toBe('new-york');
  });

  it('can always be finished by replaying for stars', () => {
    const chapterStars = CHAPTERS.map((chapter) => stagesIn(chapter.id).length * 3);
    let available = 0;
    CHAPTERS.forEach((chapter, index) => {
      expect(chapter.starsToUnlock).toBeLessThanOrEqual(available);
      available += chapterStars[index] ?? 0;
    });
    expect(available).toBe(MAX_STARS);
  });

  it('keeps the best result and reports what changed', () => {
    const jakarta = stage('jakarta');
    const first = recordStage(emptyTour(), jakarta, win({ throws: 99, timesHit: 1 }));
    expect(first).toMatchObject({ newStars: 1, firstWin: true, rivalFirstDefeat: true });
    const better = recordStage(first.save, jakarta, win({ throws: 4 }));
    expect(better).toMatchObject({ newStars: 2, firstWin: false, rivalFirstDefeat: false });
    const worse = recordStage(better.save, jakarta, win({ won: false }));
    expect(worse.newStars).toBe(0);
    expect(worse.save.stages.jakarta).toMatchObject({
      stars: 3,
      won: true,
      bestThrows: 4,
      plays: 3,
    });
  });

  it('notices a chapter opening and the tour ending', () => {
    const beforeBoss = playThrough('rio');
    const boss = recordStage(beforeBoss, stage('new-york'), win());
    expect(boss.opened.map((chapter) => chapter.id)).toEqual(['moon']);
    expect(boss.tourComplete).toBe(false);
    const finale = recordStage(playThrough('red-spot'), stage('the-eye'), win());
    expect(finale.tourComplete).toBe(true);
  });

  it('offers beaten rivals in Quick Match', () => {
    expect(rivalsForQuickMatch(emptyTour())).toEqual([]);
    expect(rivalsForQuickMatch(playThrough('tokyo'))).toEqual(['drizzle', 'glitch']);
  });
});

describe('the tour save', () => {
  it('round-trips through JSON', () => {
    const save = playThrough('dubai');
    save.outfits[0].headwear = 'hat-cap';
    expect(loadTour(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('starts afresh on anything unreadable or from a newer version', () => {
    for (const raw of [null, 'tour', [], {}, { version: 0 }, { version: TOUR_VERSION + 1 }]) {
      expect(loadTour(raw)).toEqual(emptyTour());
    }
  });

  it('repairs damaged records field by field', () => {
    const loaded = loadTour({
      version: 1,
      stages: {
        jakarta: { stars: 7, won: 'yes', bestThrows: -3, plays: 2.7 },
        atlantis: { stars: 3 },
      },
      rivalsBeaten: ['drizzle', 'nobody'],
      outfits: [{ headwear: 'hat-cap', eyewear: 'hat-cap' }, 'nonsense'],
    });
    expect(loaded.stages).toEqual({
      jakarta: { stars: 3, won: false, bestThrows: null, plays: 2 },
    });
    expect(loaded.rivalsBeaten).toEqual(['drizzle']);
    expect(loaded.outfits[0]).toMatchObject({ headwear: 'hat-cap', eyewear: 'eyes-none' });
    expect(loaded.outfits[1]).toEqual(emptyTour().outfits[1]);
  });

  it('runs every migration step from an older version', () => {
    // Pretend version 2 renamed "beaten" to "rivalsBeaten".
    const steps = { 1: (v1: Record<string, unknown>) => ({ ...v1, rivalsBeaten: v1.beaten }) };
    expect(loadTour({ version: 1, beaten: ['tempo'] }, steps, 2).rivalsBeaten).toEqual(['tempo']);
    expect(loadTour({ version: 1, beaten: ['tempo'] }, {}, 2)).toEqual(emptyTour());
  });
});
