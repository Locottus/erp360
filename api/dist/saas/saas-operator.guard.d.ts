import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
export declare class SaasOperatorGuard implements CanActivate {
    private readonly db;
    constructor(db: DatabaseService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
