import { STREET_Y } from '../engine/constants';
import type { Circle } from '../engine/geometry';
import type { Building } from '../engine/skyline';
import { droneAt, NO_HAZARDS, type Hazards } from '../engine/twists';
import type { VisibleArea } from './backdrop';
import { shade, withAlpha } from './palette';

/**
 * How the World Tour's twists look. The engine decides everything; this
 * only shows it, as plainly as it can: the drone's whole patrol line, the
 * jet stream's own wind written in the band, the dust devil's push drawn
 * as arrows, and the next lightning target marked a full throw ahead.
 */
const DRONE_SCREEN = '#ff3fa4';
const JET_COLOUR = '#8fe6ff';
const DEVIL_DUST = '#d9a070';
const WARNING = '#ffd23f';
const SPRING = '#7dffcf';
const BOLT_SECONDS = 0.45;

interface Strike {
  x: number;
  roof: number;
  age: number;
  points: { x: number; y: number }[];
}

export class HazardView {
  hazards: Hazards = NO_HAZARDS;
  /** Steps into the current throw, which is where the drone is on its patrol. */
  droneStep = 0;
  /** The building lightning will strike next, marked a throw ahead. */
  lightningTarget: number | null = null;
  hiddenWind = false;
  /** Where the dust devil is drawn; it glides to its new spot between throws. */
  private devilX: number | null = null;
  private strikeFx: Strike | null = null;
  private time = 0;

  constructor(private readonly buildings: () => readonly Building[]) {}

  show(hazards: Hazards, lightningTarget: number | null) {
    this.hazards = hazards;
    this.lightningTarget = lightningTarget;
    this.devilX ??= hazards.dustDevil?.x ?? null;
  }

  /** Starts the bolt; the crater itself is carved by the scene. */
  strike(building: number, crater: Circle) {
    const roof = this.buildings()[building]?.top ?? crater.y;
    const points = [{ x: crater.x + 30, y: -40 }];
    while ((points.at(-1)?.y ?? roof) < roof - 12) {
      const last = points.at(-1) ?? { x: crater.x, y: 0 };
      const towards = (crater.x - last.x) * 0.25;
      points.push({ x: last.x + towards + (Math.random() - 0.5) * 16, y: last.y + 18 });
    }
    points.push({ x: crater.x, y: roof });
    this.strikeFx = { x: crater.x, roof, age: 0, points };
  }

  update(delta: number) {
    this.time += delta;
    const devil = this.hazards.dustDevil;
    if (devil && this.devilX !== null) {
      this.devilX += (devil.x - this.devilX) * (1 - Math.exp(-delta * 2.5));
    }
    if (this.strikeFx) {
      this.strikeFx.age += delta;
      if (this.strikeFx.age > BOLT_SECONDS) this.strikeFx = null;
    }
  }

  /** How bright the sky should flash for a strike right now. */
  get flash(): number {
    return this.strikeFx ? Math.max(0, 1 - this.strikeFx.age / BOLT_SECONDS) * 0.6 : 0;
  }

  /** The jet stream and the heat haze sit in the sky, behind the city. */
  drawBehind(ctx: CanvasRenderingContext2D, area: VisibleArea, reducedMotion: boolean) {
    const band = this.hazards.jetStream;
    if (band) this.drawJetStream(ctx, area, band.top, band.bottom, band.wind, reducedMotion);
  }

  /** Everything that sits on or in front of the buildings. */
  drawFront(ctx: CanvasRenderingContext2D, area: VisibleArea, reducedMotion: boolean) {
    if (this.hiddenWind) this.drawHeatHaze(ctx, area, reducedMotion);
    if (this.hazards.bouncy) this.drawSpringyRoofs(ctx);
    if (this.hazards.dustDevil) this.drawDustDevil(ctx, reducedMotion);
    if (this.lightningTarget !== null) {
      this.drawLightningMark(ctx, this.lightningTarget, reducedMotion);
    }
    if (this.hazards.drone) this.drawDrone(ctx);
    if (this.strikeFx) this.drawBolt(ctx, this.strikeFx);
  }

