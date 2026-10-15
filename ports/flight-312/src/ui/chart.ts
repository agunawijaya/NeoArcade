import { AIRPORTS } from '../data/airport-data';
import { LAKES, LAND } from '../data/geography-data';
import type { Flight } from '../engine/flight';
import { STATIONS } from '../engine/navdata';
import { windAt } from '../engine/weather';
import { REGION_BOUNDS } from '../world/landuse';
import { h } from './dom';

/**
 * The en-route chart: drawn the way an IFR chart of the day was drawn —
 * pale paper, the coastlines and lakes, each VOR with its compass rose and
 * a box with its name, frequency and identifier, the airports — without
 * copying any publisher's look. Over it, the planned route, the track
 * flown so far, the wind at the cruising level, and the aircraft. Drag to
 * pan, wheel or pinch to zoom.
 */
const INK = '#1f4d6b';
const PAPER = '#f4f1e6';
const WATER = '#cfe2e6';
const LAND_TINT = '#ece7d6';
const ROUTE = '#7a2f7d';
const TRACK = '#c4442c';

export class EnRouteChart {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private centre = { lat: 41.5, lon: -78 };
  private scale = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  /** One finger drags the chart; two pinch it, from where they were when the gesture began. */
  private gesture: {
    x: number;
    y: number;
    lat: number;
    lon: number;
    spread: number;
    scale: number;
  } | null = null;

