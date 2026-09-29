import { describe, expect, it } from 'vitest';
import { engineFingerprint } from './fingerprint';
import { compatibilityOf, ENGINE_VERSION, RULES_BY_VERSION, RULES_FINGERPRINT } from './version';

describe('the engine version', () => {
  it('still throws every banana exactly as its rules say', () => {
    // A change here means a change to the rules: bump them in version.ts
    // (ENGINE_VERSION and a new RULES_BY_VERSION entry), then pin the new fingerprint.
    expect(engineFingerprint()).toBe(RULES_FINGERPRINT);
  });

  it('knows the rules of every version up to this one', () => {
    expect(RULES_BY_VERSION).toHaveLength(ENGINE_VERSION);
    RULES_BY_VERSION.forEach((rules, index) => {
      expect(rules).toBeGreaterThanOrEqual(RULES_BY_VERSION[index - 1] ?? 1);
    });
  });

  it('tells a link from this engine, an older one and a newer one apart', () => {
    expect(compatibilityOf(ENGINE_VERSION)).toBe('current');
    expect(compatibilityOf(ENGINE_VERSION + 1)).toBe('newer');
  });
});
