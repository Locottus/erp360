import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health/live')
  getLiveness() {
    return {
      status: 'ok',
      check: 'liveness',
      service: 'erp360-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('/health/ready')
  getReadiness() {
    return {
      status: 'ok',
      check: 'readiness',
      service: 'erp360-api',
      timestamp: new Date().toISOString(),
    };
  }
}
