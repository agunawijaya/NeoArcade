import type { AudioMix } from '@shared/audio';
import { MAX_THROTTLE } from '../engine/constants';
import { climbFactor } from '../engine/trig';
import type { Plane, World } from '../engine/world';

/**
 * The sounds that never stop while a plane is up: the rotary engine,
 * blatting faster with the throttle and the speed, and the wind in the
 * wires, rising in a dive; at sea, the slow wash of the waves under it all,
 * louder low over the water and with the swell. They run on their own
 * audio graph (one-shot effects go through @shared/audio) and follow the
 * arcade's volume and mute.
 */
export class Soundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  /** Rotary engines fire in a pulse: an LFO on the engine's volume. */
  private pulse: OscillatorNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private seaGain: GainNode | null = null;

  constructor(private readonly mix: () => Readonly<AudioMix>) {}

  /** Audio may only start after a gesture; the page calls this on the first one. */
  unlock() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);

    this.engine = context.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 60;
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    const pulseDepth = context.createGain();
    pulseDepth.gain.value = 0.5;
    this.pulse = context.createOscillator();
    this.pulse.frequency.value = 9;
    const pulsed = context.createGain();
    pulsed.gain.value = 0.5;
    this.pulse.connect(pulseDepth).connect(pulsed.gain);
    this.engine.connect(this.engineFilter).connect(pulsed).connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engine.start();
    this.pulse.start();

    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noise.getChannelData(0);
    let seed = 1984;
    for (let index = 0; index < samples.length; index++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      samples[index] = (seed / 4294967296) * 2 - 1;
    }
    const wind = context.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.8;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // The sea: the same noise, low and dull, breathing in and out like waves on a shore.
    const sea = context.createBufferSource();
    sea.buffer = noise;
    sea.loop = true;
    sea.playbackRate.value = 0.7;
    const seaFilter = context.createBiquadFilter();
    seaFilter.type = 'lowpass';
    seaFilter.frequency.value = 380;
    const swell = context.createGain();
    swell.gain.value = 0.5;
    const waves = context.createOscillator();
    waves.frequency.value = 0.13;
    const waveDepth = context.createGain();
    waveDepth.gain.value = 0.45;
    waves.connect(waveDepth).connect(swell.gain);
    this.seaGain = context.createGain();
    this.seaGain.gain.value = 0;
    sea.connect(seaFilter).connect(swell).connect(this.seaGain).connect(this.master);
    sea.start();
    waves.start();
  }

  /**
   * Follows the listener's plane, once per display frame. With no plane
   * up (menus, pause, a wreck) everything fades out.
   */
  update(world: World | null, plane: Plane | null, paused: boolean) {
    const context = this.context;
    if (!context || !this.master) return;
    const now = context.currentTime;
    const mix = this.mix();
    const level = mix.muted ? 0 : mix.volume * mix.sfx;
    this.master.gain.setTargetAtTime(paused ? 0 : level * 0.5, now, 0.08);
    const flying =
      plane !== null &&
      world !== null &&
      (plane.state === 'flying' ||
        plane.state === 'stalled' ||
        plane.state === 'victory' ||
        plane.state === 'parked' ||
        plane.state === 'rolling');
    this.seaGain?.gain.setTargetAtTime(seaLevelOf(world, plane), now, 0.4);
    if (!flying || !plane || !world) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.15);
      this.windGain?.gain.setTargetAtTime(0, now, 0.2);
      return;
    }
    const throttle = plane.throttle / MAX_THROTTLE;
    const parked = plane.state === 'parked';
    const revs = parked ? 0.15 : 0.3 + throttle * 0.55 + Math.min(0.3, plane.speed / 40);
    this.engine?.frequency.setTargetAtTime(48 + revs * 70, now, 0.1);
    this.pulse?.frequency.setTargetAtTime(6 + revs * 18, now, 0.1);
    this.engineFilter?.frequency.setTargetAtTime(300 + revs * 900, now, 0.1);
    this.engineGain?.gain.setTargetAtTime(
      plane.state === 'stalled' ? 0.05 : 0.12 + revs * 0.12,
      now,
      0.1,
    );
    // Wind sings in the wires when the plane is fast and diving.
    const dive = Math.max(0, -climbFactor(plane.heading));
    const rush = parked ? 0 : Math.max(0, plane.speed - world.tuning.minSpeed) / 8 + dive * 0.5;
    this.windGain?.gain.setTargetAtTime(Math.min(0.35, rush * 0.25), now, 0.15);
    this.windFilter?.frequency.setTargetAtTime(500 + rush * 900, now, 0.15);
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }
}

/** How loud the sea is for a plane: louder the lower it is over open water, and the rougher the sea. */
function seaLevelOf(world: World | null, plane: Plane | null): number {
  const sea = world?.map.sea;
  if (!world || !sea || !plane || !world.terrain.isWater(plane.x)) return 0;
  const height = Math.max(0, plane.y - sea.level);
  const near = Math.max(0, 1 - height / 140);
  return (0.05 + near * 0.12) * (1 + world.rules.seaState * 0.35);
}
