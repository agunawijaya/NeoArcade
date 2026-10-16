import { label, line, pad3, screen, type Context, type DisplayColours } from './glass-kit';
import type { MapPoint, NdData } from './glass-model';
import {
  aircraftTriangle,
  compass,
  headingBox,
  headingBug,
  lubber,
  navaid,
  smallAircraft,
  waypointStar,
  type Frame,
} from './nd-symbols';

/**
 * The glass deck's navigation display. MAP is the -400's expanded mode,
 * track up: the compass arc ahead, the aircraft near the bottom, the route
 * in magenta with its waypoints, the navaids, the runway, the range arcs.
 * VOR and APP turn it into a full rose, heading up, with the course pointer
 * and its deviation bar, and in APP the glideslope beside it. The ground
 * speed, true airspeed and wind sit top left; the active waypoint or the
 * radio top right.
 */
const MAP = { cy: 0.84, radius: 0.66 } as const;
const ROSE = { cy: 0.53, radius: 0.36 } as const;
const DOT = 0.06;
/** The extended centreline drawn out from the runway, nautical miles. */
const CENTRELINE_NM = 14;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const wrap = (degrees: number) => (((degrees % 360) + 540) % 360) - 180;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function drawNd(
  context: Context,
  x: number,
  y: number,
  size: number,
  nd: NdData,
  colours: DisplayColours,
) {
  const frame: Frame = { x, y, s: size };
  screen(context, x, y, size, size, colours, () => {
    if (nd.mode === 'map') drawMap(context, frame, nd, colours);
    else drawRose(context, frame, nd, colours);
    drawSpeedsAndWind(context, frame, nd, colours);
    if (nd.mode === 'map') drawActiveWaypoint(context, frame, nd, colours);
    else drawRadioData(context, frame, nd, colours);
  });
}

