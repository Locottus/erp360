import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { HealthService } from './health.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private readonly health: HealthService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health/live')
  @Header('Cache-Control', 'no-store')
  getLiveness() {
    return {
      status: 'ok',
      check: 'liveness',
      service: 'erp360-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('/health/ready')
  @Header('Cache-Control', 'no-store')
  async getReadiness() {
    await this.health.checkReadiness();
    return {
      status: 'ok',
      check: 'readiness',
      service: 'erp360-api',
      timestamp: new Date().toISOString(),
    };
  }
}
