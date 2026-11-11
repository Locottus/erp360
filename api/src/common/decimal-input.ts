import { BadRequestException } from '@nestjs/common';

export function requiredDecimal(input: unknown, field: string, allowZero = false): string {
  if (typeof input !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(input)) {
    throw new BadRequestException(`${field} must be a decimal string with at most four fractional digits.`);
  }
  const [whole, fraction = ''] = input.split('.');
  const normalized = `${whole}.${fraction.padEnd(4, '0')}`;
  if (!allowZero && normalized === '0.0000') {
    throw new BadRequestException(`${field} must be greater than zero.`);
  }
  return normalized;
}
