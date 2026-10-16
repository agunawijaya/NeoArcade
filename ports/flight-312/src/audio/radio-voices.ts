import type { Transmission } from '../engine/atc';
import type { Controller } from '../engine/phraseology';
import type { Callout } from '../engine/warnings';
import type { SpeakingRate } from '../settings';
import type { Soundscape } from './soundscape';

/**
 * The voices on the radio, through the browser's speech synthesis. Only
 * voices that live on this device are used (`localService`): some browsers
 * offer "online" voices that send the text to a server, and those are
 * never chosen. Each controller gets a voice and a pitch of its own, the
 * first officer another; the radio's key click and squelch frame every
 * call. Speech only renders what the engine already decided and timed:
 * if it runs late, the next call waits its turn, and nothing it does can
 * change the flight. With no local English voice the game falls back to
 * subtitles and clicks, and says so once.
 */
const ORDER: Controller[] = [
  'clearance',
  'tower',
  'departure',
  'center',
  'approach',
  'arrivalTower',
  'firstOfficer',
  'captain',
];
const PITCH: Record<Controller, number> = {
  clearance: 1.0,
  tower: 1.12,
  departure: 0.9,
  center: 0.82,
  approach: 1.05,
  arrivalTower: 1.18,
  firstOfficer: 0.95,
  captain: 0.88,
};
const RATE: Record<SpeakingRate, number> = { slow: 0.92, normal: 1.08, fast: 1.25 };
/** The flight instructor speaks in the cockpit, a little slower than the radio, in a voice of their own. */
const INSTRUCTOR_PITCH = 1.0;
const INSTRUCTOR_RATE = 0.96;

/** What the GPWS says for each of its alerts and the height callouts. */
export function calloutWords(callout: Callout): string {
  const words: Record<string, string> = {
    pullUp: 'Whoop whoop, pull up',
    sinkRate: 'Sink rate',
    terrain: 'Terrain, terrain',
    dontSink: "Don't sink",
    tooLowGear: 'Too low, gear',
    tooLowFlaps: 'Too low, flaps',
    glideslope: 'Glideslope',
    minimums: 'Minimums',
    '1000': 'One thousand',
    '500': 'Five hundred',
    '100': 'One hundred',
    '50': 'Fifty',
    '40': 'Forty',
    '30': 'Thirty',
    '20': 'Twenty',
    '10': 'Ten',
  };
  return words[callout] ?? callout;
}

type Speaker = Controller | 'gpws' | 'instructor';

export class RadioVoices {
  private voices: SpeechSynthesisVoice[] = [];
  private queue: { text: string; speaker: Speaker }[] = [];
  private speaking = false;
  enabled = true;
  rate: SpeakingRate = 'normal';
  volume = 0.9;
  /** Called once if this device has no local English voice. */
  onNoVoices: (() => void) | null = null;
  private told = false;

  constructor(private sound: Soundscape) {
    if (!('speechSynthesis' in window)) return;
    const load = () => {
      this.voices = speechSynthesis
        .getVoices()
        .filter((voice) => voice.localService && /^en(-|_|$)/i.test(voice.lang));
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
  }

  get available(): boolean {
    return this.voices.length > 0;
  }

  private voiceFor(speaker: Speaker): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) return null;
    const index =
      speaker === 'gpws'
        ? this.voices.length - 1
        : speaker === 'instructor'
          ? ORDER.length
          : ORDER.indexOf(speaker);
    return this.voices[Math.max(0, index) % this.voices.length] ?? null;
  }

  say(transmission: Transmission) {
    if (!this.enabled || !transmission.heard || transmission.text.spoken === '') return;
    if (!this.available) {
      if (!this.told) {
        this.told = true;
        this.onNoVoices?.();
      }
      this.sound.play('radioKey');
      return;
    }
    this.queue.push({ text: transmission.text.spoken, speaker: transmission.speaker });
    this.next();
  }

  /** The flight instructor, beside you in the cockpit: no radio clicks, and always in turn. */
  instructor(text: string) {
    if (!this.enabled || !this.available) return;
    this.queue.push({ text, speaker: 'instructor' });
    this.next();
  }

  /** The GPWS interrupts whatever is being said: it is the one voice that must be heard now. */
  callout(callout: Callout) {
    if (!this.enabled || !this.available) return;
    const urgent = callout === 'pullUp' || callout === 'terrain';
    if (urgent) {
      speechSynthesis.cancel();
      this.queue = this.queue.filter((item) => item.speaker !== 'gpws');
      this.speaking = false;
    }
    this.queue.unshift({ text: calloutWords(callout), speaker: 'gpws' });
    this.next();
  }

  private next() {
    if (this.speaking) return;
    const item = this.queue.shift();
    if (!item) return;
    this.speaking = true;
    const utterance = new SpeechSynthesisUtterance(item.text);
    const voice = this.voiceFor(item.speaker);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-US';
    utterance.pitch =
      item.speaker === 'gpws'
        ? 0.6
        : item.speaker === 'instructor'
          ? INSTRUCTOR_PITCH
          : PITCH[item.speaker];
    utterance.rate =
      item.speaker === 'gpws'
        ? 1.1
        : RATE[this.rate] * (item.speaker === 'instructor' ? INSTRUCTOR_RATE : 1);
    utterance.volume = this.volume;
    const radio = item.speaker !== 'gpws' && item.speaker !== 'instructor';
    utterance.onstart = () => {
      if (radio) this.sound.play('radioKey');
    };
    const done = () => {
      if (radio) this.sound.play('squelch');
      this.speaking = false;
      this.next();
    };
    utterance.onend = done;
    utterance.onerror = done;
    speechSynthesis.speak(utterance);
  }

  /** Paused or left: the radio goes quiet. */
  silence() {
    this.queue = [];
    this.speaking = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  get busy(): boolean {
    return this.speaking || this.queue.length > 0;
  }
}
