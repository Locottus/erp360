import { BadRequestException, ForbiddenException } from '@nestjs/common';

export const SAAS_MODULES = [
  'base',
  'sales',
  'purchases',
  'inventory',
  'accounting',
  'store',
  'people',
] as const;

export type SaasModuleCode = (typeof SAAS_MODULES)[number];
export type SaasRole = 'owner' | 'billing' | 'viewer';

export type ModulePrice = { code: SaasModuleCode; price: string };

export function objectInput(
  input: unknown,
  label = 'Request body',
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException(`${label} must be an object.`);
  }
  return input as Record<string, unknown>;
}

export function requiredText(
  input: unknown,
  field: string,
  maxLength: number,
  options: { lowerCase?: boolean } = {},
): string {
  if (typeof input !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const value = input.trim();
  if (
    !value ||
    value.length > maxLength ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
  ) {
    throw new BadRequestException(
      `${field} is required and must be at most ${maxLength} characters.`,
    );
  }
  return options.lowerCase ? value.toLowerCase() : value;
}

export function requiredDate(input: unknown, field: string): string {
  if (typeof input !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date.`);
  }
  const date = new Date(`${input}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input
  ) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date.`);
  }
  return input;
}

export function requiredMoney(
  input: unknown,
  field: string,
  allowZero = false,
): string {
  if (
    typeof input !== 'string' ||
    !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(input)
  ) {
    throw new BadRequestException(
      `${field} must be a decimal string with at most four fractional digits.`,
    );
  }
  const [whole, fraction = ''] = input.split('.');
  const normalized = `${whole}.${fraction.padEnd(4, '0')}`;
  if (!allowZero && normalized === '0.0000') {
    throw new BadRequestException(`${field} must be greater than zero.`);
  }
  return normalized;
}

export function requiredReference(input: unknown): string {
  return requiredText(input, 'reference', 120);
}

export function requiredReason(input: unknown, field = 'reason'): string {
  const reason = requiredText(input, field, 2000);
  if (reason.length < 10) {
    throw new BadRequestException(
      `${field} must contain at least 10 characters.`,
    );
  }
  return reason;
}

export function parseModulePrices(input: unknown): ModulePrice[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > SAAS_MODULES.length
  ) {
    throw new BadRequestException(
      'modules must contain between one and seven module prices.',
    );
  }
  const seen = new Set<string>();
  const modules = input.map((entry, index) => {
    const row = objectInput(entry, `modules[${index}]`);
    const code = requiredText(row.code, `modules[${index}].code`, 32);
    if (!SAAS_MODULES.includes(code as SaasModuleCode)) {
      throw new BadRequestException(`modules[${index}].code is not supported.`);
    }
    if (seen.has(code)) {
      throw new BadRequestException('modules cannot contain duplicate codes.');
    }
    seen.add(code);
    return {
      code: code as SaasModuleCode,
      price: requiredMoney(row.price, `modules[${index}].price`, true),
    };
  });
  if (!seen.has('base')) {
    throw new BadRequestException(
      'The base module is required for every subscription.',
    );
  }
  if (seen.has('store') && (!seen.has('sales') || !seen.has('inventory'))) {
    throw new BadRequestException(
      'The store module requires both sales and inventory.',
    );
  }
  return modules.sort(
    (left, right) =>
      SAAS_MODULES.indexOf(left.code) - SAAS_MODULES.indexOf(right.code),
  );
}

export function requireSaasRole(
  role: SaasRole | null | undefined,
  write = false,
): void {
  if (!role) {
    throw new ForbiddenException(
      'Enabled platform SaaS membership is required.',
    );
  }
  if (write && role === 'viewer') {
    throw new ForbiddenException(
      'A billing or owner platform role is required for this action.',
    );
  }
}
