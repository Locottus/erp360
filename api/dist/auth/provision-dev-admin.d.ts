import { DatabaseService } from '../common/database.service';
export declare function provisionDevAdmin(db: DatabaseService, env?: NodeJS.ProcessEnv): Promise<{
    userId: string;
    companyId: string;
    changed: boolean;
}>;
