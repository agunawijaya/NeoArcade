import { Group } from 'three';
import type { Target } from '../../engine/world';
import type { Palette } from '../palette';
import { mix, shade } from '../side/colour';
import type { MaterialCache } from './materials';
import { BALL, BOX, CONE, DRUM, HALF_DRUM, block } from './shapes';

/**
 * The ground targets as little models, one set per theme, built the way
 * the side view paints them (see side/targets*.ts): the Great War's canvas
 * hangars, brick works, fuel tanks and landships; Cyan vs Magenta's
 * rounded cartoon buildings and trucks; the Airshow's balloon carts,
 * bullseye markers, fireworks stands and ribbon gates. A convoy's lorries
 * (or floats) are built facing the way they drive.
 */
export function buildTargetModel(target: Target, palette: Palette, m: MaterialCache): Group {
  if (target.kind === 'shed' && target.standing) return shed(target, palette, m);
  if (palette.theme === 'cyan-magenta') return cartoonTarget(target, palette, m);
  if (palette.theme === 'airshow') return airshowTarget(target, palette, m);
  return target.standing ? greatWarTarget(target, palette, m) : greatWarWreck(target, palette, m);
}

/**
 * An airship shed in any theme: a long vault lying along the line of play,
 * deep enough for an airship, its doors open at one end on the envelope's
 * nose; corrugated iron, painted boards or a striped show tent.
 */
function shed(target: Target, palette: Palette, m: MaterialCache): Group {
  const group = new Group();
  const { width, height } = target;
  const accent = palette.accents[target.side];
  const wall =
    palette.theme === 'cyan-magenta'
      ? mix(accent, '#ffffff', 0.35)
      : palette.theme === 'airshow'
        ? '#f4efe2'
        : mix(palette.metal, palette.ink, 0.35);
  const depth = 16;
  group.add(block(BOX, m.toon(wall), 0, height * 0.28, 0, width, height * 0.56, depth));
  // The vault: a half drum lying along the line of play.
  const roof = block(HALF_DRUM, m.toon(wall), 0, height * 0.56, 0, depth / 2, width, height * 0.46);
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  group.add(roof);
  if (palette.theme === 'airshow')
    for (let stripe = -width / 2 + 3; stripe < width / 2; stripe += 6)
      group.add(
        block(BOX, m.toon(accent), stripe, height * 0.28, depth / 2 + 0.05, 3, height * 0.56, 0.1),
      );
  group.add(
    block(
      BOX,
      m.toon(shade(palette.ink, 0.08)),
      width / 2 + 0.05,
      height * 0.38,
      0,
      0.1,
      height * 0.7,
      depth * 0.7,
    ),
  );
  const envelope = palette.theme === 'cyan-magenta' ? '#f2a6c8' : mix('#c9ccd0', palette.ink, 0.2);
  group.add(
    block(BALL, m.toon(envelope), width / 2 - 2, height * 0.42, 0, 4, height * 0.26, depth * 0.3),
  );
  group.add(block(BOX, m.toon(accent), -width * 0.3, height + 2.4, 0, 0.3, 4.6, 0.3));
  return group;
}

