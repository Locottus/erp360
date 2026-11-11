import { BadRequestException } from '@nestjs/common';

export function requiredDate(input: unknown, field: string): string {
  if (typeof input !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date.`);
  }
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date.`);
  }
  return input;
}