  constructor(
    private flight: Flight,
    close: () => void,
  ) {
    this.canvas = h('canvas', { class: 'chart-canvas', 'aria-label': 'En-route chart' });
    this.element = h(
      'div',
      { class: 'overlay chart-overlay', role: 'dialog', 'aria-label': 'En-route chart' },
      this.canvas,
      h('button', { type: 'button', class: 'primary chart-close', onclick: close }, 'Close chart'),
      h(
        'p',
        { class: 'chart-legend' },
        h('span', { class: 'legend-route' }, 'planned route'),
        h('span', { class: 'legend-track' }, 'flown'),
        h(
          'span',
          { class: 'legend-wind' },
          `winds at FL${Math.round(windsAltitude(flight) / 1000) * 10}`,
        ),
        'Drag to move; wheel or pinch to zoom.',
      ),
    );
    const here = flight.readout.position;
    this.centre = { ...here };
    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.startGesture();
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.moveGesture();
    });
    const lift = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      this.startGesture();
    };
    this.canvas.addEventListener('pointerup', lift);
    this.canvas.addEventListener('pointercancel', lift);
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoomTo(this.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2));
      },
      { passive: false },
    );
  }

  private startGesture() {
    const [first, second] = [...this.pointers.values()];
    if (!first) {
      this.gesture = null;
      return;
    }
    this.gesture = {
      x: first.x,
      y: first.y,
      lat: this.centre.lat,
      lon: this.centre.lon,
      spread: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
      scale: this.scale,
    };
  }

  private moveGesture() {
    const gesture = this.gesture;
    const [first, second] = [...this.pointers.values()];
    if (!gesture || !first) return;
    if (second && gesture.spread > 0) {
      const spread = Math.hypot(second.x - first.x, second.y - first.y);
      this.zoomTo(gesture.scale * (spread / gesture.spread));
      return;
    }
    const perPixel = this.degreesPerPixel();
    this.centre = {
      lat: gesture.lat + (first.y - gesture.y) * perPixel,
      lon:
        gesture.lon -
        ((first.x - gesture.x) * perPixel) / Math.cos((this.centre.lat * Math.PI) / 180),
    };
    this.draw();
  }

  private zoomTo(scale: number) {
    this.scale = Math.min(8, Math.max(0.5, scale));
    this.draw();
  }

  /** The rose shrinks on a small screen so the stations keep apart. */
  private roseRadius() {
    const height = this.canvas.clientHeight || 600;
    return Math.min(38, Math.max(18, height * 0.042)) * Math.min(1.6, this.scale);
  }

  private degreesPerPixel() {
    const height = this.canvas.clientHeight || 600;
    return 6 / this.scale / height;
  }

  private project(lat: number, lon: number): [number, number] {
    const width = this.canvas.width / devicePixelRatio;
    const height = this.canvas.height / devicePixelRatio;
    const perPixel = this.degreesPerPixel();
    const cos = Math.cos((this.centre.lat * Math.PI) / 180);
    return [
      width / 2 + ((lon - this.centre.lon) * cos) / perPixel,
      height / 2 - (lat - this.centre.lat) / perPixel,
    ];
  }

  draw() {
    const ratio = devicePixelRatio || 1;
    const width = this.canvas.clientWidth || innerWidth;
    const height = this.canvas.clientHeight || innerHeight;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = WATER;
    context.fillRect(0, 0, width, height);
    const ring = (points: number[]) => {
      context.beginPath();
      for (let index = 0; index < points.length; index += 2) {
        const [x, y] = this.project(points[index + 1] as number, points[index] as number);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
    };
    context.fillStyle = LAND_TINT;
    for (const land of LAND) {
      ring(land);
      context.fill();
    }
    context.fillStyle = WATER;
    for (const lake of LAKES) {
      ring(lake.ring);
      context.fill();
    }
    context.strokeStyle = 'rgba(31, 77, 107, 0.35)';
    context.lineWidth = 0.8;
    for (const land of LAND) {
      ring(land);
      context.stroke();
    }
    this.drawGraticule(context, width, height);
    this.drawRoute(context);
    for (const station of STATIONS) this.drawStation(context, station);
    for (const airport of AIRPORTS) {
      const [x, y] = this.project(airport.lat, airport.lon);
      context.fillStyle = INK;
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PAPER;
      context.fillRect(x - 3.5, y - 0.8, 7, 1.6);
      context.fillStyle = INK;
      context.font = '600 11px system-ui, sans-serif';
      context.textAlign = 'left';
      context.fillText(airport.ident, x + 8, y + 12);
    }
    this.drawWinds(context, width, height);
    this.drawAircraft(context);
  }

  private drawGraticule(context: CanvasRenderingContext2D, width: number, height: number) {
    context.strokeStyle = 'rgba(31, 77, 107, 0.12)';
    context.lineWidth = 1;
    for (let lat = Math.floor(REGION_BOUNDS.south); lat <= REGION_BOUNDS.north; lat++) {
      const [, y] = this.project(lat, this.centre.lon);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    for (let lon = Math.floor(REGION_BOUNDS.west); lon <= REGION_BOUNDS.east; lon++) {
      const [x] = this.project(this.centre.lat, lon);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  private drawStation(context: CanvasRenderingContext2D, station: (typeof STATIONS)[number]) {
    const [x, y] = this.project(station.position.lat, station.position.lon);
    const radius = this.roseRadius();
    context.strokeStyle = INK;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    // The rose is laid to magnetic north.
    for (let degrees = 0; degrees < 360; degrees += 10) {
      const angle = ((degrees + station.variation - 90) * Math.PI) / 180;
      const inner = degrees % 30 === 0 ? radius * 0.82 : radius * 0.9;
      context.beginPath();
      context.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      context.stroke();
    }
    const north = ((station.variation - 90) * Math.PI) / 180;
    context.beginPath();
    context.moveTo(x + Math.cos(north) * radius, y + Math.sin(north) * radius);
    context.lineTo(x + Math.cos(north) * (radius + 8), y + Math.sin(north) * (radius + 8));
    context.stroke();
    context.beginPath();
    context.moveTo(x, y - 6);
    for (let corner = 1; corner <= 6; corner++) {
      const angle = (corner * Math.PI) / 3 - Math.PI / 2;
      context.lineTo(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
    }
    context.stroke();
    const label = `${station.name.toUpperCase()}  ${station.frequency.toFixed(1)}  ${station.ident}`;
    const fontSize = radius < 30 ? 9 : 10.5;
    context.font = `600 ${fontSize}px system-ui, sans-serif`;
    const boxWidth = context.measureText(label).width + 10;
    const boxHeight = fontSize + 5.5;
    context.fillStyle = PAPER;
    context.fillRect(x - boxWidth / 2, y + radius + 6, boxWidth, boxHeight);
    context.strokeRect(x - boxWidth / 2, y + radius + 6, boxWidth, boxHeight);
    context.fillStyle = INK;
    context.textAlign = 'center';
    context.fillText(label, x, y + radius + 6 + boxHeight * 0.75);
  }

  private drawRoute(context: CanvasRenderingContext2D) {
    const plan = this.flight.plan;
    const start = this.flight.world.departure.threshold;
    context.strokeStyle = ROUTE;
    context.lineWidth = 2;
    context.setLineDash([10, 6]);
    context.beginPath();
    let [x, y] = this.project(start.lat, start.lon);
    context.moveTo(x, y);
    for (const leg of plan.legs) {
      [x, y] = this.project(leg.station.position.lat, leg.station.position.lon);
      context.lineTo(x, y);
    }
    const end = this.flight.world.ils.runway.threshold;
    [x, y] = this.project(end.lat, end.lon);
    context.lineTo(x, y);
    context.stroke();
    context.setLineDash([]);
    context.strokeStyle = TRACK;
    context.lineWidth = 2.5;
    context.beginPath();
    this.flight.track.forEach((point, index) => {
      const [px, py] = this.project(point.position.lat, point.position.lon);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.stroke();
  }

  /** Arrows flying with the wind, each with its direction and speed, every few inches of chart. */
  private drawWinds(context: CanvasRenderingContext2D, width: number, height: number) {
    const altitude = windsAltitude(this.flight);
    for (let gx = 140; gx < width; gx += 280) {
      for (let gy = 120; gy < height; gy += 240) {
        const perPixel = this.degreesPerPixel();
        const lat = this.centre.lat + (height / 2 - gy) * perPixel;
        const lon =
          this.centre.lon +
          ((gx - width / 2) * perPixel) / Math.cos((this.centre.lat * Math.PI) / 180);
        const wind = windAt(this.flight.world.weather, { lat, lon }, altitude);
        const toward = ((wind.direction + 180 - 90) * Math.PI) / 180;
        const length = 14 + Math.min(36, wind.speedKt * 0.3);
        const tipX = gx + Math.cos(toward) * length;
        const tipY = gy + Math.sin(toward) * length;
        context.strokeStyle = 'rgba(31, 77, 107, 0.45)';
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(gx, gy);
        context.lineTo(tipX, tipY);
        for (const side of [-1, 1]) {
          const back = toward + Math.PI + side * 0.45;
          context.moveTo(tipX, tipY);
          context.lineTo(tipX + Math.cos(back) * 7, tipY + Math.sin(back) * 7);
        }
        context.stroke();
        context.fillStyle = 'rgba(31, 77, 107, 0.6)';
        context.font = '10px system-ui, sans-serif';
        context.textAlign = 'center';
        const from = String(Math.round(wind.direction / 10) * 10 || 360).padStart(3, '0');
        context.fillText(`${from}/${Math.round(wind.speedKt)}`, gx, gy - 8);
      }
    }
  }

  private drawAircraft(context: CanvasRenderingContext2D) {
    const r = this.flight.readout;
    const [x, y] = this.project(r.position.lat, r.position.lon);
    context.save();
    context.translate(x, y);
    context.rotate((r.headingTrue * Math.PI) / 180);
    context.fillStyle = TRACK;
    context.beginPath();
    context.moveTo(0, -12);
    context.lineTo(3, -2);
    context.lineTo(12, 3);
    context.lineTo(3, 3);
    context.lineTo(2, 9);
    context.lineTo(5, 12);
    context.lineTo(-5, 12);
    context.lineTo(-2, 9);
    context.lineTo(-3, 3);
    context.lineTo(-12, 3);
    context.lineTo(-3, -2);
    context.closePath();
    context.fill();
    context.restore();
  }
}

/** The chart shows the winds at the cruise level, or wherever the aircraft is above it. */
function windsAltitude(flight: Flight): number {
  return Math.max(flight.plan.cruiseAltitudeFt, flight.readout.altitudeFt);
}
