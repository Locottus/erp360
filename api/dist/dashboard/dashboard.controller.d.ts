import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private readonly dashboard;
    constructor(dashboard: DashboardService);
    overview(request: AuthenticatedRequest, period?: string): Promise<{
        period: string;
        timezone: string;
        visibility: {
            admin: boolean;
            sales: boolean;
            purchases: boolean;
        };
        summary: {
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
        series: {
            start: string;
            salesOrders: number | null;
            purchaseOrders: number | null;
        }[];
    }>;
}
