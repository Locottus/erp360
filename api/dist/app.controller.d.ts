import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    getLiveness(): {
        status: string;
        check: string;
        service: string;
        timestamp: string;
    };
    getReadiness(): {
        status: string;
        check: string;
        service: string;
        timestamp: string;
    };
}
