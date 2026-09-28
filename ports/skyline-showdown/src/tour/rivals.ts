import { DEFAULT_STYLE, type CpuLevel, type PlayStyle } from '../engine/ai';
import type { Outfit } from '../wardrobe/items';

/**
 * The World Tour's rivals. Each is a CPU level plus a play style, a
 * signature colour, an outfit built from the wardrobe (so they show off what
 * players can unlock) and a few lines. Their personalities come from how
 * they throw and what they say, never from where they come from.
 */
export type RivalId =
  | 'drizzle'
  | 'glitch'
  | 'summit'
  | 'mirage'
  | 'tempo'
  | 'landlord'
  | 'orbit'
  | 'rust'
  | 'thunder'
  | 'colossus';

export interface Rival {
  id: RivalId;
  name: string;
  /** A few words under the name on the stage card. */
  title: string;
  colour: string;
  outfit: Outfit;
  level: CpuLevel;
  style: PlayStyle;
  /** How the style reads to a player, for the stage card. */
  styleNote: string;
  lines: {
    intro: string;
    /** After a near miss by the player. */
    taunt: readonly string[];
    /** After the player hits them. */
    hit: readonly string[];
    defeat: string;
    /** After they win the match. */
    victory: string;
  };
}

const outfit = (parts: Partial<Outfit> & { fur: string }): Outfit => ({
  headwear: 'hat-none',
  eyewear: 'eyes-none',
  neckwear: 'neck-bandana',
  banana: 'banana-classic',
  trail: 'trail-classic',
  explosion: 'boom-classic',
  dance: 'dance-classic',
  ...parts,
});

