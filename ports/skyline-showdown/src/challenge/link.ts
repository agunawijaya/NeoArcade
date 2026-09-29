import type { PlayerIndex } from '../engine/gorillas';
import type { Held, TurnAim } from '../engine/match';
import { POWER_UP_KINDS, type PowerUpKind } from '../engine/powerups';
import { WORLD_IDS, type WorldChoice } from '../engine/worlds';

/**
 * A challenge link carries one shot and everything needed to set it up
 * again, packed into a few dozen bytes after `#c=` (ADR 0014). Nothing goes
 * to a server: the hash never leaves the browser.
 *
 * The round is rebuilt from where it came from (a Quick Match round's seed
 * and rules, a World Tour stage, a Trick Shot puzzle or a Daily Skyline),
 * then every throw made in it so far is thrown again, the last being the
 * challenger's. A nickname travels only if the challenger typed one.
 */
export type ChallengeSource =
  | {
      kind: 'quick';
      roundSeed: number;
      round: number;
      world: WorldChoice;
      powerUps: PowerUpKind[];
      /** Who threw first in the round, and what each side held when it began. */
      firstTurn: PlayerIndex;
      held: Held;
    }
  | { kind: 'tour'; stage: number; roundSeed: number; round: number; firstTurn: PlayerIndex }
  | { kind: 'trick'; puzzle: number }
  | { kind: 'daily'; day: number };

export interface Challenge {
  /** The engine version that made it (src/engine/version.ts). */
  version: number;
  source: ChallengeSource;
  /** The wind when the round began: a check that the round was rebuilt as it was. */
  wind: number;
  /** Every throw of the round in order; the last is the one to match. */
  throws: TurnAim[];
  nickname: string | null;
}

export type DecodeFailure = 'missing' | 'damaged';

export const NICKNAME_LIMIT = 16;
const KINDS = ['quick', 'tour', 'trick', 'daily'] as const;
const WORLD_CHOICES: readonly WorldChoice[] = [...WORLD_IDS, 'random'];
const HAS_NICKNAME = 0b100;
const FIRST_TURN = 0b1000;
const MAX_THROWS = 255;
const CHECKSUM_BYTES = 4;

export function encodeChallenge(challenge: Challenge): string {
  const bytes = new ByteWriter();
  const { source } = challenge;
  const nickname = cleanNickname(challenge.nickname);
  const firstTurn = 'firstTurn' in source ? source.firstTurn : 0;
  bytes.u8(challenge.version);
  bytes.u8(
    KINDS.indexOf(source.kind) | (nickname ? HAS_NICKNAME : 0) | (firstTurn ? FIRST_TURN : 0),
  );
  switch (source.kind) {
    case 'quick':
      bytes.u32(source.roundSeed);
      bytes.u8(source.round);
      bytes.u8(WORLD_CHOICES.indexOf(source.world));
      bytes.u8(
        POWER_UP_KINDS.reduce(
          (mask, kind, bit) => mask | (source.powerUps.includes(kind) ? 1 << bit : 0),
          0,
        ),
      );
      bytes.u8(heldCode(source.held[0]) | (heldCode(source.held[1]) << 3));
      break;
    case 'tour':
      bytes.u8(source.stage);
      bytes.u32(source.roundSeed);
      bytes.u8(source.round);
      break;
    case 'trick':
      bytes.u8(source.puzzle);
      break;
    case 'daily':
      bytes.u16(source.day);
      break;
  }
  bytes.i8(challenge.wind);
  const throws = challenge.throws.slice(-MAX_THROWS);
  bytes.u8(throws.length);
  for (const aim of throws) {
    bytes.u16(Math.round(Math.min(360, Math.max(0, aim.angle)) * 100));
    bytes.u16(Math.round(Math.min(360, Math.max(0, aim.velocity))) | (aim.usePowerUp ? 1 << 9 : 0));
  }
  if (nickname) {
    const text = new TextEncoder().encode(nickname);
    bytes.u8(text.length);
    text.forEach((byte) => bytes.u8(byte));
  }
  bytes.u32(checksum(bytes.bytes));
  return toBase64Url(bytes.bytes);
}

export function decodeChallenge(text: string | null): Challenge | DecodeFailure {
  if (!text) return 'missing';
  const raw = fromBase64Url(text);
  if (!raw || raw.length < 2 + CHECKSUM_BYTES) return 'damaged';
  const body = raw.subarray(0, raw.length - CHECKSUM_BYTES);
  const stored = new ByteReader(raw.subarray(body.length)).u32();
  if (stored !== checksum(body)) return 'damaged';
  try {
    return readChallenge(new ByteReader(body));
  } catch {
    return 'damaged';
  }
}