function drawMap(context: Context, frame: Frame, nd: NdData, colours: DisplayColours) {
  const { s } = frame;
  const cx = frame.x + 0.5 * s;
  const cy = frame.y + MAP.cy * s;
  const radius = MAP.radius * s;
  const thin = Math.max(1, s * 0.0035);
  const perNm = radius / nd.range;
  // Track up: the map turns with the true track, the card with the magnetic one.
  const trackTrue = nd.track + nd.variation;
  const toScreen = (point: MapPoint): [number, number] => {
    const distance = Math.hypot(point.east, point.north) * perNm;
    const angle = Math.atan2(point.east, point.north) - radians(trackTrue);
    return [cx + Math.sin(angle) * distance, cy - Math.cos(angle) * distance];
  };

  context.save();
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.clip();
  drawRunway(
    context,
    nd,
    toScreen,
    perNm,
    trackTrue,
    colours,
    s,
    !nd.route.some((point) => point.ident.startsWith('RW')),
  );
  const routeIdents = new Set(nd.route.map((point) => point.ident));
  const routeSpots = nd.route.map(toScreen);
  for (const station of nd.stations) {
    if (routeIdents.has(station.ident)) continue;
    const [px, py] = toScreen(station);
    // A navaid under a waypoint would only blur both labels.
    if (routeSpots.some(([wx, wy]) => Math.hypot(wx - px, wy - py) < s * 0.04)) continue;
    navaid(context, px, py, s * 0.011, colours, Math.max(1, s * 0.003));
    label(context, station.ident, px + s * 0.018, py + s * 0.02, s * 0.027, colours.cyan, 'left');
  }
  if (nd.pending && nd.pending.length > 0) {
    context.setLineDash([s * 0.02, s * 0.014]);
    context.strokeStyle = colours.white;
    context.lineWidth = thin;
    context.beginPath();
    const start = nd.legFrom ? toScreen(nd.legFrom) : [cx, cy];
    context.moveTo(start[0] as number, start[1] as number);
    for (const point of nd.pending) context.lineTo(...toScreen(point));
    context.stroke();
    context.setLineDash([]);
  }
  // The active route is magenta all the way; only the waypoint it flies to is magenta among the stars.
  if (nd.route.length > 0) {
    context.strokeStyle = colours.magenta;
    context.lineWidth = Math.max(1.5, s * 0.006);
    context.beginPath();
    const start = nd.legFrom ? toScreen(nd.legFrom) : ([cx, cy] as [number, number]);
    context.moveTo(...start);
    for (const point of nd.route) context.lineTo(...toScreen(point));
    context.stroke();
  }
  for (const point of nd.route) {
    const [px, py] = toScreen(point);
    const colour = point.active ? colours.magenta : colours.white;
    waypointStar(context, px, py, s * 0.016, colour, Math.max(1, s * 0.0045));
    label(context, point.ident, px + s * 0.022, py - s * 0.012, s * 0.03, colour, 'left');
    // The crossing altitudes only while there is room to read them.
    if (
      nd.range <= 40 &&
      point.approach &&
      point.altitudeFt !== null &&
      !point.ident.startsWith('RW')
    )
      label(
        context,
        String(point.altitudeFt),
        px + s * 0.022,
        py + s * 0.018,
        s * 0.024,
        colours.white,
        'left',
      );
  }
  context.restore();

  // Range arcs: half range dashed with its number; the full range is the compass itself.
  context.setLineDash([s * 0.012, s * 0.012]);
  context.strokeStyle = colours.white;
  context.lineWidth = thin;
  context.beginPath();
  context.arc(cx, cy, radius / 2, radians(-90 - 70), radians(-90 + 70));
  context.stroke();
  context.setLineDash([]);
  const halfRange = nd.range / 2;
  label(
    context,
    String(Number.isInteger(halfRange) ? halfRange : halfRange.toFixed(1)),
    cx + Math.sin(radians(-62)) * (radius / 2) - s * 0.02,
    cy - Math.cos(radians(-62)) * (radius / 2),
    s * 0.03,
    colours.white,
    'right',
  );

  context.strokeStyle = colours.white;
  context.lineWidth = thin;
  context.beginPath();
  context.arc(cx, cy, radius, radians(-90 - 62), radians(-90 + 62));
  context.stroke();
  compass(context, cx, cy, radius, nd.track, s, colours, 62);
  lubber(context, cx, cy - radius, s, colours);
  // The track line, straight ahead, with a mark at half range.
  line(context, cx, cy - s * 0.04, cx, cy - radius, colours.white, thin);
  line(
    context,
    cx - s * 0.012,
    cy - radius / 2,
    cx + s * 0.012,
    cy - radius / 2,
    colours.white,
    thin,
  );
  // The heading: a white triangle on the arc where the nose points.
  const heading = wrap(nd.heading - nd.track);
  context.save();
  context.translate(cx, cy);
  context.rotate(radians(heading));
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, s * 0.004);
  context.beginPath();
  context.moveTo(0, -radius + s * 0.002);
  context.lineTo(-s * 0.012, -radius + s * 0.03);
  context.lineTo(s * 0.012, -radius + s * 0.03);
  context.closePath();
  context.stroke();
  context.restore();
  const selected = clamp(wrap(nd.selectedHeading - nd.track), -62, 62);
  context.setLineDash([s * 0.016, s * 0.012]);
  const selectedEnd = radius - s * 0.03;
  line(
    context,
    cx,
    cy,
    cx + Math.sin(radians(selected)) * selectedEnd,
    cy - Math.cos(radians(selected)) * selectedEnd,
    colours.magenta,
    Math.max(1, s * 0.003),
  );
  context.setLineDash([]);
  headingBug(context, cx, cy, radius, selected, s, colours);
  headingBox(context, frame, 'TRK', nd.track, colours);
  aircraftTriangle(context, cx, cy, s, colours);
}

function drawRunway(
  context: Context,
  nd: NdData,
  toScreen: (point: MapPoint) => [number, number],
  perNm: number,
  trackTrue: number,
  colours: DisplayColours,
  s: number,
  named: boolean,
) {
  const runway = nd.runway;
  if (!runway) return;
  const [px, py] = toScreen(runway);
  const angle = radians(runway.headingTrue - trackTrue);
  const length = Math.max(runway.lengthNm * perNm, s * 0.012);
  const along = [Math.sin(angle), -Math.cos(angle)] as const;
  const across = [Math.cos(angle), Math.sin(angle)] as const;
  const half = Math.max(1.5, s * 0.004);
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, s * 0.003);
  context.beginPath();
  context.moveTo(px + across[0] * half, py + across[1] * half);
  context.lineTo(
    px + across[0] * half + along[0] * length,
    py + across[1] * half + along[1] * length,
  );
  context.lineTo(
    px - across[0] * half + along[0] * length,
    py - across[1] * half + along[1] * length,
  );
  context.lineTo(px - across[0] * half, py - across[1] * half);
  context.closePath();
  context.stroke();
  context.setLineDash([s * 0.014, s * 0.012]);
  const back = CENTRELINE_NM * perNm;
  line(
    context,
    px,
    py,
    px - along[0] * back,
    py - along[1] * back,
    colours.white,
    Math.max(1, s * 0.0025),
  );
  context.setLineDash([]);
  if (named)
    label(context, runway.ident, px + s * 0.02, py + s * 0.03, s * 0.027, colours.white, 'left');
}

