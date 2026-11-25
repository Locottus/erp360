import { AppService } from './app.service';
import { HealthService } from './health.service';
export declare class AppController {
    private readonly appService;
    private readonly health;
    constructor(appService: AppService, health: HealthService);
    getHello(): string;
    getLiveness(): {
        status: string;
        check: string;
        service: string;
        timestamp: string;
    };
    getReadiness(): Promise<{
        status: string;
        check: string;
        service: string;
        timestamp: string;
    }>;
}