function readChallenge(bytes: ByteReader): Challenge {
  const version = bytes.u8();
  const flags = bytes.u8();
  const kind = KINDS[flags & 0b11];
  const firstTurn: PlayerIndex = flags & FIRST_TURN ? 1 : 0;
  let source: ChallengeSource;
  switch (kind) {
    case 'quick': {
      const roundSeed = bytes.u32();
      const round = bytes.u8();
      const world = WORLD_CHOICES[bytes.u8()];
      const mask = bytes.u8();
      const heldCodes = bytes.u8();
      if (!world) throw new RangeError('Unknown world.');
      source = {
        kind,
        roundSeed,
        round,
        world,
        powerUps: POWER_UP_KINDS.filter((_, bit) => mask & (1 << bit)),
        firstTurn,
        held: [heldKind(heldCodes & 0b111), heldKind(heldCodes >> 3)],
      };
      break;
    }
    case 'tour':
      source = { kind, stage: bytes.u8(), roundSeed: bytes.u32(), round: bytes.u8(), firstTurn };
      break;
    case 'trick':
      source = { kind, puzzle: bytes.u8() };
      break;
    default:
      source = { kind: 'daily', day: bytes.u16() };
  }
  const wind = bytes.i8();
  const count = bytes.u8();
  if (count === 0) throw new RangeError('A challenge needs a shot.');
  const throws: TurnAim[] = Array.from({ length: count }, () => {
    const angle = bytes.u16() / 100;
    const packed = bytes.u16();
    return { angle, velocity: packed & 0x1ff, usePowerUp: (packed & (1 << 9)) !== 0 };
  });
  let nickname: string | null = null;
  if (flags & HAS_NICKNAME) {
    const length = bytes.u8();
    nickname = cleanNickname(new TextDecoder('utf-8', { fatal: true }).decode(bytes.take(length)));
  }
  bytes.done();
  return { version, source, wind, throws, nickname };
}

/** A nickname as it may travel: printable, trimmed, and short. */
export function cleanNickname(name: string | null): string | null {
  if (!name) return null;
  // Control and formatting characters could hide or reorder text on the other end.
  const printable = name
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = [...printable].slice(0, NICKNAME_LIMIT).join('');
  return clipped.length > 0 ? clipped : null;
}

function heldCode(kind: PowerUpKind | null): number {
  return kind ? POWER_UP_KINDS.indexOf(kind) + 1 : 0;
}

function heldKind(code: number): PowerUpKind | null {
  if (code === 0) return null;
  const kind = POWER_UP_KINDS[code - 1];
  if (!kind) throw new RangeError('Unknown power-up.');
  return kind;
}

/** FNV-1a over the bytes: catches a link cut short or mistyped. */
function checksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

class ByteWriter {
  private readonly values: number[] = [];

  get bytes(): Uint8Array {
    return Uint8Array.from(this.values);
  }

  u8(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new RangeError(`${value} does not fit in a byte.`);
    }
    this.values.push(value);
  }

  i8(value: number) {
    this.u8(Math.max(-128, Math.min(127, Math.round(value))) & 0xff);
  }

  u16(value: number) {
    this.u8((value >>> 8) & 0xff);
    this.u8(value & 0xff);
  }

  u32(value: number) {
    this.u16((value >>> 16) & 0xffff);
    this.u16(value & 0xffff);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    const value = this.bytes[this.offset];
    if (value === undefined) throw new RangeError('The link ends too soon.');
    this.offset++;
    return value;
  }

  i8(): number {
    const value = this.u8();
    return value > 127 ? value - 256 : value;
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u16() << 16) | this.u16()) >>> 0;
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new RangeError('The link ends too soon.');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  /** Nothing may follow the last field. */
  done() {
    if (this.offset !== this.bytes.length) throw new RangeError('The link runs on too long.');
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk =
      ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const characters = Math.min(4, Math.ceil(((bytes.length - index) * 8) / 6));
    for (let character = 0; character < characters; character++) {
      text += ALPHABET[(chunk >> (18 - character * 6)) & 0x3f];
    }
  }
  return text;
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 4) {
    const group = text.slice(index, index + 4);
    let chunk = 0;
    for (let character = 0; character < 4; character++) {
      chunk =
        (chunk << 6) |
        (character < group.length ? ALPHABET.indexOf(group[character] as string) : 0);
    }
    const count = Math.floor((group.length * 6) / 8);
    for (let byte = 0; byte < count; byte++) bytes.push((chunk >> (16 - byte * 8)) & 0xff);
  }
  return Uint8Array.from(bytes);
}