/** VOR and APP: the full rose, heading up, the course pointer through the middle. */
function drawRose(context: Context, frame: Frame, nd: NdData, colours: DisplayColours) {
  const { s } = frame;
  const cx = frame.x + 0.5 * s;
  const cy = frame.y + ROSE.cy * s;
  const radius = ROSE.radius * s;
  const thin = Math.max(1, s * 0.0035);
  context.strokeStyle = colours.white;
  context.lineWidth = thin;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.stroke();
  compass(context, cx, cy, radius, nd.heading, s, colours, 180);
  lubber(context, cx, cy - radius, s, colours);
  const track = wrap(nd.track - nd.heading);
  line(
    context,
    cx + Math.sin(radians(track)) * (radius - s * 0.05),
    cy - Math.cos(radians(track)) * (radius - s * 0.05),
    cx + Math.sin(radians(track)) * radius,
    cy - Math.cos(radians(track)) * radius,
    colours.white,
    Math.max(1, s * 0.005),
  );
  headingBug(context, cx, cy, radius, wrap(nd.selectedHeading - nd.heading), s, colours);
  headingBox(context, frame, 'HDG', nd.heading, colours);

  const source =
    nd.mode === 'vor'
      ? nd.vor && { course: nd.vor.course, dots: nd.vor.deviationDots, toFrom: nd.vor.toFrom }
      : nd.ils && { course: nd.ils.course, dots: nd.ils.localizerDots ?? 0, toFrom: '' };
  if (source)
    drawCoursePointer(
      context,
      cx,
      cy,
      radius,
      wrap(source.course - nd.heading),
      source.dots,
      source.toFrom,
      s,
      colours,
    );
  else
    label(
      context,
      nd.mode === 'vor' ? 'VOR' : 'LOC',
      cx + radius * 0.5,
      cy - radius * 0.3,
      s * 0.04,
      colours.amber,
    );
  if (nd.mode === 'app') drawGlideslope(context, frame, nd, colours);
  smallAircraft(context, cx, cy, s, colours);
}

function drawCoursePointer(
  context: Context,
  cx: number,
  cy: number,
  radius: number,
  relative: number,
  dots: number,
  toFrom: string,
  s: number,
  colours: DisplayColours,
) {
  const width = Math.max(1.5, s * 0.007);
  const spacing = DOT * s;
  context.save();
  context.translate(cx, cy);
  context.rotate(radians(relative));
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, s * 0.0035);
  for (const dot of [-2, -1, 1, 2]) {
    context.beginPath();
    context.arc(dot * spacing, 0, s * 0.01, 0, Math.PI * 2);
    context.stroke();
  }
  // The arrow's head and tail stay on the course; the middle slides with the deviation.
  line(context, 0, -radius * 0.42, 0, -radius * 0.86, colours.magenta, width);
  line(context, 0, radius * 0.42, 0, radius * 0.86, colours.magenta, width);
  context.fillStyle = colours.magenta;
  context.beginPath();
  context.moveTo(0, -radius * 0.92);
  context.lineTo(-s * 0.02, -radius * 0.8);
  context.lineTo(s * 0.02, -radius * 0.8);
  context.closePath();
  context.fill();
  const bar = clamp(dots, -2.4, 2.4) * spacing;
  line(context, bar, -radius * 0.36, bar, radius * 0.36, colours.magenta, width);
  if (toFrom === 'TO' || toFrom === 'FROM') {
    const tip = toFrom === 'TO' ? -1 : 1;
    context.fillStyle = colours.white;
    context.beginPath();
    context.moveTo(s * 0.06, tip * radius * 0.28);
    context.lineTo(s * 0.045, tip * radius * 0.2);
    context.lineTo(s * 0.075, tip * radius * 0.2);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function drawGlideslope(context: Context, frame: Frame, nd: NdData, colours: DisplayColours) {
  const { s } = frame;
  const x = frame.x + 0.93 * s;
  const cy = frame.y + ROSE.cy * s;
  context.strokeStyle = colours.white;
  context.lineWidth = Math.max(1, s * 0.0035);
  for (const dot of [-2, -1, 1, 2]) {
    context.beginPath();
    context.arc(x, cy + dot * DOT * s, s * 0.01, 0, Math.PI * 2);
    context.stroke();
  }
  line(context, x - s * 0.018, cy, x + s * 0.018, cy, colours.white, Math.max(1, s * 0.004));
  const dots = nd.ils?.glideslopeDots ?? null;
  if (dots === null) {
    label(context, 'G/S', x, cy - s * 0.15, s * 0.03, colours.amber);
    return;
  }
  // Above the slope the beam is below: the diamond shows where to fly.
  const y = cy + clamp(dots, -2.3, 2.3) * DOT * s;
  const size = s * 0.018;
  context.fillStyle = colours.magenta;
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.75, y);
  context.lineTo(x, y + size);
  context.lineTo(x - size * 0.75, y);
  context.closePath();
  if (Math.abs(dots) > 2.3) {
    context.strokeStyle = colours.magenta;
    context.stroke();
  } else context.fill();
}

