"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptApiKey = encryptApiKey;
exports.decryptApiKey = decryptApiKey;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
function encryptionKey() {
    const source = process.env.ASSISTANT_CREDENTIAL_KEY;
    if (!source || !/^[A-Za-z0-9+/]{43}=$/.test(source)) {
        throw new common_1.ServiceUnavailableException('Falta una clave de cifrado de IA válida en el servidor.');
    }
    const key = Buffer.from(source, 'base64');
    if (key.length !== 32)
        throw new common_1.ServiceUnavailableException('Clave de cifrado de IA no válida.');
    return key;
}
function associatedData(companyId, provider) {
    return Buffer.from(`erp360-assistant-v2:${companyId.toLowerCase()}:${provider}`);
}
function encryptApiKey(secret, companyId, provider) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', encryptionKey(), iv);
    cipher.setAAD(associatedData(companyId, provider));
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return ['v2', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function decryptApiKey(value, companyId, provider) {
    const key = encryptionKey();
    try {
        const [version, iv, tag, ciphertext, extra] = value.split('.');
        if (!iv || !tag || !ciphertext || extra || (version !== 'v2' && !(version === 'v1' && provider === 'deepseek'))) {
            throw new Error('Invalid envelope');
        }
        const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        decipher.setAAD(version === 'v1' ? Buffer.from('erp360-assistant-deepseek-v1') : associatedData(companyId, provider));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
    }
    catch {
        throw new common_1.ServiceUnavailableException('No se pudo descifrar la credencial de IA. Revisa la clave del servidor.');
    }
}
//# sourceMappingURL=provider-credentials.js.map