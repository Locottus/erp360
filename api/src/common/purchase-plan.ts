import { BadRequestException } from '@nestjs/common';
import { requiredDate } from './iso-date';

export type PurchasePlanInput = {
  destinationLocationCode?: string | null;
  expectedReceiptDate?: string | null;
};

export function normalizePurchasePlan(input: PurchasePlanInput) {
  let destinationLocationCode: string | null = null;
  if (input.destinationLocationCode != null) {
    if (typeof input.destinationLocationCode !== 'string' ||
        /[\u0000-\u001f\u007f]/.test(input.destinationLocationCode)) {
      throw new BadRequestException('destinationLocationCode must be a location code or null.');
    }
    destinationLocationCode = input.destinationLocationCode.trim().toUpperCase();
    if (!destinationLocationCode || destinationLocationCode.length > 32) {
      throw new BadRequestException('destinationLocationCode must have 1 to 32 characters.');
    }
  }
  return {
    destinationLocationCode,
    expectedReceiptDate: input.expectedReceiptDate == null
      ? null : requiredDate(input.expectedReceiptDate, 'expectedReceiptDate'),
  };
}
