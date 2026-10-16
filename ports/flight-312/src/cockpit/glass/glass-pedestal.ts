import type { Flight } from '../../engine/flight';
import type { Region } from '../actions';
import { annunciator, counter, knob, roundRect, text, type Context } from '../canvas-kit';
import type { Palette } from '../palette';
import { drawParkingBrakeAndTrim, drawQuadrant } from '../pedestal';
import type { Cdu } from './cdu';
import type { DisplayColours } from './glass-kit';

/**
 * Looking down at the glass deck's pedestal: the captain's CDU, large
 * enough to read and to type into; the same throttle quadrant, speedbrake
 * and flap lever as the classic jumbo; the VHF radio tuning panel for the
 * controllers; the transponder; the parking brake and the trim. There are
 * no NAV radio heads: on this deck the VORs and the ILS are tuned through
 * the CDU's NAV RAD page.
 */
export function drawGlassPedestal(
  context: Context,
  flight: Flight,
  cdu: Cdu,
  width: number,
  height: number,
  palette: Palette,
  colours: DisplayColours,
  regions: Region[],
) {
  context.fillStyle = '#141516';
  context.fillRect(0, 0, width, height);
  const unit = Math.min(width / 160, height / 100);
  const ox = (width - unit * 160) / 2;
  const oy = (height - unit * 100) / 2;
  const u = (value: number) => value * unit;
  const X = (value: number) => ox + u(value);
  const Y = (value: number) => oy + u(value);

  context.fillStyle = palette.panelShade;
  roundRect(context, X(1), Y(1), u(57), u(98), u(3));
  context.fill();
  cdu.draw(context, X(3), Y(3), u(53), u(94), flight, colours, palette, regions);

  context.fillStyle = palette.panel;
  roundRect(context, X(60), Y(2), u(98), u(96), u(3));
  context.fill();
  // The quadrant is drawn in its own units, 34 to 126 across: here it sits right of the CDU.
  const shift = (value: number) => X(value + 27);
  drawQuadrant(context, flight.panel, shift, Y, u, palette, regions);
  drawRadioPanel(context, flight, X, Y, u, palette, regions);
  drawParkingBrakeAndTrim(context, flight, (value) => X(value + 1), Y, u, palette, regions);
}

/** VHF L on the radio tuning panel: the active and standby frequencies, the transfer key and the knobs. */
function drawRadioPanel(
  context: Context,
  flight: Flight,
  X: (value: number) => number,
  Y: (value: number) => number,
  u: (value: number) => number,
  palette: Palette,
  regions: Region[],
) {
  const panel = flight.panel;
  context.fillStyle = '#1a1b1d';
  roundRect(context, X(63), Y(60), u(66), u(19), u(1.5));
  context.fill();
  text(context, 'RADIO TUNING · VHF L', X(96), Y(62.5), u(2.2), palette.marking);
  text(context, 'ACTIVE', X(77), Y(65.5), u(1.8), palette.dim);
  text(context, 'STANDBY', X(115), Y(65.5), u(1.8), palette.dim);
  counter(context, X(66), Y(67), u(22), u(6), panel.comm.toFixed(3), '#9cf0a0');
  counter(context, X(104), Y(67), u(22), u(6), panel.commStandby.toFixed(3), '#9cf0a0');
  annunciator(context, X(90), Y(67.5), u(12), u(5), '⇄ TFR', false, palette.marking);
  regions.push({
    x: X(90),
    y: Y(67.5),
    width: u(12),
    height: u(5),
    label: 'VHF transfer',
    click: { kind: 'swapComm' },
  });
  knob(context, X(115), Y(76), u(2.6), 0);
  knob(context, X(115), Y(76), u(1.5), 45, '#3a3d41');
  regions.push({
    x: X(110),
    y: Y(73.5),
    width: u(5),
    height: u(5.5),
    label: 'VHF megahertz',
    knob: 'commWhole',
  });
  regions.push({
    x: X(115),
    y: Y(73.5),
    width: u(5),
    height: u(5.5),
    label: 'VHF kilohertz',
    knob: 'commFraction',
  });

  context.fillStyle = '#1a1b1d';
  roundRect(context, X(63), Y(80.5), u(66), u(16.5), u(1.5));
  context.fill();
  text(context, 'ATC / TCAS', X(96), Y(83), u(2.2), palette.marking);
  counter(context, X(84), Y(85.5), u(24), u(6.5), flight.atcContext.squawk, '#9cf0a0');
  text(context, 'TA/RA', X(96), Y(94.5), u(2), palette.dim);
}