function greatWarTarget(target: Target, palette: Palette, m: MaterialCache): Group {
  const group = new Group();
  const { width, height } = target;
  const accent = palette.accents[target.side];
  if (target.drivesTo !== null) return lorry(target, palette, m, accent);
  switch (target.kind) {
    case 'hangar': {
      // A half drum lying along the depth, arched on top: its radius becomes height and half the width.
      const shell = block(HALF_DRUM, m.toon(palette.canvas), 0, 0, 0, height, 10, width / 2);
      shell.rotation.set(0, Math.PI / 2, Math.PI / 2);
      group.add(shell);
      group.add(
        block(
          BOX,
          m.toon(shade(palette.ink, 0.1)),
          0,
          height * 0.32,
          5.05,
          width * 0.42,
          height * 0.62,
          0.1,
        ),
      );
      group.add(block(BOX, m.toon(accent), width * 0.45, height + 2.5, 0, 0.3, 5, 0.3));
      break;
    }
    case 'factory': {
      const brick = mix(palette.roof, palette.trunk, 0.35);
      group.add(block(BOX, m.toon(brick), 0, height * 0.31, 0, width, height * 0.62, 9));
      for (let tooth = 0; tooth < 4; tooth++) {
        const roof = block(
          BOX,
          m.toon(shade(brick, -0.25)),
          -width / 2 + (width * (tooth + 0.5)) / 4,
          height * 0.7,
          0,
          width / 4.2,
          height * 0.22,
          9,
        );
        roof.rotation.z = 0.5;
        group.add(roof);
      }
      group.add(
        block(
          DRUM,
          m.toon(shade(brick, -0.15)),
          width * 0.32,
          height * 0.75,
          -2,
          0.9,
          height * 0.8,
          0.9,
        ),
      );
      const lit = palette.daylight < 0.5;
      for (let window = 0; window < 4; window++) {
        group.add(
          block(
            BOX,
            m.toon(palette.window, lit ? { emissive: palette.window } : {}),
            -width / 2 + 2 + window * 3.6,
            height * 0.36,
            4.55,
            1.6,
            1.8,
            0.1,
          ),
        );
      }
      break;
    }
    case 'depot': {
      group.add(
        block(
          DRUM,
          m.toon(shade(palette.metal, 0.2)),
          -width * 0.18,
          height * 0.42,
          0,
          width * 0.34,
          height * 0.84,
          width * 0.34,
        ),
      );
      group.add(
        block(
          DRUM,
          m.toon('#c8412f'),
          -width * 0.18,
          height * 0.42,
          0,
          width * 0.345,
          0.9,
          width * 0.345,
        ),
      );
      for (const [dx, dz] of [
        [0.32, 2],
        [0.42, -1.5],
        [0.22, -3],
      ] as const) {
        group.add(
          block(
            DRUM,
            m.toon(mix(palette.metal, accent, 0.25)),
            width * dx,
            0.8,
            dz,
            0.75,
            1.6,
            0.75,
          ),
        );
      }
      break;
    }
    case 'tank': {
      const hull = mix(palette.metal, palette.grass[2], 0.35);
      const body = block(BOX, m.toon(hull), 0, height * 0.5, 0, width * 0.9, height * 0.8, 6);
      group.add(body);
      group.add(
        block(BOX, m.toon(shade(hull, -0.4)), 0, height * 0.18, 0, width, height * 0.36, 6.6),
      );
      group.add(block(BOX, m.toon(shade(hull, -0.1)), 0, height * 0.55, 3.4, 4, height * 0.4, 1));
      group.add(block(BOX, m.toon(palette.ink), 2.6, height * 0.55, 3.6, 2.4, 0.35, 0.35));
      break;
    }
  }
  return group;
}

function greatWarWreck(target: Target, palette: Palette, m: MaterialCache): Group {
  const group = new Group();
  const char = m.toon(palette.scorch);
  for (let beam = 0; beam < 4; beam++) {
    const piece = block(
      BOX,
      char,
      -target.width * 0.35 + beam * target.width * 0.24,
      1.2,
      (beam % 2) * 2 - 1,
      0.6,
      3 - (beam % 2),
      0.6,
    );
    piece.rotation.z = (beam - 1.5) * 0.35;
    group.add(piece);
  }
  group.add(block(BALL, char, 0, 0, 0, target.width * 0.6, 1, 5));
  return group;
}

/** A canvas-topped lorry of the supply column. */
function lorry(target: Target, palette: Palette, m: MaterialCache, accent: string): Group {
  const group = new Group();
  const body = mix(palette.metal, palette.grass[2], 0.45);
  const half = target.width / 2;
  const tilt = block(
    HALF_DRUM,
    m.toon(palette.canvas),
    -half * 0.35,
    1.8,
    0,
    3.4,
    6.4,
    half * 0.62,
  );
  tilt.rotation.set(0, Math.PI / 2, Math.PI / 2);
  group.add(tilt);
  group.add(block(BOX, m.toon(body), -half * 0.35, 1.6, 0, half * 1.3, 0.6, 5.2));
  group.add(block(BOX, m.toon(body), half * 0.5, 2.6, 0, half * 0.45, 3.4, 4.4));
  group.add(block(BOX, m.toon(body), half * 0.85, 1.9, 0, half * 0.3, 1.8, 3.6));
  group.add(block(BOX, m.toon(accent), -half * 0.35, 3.2, 3.25, 1.4, 1, 0.1));
  for (const wheel of [-0.65, 0.65]) {
    for (const z of [-2.2, 2.2]) {
      const tyre = block(DRUM, m.toon('#26221e'), half * wheel, 1, z, 1.05, 0.6, 1.05);
      tyre.rotation.x = Math.PI / 2;
      group.add(tyre);
    }
  }
  return group;
}

