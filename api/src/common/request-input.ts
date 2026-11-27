import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabaseService } from './database.service';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function objectBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('A JSON object body is required.');
  }
  return input as Record<string, unknown>;
}

export function boundedText(input: unknown, field: string, min: number, max: number) {
  if (typeof input !== 'string' || /[\u0000-\u001f]/.test(input) ||
      input.trim().length < min || input.trim().length > max) {
    throw new BadRequestException(`${field} must contain ${min} to ${max} characters without control characters.`);
  }
  return input.trim();
}

export function idempotencyKey(input: unknown) {
  if (typeof input !== 'string' || !/^[A-Za-z0-9._:-]{8,80}$/.test(input)) {
    throw new BadRequestException('idempotencyKey must contain 8 to 80 letters, digits or . _ : -');
  }
  return input;
}

export function uuidValue(input: unknown, field: string) {
  if (typeof input !== 'string' || !UUID_PATTERN.test(input)) {
    throw new BadRequestException(`${field} must be a UUID.`);
  }
  return input;
}

export async function inTransaction<T>(db: DatabaseService, work: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
