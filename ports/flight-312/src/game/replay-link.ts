import { RECORDING_VERSION, type Recording } from '../engine/recording';
import { decodeRecording, encodeRecording, RecordingError } from '../engine/recording-codec';

/**
 * A replay as text, for a link or the saved list: a few words about where
 * it came from, then the recording's bytes, deflated and written in
 * base64url. A challenge link is `#r=` and that text; the hash never
 * leaves the browser, and the one who opens it flies the same flight again
 * from the setup and the inputs, so the score it shows is worked out on
 * their own machine, not taken on trust.
 */
export type ReplayKind = 'flight' | 'takeoff' | 'approach' | 'daily' | 'lesson';

export interface ReplayMeta {
  kind: ReplayKind;
  /** The Daily Approach's number, or the lesson's id. */
  daily?: number;
  lesson?: string;
  /** Only when the one who shares it typed one. */
  nickname?: string;
}

export interface PackedReplay {
  meta: ReplayMeta;
  recording: Recording;
}

export const NICKNAME_LIMIT = 16;
/** Longer than this, a link is unkind to the chat it is pasted into: the replay stays saved instead. */
export const LINK_LIMIT = 24_000;

export async function packReplay(replay: PackedReplay): Promise<string> {
  const meta = new TextEncoder().encode(JSON.stringify(cleanMeta(replay.meta)));
  const recording = encodeRecording(replay.recording);
  const whole = new Uint8Array(2 + meta.length + recording.length);
  new DataView(whole.buffer).setUint16(0, meta.length);
  whole.set(meta, 2);
  whole.set(recording, 2 + meta.length);
  return toBase64Url(await squeeze(whole, 'compress'));
}

export async function unpackReplay(text: string): Promise<PackedReplay> {
  const packed = fromBase64Url(text.trim());
  if (!packed) throw new RecordingError('That link is damaged.');
  let whole: Uint8Array;
  try {
    whole = await squeeze(packed, 'decompress');
  } catch {
    throw new RecordingError('That link is damaged.');
  }
  if (whole.length < 2) throw new RecordingError('That link is damaged.');
  const metaLength = new DataView(whole.buffer, whole.byteOffset).getUint16(0);
  let meta: ReplayMeta;
  try {
    meta = JSON.parse(new TextDecoder().decode(whole.subarray(2, 2 + metaLength))) as ReplayMeta;
  } catch {
    throw new RecordingError('That link is damaged.');
  }
  const recording = decodeRecording(whole.subarray(2 + metaLength));
  if (recording.version !== RECORDING_VERSION)
    throw new RecordingError('That flight was recorded by another version of Flight 312.');
  return { meta: cleanMeta(meta), recording };
}

/** Only what the link is meant to carry, and a nickname that cannot hide or reorder text. */
function cleanMeta(meta: ReplayMeta): ReplayMeta {
  const kinds: ReplayKind[] = ['flight', 'takeoff', 'approach', 'daily', 'lesson'];
  const clean: ReplayMeta = { kind: kinds.includes(meta.kind) ? meta.kind : 'approach' };
  if (typeof meta.daily === 'number' && Number.isInteger(meta.daily)) clean.daily = meta.daily;
  if (typeof meta.lesson === 'string' && /^[a-z0-9-]{1,40}$/.test(meta.lesson))
    clean.lesson = meta.lesson;
  const nickname = cleanNickname(meta.nickname ?? null);
  if (nickname) clean.nickname = nickname;
  return clean;
}

export function cleanNickname(name: string | null): string | null {
  if (!name) return null;
  const printable = name
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = [...printable].slice(0, NICKNAME_LIMIT).join('');
  return clipped.length > 0 ? clipped : null;
}

export function replayUrl(packed: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = `r=${packed}`;
  return url.toString();
}

/** The `#r=` of the address, if a challenge brought the player here. */
export function linkedReplay(): string | null {
  const match = /(?:^#|&)r=([A-Za-z0-9_-]+)/.exec(location.hash);
  return match?.[1] ?? null;
}

async function squeeze(bytes: Uint8Array, way: 'compress' | 'decompress'): Promise<Uint8Array> {
  const stream =
    way === 'compress'
      ? new CompressionStream('deflate-raw')
      : new DecompressionStream('deflate-raw');
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
