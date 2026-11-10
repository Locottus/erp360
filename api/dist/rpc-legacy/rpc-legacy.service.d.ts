import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
export declare class RpcLegacyService {
    private readonly db;
    private readonly authService;
    constructor(db: DatabaseService, authService: AuthService);
    execute(methodName: string, params: unknown[]): Promise<import("pg").QueryResultRow | import("pg").QueryResultRow[] | {
        uid: string;
        company_id: string;
        token: string;
        roles: string[];
    }>;
    private authenticate;
    private executeKw;
    private dispatch;
}
