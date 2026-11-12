import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ProviderCode } from './ai-providers';

function encryptionKey() {
  const source = process.env.ASSISTANT_CREDENTIAL_KEY;
  if (!source || !/^[A-Za-z0-9+/]{43}=$/.test(source)) {
    throw new ServiceUnavailableException('Falta una clave de cifrado de IA válida en el servidor.');
  }
  const key = Buffer.from(source, 'base64');
  if (key.length !== 32) throw new ServiceUnavailableException('Clave de cifrado de IA no válida.');
  return key;
}
function associatedData(companyId: string, provider: ProviderCode) {
  return Buffer.from(`erp360-assistant-v2:${companyId.toLowerCase()}:${provider}`);
}
export function encryptApiKey(secret: string, companyId: string, provider: ProviderCode) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(associatedData(companyId, provider));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v2', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function decryptApiKey(value: string, companyId: string, provider: ProviderCode) {
  const key = encryptionKey();
  try {
    const [version, iv, tag, ciphertext, extra] = value.split('.');
    if (!iv || !tag || !ciphertext || extra || (version !== 'v2' && !(version === 'v1' && provider === 'deepseek'))) {
      throw new Error('Invalid envelope');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAAD(version === 'v1' ? Buffer.from('erp360-assistant-deepseek-v1') : associatedData(companyId, provider));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new ServiceUnavailableException('No se pudo descifrar la credencial de IA. Revisa la clave del servidor.');
  }
}
