import { levelForXp, rankForLevel, type Rank } from './levels';
import { loadProfile, type Profile } from './profile';

/**
 * Backups move a profile to another browser without any server: either a
 * text code to copy and paste, or a JSON file to download. The code is the
 * profile as base64url with a checksum, so a truncated paste is caught
 * before it can replace anything.
 *
 *   NEOPASS1.<base64url JSON>.<FNV-1a checksum>
 */
export const BACKUP_FORMAT = 'neoarcade-pass';
const CODE_PREFIX = 'NEOPASS1';

export function encodeBackupCode(profile: Profile): string {
  const payload = toBase64Url(JSON.stringify(profile));
  return `${CODE_PREFIX}.${payload}.${checksum(payload)}`;
}

export function backupFileText(profile: Profile, exportedAt: Date): string {
  return JSON.stringify(
    { format: BACKUP_FORMAT, exportedAt: exportedAt.toISOString(), profile },
    null,
    2,
  );
}

export function backupFileName(profile: Profile, exportedAt: Date): string {
  const name = profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `arcade-pass-${name || 'player'}-${exportedAt.toISOString().slice(0, 10)}.json`;
}

export type BackupReading =
  { ok: true; profile: Profile; exportedAt: string | null } | { ok: false; problem: string };

/** Reads a pasted code or the text of a backup file, and says politely what is wrong if it can't. */
export function readBackup(text: string, now: Date): BackupReading {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, problem: 'Paste a backup code or choose a backup file first.' };

  const unwrapped = trimmed.startsWith('{') ? fromFile(trimmed) : fromCode(trimmed);
  if (!unwrapped.ok) return unwrapped;

  const loaded = loadProfile(unwrapped.raw, now);
  if (loaded.status === 'newer-version') {
    return {
      ok: false,
      problem: 'This backup comes from a newer version of NeoArcade, so it can’t be read here yet.',
    };
  }
  if (loaded.status === 'unreadable') return notAPass();
  return { ok: true, profile: loaded.profile, exportedAt: unwrapped.exportedAt };
}

export interface BackupSummary {
  name: string;
  level: number;
  rank: Rank;
  xp: number;
  badges: number;
  games: number;
  createdAt: string;
}

export function summariseProfile(profile: Profile): BackupSummary {
  const level = levelForXp(profile.xp);
  const records = Object.values(profile.games);
  return {
    name: profile.name,
    level,
    rank: rankForLevel(level),
    xp: profile.xp,
    badges: records.reduce((total, record) => total + Object.keys(record.badges).length, 0),
    games: records.length,
    createdAt: profile.createdAt,
  };
}

type Unwrapped =
  { ok: true; raw: unknown; exportedAt: string | null } | { ok: false; problem: string };

function fromFile(text: string): Unwrapped {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'This file isn’t valid JSON. Is it the file the Pass saved?' };
  }
  if (typeof parsed === 'object' && parsed !== null && 'format' in parsed) {
    const file = parsed as { format: unknown; exportedAt?: unknown; profile?: unknown };
    if (file.format !== BACKUP_FORMAT) return notAPass();
    return {
      ok: true,
      raw: file.profile,
      exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null,
    };
  }
  // A bare profile, e.g. copied straight out of localStorage.
  return { ok: true, raw: parsed, exportedAt: null };
}

function fromCode(text: string): Unwrapped {
  const code = text.replace(/\s+/g, '');
  const [prefix, payload, sum, ...rest] = code.split('.');
  if (!prefix?.startsWith('NEOPASS')) return notAPass();
  if (prefix !== CODE_PREFIX) {
    return {
      ok: false,
      problem: 'This code comes from a newer version of NeoArcade, so it can’t be read here yet.',
    };
  }
  if (!payload || !sum || rest.length > 0 || checksum(payload) !== sum) {
    return {
      ok: false,
      problem:
        'This code looks incomplete or mistyped. Copy it again, all of it, and paste once more.',
    };
  }
  try {
    return { ok: true, raw: JSON.parse(fromBase64Url(payload)), exportedAt: null };
  } catch {
    return notAPass();
  }
}

function notAPass(): { ok: false; problem: string } {
  return { ok: false, problem: 'This isn’t an Arcade Pass backup.' };
}

function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toBase64Url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}
