import { describe, expect, it } from 'vitest';
import { FLAP_DETENTS } from './aircraft';
import {
  COMM_BAND,
  flapLeverDegrees,
  moveFlapLever,
  moveSpeedbrake,
  NAV_BAND,
  nudgeLevers,
  setFlapDegrees,
  setLevers,
  setReverse,
  speedbrakeDemand,
  startPanel,
  swapComm,
  turnFrequency,
} from './panel';

describe('the panel at the gate', () => {
  it('starts with the levers closed, gear down, the parking brake set and the flaps up', () => {
    const panel = startPanel();
    expect(panel.levers).toEqual([0, 0, 0, 0]);
    expect(panel.reverse).toEqual([0, 0, 0, 0]);
    expect(panel.gearDown).toBe(true);
    expect(panel.parkingBrake).toBe(true);
    expect(panel.speedbrake).toBe('down');
    expect(flapLeverDegrees(panel)).toBe(0);
    expect(panel.altimeterInHg).toBe(29.92);
  });

  it('takes the settings a flight starts with', () => {
    const panel = startPanel({ comm: 121.9, headingBug: 88, parkingBrake: false });
    expect(panel.comm).toBe(121.9);
    expect(panel.headingBug).toBe(88);
    expect(panel.parkingBrake).toBe(false);
  });
});

describe('the thrust levers', () => {
  it('move together and stop at idle and full', () => {
    const panel = startPanel();
    setLevers(panel, 1.4);
    expect(panel.levers).toEqual([1, 1, 1, 1]);
    nudgeLevers(panel, -0.25);
    expect(panel.levers).toEqual([0.75, 0.75, 0.75, 0.75]);
    nudgeLevers(panel, -2);
    expect(panel.levers).toEqual([0, 0, 0, 0]);
  });

  it('close the forward levers when the reversers come up', () => {
    const panel = startPanel();
    setLevers(panel, 0.6);
    setReverse(panel, 0);
    expect(panel.levers).toEqual([0.6, 0.6, 0.6, 0.6]);
    setReverse(panel, 3);
    expect(panel.reverse).toEqual([1, 1, 1, 1]);
    expect(panel.levers).toEqual([0, 0, 0, 0]);
  });
});

describe('the flap lever', () => {
  it('steps through the detents 1, 5, 10, 20, 25 and 30, and stops at each end', () => {
    const panel = startPanel();
    const seen = [flapLeverDegrees(panel)];
    for (let step = 0; step < FLAP_DETENTS.length + 2; step++) {
      moveFlapLever(panel, 1);
      seen.push(flapLeverDegrees(panel));
    }
    expect(seen).toEqual([0, 1, 5, 10, 20, 25, 30, 30, 30, 30]);
    moveFlapLever(panel, -20);
    expect(flapLeverDegrees(panel)).toBe(0);
  });

  it('goes straight to a detent, and ignores a setting between them', () => {
    const panel = startPanel();
    setFlapDegrees(panel, 20);
    expect(flapLeverDegrees(panel)).toBe(20);
    setFlapDegrees(panel, 15);
    expect(flapLeverDegrees(panel)).toBe(20);
  });
});

describe('the speedbrake lever', () => {
  it('moves down, armed, flight detent and up, and no further', () => {
    const panel = startPanel();
    const seen = [panel.speedbrake];
    for (let step = 0; step < 4; step++) {
      moveSpeedbrake(panel, 1);
      seen.push(panel.speedbrake);
    }
    expect(seen).toEqual(['down', 'armed', 'flight', 'up', 'up']);
    moveSpeedbrake(panel, -9);
    expect(panel.speedbrake).toBe('down');
  });

  it('raises the panels halfway in the flight detent and fully up', () => {
    expect(speedbrakeDemand('down')).toBe(0);
    expect(speedbrakeDemand('armed')).toBe(0);
    expect(speedbrakeDemand('flight')).toBe(0.5);
    expect(speedbrakeDemand('up')).toBe(1);
  });
});

describe('the radio heads', () => {
  const nav = (frequency: number, clicks: number) =>
    turnFrequency(frequency, NAV_BAND.low, NAV_BAND.high, NAV_BAND.step, clicks);
  const comm = (frequency: number, clicks: number) =>
    turnFrequency(frequency, COMM_BAND.low, COMM_BAND.high, COMM_BAND.step, clicks);

  it('turns in 50 kHz clicks, a megahertz every twenty', () => {
    expect(nav(109.5, 1)).toBe(109.55);
    expect(nav(109.5, 20)).toBe(110.5);
    expect(comm(118.85, -3)).toBe(118.7);
  });

  it('wraps round the ends of each band', () => {
    expect(nav(117.95, 1)).toBe(108);
    expect(nav(108, -1)).toBe(117.95);
    expect(comm(135.95, 1)).toBe(118);
    expect(comm(118, -1)).toBe(135.95);
  });

  it('swaps the active and standby frequencies', () => {
    const panel = startPanel({ comm: 118.85, commStandby: 124.35 });
    swapComm(panel);
    expect([panel.comm, panel.commStandby]).toEqual([124.35, 118.85]);
  });
});