/** Top left: ground speed and true airspeed, the wind and its arrow. */
function drawSpeedsAndWind(context: Context, frame: Frame, nd: NdData, colours: DisplayColours) {
  const { s } = frame;
  const left = frame.x + 0.03 * s;
  const top = frame.y + 0.04 * s;
  label(context, 'GS', left, top, s * 0.03, colours.white, 'left');
  label(
    context,
    String(Math.round(nd.groundSpeed)),
    left + s * 0.045,
    top,
    s * 0.042,
    colours.white,
    'left',
  );
  label(context, 'TAS', left + s * 0.13, top, s * 0.03, colours.white, 'left');
  label(
    context,
    String(Math.round(nd.tas)),
    left + s * 0.19,
    top,
    s * 0.042,
    colours.white,
    'left',
  );
  // Below a hundred knots the wind is not worth reading, as on the real display.
  if (nd.tas < 100) return;
  label(
    context,
    `${pad3(nd.wind.from)}°/${Math.round(nd.wind.kt)}`,
    left,
    top + s * 0.045,
    s * 0.034,
    colours.white,
    'left',
  );
  const up = nd.mode === 'map' ? nd.track : nd.heading;
  const toward = radians(nd.wind.from + 180 - up);
  const ax = left + s * 0.04;
  const ay = top + s * 0.11;
  const length = s * 0.03;
  const dx = Math.sin(toward) * length;
  const dy = -Math.cos(toward) * length;
  const width = Math.max(1, s * 0.004);
  line(context, ax - dx, ay - dy, ax + dx, ay + dy, colours.white, width);
  const head = s * 0.012;
  const back = toward + Math.PI;
  for (const spread of [-0.5, 0.5]) {
    line(
      context,
      ax + dx,
      ay + dy,
      ax + dx + Math.sin(back + spread) * head,
      ay + dy - Math.cos(back + spread) * head,
      colours.white,
      width,
    );
  }
}

/** Top right in MAP: the waypoint LNAV flies to, when the aircraft gets there, and how far it is. */
function drawActiveWaypoint(context: Context, frame: Frame, nd: NdData, colours: DisplayColours) {
  const active = nd.active;
  if (!active) return;
  const { s } = frame;
  const right = frame.x + 0.97 * s;
  const top = frame.y + 0.04 * s;
  label(context, active.ident, right, top, s * 0.042, colours.magenta, 'right');
  const seconds = ((active.etaSeconds % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(seconds / 3600);
  const minutes = (seconds - hours * 3600) / 60;
  label(
    context,
    `${String(hours).padStart(2, '0')}${minutes.toFixed(1).padStart(4, '0')}`,
    right,
    top + s * 0.042,
    s * 0.034,
    colours.white,
    'right',
  );
  label(
    context,
    `${active.distanceNm.toFixed(1)} NM`,
    right,
    top + s * 0.082,
    s * 0.034,
    colours.white,
    'right',
  );
}

/** Top right in VOR and APP: which radio, its station, the course and the distance. */
function drawRadioData(context: Context, frame: Frame, nd: NdData, colours: DisplayColours) {
  const { s } = frame;
  const right = frame.x + 0.97 * s;
  const top = frame.y + 0.04 * s;
  const radio = nd.mode === 'vor' ? nd.vor : nd.ils;
  const name = nd.mode === 'vor' ? 'VOR L' : 'ILS';
  if (!radio) {
    label(context, name, right, top, s * 0.036, colours.amber, 'right');
    return;
  }
  label(context, `${name}  ${radio.ident}`, right, top, s * 0.036, colours.green, 'right');
  label(
    context,
    `CRS ${pad3(radio.course)}`,
    right,
    top + s * 0.042,
    s * 0.034,
    colours.white,
    'right',
  );
  if (radio.dme !== null)
    label(
      context,
      `DME ${radio.dme.toFixed(1)}`,
      right,
      top + s * 0.082,
      s * 0.034,
      colours.white,
      'right',
    );
}
