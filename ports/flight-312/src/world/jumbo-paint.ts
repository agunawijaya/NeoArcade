import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

/**
 * The jumbo's skin, painted on canvases: the fuselage's livery bands, its
 * windows, doors and titles, and the upper deck with the flight deck's
 * windows. The fuselage is a lathe, so its texture runs around the body
 * across the canvas and from nose to tail down it; everything is drawn in
 * metres on each side and turned into the canvas's terms here.
 */
export interface Paint {
  top: string;
  belly: string;
  cheatline: string;
  pinstripe: string;
  fin: string;
  finMark: string;
  engine: string;
  title: string;
}

export interface SkinShape {
  /** Fuselage radius, metres. */
  radius: number;
  /** Nose to tail along the lathe, metres. */
  length: number;
}

const AROUND_PIXELS = 1024;
const ALONG_PIXELS = 2048;
const WINDOW = '#1c232c';
const SEAM = 'rgba(40, 46, 54, 0.55)';

/** Passenger doors, metres from the nose. */
const DOORS = [8.6, 19.2, 30.4, 43.6, 55.4];
const DOOR_WIDTH = 1.1;
const WINDOW_PITCH = 0.53;

export function skinTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 8;
  texture.minFilter = LinearMipmapLinearFilter;
  return texture;
}

export function fuselageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = AROUND_PIXELS;
  canvas.height = ALONG_PIXELS;
  return canvas;
}

/**
 * The fuselage: the belly below the wing root's line, the cheatline and its
 * pinstripe along the sides, a row of cabin windows broken by the doors,
 * and the airline's name over the forward cabin.
 */
export function paintFuselage(canvas: HTMLCanvasElement, paint: Paint, shape: SkinShape) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { radius, length } = shape;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = paint.top;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Bands by height on the side, as a fraction of the radius above the axis; both sides at once.
  const band = (low: number, high: number, colour: string) => {
    const from = Math.acos(-high) / (2 * Math.PI);
    const to = Math.acos(-low) / (2 * Math.PI);
    context.fillStyle = colour;
    context.fillRect(to * canvas.width, 0, (from - to) * canvas.width, canvas.height);
    context.fillRect((1 - from) * canvas.width, 0, (from - to) * canvas.width, canvas.height);
  };
  band(-1.01, -0.3, paint.belly);
  band(0.02, 0.26, paint.cheatline);
  band(0.26, 0.31, paint.pinstripe);

  const perAround = canvas.width / (2 * Math.PI * radius);
  const perAlong = canvas.height / length;
  /** Metres down from the crown to a height on the side. */
  const down = (height: number) => radius * (Math.PI - Math.acos(-height));
  for (const side of [1, -1]) {
    // Drawing coordinates on this side: x in metres the way the titles read (toward the nose on the right), y metres down from the crown.
    context.setTransform(0, side * -perAlong, side * -perAround, 0, canvas.width / 2, 0);
    const at = (station: number) => -side * station;
    const windowTop = down(0.46);
    const windowHeight = down(0.36) - windowTop;
    context.fillStyle = WINDOW;
    for (let station = 6.4; station < 60; station += WINDOW_PITCH) {
      if (DOORS.some((door) => Math.abs(door - station) < DOOR_WIDTH * 0.75)) continue;
      context.fillRect(at(station) - 0.12, windowTop, 0.24, windowHeight);
    }
    context.strokeStyle = SEAM;
    context.lineWidth = 0.05;
    for (const door of DOORS) {
      const doorTop = down(0.6);
      context.strokeRect(at(door) - DOOR_WIDTH / 2, doorTop, DOOR_WIDTH, down(0.02) - doorTop);
      context.fillStyle = WINDOW;
      context.fillRect(at(door) - 0.12, windowTop, 0.24, windowHeight);
    }
    // Type is set twenty times larger and scaled down: some browsers round a font of a pixel or two.
    context.fillStyle = paint.cheatline;
    context.font = '700 23px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.translate(at(24), down(0.55));
    context.scale(1 / 20, 1 / 20);
    context.fillText(paint.title, 0, 0, 300);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
}

export function upperDeckCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  return canvas;
}

/**
 * The upper deck's hump, a stretched sphere: the flight deck's windows
 * across its front and a short row of upper-deck windows down each side,
 * longer on the later jumbo's stretched deck. A sphere's texture runs
 * around it across the canvas and from the bottom pole up it.
 */
export function paintUpperDeck(canvas: HTMLCanvasElement, paint: Paint, stretched: boolean) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  context.fillStyle = paint.top;
  context.fillRect(0, 0, width, height);
  const row = (fromDeg: number, toDeg: number) => ({
    y: (1 - toDeg / 180) * height,
    h: ((toDeg - fromDeg) / 180) * height,
  });
  context.fillStyle = WINDOW;

  // The flight deck: two panes each side of the nose, the front ones the larger.
  const deck = row(50, 63);
  for (const [from, to] of [
    [0.69, 0.718],
    [0.722, 0.747],
    [0.753, 0.778],
    [0.782, 0.81],
  ] as const) {
    context.fillRect(from * width, deck.y, (to - from) * width, deck.h);
  }

  // Cabin windows along each side, placed by where they sit along the hump.
  const cabin = row(56, 62);
  const sinTheta = Math.sin((59 * Math.PI) / 180);
  const last = stretched ? 0.5 : 0.2;
  for (let along = -0.68; along <= last; along += 0.075) {
    for (const side of [1, -1]) {
      const u = (z: number) => {
        const turn = Math.asin(Math.max(-1, Math.min(1, z / sinTheta)));
        const phi = side > 0 ? Math.PI - turn : 2 * Math.PI + turn;
        return phi / (2 * Math.PI);
      };
      const a = u(along - 0.012);
      const b = u(along + 0.012);
      context.fillRect(Math.min(a, b) * width, cabin.y, Math.abs(b - a) * width, cabin.h);
    }
  }
}
