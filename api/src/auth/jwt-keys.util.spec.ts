import { BadRequestException } from '@nestjs/common';
import {
  loadJwtKeysFromEnv,
  resolveActiveJwtKey,
  resolveVerificationKeys,
} from './jwt-keys.util';

describe('jwt-keys.util', () => {
  it('rejects the development fallback in production', () => {
    const old = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => loadJwtKeysFromEnv(undefined, undefined)).toThrow(
        BadRequestException,
      );
    } finally {
      if (old === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = old;
    }
  });

  it('rejects weak and development JWT secrets in production', () => {
    const old = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => loadJwtKeysFromEnv(undefined, 'short-secret')).toThrow(
        BadRequestException,
      );
      expect(() =>
        loadJwtKeysFromEnv(undefined, 'erp360-dev-secret-change-me'),
      ).toThrow(BadRequestException);
    } finally {
      if (old === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = old;
    }
  });

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
    expect(() => loadJwtKeysFromEnv('{invalid}', undefined)).toThrow(
      BadRequestException,
    );
  });

  it('rejects duplicate key identifiers', () => {
    expect(() =>
      loadJwtKeysFromEnv(
        JSON.stringify([
          { kid: 'duplicate', secret: 'secret-a' },
          { kid: 'duplicate', secret: 'secret-b' },
        ]),
        undefined,
      ),
    ).toThrow(BadRequestException);
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