  private drawJetStream(
    ctx: CanvasRenderingContext2D,
    area: VisibleArea,
    top: number,
    bottom: number,
    wind: number,
    reducedMotion: boolean,
  ) {
    const depth = bottom - top;
    const band = ctx.createLinearGradient(0, top, 0, bottom);
    band.addColorStop(0, withAlpha(JET_COLOUR, 0));
    band.addColorStop(0.5, withAlpha(JET_COLOUR, 0.13));
    band.addColorStop(1, withAlpha(JET_COLOUR, 0));
    ctx.fillStyle = band;
    ctx.fillRect(area.left, top, area.right - area.left, depth);

    // Streaks racing along with the band's wind; their speed is its strength.
    const direction = Math.sign(wind) || 1;
    const speed = reducedMotion ? 0 : Math.abs(wind) * 9;
    const span = area.right - area.left + 80;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let lane = 0; lane < 7; lane++) {
      const y = top + depth * ((lane + 0.5) / 7);
      for (let streak = 0; streak < 4; streak++) {
        const offset = (lane * 97 + streak * 211 + this.time * speed) % span;
        const x = direction > 0 ? area.left - 40 + offset : area.right + 40 - offset;
        const length = 10 + ((lane + streak) % 3) * 6;
        ctx.strokeStyle = withAlpha(JET_COLOUR, 0.28);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - direction * length, y);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.font = '600 7px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = withAlpha('#eafcff', 0.8);
    const label = `JET STREAM ${Math.abs(wind)} ${direction > 0 ? '→' : '←'}`;
    // Pinned to the left of the screen, so it stays readable while the camera pans.
    ctx.fillText(label, Math.max(14, area.left + 10), top + 7);
  }