/** Cyan vs Magenta: rounded, stripy, cheerful; a wreck is a heap with a white flag in it. */
function cartoonTarget(target: Target, palette: Palette, m: MaterialCache): Group {
  const group = new Group();
  const { width, height } = target;
  const accent = palette.accents[target.side];
  if (!target.standing) {
    for (const [dx, radius] of [
      [-0.3, 1.6],
      [0, 2.1],
      [0.3, 1.4],
    ] as const)
      group.add(
        block(BALL, m.toon(shade(palette.metal, -0.2)), width * dx, 0, 0, radius, radius, radius),
      );
    group.add(block(BOX, m.toon(palette.ink), 0.4, 3.6, 0, 0.25, 5, 0.25));
    group.add(block(BOX, m.toon('#ffffff'), 1.7, 5.4, 0, 2.4, 1.4, 0.1));
    return group;
  }
  switch (target.kind) {
    case 'hangar':
      group.add(block(BOX, m.toon(palette.canvas), 0, height * 0.39, 0, width, height * 0.78, 9));
      group.add(
        block(DRUM, m.toon(palette.canvas), 0, height * 0.78, 0, width / 2, 9, width / 2).rotateX(
          Math.PI / 2,
        ),
      );
      group.add(block(BOX, m.toon(accent), 0, height * 0.62, 4.56, width * 0.9, 1.3, 0.1));
      group.add(
        block(
          BOX,
          m.toon(shade(palette.ink, 0.15)),
          0,
          height * 0.25,
          4.56,
          width * 0.5,
          height * 0.5,
          0.1,
        ),
      );
      break;
    case 'factory':
      group.add(block(BOX, m.toon(palette.roof), 0, height * 0.3, 0, width, height * 0.6, 9));
      group.add(
        block(
          DRUM,
          m.toon(palette.wall),
          width * 0.32,
          height * 0.9,
          -1.5,
          1.1,
          height * 0.62,
          1.1,
        ),
      );
      for (const band of [0.75, 1.05])
        group.add(block(DRUM, m.toon(accent), width * 0.32, height * band, -1.5, 1.15, 0.9, 1.15));
      break;
    case 'depot':
      group.add(
        block(
          BALL,
          m.toon(shade(palette.metal, 0.15)),
          -width * 0.1,
          height * 0.5,
          0,
          width * 0.4,
          height * 0.5,
          width * 0.4,
        ),
      );
      group.add(
        block(
          DRUM,
          m.toon('#ff5a3c'),
          -width * 0.1,
          height * 0.42,
          0,
          width * 0.41,
          1.6,
          width * 0.41,
        ),
      );
      for (const [dx, dz] of [
        [0.38, 2],
        [0.46, -1.6],
      ] as const)
        group.add(block(DRUM, m.toon(accent), width * dx, 1.2, dz, 0.9, 2.4, 0.9));
      break;
    case 'tank': {
      group.add(block(BOX, m.toon(palette.wall), -width * 0.12, 3.6, 0, width * 0.62, 4.6, 5));
      group.add(block(BOX, m.toon(accent), -width * 0.12, 3.2, 2.56, width * 0.6, 1.2, 0.1));
      group.add(
        block(
          BALL,
          m.toon(mix(accent, palette.ink, 0.15)),
          width * 0.3,
          2.6,
          0,
          width * 0.22,
          1.6,
          2.2,
        ),
      );
      for (const wheel of [-0.31, 0.31])
        for (const z of [-2.3, 2.3]) {
          const tyre = block(DRUM, m.toon(palette.ink), width * wheel, 1.1, z, 1.1, 0.6, 1.1);
          tyre.rotation.x = Math.PI / 2;
          group.add(tyre);
        }
      break;
    }
  }
  return group;
}

