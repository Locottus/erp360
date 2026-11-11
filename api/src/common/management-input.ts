import { BadRequestException } from '@nestjs/common';

export function expectedRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException('expectedRevision must be a non-negative safe integer.');
  }
  return value;
}

export function changeReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 10 || value.length > 1000 ||
      /[\u0000-\u001f]/.test(value)) {
    throw new BadRequestException('reason must contain 10 to 1000 characters without control characters.');
  }
  return value.trim();
}
