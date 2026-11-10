import { BadRequestException } from '@nestjs/common';
import {
  loadJwtKeysFromEnv,
  resolveActiveJwtKey,
  resolveVerificationKeys,
} from './jwt-keys.util';

describe('jwt-keys.util', () => {
  it('loads fallback key when JSON config is absent', () => {
    const keys = loadJwtKeysFromEnv(undefined, 'fallback-secret');
    expect(keys).toEqual([{ kid: 'default', secret: 'fallback-secret' }]);
  });

  it('loads keys from JSON array config', () => {
    const keys = loadJwtKeysFromEnv(
      JSON.stringify([
        { kid: '2026-q4', secret: 'secret-a' },
        { kid: '2027-q1', secret: 'secret-b' },
      ]),
      undefined,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0].kid).toBe('2026-q4');
  });

  it('throws on invalid JSON config', () => {
    expect(() => loadJwtKeysFromEnv('{invalid}', undefined)).toThrow(BadRequestException);
  });

  it('resolves active key by kid', () => {
    const keys = [
      { kid: 'old', secret: 'a' },
      { kid: 'new', secret: 'b' },
    ];
    expect(resolveActiveJwtKey(keys, 'new').secret).toBe('b');
  });

  it('prioritizes verification by token kid', () => {
    const keys = [
      { kid: 'old', secret: 'a' },
      { kid: 'new', secret: 'b' },
    ];
    const ordered = resolveVerificationKeys(keys, 'new');
    expect(ordered[0].kid).toBe('new');
  });
});
