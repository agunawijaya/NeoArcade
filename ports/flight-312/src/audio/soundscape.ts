import type { AudioMix } from '@shared/audio';

/**
 * The flight deck's sound, synthesised: four fans spooling with N1 and
 * their turbines whining with N2, the rumble of thrust, the wind rising
 * with the speed, the runway under the wheels, the gear and flap motors,
 * the marker beacons at their real pitches and keying (outer 400 Hz in
 * dashes, middle 1,300 Hz dot-dash), the gear thumping into its locks, the stick
 * shaker, the gear horn, the takeoff configuration horn, the overspeed
 * clacker, the autopilot's disconnect wail, and the radio's key click,
 * static and squelch. It keeps to the arcade's one volume and mute.
 */
export interface SoundState {
  n1: number[];
  n2: number[];
  thrustShare: number;
  airspeedKt: number;
  rollingKt: number;
  gearMoving: boolean;
  flapsMoving: boolean;
  marker: 'outer' | 'middle' | null;
  stall: boolean;
  gearHorn: boolean;
  takeoffConfig: boolean;
  overspeed: boolean;
  radioBusy: boolean;
  trimming: boolean;
}

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  set(value: number, time?: number): void;
}

export class Soundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private fans: OscillatorNode[] = [];
  private turbines: OscillatorNode[] = [];
  private voices: Record<string, Voice> = {};
  private markerOscillator: OscillatorNode | null = null;
  private time = 0;
  private effects = 0.8;

  constructor(private mix: () => Readonly<AudioMix>) {}

  /** Audio may start only after a gesture; the game calls this on the first one. */
  unlock() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.engineBus = context.createGain();
    this.engineBus.connect(this.master);
    this.noise = this.makeNoise(context);
    for (let engine = 0; engine < 4; engine++) {
      const fan = context.createOscillator();
      fan.type = 'sawtooth';
      fan.detune.value = engine * 7 - 10;
      const turbine = context.createOscillator();
      turbine.type = 'sine';
      const fanGain = context.createGain();
      fanGain.gain.value = 0.012;
      const turbineGain = context.createGain();
      turbineGain.gain.value = 0.004;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      fan.connect(filter).connect(fanGain).connect(this.engineBus);
      turbine.connect(turbineGain).connect(this.engineBus);
      fan.start();
      turbine.start();
      this.fans.push(fan);
      this.turbines.push(turbine);
    }
    this.voices.rumble = this.noiseVoice('lowpass', 180, this.engineBus);
    this.voices.wind = this.noiseVoice('bandpass', 900, this.master);
    this.voices.runway = this.noiseVoice('lowpass', 90, this.master);
    this.voices.motor = this.toneVoice('triangle', 115);
    this.voices.shaker = this.noiseVoice('bandpass', 60, this.master);
    this.voices.gearHorn = this.toneVoice('square', 250);
    this.voices.configHorn = this.toneVoice('square', 520);
    this.voices.clacker = this.noiseVoice('highpass', 2500, this.master);
    this.voices.static = this.noiseVoice('bandpass', 2200, this.master);
    this.voices.trim = this.noiseVoice('highpass', 4000, this.master);
    const marker = this.toneVoice('sine', 400);
    this.markerOscillator = marker.source as OscillatorNode;
    this.voices.marker = marker;
  }

  setEffectsVolume(volume: number) {
    this.effects = volume;
  }

  private makeNoise(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 312;
    for (let index = 0; index < data.length; index++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      data[index] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  private noiseVoice(type: BiquadFilterType, frequency: number, destination: AudioNode): Voice {
    const context = this.context as AudioContext;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(destination);
    source.start();
    return {
      source,
      gain,
      set: (value, time = 0.08) => gain.gain.setTargetAtTime(value, context.currentTime, time),
    };
  }

  private toneVoice(type: OscillatorType, frequency: number): Voice {
    const context = this.context as AudioContext;
    const source = context.createOscillator();
    source.type = type;
    source.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.master as GainNode);
    source.start();
    return {
      source,
      gain,
      set: (value, time = 0.02) => gain.gain.setTargetAtTime(value, context.currentTime, time),
    };
  }

  update(state: SoundState, dt: number) {
    const context = this.context;
    if (!context || !this.master || !this.engineBus) return;
    this.time += dt;
    const mix = this.mix();
    this.master.gain.setTargetAtTime(
      mix.muted ? 0 : mix.volume * mix.sfx * this.effects,
      context.currentTime,
      0.05,
    );
    const duck = state.radioBusy ? 0.55 : 1;
    this.engineBus.gain.setTargetAtTime(duck, context.currentTime, 0.2);
    state.n1.forEach((n1, index) => {
      this.fans[index]?.frequency.setTargetAtTime(30 + n1 * 2.6, context.currentTime, 0.2);
      this.turbines[index]?.frequency.setTargetAtTime(
        900 + (state.n2[index] ?? 0) * 34,
        context.currentTime,
        0.2,
      );
    });
    const v = this.voices;
    v.rumble?.set(0.05 + state.thrustShare * 0.22);
    v.wind?.set(Math.min(0.35, (state.airspeedKt / 380) ** 2 * 0.35) * duck);
    v.runway?.set(Math.min(0.4, state.rollingKt / 160) * 0.4);
    v.motor?.set(state.gearMoving || state.flapsMoving ? 0.03 : 0);
    v.shaker?.set(state.stall && Math.sin(this.time * 2 * Math.PI * 18) > 0 ? 0.5 : 0, 0.005);
    v.gearHorn?.set(state.gearHorn ? 0.06 : 0);
    v.configHorn?.set(state.takeoffConfig && this.time % 0.6 < 0.35 ? 0.06 : 0);
    v.clacker?.set(state.overspeed && this.time % 0.125 < 0.03 ? 0.3 : 0, 0.002);
    v.static?.set(state.radioBusy ? 0.025 : 0, 0.1);
    v.trim?.set(state.trimming && this.time % 0.25 < 0.04 ? 0.08 : 0, 0.004);
    this.keyMarker(state.marker);
  }

  /** The marker tones, keyed as the beacons key them. */
  private keyMarker(marker: SoundState['marker']) {
    const oscillator = this.markerOscillator;
    const voice = this.voices.marker;
    if (!oscillator || !voice || !this.context) return;
    if (marker === null) {
      voice.set(0);
      return;
    }
    if (marker === 'outer') {
      oscillator.frequency.value = 400;
      voice.set(this.time % 0.5 < 0.375 ? 0.07 : 0, 0.004);
    } else {
      oscillator.frequency.value = 1300;
      // Dot, dash, repeating: a 0.12 s dot, a 0.5 s dash, with gaps.
      const phase = this.time % 0.9;
      voice.set(phase < 0.12 || (phase > 0.25 && phase < 0.75) ? 0.07 : 0, 0.004);
    }
  }

  /** A short sound: the touchdown, the gear locking, the autopilot letting go, the radio's key. */
  play(effect: 'touchdown' | 'gearLock' | 'disconnect' | 'radioKey' | 'squelch' | 'click') {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.noise) return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(master);
    if (effect === 'disconnect') {
      const siren = context.createOscillator();
      siren.type = 'sawtooth';
      siren.frequency.setValueAtTime(600, now);
      for (let cycle = 0; cycle < 3; cycle++) {
        siren.frequency.linearRampToValueAtTime(1200, now + cycle * 0.5 + 0.25);
        siren.frequency.linearRampToValueAtTime(600, now + cycle * 0.5 + 0.5);
      }
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.setValueAtTime(0, now + 1.5);
      siren.connect(gain);
      siren.start(now);
      siren.stop(now + 1.6);
      return;
    }
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    const shape = {
      touchdown: { type: 'lowpass' as BiquadFilterType, frequency: 140, level: 0.9, length: 0.35 },
      gearLock: { type: 'lowpass' as BiquadFilterType, frequency: 300, level: 0.5, length: 0.12 },
      radioKey: {
        type: 'bandpass' as BiquadFilterType,
        frequency: 2600,
        level: 0.18,
        length: 0.09,
      },
      squelch: { type: 'bandpass' as BiquadFilterType, frequency: 1800, level: 0.16, length: 0.22 },
      click: { type: 'highpass' as BiquadFilterType, frequency: 3000, level: 0.2, length: 0.02 },
    }[effect];
    filter.type = shape.type;
    filter.frequency.value = shape.frequency;
    gain.gain.setValueAtTime(shape.level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + shape.length);
    source.connect(filter).connect(gain);
    source.start(now, Math.random() * 1.5);
    source.stop(now + shape.length + 0.02);
  }

  suspend() {
    void this.context?.suspend();
  }

  resume() {
    void this.context?.resume();
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }
}
