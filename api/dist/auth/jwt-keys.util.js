"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadJwtKeysFromEnv = loadJwtKeysFromEnv;
exports.resolveActiveJwtKey = resolveActiveJwtKey;
exports.resolveVerificationKeys = resolveVerificationKeys;
const common_1 = require("@nestjs/common");
const DEFAULT_KID = 'default';
function loadJwtKeysFromEnv(rawJson, fallbackSecret) {
    if (rawJson && rawJson.trim().length > 0) {
        try {
            const parsed = JSON.parse(rawJson);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                throw new common_1.BadRequestException('JWT_SECRETS_JSON must be a non-empty array.');
            }
            const normalized = parsed.map((item) => ({
                kid: item.kid?.trim() || DEFAULT_KID,
                secret: item.secret?.trim() || '',
            }));
            if (normalized.some((k) => !k.secret)) {
                throw new common_1.BadRequestException('Each JWT key entry must contain a non-empty secret.');
            }
            return normalized;
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('JWT_SECRETS_JSON is not valid JSON.');
        }
    }
    if (process.env.NODE_ENV === 'production' && !fallbackSecret?.trim()) {
        throw new common_1.BadRequestException('Explicit JWT keys are required in production.');
    }
    const secret = (fallbackSecret ?? '').trim() || 'erp360-dev-secret-change-me';
    return [{ kid: DEFAULT_KID, secret }];
}
function resolveActiveJwtKey(keys, activeKid) {
    const requestedKid = (activeKid ?? '').trim();
    if (!requestedKid) {
        return keys[0];
    }
    const selected = keys.find((key) => key.kid === requestedKid);
    if (!selected) {
        throw new common_1.BadRequestException(`JWT_ACTIVE_KID '${requestedKid}' was not found in JWT key set.`);
    }
    return selected;
}
function resolveVerificationKeys(keys, tokenKid) {
    const kid = (tokenKid ?? '').trim();
    if (!kid) {
        return keys;
    }
    const selected = keys.find((key) => key.kid === kid);
    return selected ? [selected, ...keys.filter((key) => key.kid !== kid)] : keys;
}
//# sourceMappingURL=jwt-keys.util.js.map