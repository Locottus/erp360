import { BadRequestException } from '@nestjs/common';

export type JwtKey = {
  kid: string;
  secret: string;
};

const DEFAULT_KID = 'default';
const DEVELOPMENT_FALLBACK_SECRET = 'erp360-dev-secret-change-me';
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

export function loadJwtKeysFromEnv(
  rawJson: string | undefined,
  fallbackSecret: string | undefined,
): JwtKey[] {
  if (rawJson && rawJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawJson) as Array<{
        kid?: string;
        secret?: string;
      }>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new BadRequestException(
          'JWT_SECRETS_JSON must be a non-empty array.',
        );
      }
      const normalized = parsed.map((item) => ({
        kid: item.kid?.trim() || DEFAULT_KID,
        secret: item.secret?.trim() || '',
      }));
      if (normalized.some((k) => !k.secret)) {
        throw new BadRequestException(
          'Each JWT key entry must contain a non-empty secret.',
        );
      }
      const kids = new Set(normalized.map((key) => key.kid));
      if (kids.size !== normalized.length) {
        throw new BadRequestException(
          'Each JWT key entry must use a unique kid.',
        );
      }
      assertProductionSecrets(normalized);
      return normalized;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('JWT_SECRETS_JSON is not valid JSON.');
    }
  }

  if (process.env.NODE_ENV === 'production' && !fallbackSecret?.trim()) {
    throw new BadRequestException(
      'Explicit JWT keys are required in production.',
    );
  }
  const secret = (fallbackSecret ?? '').trim() || DEVELOPMENT_FALLBACK_SECRET;
  const keys = [{ kid: DEFAULT_KID, secret }];
  assertProductionSecrets(keys);
  return keys;
}

export function resolveActiveJwtKey(
  keys: JwtKey[],
  activeKid: string | undefined,
): JwtKey {
  const requestedKid = (activeKid ?? '').trim();
  if (!requestedKid) {
    return keys[0];
  }
  const selected = keys.find((key) => key.kid === requestedKid);
  if (!selected) {
    throw new BadRequestException(
      `JWT_ACTIVE_KID '${requestedKid}' was not found in JWT key set.`,
    );
  }
  return selected;
}

export function resolveVerificationKeys(
  keys: JwtKey[],
  tokenKid: string | undefined,
): JwtKey[] {
  const kid = (tokenKid ?? '').trim();
  if (!kid) {
    return keys;
  }
  const selected = keys.find((key) => key.kid === kid);
  return selected ? [selected, ...keys.filter((key) => key.kid !== kid)] : keys;
}

function assertProductionSecrets(keys: JwtKey[]) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  if (
    keys.some(
      (key) =>
        key.secret === DEVELOPMENT_FALLBACK_SECRET ||
        key.secret.length < MINIMUM_PRODUCTION_SECRET_LENGTH,
    )
  ) {
    throw new BadRequestException(
      `JWT secrets must be at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters in production and cannot use the development fallback.`,
    );
  }
}