export const RIVALS: Record<RivalId, Rival> = {
  drizzle: {
    id: 'drizzle',
    name: 'Drizzle',
    title: 'The cheerful rookie',
    colour: '#3fd6c8',
    outfit: outfit({ fur: 'fur-cocoa', headwear: 'hat-beanie', neckwear: 'neck-scarf' }),
    level: 'easy',
    style: { ...DEFAULT_STYLE, angle: 58, correction: 0.8 },
    styleNote: 'Throws high, learns slowly',
    lines: {
      intro: 'First time on a roof? Me too! Let’s make it rain.',
      taunt: ['Ooh, so close!', 'Splashy!', 'The wind has opinions today.'],
      hit: ['Ow! Worth it.', 'Soaked!', 'Nice one, really!'],
      defeat: 'Rain check? I’ll get you in the next storm.',
      victory: 'I won? I won! Wait until I tell my umbrella.',
    },
  },
  glitch: {
    id: 'glitch',
    name: 'Glitch',
    title: 'Runs on energy drinks',
    colour: '#ff4fb4',
    outfit: outfit({
      fur: 'fur-charcoal',
      headwear: 'hat-headphones',
      eyewear: 'eyes-3d',
      trail: 'trail-neon',
    }),
    level: 'easy',
    style: { ...DEFAULT_STYLE, angle: 32, windSense: 1.2 },
    styleNote: 'Flat and fast',
    lines: {
      intro: 'Calculating trajectory… just kidding, I throw by feel.',
      taunt: ['Buffering… miss!', '404: gorilla not found.', 'Lag! Definitely lag.'],
      hit: ['Ctrl+Z! Ctrl+Z!', 'That’s a bug, not a feature.', 'Rebooting…'],
      defeat: 'GG. Patching my throwing arm tonight.',
      victory: 'Speedrun complete.',
    },
  },
  summit: {
    id: 'summit',
    name: 'Summit',
    title: 'Only happy at the top',
    colour: '#ffc93d',
    outfit: outfit({
      fur: 'fur-ginger',
      headwear: 'hat-top',
      eyewear: 'eyes-aviators',
      neckwear: 'neck-bow',
    }),
    level: 'normal',
    style: { ...DEFAULT_STYLE, angle: 68, angleSpread: 3, correction: 0.8 },
    styleNote: 'Sky-high lobs',
    lines: {
      intro: 'Everything looks small from up here. Including you.',
      taunt: ['Look up. Higher. Higher.', 'Altitude is attitude.', 'Did that one reach orbit?'],
      hit: ['My view!', 'Not the suit!', 'Fine. Lucky.'],
      defeat: 'Enjoy the view. I’ll be back on top.',
      victory: 'As expected, from the top.',
    },
  },
  mirage: {
    id: 'mirage',
    name: 'Mirage',
    title: 'Speaks in riddles',
    colour: '#e8b86a',
    outfit: outfit({ fur: 'fur-silverback', eyewear: 'eyes-monocle', neckwear: 'neck-scarf' }),
    level: 'easy',
    style: { ...DEFAULT_STYLE, angleSpread: 1.5, correction: 0.9, windSense: 0.6 },
    styleNote: 'Calm, careful, trusts instinct',
    lines: {
      intro: 'The wind is a rumour. Listen with your eyes.',
      taunt: ['The haze agrees with me.', 'Close is a kind of far.', 'Patience.'],
      hit: ['Hm. The haze lied.', 'Well read.', 'A fair wind for you.'],
      defeat: 'You saw through the shimmer. That is rare.',
      victory: 'The shimmer keeps its secrets.',
    },
  },
  tempo: {
    id: 'tempo',
    name: 'Tempo',
    title: 'Never stops moving',
    colour: '#9dff5c',
    outfit: outfit({
      fur: 'fur-rose',
      headwear: 'hat-cap',
      eyewear: 'eyes-shades',
      dance: 'dance-spin',
    }),
    level: 'easy',
    style: { ...DEFAULT_STYLE, correction: 1.7 },
    styleNote: 'Overcorrects wildly',
    lines: {
      intro: 'Let’s keep it moving! Up, down, up, down!',
      taunt: ['Too short! No, too long! Wait—', 'Feel the beat!', 'Rhythm, baby!'],
      hit: ['Off the beat!', 'Ouch, syncopated!', 'Tempo change!'],
      defeat: 'You kept better time. Encore someday?',
      victory: 'And… scene!',
    },
  },
  landlord: {
    id: 'landlord',
    name: 'The Landlord',
    title: 'Owns every roof in town',
    colour: '#ff4a4a',
    outfit: outfit({
      fur: 'fur-midnight',
      headwear: 'hat-top',
      eyewear: 'eyes-monocle',
      neckwear: 'neck-bow',
      dance: 'dance-flex',
    }),
    level: 'normal',
    style: { ...DEFAULT_STYLE, angle: 48, rattle: 0.9 },
    styleNote: 'Starts sharp, rattled when hit',
    lines: {
      intro: 'Every roof in this city pays me rent. Including yours.',
      taunt: ['Rent’s due.', 'Missed. Again.', 'My city, my wind.'],
      hit: ['That’s coming out of your deposit!', 'My tower!', 'Who let you up here?!'],
      defeat: 'Fine. Keep the roof. For now.',
      victory: 'Evicted.',
    },
  },
  orbit: {
    id: 'orbit',
    name: 'Orbit',
    title: 'Has all the time in the world',
    colour: '#9fc8ff',
    outfit: outfit({ fur: 'fur-snow', headwear: 'hat-helmet', trail: 'trail-sparkle' }),
    level: 'hard',
    style: { ...DEFAULT_STYLE, angle: 62, correction: 0.85, rattle: 0.2 },
    styleNote: 'Patient, floaty lobs',
    lines: {
      intro: 'Up here, patience is gravity. Take your time. I have plenty.',
      taunt: [
        'Still in orbit, that one.',
        'Gravity is gentle here. I am not.',
        'Try again in a thousand years.',
      ],
      hit: ['A direct landing!', 'I seem to have a problem.', 'Nicely plotted.'],
      defeat: 'One small throw for you. One giant fall for me.',
      victory: 'Mission accomplished. Mine, not yours.',
    },
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    title: 'Grit in every throw',
    colour: '#e2553a',
    outfit: outfit({
      fur: 'fur-ginger',
      eyewear: 'eyes-goggles',
      neckwear: 'neck-scarf',
      explosion: 'boom-fireworks',
    }),
    level: 'normal',
    style: { ...DEFAULT_STYLE, angle: 34, correction: 1.25, windSense: 1.1 },
    styleNote: 'Flat, fast and aggressive',
    lines: {
      intro: 'Mars chews up the soft ones. You look soft.',
      taunt: ['Dust in your eyes?', 'Red sky, red face.', 'Flat and fast. Learn it.'],
      hit: ['Grr. Lucky dust.', 'Scratched the paint!', 'Fine. You bite.'],
      defeat: 'You’re not soft. You’re sandpaper.',
      victory: 'Told you. Soft.',
    },
  },
  thunder: {
    id: 'thunder',
    name: 'Thunder',
    title: 'Feeds on storms',
    colour: '#a46bff',
    outfit: outfit({
      fur: 'fur-midnight',
      headwear: 'hat-propeller',
      eyewear: 'eyes-visor',
      trail: 'trail-neon',
    }),
    level: 'hard',
    style: { ...DEFAULT_STYLE, angle: 50, correction: 1.1, windSense: 1.15 },
    styleNote: 'Reads the storm, pushes hard',
    lines: {
      intro: 'Hear that rumble? That’s my warm-up.',
      taunt: ['Boom! Missed.', 'Crackle, crackle.', 'Feel the static?'],
      hit: ['Zapped!', 'Grounded…', 'Shocking.'],
      defeat: 'Struck twice in one storm. By you.',
      victory: 'Thunder always follows the flash.',
    },
  },
  colossus: {
    id: 'colossus',
    name: 'Colossus',
    title: 'The storm at the end of the tour',
    colour: '#ff3f6c',
    outfit: outfit({
      fur: 'fur-charcoal',
      headwear: 'hat-crown',
      eyewear: 'eyes-visor',
      neckwear: 'neck-cape',
      trail: 'trail-smoke',
      explosion: 'boom-stars',
      dance: 'dance-thump',
    }),
    level: 'brutal',
    style: { ...DEFAULT_STYLE, angle: 55, correction: 1.05, rattle: 0.35 },
    styleNote: 'Adapts fast; only nerves can crack it',
    lines: {
      intro: 'Nobody throws past me. Many have tried.',
      taunt: ['The storm is patient.', 'Almost is nothing.', 'Jupiter bends to me.'],
      hit: ['…Impressive.', 'You struck the storm itself.', 'Again? Again.'],
      defeat: 'The storm clears. The skyline is yours.',
      victory: 'The storm never ends.',
    },
  },
};

export const RIVAL_IDS = Object.keys(RIVALS) as RivalId[];