  private drawHeatHaze(ctx: CanvasRenderingContext2D, area: VisibleArea, reducedMotion: boolean) {
    const drift = reducedMotion ? 0 : this.time;
    ctx.save();
    ctx.strokeStyle = withAlpha('#fff2d8', 0.07);
    ctx.lineWidth = 2.2;
    for (let row = 0; row < 9; row++) {
      const baseY = 150 + row * 20 - ((drift * 6) % 20);
      ctx.beginPath();
      for (let x = area.left; x <= area.right; x += 8) {
        const y = baseY + Math.sin(x * 0.05 + drift * 2 + row) * 2.2;
        if (x === area.left) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSpringyRoofs(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const building of this.buildings()) {
      ctx.fillStyle = withAlpha(SPRING, 0.55);
      ctx.fillRect(building.x + 0.5, building.top - 0.4, building.width, 0.9);
      // A spring coil at each end of the roof.
      ctx.strokeStyle = withAlpha(SPRING, 0.6);
      ctx.lineWidth = 0.5;
      for (const x of [building.x + 3, building.x + building.width - 3]) {
        ctx.beginPath();
        for (let turn = 0; turn <= 4; turn++) {
          const y = building.top + 1 + turn * 1.1;
          ctx.lineTo(x + (turn % 2 === 0 ? -1.2 : 1.2), y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawDustDevil(ctx: CanvasRenderingContext2D, reducedMotion: boolean) {
    const devil = this.hazards.dustDevil;
    if (!devil || this.devilX === null) return;
    const x = this.devilX;
    const height = STREET_Y - devil.top;
    const spin = reducedMotion ? 0 : this.time * 5;
    const lean = Math.sign(devil.push);

    // A soft funnel, wide at the top and thin at the ground.
    const funnel = ctx.createLinearGradient(0, devil.top, 0, STREET_Y);
    funnel.addColorStop(0, withAlpha(DEVIL_DUST, 0.12));
    funnel.addColorStop(0.5, withAlpha(DEVIL_DUST, 0.32));
    funnel.addColorStop(1, withAlpha(DEVIL_DUST, 0.5));
    ctx.fillStyle = funnel;
    ctx.beginPath();
    ctx.moveTo(x - devil.width / 2 + lean * 4, devil.top);
    ctx.quadraticCurveTo(x - 6, STREET_Y - height * 0.3, x - 2, STREET_Y);
    ctx.lineTo(x + 2, STREET_Y);
    ctx.quadraticCurveTo(x + 6, STREET_Y - height * 0.3, x + devil.width / 2 + lean * 4, devil.top);
    ctx.closePath();
    ctx.fill();

    // Bands of dust wound round the axis, and grains circling it, so it reads as spinning.
    ctx.strokeStyle = withAlpha(shade(DEVIL_DUST, 0.35), 0.5);
    ctx.lineWidth = 1.2;
    for (let band = 0; band < 7; band++) {
      const along = (band + 0.5) / 7;
      const y = STREET_Y - along * height;
      const radius = 2 + along * (devil.width / 2 - 2);
      const start = spin * (1.5 - along) + band;
      ctx.beginPath();
      ctx.ellipse(x + lean * along * 4, y, radius, 2 + along * 2, 0, start, start + Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.fillStyle = withAlpha(shade(DEVIL_DUST, 0.45), 0.8);
    for (let grain = 0; grain < 70; grain++) {
      const along = grain / 70;
      const y = STREET_Y - along * height;
      const radius = 2 + along * (devil.width / 2 - 2);
      const angle = spin * (1.5 - along) + grain * 2.4;
      ctx.fillRect(x + Math.cos(angle) * radius + lean * along * 4, y, 1.5, 1.5);
    }

    // Which way it shoves, drawn inside the column.
    ctx.strokeStyle = withAlpha('#fff2e0', 0.75);
    ctx.lineWidth = 0.9;
    for (const y of [devil.top + height * 0.25, devil.top + height * 0.55]) {
      const from = x - lean * 7;
      const to = x + lean * 7;
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to, y);
      ctx.moveTo(to - lean * 3, y - 2.5);
      ctx.lineTo(to, y);
      ctx.lineTo(to - lean * 3, y + 2.5);
      ctx.stroke();
    }
  }

  private drawLightningMark(ctx: CanvasRenderingContext2D, index: number, reducedMotion: boolean) {
    const building = this.buildings()[index];
    if (!building) return;
    const x = building.x + building.width / 2;
    const pulse = reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(this.time * 6);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = withAlpha(WARNING, 0.25 + 0.25 * pulse);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, building.top - 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(WARNING, 0.2 + 0.25 * pulse);
    ctx.fillRect(building.x, building.top - 1, building.width, 2);
    ctx.restore();

    // A warning sign with a bolt, hovering over the roof.
    const y = building.top - 12;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 6, y + 4);
    ctx.lineTo(x - 6, y + 4);
    ctx.closePath();
    ctx.fillStyle = WARNING;
    ctx.fill();
    ctx.strokeStyle = '#3a2800';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 0.8, y - 3);
    ctx.lineTo(x - 1.6, y + 0.8);
    ctx.lineTo(x + 0.2, y + 0.8);
    ctx.lineTo(x - 0.8, y + 3.4);
    ctx.lineTo(x + 1.8, y - 0.4);
    ctx.lineTo(x, y - 0.4);
    ctx.closePath();
    ctx.fillStyle = '#3a2800';
    ctx.fill();
  }

  private drawDrone(ctx: CanvasRenderingContext2D) {
    const drone = this.hazards.drone;
    if (!drone) return;
    // The patrol line, end to end, so its timing can be learned.
    ctx.save();
    ctx.setLineDash([1.5, 3]);
    ctx.strokeStyle = withAlpha(DRONE_SCREEN, 0.35);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(drone.from, drone.y);
    ctx.lineTo(drone.to, drone.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha(DRONE_SCREEN, 0.5);
    for (const end of [drone.from, drone.to]) ctx.fillRect(end - 0.6, drone.y - 3, 1.2, 6);
    ctx.restore();

    const body = droneAt(drone, this.droneStep);
    const { x, y, width, height } = body;
    // A soft neon glow, so the drone stands out from the billboards on the roofs.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(
      x + width / 2,
      y + height / 2,
      2,
      x + width / 2,
      y + height / 2,
      width * 0.9,
    );
    glow.addColorStop(0, withAlpha(DRONE_SCREEN, 0.45));
    glow.addColorStop(1, withAlpha(DRONE_SCREEN, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - width * 0.4, y - width * 0.6, width * 1.8, width * 1.8);
    ctx.restore();
    ctx.fillStyle = '#1c1826';
    for (const rotorX of [x + 3, x + width - 3]) {
      ctx.fillRect(rotorX - 0.4, y - 3, 0.8, 3);
      const blade = 4 * Math.cos(this.time * 40 + rotorX);
      ctx.fillRect(rotorX - Math.abs(blade), y - 3.6, Math.abs(blade) * 2, 0.7);
    }
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 1.5);
    ctx.fillStyle = '#231e30';
    ctx.fill();
    ctx.strokeStyle = DRONE_SCREEN;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // The billboard screen, scrolling its neon shapes.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1.5, y + 1.5, width - 3, height - 3);
    ctx.clip();
    ctx.fillStyle = '#12091a';
    ctx.fillRect(x, y, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const scroll = (this.time * 14) % 14;
    for (let bar = -1; bar < 3; bar++) {
      ctx.fillStyle = bar % 2 === 0 ? DRONE_SCREEN : '#3ff3ff';
      ctx.fillRect(x + 2 + bar * 14 - scroll + 14, y + 3, 8, 1.4);
      ctx.fillRect(x + 4 + bar * 14 - scroll + 14, y + 6, 5, 1.2);
    }
    ctx.restore();
    const blink = Math.sin(this.time * 8) > 0;
    ctx.fillStyle = blink ? '#ff4040' : '#40ff80';
    ctx.fillRect(x + width / 2 - 0.6, y + height, 1.2, 1.2);
  }

  private drawBolt(ctx: CanvasRenderingContext2D, strike: Strike) {
    const fade = 1 - strike.age / BOLT_SECONDS;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [width, alpha] of [
      [4, 0.25],
      [1.4, 1],
    ] as const) {
      ctx.strokeStyle = withAlpha('#e8eeff', alpha * fade);
      ctx.lineWidth = width;
      ctx.beginPath();
      strike.points.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}
