import { createRng, type Rng } from '@shared/rng';
import { STREET_Y, WORLD_HEIGHT, WORLD_WIDTH } from '../engine/constants';
import type { Circle, Point, Rect } from '../engine/geometry';
import type { Building } from '../engine/skyline';
import type { CityKit, FacadeStyle } from './kits';
import { shade, tintKeepingLight, withAlpha, type Palette } from './palette';
import { paintRoofProp, PROP_MIN_WIDTH } from './rooftop-props';

/**
 * The playable row of buildings, painted once into an offscreen canvas.
 * Explosions carve that canvas with `destination-out`, so damage costs
 * nothing per frame. Windows are repainted one at a time when they switch
 * on or off. Rooftop props sit set back on the roof: they are scenery and
 * never stop a banana, just as the original's roofs had nothing on them.
 * What the city is built from (facades, tints, props) comes from its kit.
 */

interface WindowState {
  rect: Rect;
  lit: boolean;
  colour: string;
  building: number;
  /** Someone is standing in this window. */
  figure: boolean;
}

export interface Rooftops {
  /** Tip of each antenna, with the roof it stands on. */
  antennas: (Point & { roof: number })[];
  chimneys: Point[];
  flags: Point[];
}

const NEON = ['#ff3fa4', '#3ff3ff', '#ffe066', '#9b6bff'];

export class City {
  readonly canvas = document.createElement('canvas');
  readonly rooftops: Rooftops = { antennas: [], chimneys: [], flags: [] };
  private readonly ctx: CanvasRenderingContext2D;
  private readonly facades: { colour: string; style: FacadeStyle; neon: string | null }[];
  private windows: WindowState[] = [];
  private craters: Circle[] = [];
  private cuts: Rect[] = [];
  private scale = 1;
  private readonly flickerRng: Rng;
  private readonly propSeed: number;

  constructor(
    private readonly buildings: readonly Building[],
    private readonly occupied: readonly number[],
    seed: number,
    private readonly palette: Palette,
    private readonly kit: CityKit,
  ) {
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available.');
    this.ctx = context;
    const rng = createRng(seed);
    this.flickerRng = rng.clone();
    this.propSeed = rng.int(0, 2 ** 31 - 1);
    this.facades = buildings.map((building, index) => {
      const base = rng.pick(palette.facades);
      return {
        colour:
          kit.tints.length > 0 ? tintKeepingLight(base, rng.pick(kit.tints), kit.tintAmount) : base,
        style: rng.pick(kit.styles),
        neon:
          !occupied.includes(index) && building.width > 44 && rng.chance(kit.neon)
            ? rng.pick(NEON)
            : null,
      };
    });
    this.windows = buildings.flatMap((building, index) =>
      building.windows.map((window) => ({
        rect: { x: window.x, y: window.y, width: window.width, height: window.height },
        lit: window.lit,
        colour: rng.pick(palette.windowLit),
        building: index,
        figure: rng.chance(0.08),
      })),
    );
    this.planRooftops(rng);
  }

