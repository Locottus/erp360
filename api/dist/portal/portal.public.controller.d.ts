import { PortalService } from './portal.service';
export declare class PortalPublicController {
    private readonly portalService;
    constructor(portalService: PortalService);
    getPublicSummary(token: string): Promise<{
        customer: {
            id: string;
            code: string;
            name: string;
            email: string | null;
        };
        quotations: any[];
        orders: any[];
        invoices: any[];
    }>;
}
