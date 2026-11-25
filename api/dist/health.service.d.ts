import { OnModuleDestroy } from '@nestjs/common';
export declare class HealthService implements OnModuleDestroy {
    private readonly logger;
    private readonly pool;
    constructor();
    checkReadiness(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
