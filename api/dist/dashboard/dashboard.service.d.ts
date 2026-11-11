import type { AuthTokenPayload } from '../auth/auth.types';
import { DatabaseService } from '../common/database.service';
type SummaryRow = {
    products: number;
    stockRows: number;
    customers: number | null;
    quotations: number | null;
    suppliers: number | null;
    purchaseRequests: number | null;
    portalTokens: number | null;
    ecommerceListings: number | null;
    ecommerceSubscribers: number | null;
};
type SeriesRow = {
    start: string;
    salesOrders: number | null;
    purchaseOrders: number | null;
};
export declare class DashboardService {
    private readonly db;
    constructor(db: DatabaseService);
    getOverview(user: AuthTokenPayload, period?: string): Promise<{
        period: string;
        timezone: string;
        visibility: {
            admin: boolean;
            sales: boolean;
            purchases: boolean;
        };
        summary: SummaryRow;
        series: SeriesRow[];
    }>;
}
export {};
