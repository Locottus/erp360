import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health endpoints', () => {
  let app: INestApplication;

  afterEach(async () => { if (app) await app.close(); });

  it('reports readiness when PostgreSQL accepts a query', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init();
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ status: 'ok', check: 'readiness', service: 'erp360-api' });
  });

  it('returns a safe 503 when the database cannot be reached while liveness stays available', async () => {
    const rejectConnections = createServer(socket => socket.destroy());
    await new Promise<void>(resolve => rejectConnections.listen(0, '127.0.0.1', resolve));
    const address = rejectConnections.address();
    if (!address || typeof address === 'string') throw new Error('No se pudo crear el servidor de fallo aislado.');
    const previousPort = process.env.POSTGRES_PORT;
    const previousHost = process.env.POSTGRES_HOST;
    process.env.POSTGRES_HOST = '127.0.0.1';
    process.env.POSTGRES_PORT = String(address.port);
    try {
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = module.createNestApplication(); app.useLogger(false); await app.init();
      const live = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(live.body.check).toBe('liveness');
      const ready = await request(app.getHttpServer()).get('/health/ready').expect(503);
      expect(ready.headers['cache-control']).toBe('no-store');
      expect(ready.body.message).toBe('No se pudo verificar la conexión de base de datos.');
      expect(JSON.stringify(ready.body)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(ready.body)).not.toContain(process.env.POSTGRES_PASSWORD ?? 'erp360_dev_password');
    } finally {
      if (previousPort === undefined) delete process.env.POSTGRES_PORT;
      else process.env.POSTGRES_PORT = previousPort;
      if (previousHost === undefined) delete process.env.POSTGRES_HOST;
      else process.env.POSTGRES_HOST = previousHost;
      await new Promise<void>((resolve, reject) => rejectConnections.close(error => error ? reject(error) : resolve()));
    }
  });
});
