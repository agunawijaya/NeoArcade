import { createArcadePass, xpForLevel, type PlayerLook } from '@shared/pass';
import labManifest from './lab.manifest';

/**
 * Ready-made profiles for looking at the Pass in every state. Each one is
 * played into existence through the real Pass API on a pretend calendar, so
 * caps, levels, the feed and badge dates all come out the way real play
 * would leave them.
 */
export type PresetName = 'fresh' | 'mid' | 'almost-level' | 'almost-rank' | 'full' | 'legend';

export const PRESETS: Record<PresetName, string> = {
  fresh: 'Fresh profile',
  mid: 'Mid-season',
  'almost-level': 'One win from a level',
  'almost-rank': 'One win from a rank',
  full: 'Full cabinet',
  legend: 'Arcade Legend',
};

interface Plan {
  name: string;
  look: Partial<PlayerLook>;
  days: number;
  roundsPerDay: number;
  badges: { id: (typeof labManifest.badges)[number]['id']; onDay: number }[];
}

const ALL_BADGES = labManifest.badges.map((badge, index) => ({
  id: badge.id,
  onDay: 2 + index * 2,
}));

const PLANS: Record<Exclude<PresetName, 'fresh'>, Plan> = {
  mid: {
    name: 'Ada',
    look: {
      skin: 'honey',
      backdrop: 'dusk',
      eyes: 'happy',
      headwear: 'headphones',
      accessory: 'glasses',
      frame: 'neon',
    },
    days: 7,
    roundsPerDay: 9,
    badges: [
      { id: 'first-coin', onDay: 1 },
      { id: 'warmed-up', onDay: 2 },
      { id: 'bullseye', onDay: 2 },
      { id: 'night-owl', onDay: 4 },
      { id: 'sprinter', onDay: 5 },
      { id: 'hot-streak', onDay: 6 },
      { id: 'oops', onDay: 7 },
    ],
  },
  'almost-level': {
    name: 'Ada',
    look: { skin: 'honey', backdrop: 'dusk', eyes: 'happy', headwear: 'headphones', frame: 'neon' },
    days: 3,
    roundsPerDay: 8,
    badges: [
      { id: 'first-coin', onDay: 1 },
      { id: 'bullseye', onDay: 2 },
    ],
  },
  'almost-rank': {
    name: 'Ada',
    look: { skin: 'honey', backdrop: 'dusk', eyes: 'happy', headwear: 'headphones', frame: 'neon' },
    days: 2,
    roundsPerDay: 9,
    badges: [{ id: 'first-coin', onDay: 1 }],
  },
  full: {
    name: 'Grace',
    look: {
      face: 'tall',
      skin: 'umber',
      backdrop: 'grid',
      eyes: 'stars',
      mouth: 'grin',
      headwear: 'crown',
      accessory: 'shades',
      frame: 'gold',
    },
    days: 52,
    roundsPerDay: 10,
    badges: ALL_BADGES,
  },
  legend: {
    name: 'Hopper',
    look: {
      face: 'ghost',
      skin: 'mint',
      backdrop: 'starfield',
      eyes: 'happy',
      mouth: 'tongue',
      headwear: 'halo',
      accessory: 'blush',
      frame: 'legend',
      hallTheme: 'hyperspace',
    },
    days: 96,
    roundsPerDay: 10,
    badges: ALL_BADGES,
  },
};

/** Presets that stop just short of a level: which one (default: the next), and by how much XP. */
const STOP_SHORT: Partial<Record<PresetName, { level?: number; xp: number }>> = {
  'almost-level': { level: 7, xp: 25 },
  'almost-rank': { level: 5, xp: 25 },
};

export function applyPreset(preset: PresetName, backend: Storage): void {
  backend.removeItem('neoarcade:pass:profile');
  if (preset === 'fresh') return;
  const plan = PLANS[preset];
  const start = new Date();
  start.setDate(start.getDate() - plan.days);
  start.setHours(start.getHours() - 3, 0, 0, 0);
  let today = new Date(start);
  const pass = createArcadePass({ backend, now: () => new Date(today), watchOtherTabs: false });
  const game = pass.forGame(labManifest);
  let streak = 0;

  for (let day = 1; day <= plan.days; day++) {
    today = new Date(start.getTime() + (day - 1) * 86_400_000);
    for (let round = 0; round < plan.roundsPerDay; round++) {
      today = new Date(today.getTime() + 7 * 60_000);
      playRound(round % 3 !== 2);
    }
    for (const badge of plan.badges) if (badge.onDay === day) game.unlock(badge.id);
  }

  const stop = STOP_SHORT[preset];
  if (stop) topUpTo(stop.level ?? pass.level + 1, stop.xp);
  pass.rename(plan.name);
  pass.dressUp(plan.look);

  function playRound(won: boolean) {
    game.award(10, 'Played a round');
    game.stat('rounds', { add: 1 });
    game.progress('warmed-up', { add: 1 });
    game.progress('marathon', { add: 1 });
    if (won) {
      streak += 1;
      game.award(40, 'Won a round');
      game.stat('wins', { add: 1 });
      game.stat('bestStreak', { max: streak });
      game.stat('fastestWin', { min: 40 + ((streak * 7) % 50) });
    } else {
      streak = 0;
    }
    if (won && streak % 3 === 0) game.progress('magpie', { add: 1 });
  }

  // Plays practice rounds on following days until `level` is `xpShort` away.
  function topUpTo(level: number, xpShort: number) {
    const gap = () => xpForLevel(level) - xpShort - pass.profile.xp;
    today = new Date(today.getTime() + 86_400_000);
    while (gap() > 0) {
      if (game.award(Math.min(gap(), 200), 'Practice round').granted === 0) {
        today = new Date(today.getTime() + 86_400_000);
      }
    }
  }
}