/** The Airshow's targets, set out for the crowd; a "wreck" is the trick done. */
function airshowTarget(target: Target, palette: Palette, m: MaterialCache): Group {
  const group = new Group();
  const { width, height } = target;
  const accent = palette.accents[target.side];
  const festive = (index: number) => palette.festive[index % palette.festive.length] as string;
  const cart = () => {
    group.add(block(BOX, m.toon(accent), 0, 1.8, 0, width * 0.8, 1.6, 4));
    for (const wheel of [-0.28, 0.28])
      for (const z of [-2.1, 2.1]) {
        const tyre = block(DRUM, m.toon(palette.ink), width * wheel, 0.8, z, 0.8, 0.4, 0.8);
        tyre.rotation.x = Math.PI / 2;
        group.add(tyre);
      }
  };
  if (target.drivesTo !== null) {
    cart();
    if (target.standing) {
      group.add(block(BALL, m.toon('#ffd23c'), -0.6, 4.6, 0, width * 0.27, 2, 2.2));
      group.add(block(BALL, m.toon('#ffd23c'), width * 0.18, 6.4, 0, 1.3, 1.3, 1.3));
      group.add(
        block(CONE, m.toon('#ff8a2c'), width * 0.18 + 1.6, 6.3, 0, 0.5, 1.4, 0.5).rotateZ(
          -Math.PI / 2,
        ),
      );
    }
    return group;
  }
  switch (target.kind) {
    case 'hangar':
      cart();
      for (let balloon = 0; balloon < 5; balloon++) {
        const x = width * (-0.3 + balloon * 0.15);
        const y = height * (0.85 + (balloon % 2) * 0.18);
        group.add(block(BOX, m.toon(palette.ink), x, (y + 2.6) / 2, 0, 0.08, y - 2.6, 0.08));
        if (target.standing)
          group.add(block(BALL, m.toon(festive(balloon)), x, y, 0, 1.5, 1.8, 1.5));
      }
      break;
    case 'factory': {
      const radius = Math.min(width / 2, height * 0.45);
      const legs = block(
        BOX,
        m.toon(palette.trunk),
        0,
        height * 0.28,
        -0.4,
        0.4,
        height * 0.56,
        0.4,
      );
      group.add(legs);
      [accent, '#ffffff', accent, '#ffffff', festive(1)].forEach((colour, index) => {
        const ring = block(
          DRUM,
          m.toon(colour),
          0,
          height - radius,
          index * 0.06,
          radius * (1 - index * 0.19),
          0.3,
          radius * (1 - index * 0.19),
        );
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      });
      if (!target.standing) {
        const splash = block(
          DRUM,
          m.toon('#ffffff'),
          0,
          height - radius,
          0.4,
          radius * 0.7,
          0.3,
          radius * 0.6,
        );
        splash.rotation.x = Math.PI / 2;
        group.add(splash);
      }
      break;
    }
    case 'depot':
      group.add(block(BOX, m.toon(palette.wall), 0, height * 0.28, 0, width, height * 0.55, 6));
      for (let stripe = 0; stripe < 6; stripe++)
        group.add(
          block(
            BOX,
            m.toon(stripe % 2 === 0 ? festive(0) : '#ffffff'),
            -width / 2 + (stripe + 0.5) * (width / 6),
            height * 0.6,
            0.6,
            width / 6,
            height * 0.12,
            7,
          ),
        );
      if (target.standing)
        for (let rocket = 0; rocket < 4; rocket++)
          group.add(
            block(
              CONE,
              m.toon(festive(rocket + 1)),
              -width * 0.35 + rocket * width * 0.23,
              height * 1.2,
              0,
              0.5,
              height * 0.5,
              0.5,
            ),
          );
      break;
    case 'tank': {
      const top = height * 1.8;
      for (const side of [-1, 1])
        for (let band = 0; band < 6; band++)
          group.add(
            block(
              DRUM,
              m.toon(band % 2 === 0 ? accent : '#ffffff'),
              side * width * 0.4,
              (band + 0.5) * (top / 6),
              0,
              0.6,
              top / 6,
              0.6,
            ),
          );
      if (target.standing)
        group.add(block(BOX, m.toon(festive(1)), 0, top - 1.2, 0, width * 0.8, 0.5, 0.2));
      break;
    }
  }
  return group;
}
