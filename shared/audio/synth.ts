/**
 * A patch is a recipe for one voice: a wave source, an optional filter and a
 * volume envelope. Sound effects are one patch or a few layered together.
 */
export interface Patch {
  wave: OscillatorType | 'noise';
  /** Starting pitch in Hz. Music overrides it with the note being played. */
  frequency?: number;
  /** Slides the pitch to frequency × glideTo over the note (0.5 = down an octave). */
  glideTo?: number;
  detuneCents?: number;
  envelope?: Partial<Envelope>;
  filter?: {
    type: BiquadFilterType;
    frequency: number;
    q?: number;
    /** Slides the cutoff to frequency × sweepTo over the note. */
    sweepTo?: number;
  };
  /** Peak level, 0..1. */
  gain?: number;
  /** Seconds the note is held before its release. Sound effects set this; music uses note length. */
  duration?: number;
}

export type Sound = Patch | readonly Patch[];

export interface Envelope {
  attack: number;
  decay: number;
  /** Level held after the decay, as a fraction of the peak. */
  sustain: number;
  release: number;
}

export interface EnvelopePoint {
  time: number;
  value: number;
}

const DEFAULT_ENVELOPE: Envelope = { attack: 0.005, decay: 0.08, sustain: 0.6, release: 0.12 };

// Exponential ramps cannot reach zero, so silence is "very quiet" instead.
const SILENT = 0.0001;

export function resolveEnvelope(partial: Partial<Envelope> = {}): Envelope {
  return { ...DEFAULT_ENVELOPE, ...partial };
}

/**
 * The volume curve of one note as time/value points: rise to the peak, fall
 * to the sustain level, hold, then release to silence.
 */
export function envelopePoints(
  envelope: Envelope,
  start: number,
  holdSeconds: number,
  peak: number,
): EnvelopePoint[] {
  const attackEnd = start + envelope.attack;
  const decayEnd = attackEnd + envelope.decay;
  const releaseStart = Math.max(decayEnd, start + holdSeconds);
  const sustainLevel = Math.max(SILENT, peak * envelope.sustain);
  return [
    { time: start, value: SILENT },
    { time: attackEnd, value: Math.max(SILENT, peak) },
    { time: decayEnd, value: sustainLevel },
    { time: releaseStart, value: sustainLevel },
    { time: releaseStart + envelope.release, value: SILENT },
  ];
}

export interface VoiceOptions {
  when: number;
  frequency?: number;
  /** Seconds before release; defaults to the patch duration. */
  hold?: number;
  /** Scales the patch gain, 0..1. */
  velocity?: number;
}

/** Schedules one patch on the context and returns when it will be silent. */
export function playPatch(
  context: BaseAudioContext,
  destination: AudioNode,
  patch: Patch,
  noise: AudioBuffer,
  { when, frequency = patch.frequency ?? 440, hold, velocity = 1 }: VoiceOptions,
): number {
  const envelope = resolveEnvelope(patch.envelope);
  const holdSeconds = hold ?? patch.duration ?? envelope.attack + envelope.decay;
  const points = envelopePoints(envelope, when, holdSeconds, (patch.gain ?? 0.5) * velocity);
  const end = points.at(-1)?.time ?? when;

  const amplifier = context.createGain();
  amplifier.gain.setValueAtTime(SILENT, when);
  for (const point of points.slice(1)) {
    amplifier.gain.exponentialRampToValueAtTime(point.value, point.time);
  }

  const source = createSource(context, patch, noise, frequency, when, end);
  let output: AudioNode = source;
  if (patch.filter) {
    const filter = context.createBiquadFilter();
    filter.type = patch.filter.type;
    filter.Q.value = patch.filter.q ?? 1;
    filter.frequency.setValueAtTime(patch.filter.frequency, when);
    if (patch.filter.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        patch.filter.frequency * patch.filter.sweepTo,
        end,
      );
    }
    output.connect(filter);
    output = filter;
  }
  output.connect(amplifier);
  amplifier.connect(destination);

  source.start(when);
  source.stop(end + 0.02);
  source.onended = () => amplifier.disconnect();
  return end;
}

function createSource(
  context: BaseAudioContext,
  patch: Patch,
  noise: AudioBuffer,
  frequency: number,
  when: number,
  end: number,
): AudioScheduledSourceNode {
  const glide = (pitch: AudioParam, start: number) => {
    pitch.setValueAtTime(start, when);
    if (patch.glideTo !== undefined) pitch.exponentialRampToValueAtTime(start * patch.glideTo, end);
  };

  if (patch.wave === 'noise') {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    // For noise, "pitch" becomes playback speed: lower sounds rumblier.
    glide(source.playbackRate, frequency / 440);
    return source;
  }

  const oscillator = context.createOscillator();
  oscillator.type = patch.wave;
  oscillator.detune.value = patch.detuneCents ?? 0;
  glide(oscillator.frequency, frequency);
  return oscillator;
}

export function createNoiseBuffer(context: BaseAudioContext, seconds = 1): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * seconds),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}
