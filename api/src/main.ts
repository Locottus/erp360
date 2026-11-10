import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'],
    credentials: true,
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/rpc/xmlrpc', express.text({ type: ['text/xml', 'application/xml', 'text/plain'], limit: '1mb' }));

  const portalRateWindowMs = 60_000;
  const portalRateLimit = Number(process.env.PORTAL_RATE_LIMIT_PER_MINUTE ?? 60);
  const portalRate = new Map<string, { count: number; startedAt: number }>();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.header('x-correlation-id') || randomUUID()).toString();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-xss-protection', '0');
    res.setHeader(
      'content-security-policy',
      "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );

    if (req.path.startsWith('/portal/public/')) {
      const key = `${req.ip}:${req.path}`;
      const now = Date.now();
      const snapshot = portalRate.get(key);
      if (!snapshot || now - snapshot.startedAt > portalRateWindowMs) {
        portalRate.set(key, { count: 1, startedAt: now });
      } else {
        snapshot.count += 1;
        portalRate.set(key, snapshot);
        if (snapshot.count > portalRateLimit) {
          res.status(429).json({ message: 'Too many requests to portal endpoint.' });
          return;
        }
      }
    }

    const startedAt = Date.now();

    res.on('finish', () => {
      const log = {
        timestamp: new Date().toISOString(),
        level: 'info',
        correlation_id: correlationId,
        method: req.method,
        path: req.originalUrl,
        status_code: res.statusCode,
        duration_ms: Date.now() - startedAt,
      };
      console.log(JSON.stringify(log));
    });

    next();
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