  /** Paints everything from scratch at a new resolution (pixels per world unit). */
  render(scale: number) {
    this.scale = scale;
    this.canvas.width = Math.ceil(WORLD_WIDTH * scale);
    this.canvas.height = Math.ceil(WORLD_HEIGHT * scale);
    const ctx = this.ctx;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.buildings.forEach((building, index) => this.paintBuilding(building, index));
    for (const window of this.windows) this.paintWindow(window);
    this.paintRooftopProps();
    for (const crater of this.craters) this.carveCrater(crater);
    for (const cut of this.cuts) this.carveCut(cut);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.drawImage(this.canvas, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  facadeAt(building: number): string {
    return this.facades[building]?.colour ?? '#444444';
  }

  carve(crater: Circle) {
    this.craters.push(crater);
    this.carveCrater(crater);
  }

  /**
   * Knocks a roof section loose: returns a copy of it to fall away, then
   * removes it from the city.
   */
  knockOff(cut: Rect): HTMLCanvasElement {
    const piece = document.createElement('canvas');
    piece.width = Math.max(1, Math.ceil(cut.width * this.scale));
    piece.height = Math.max(1, Math.ceil(cut.height * this.scale));
    piece
      .getContext('2d')
      ?.drawImage(
        this.canvas,
        cut.x * this.scale,
        cut.y * this.scale,
        piece.width,
        piece.height,
        0,
        0,
        piece.width,
        piece.height,
      );
    this.cuts.push(cut);
    this.carveCut(cut);
    return piece;
  }

  /** The blast knocks out the lights in nearby windows. */
  darkenAround(x: number, y: number, radius: number) {
    for (const window of this.windows) {
      const dx = window.rect.x + window.rect.width / 2 - x;
      const dy = window.rect.y + window.rect.height / 2 - y;
      if (window.lit && dx * dx + dy * dy < radius * radius) this.setLit(window, false);
    }
  }

  /** People come home and go to bed: now and then a window changes. */
  flicker() {
    const window = this.flickerRng.pick(this.windows);
    if (!window || this.touchesDamage(window.rect)) return;
    const litShare = this.windows.filter((candidate) => candidate.lit).length / this.windows.length;
    // Drift back towards three windows in four being lit.
    if (window.lit && litShare > 0.6) this.setLit(window, false);
    else if (!window.lit && litShare < 0.85) this.setLit(window, true);
  }

  /** Lit state of every window, to restore after an instant replay. */
  snapshot(): boolean[] {
    return this.windows.map((window) => window.lit);
  }

  /** Rewinds the city to how it looked before a shot, for the replay. */
  restore(craters: readonly Circle[], cuts: readonly Rect[], lit: readonly boolean[]) {
    this.craters = [...craters];
    this.cuts = [...cuts];
    this.windows.forEach((window, index) => (window.lit = lit[index] ?? window.lit));
    this.render(this.scale);
  }

  private setLit(window: WindowState, lit: boolean) {
    window.lit = lit;
    if (!this.touchesDamage(window.rect)) this.paintWindow(window);
  }

  private touchesDamage(rect: Rect): boolean {
    const nearCrater = this.craters.some(
      (crater) =>
        Math.abs(crater.x - (rect.x + rect.width / 2)) < crater.radius + 6 &&
        Math.abs(crater.y - (rect.y + rect.height / 2)) < crater.radius + 7,
    );
    const inCut = this.cuts.some(
      (cut) =>
        rect.x < cut.x + cut.width && rect.x + rect.width > cut.x && rect.y < cut.y + cut.height,
    );
    return nearCrater || inCut;
  }

  private paintBuilding(building: Building, index: number) {
    const ctx = this.ctx;
    const { colour, style, neon } = this.facades[index] as (typeof this.facades)[number];
    const { x, width, top } = building;
    const height = STREET_Y - top;

    const body = ctx.createLinearGradient(0, top, 0, STREET_Y);
    body.addColorStop(0, shade(colour, 0.1));
    body.addColorStop(1, shade(colour, -0.35));
    ctx.fillStyle = body;
    ctx.fillRect(x, top, width + 1, height + 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, width + 1, height + 1);
    ctx.clip();
    this.paintTexture(style, x, top, width, colour);
    ctx.restore();

    // Sky light down the left edge, shade down the right, a lighter parapet on top.
    ctx.fillStyle = withAlpha(this.palette.rimLight, 0.28);
    ctx.fillRect(x, top, 0.9, height + 1);
    ctx.fillStyle = withAlpha('#000000', 0.28);
    ctx.fillRect(x + width, top, 1, height + 1);
    ctx.fillStyle = shade(colour, 0.28);
    ctx.fillRect(x, top, width + 1, 1.3);
    ctx.fillStyle = withAlpha(this.palette.rimLight, 0.35);
    ctx.fillRect(x, top, width + 1, 0.5);

    if (neon) {
      const signX = x + width - 3.2;
      const signTop = top + 6;
      const signHeight = Math.min(26, height - 14);
      if (signHeight > 8) {
        ctx.fillStyle = '#0c0a12';
        ctx.fillRect(signX - 0.8, signTop - 0.8, 2.6, signHeight + 1.6);
        ctx.fillStyle = neon;
        for (let y = signTop; y < signTop + signHeight - 1; y += 3.2) ctx.fillRect(signX, y, 1, 2);
      }
    }
  }

  private paintTexture(style: FacadeStyle, x: number, top: number, width: number, colour: string) {
    const ctx = this.ctx;
    switch (style) {
      case 'brick':
        ctx.fillStyle = withAlpha('#000000', 0.1);
        for (let y = top + 3; y < STREET_Y; y += 2.6) ctx.fillRect(x, y, width + 1, 0.35);
        break;
      case 'panels':
        ctx.fillStyle = withAlpha(shade(colour, 0.35), 0.35);
        for (let y = top + 11; y < STREET_Y; y += 15) ctx.fillRect(x, y, width + 1, 0.7);
        break;
      case 'glass': {
        const sheen = ctx.createLinearGradient(x, top, x + width, top + width);
        sheen.addColorStop(0, withAlpha('#ffffff', 0.1));
        sheen.addColorStop(0.5, withAlpha('#ffffff', 0));
        sheen.addColorStop(1, withAlpha('#ffffff', 0.05));
        ctx.fillStyle = sheen;
        ctx.fillRect(x, top, width + 1, STREET_Y - top);
        ctx.fillStyle = withAlpha('#000000', 0.16);
        for (let column = x + 1.5; column < x + width; column += 10)
          ctx.fillRect(column, top, 0.5, STREET_Y - top);
        break;
      }
      case 'deco':
        ctx.fillStyle = withAlpha(shade(colour, 0.3), 0.4);
        ctx.fillRect(x + 1, top, 1.4, STREET_Y - top);
        ctx.fillRect(x + width - 2.4, top, 1.4, STREET_Y - top);
        ctx.fillStyle = withAlpha(shade(colour, 0.25), 0.5);
        ctx.fillRect(x, top + 2.4, width + 1, 1);
        break;
    }
  }

  private paintWindow(window: WindowState) {
    const ctx = this.ctx;
    const { x, y, width, height } = window.rect;
    if (!window.lit) {
      ctx.fillStyle = this.palette.windowDark;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = withAlpha(this.palette.rimLight, 0.08);
      ctx.fillRect(x, y, width, 0.8);
      return;
    }
    const glow = ctx.createLinearGradient(x, y, x, y + height);
    glow.addColorStop(0, shade(window.colour, 0.25));
    glow.addColorStop(1, shade(window.colour, -0.12));
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, width, height);
    if (window.figure) {
      ctx.fillStyle = withAlpha('#2a1a14', 0.55);
      ctx.beginPath();
      ctx.arc(x + width / 2, y + 3, 0.9, 0, Math.PI * 2);
      ctx.fillRect(x + width / 2 - 1.1, y + 3.8, 2.2, height - 3.8);
      ctx.fill();
    }
    ctx.fillStyle = withAlpha('#000000', 0.25);
    ctx.fillRect(x, y + height * 0.55, width, 0.35);
  }

  private planRooftops(rng: Rng) {
    this.buildings.forEach((building, index) => {
      if (this.occupied.includes(index) || building.width < 20) return;
      const roofX = (share: number) => building.x + 4 + (building.width - 8) * share;
      if (rng.chance(this.kit.antennas)) {
        this.rooftops.antennas.push({
          x: roofX(rng.float(0.1, 0.9)),
          y: building.top - rng.float(9, 16),
          roof: building.top,
        });
      }
      if (rng.chance(this.kit.chimneys))
        this.rooftops.chimneys.push({ x: roofX(rng.float(0.1, 0.9)), y: building.top - 4 });
      if (rng.chance(this.kit.flags))
        this.rooftops.flags.push({ x: roofX(rng.float(0.2, 0.8)), y: building.top - 13 });
    });
  }

  private paintRooftopProps() {
    const ctx = this.ctx;
    const propRng = createRng(this.propSeed);
    this.buildings.forEach((building, index) => {
      if (this.occupied.includes(index) || building.width < 20) return;
      const colour = shade(this.facades[index]?.colour ?? '#444', -0.3);
      const prop = propRng.pick(this.kit.props);
      if (building.width >= PROP_MIN_WIDTH[prop] && propRng.chance(this.kit.propChance)) {
        paintRoofProp(ctx, prop, building, colour, propRng);
      }
      ctx.fillStyle = colour;
      const boxes = propRng.int(0, 2);
      for (let box = 0; box < boxes; box++) {
        ctx.fillRect(building.x + 3 + propRng.float(0, building.width - 9), building.top - 2, 3, 2);
      }
    });
    for (const antenna of this.rooftops.antennas) {
      ctx.fillStyle = withAlpha('#1a1420', 0.9);
      ctx.fillRect(antenna.x - 0.25, antenna.y, 0.5, antenna.roof - antenna.y);
    }
    for (const chimney of this.rooftops.chimneys) {
      ctx.fillStyle = '#2a1e24';
      ctx.fillRect(chimney.x - 1.2, chimney.y, 2.4, 4.2);
    }
    for (const flag of this.rooftops.flags) {
      ctx.fillStyle = '#cfc6cc';
      ctx.fillRect(flag.x - 0.2, flag.y, 0.4, 13);
    }
  }

  private carveCrater(crater: Circle) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const scorch = ctx.createRadialGradient(
      crater.x,
      crater.y,
      crater.radius,
      crater.x,
      crater.y,
      crater.radius + 4.5,
    );
    scorch.addColorStop(0, 'rgba(20, 10, 6, 0.95)');
    scorch.addColorStop(0.35, 'rgba(30, 16, 10, 0.6)');
    scorch.addColorStop(1, 'rgba(30, 16, 10, 0)');
    ctx.fillStyle = scorch;
    ctx.beginPath();
    ctx.arc(crater.x, crater.y, crater.radius + 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(crater.x, crater.y, crater.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private carveCut(cut: Rect) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(20, 10, 6, 0.7)';
    ctx.fillRect(cut.x - 1.5, cut.y, cut.width + 3, cut.height + 1.8);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(cut.x, cut.y - 20, cut.width, cut.height + 20);
    ctx.restore();
  }
}
