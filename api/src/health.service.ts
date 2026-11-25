import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { databaseConfig } from './common/database.service';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly pool = new Pool({
    ...databaseConfig(), max: 1, connectionTimeoutMillis: 2000, query_timeout: 2000,
  });

  constructor() {
    this.pool.on('error', () => this.logger.warn('La conexión de verificación de base de datos se cerró.'));
  }

  async checkReadiness() {
    try {
      await this.pool.query('SELECT 1');
    } catch {
      this.logger.warn('No se pudo verificar la conexión de base de datos.');
      throw new ServiceUnavailableException('No se pudo verificar la conexión de base de datos.');
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
