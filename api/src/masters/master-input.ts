import { BadRequestException } from '@nestjs/common';

export const masterDefinitions = {
  customers: { table: 'customers', fields: { code: 'code', name: 'name', email: 'email', taxId: 'tax_id' } },
  products: { table: 'products', fields: { sku: 'sku', name: 'name', description: 'description', unitPrice: 'unit_price' } },
  suppliers: { table: 'suppliers', fields: { code: 'code', name: 'name', email: 'email', taxId: 'tax_id' } },
  'tax-rates': { table: 'tax_rates', fields: { code: 'code', name: 'name', rate: 'rate', taxType: 'tax_type' } },
} as const;
export type MasterKind = keyof typeof masterDefinitions;
export function masterDefinition(kind: string) {
  if (!Object.hasOwn(masterDefinitions, kind)) throw new BadRequestException('Unknown master catalog.');
  return masterDefinitions[kind as MasterKind];
}
export function validateMaster(kind: string, value: unknown): Record<string, string | number | boolean | null> {
  masterDefinition(kind);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('A catalog record is required.');
  const record: Record<string, unknown> = value as Record<string, unknown>;
  const text = (key: string, limit: number, required = false) => {
    const raw = record[key];
    if (raw === undefined || raw === null || raw === '') {
      if (required) throw new BadRequestException(`${key} is required.`);
      return null;
    }
    if (typeof raw !== 'string' || raw.trim().length > limit || (required && !raw.trim())) {
      throw new BadRequestException(`${key} is invalid (maximum ${limit} characters).`);
    }
    return raw.trim();
  };
  const numeric = (key: string, maximum: number) => {
    const raw = record[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > maximum ||
        Math.abs(raw * 10000 - Math.round(raw * 10000)) > 0.00001) {
      throw new BadRequestException(`${key} must be finite, nonnegative and have at most 4 decimal places.`);
    }
    return raw;
  };
  const result: Record<string, string | number | boolean | null> = { name: text('name', 180, true) };
  if (record['isActive'] !== undefined && typeof record['isActive'] !== 'boolean') {
    throw new BadRequestException('isActive must be boolean.');
  }
  result['isActive'] = record['isActive'] ?? true;
  if (kind === 'products') {
    result['sku'] = text('sku', 64, true);
    result['description'] = text('description', 10000);
    result['unitPrice'] = numeric('unitPrice', 9999999999);
  } else {
    result['code'] = text('code', 64, true);
    if (kind === 'tax-rates') {
      result['rate'] = numeric('rate', 100);
      if (!['vat', 'withholding', 'other'].includes(String(record['taxType']))) {
        throw new BadRequestException('Invalid tax type.');
      }
      result['taxType'] = String(record['taxType']);
    } else {
      const email = text('email', 255);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Invalid email.');
      result['email'] = email?.toLowerCase() ?? null;
      result['taxId'] = text('taxId', 64);
    }
  }
  return result;
}
