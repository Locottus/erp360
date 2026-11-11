import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { StockAdjustmentInput } from './inventory.types';
import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    applyPurchaseReceipt(request: AuthenticatedRequest, purchaseOrderId: string, body: {
        locationCode?: string;
    }): Promise<{
        purchaseOrderId: string;
        locationCode: string;
        appliedLines: number;
    }>;
    applySalesReservation(request: AuthenticatedRequest, salesOrderId: string, body: {
        locationCode?: string;
    }): Promise<{
        salesOrderId: string;
        locationCode: string;
        reservedLines: number;
    }>;
    applySalesDispatch(request: AuthenticatedRequest, salesOrderId: string, body: {
        locationCode?: string;
    }): Promise<{
        salesOrderId: string;
        locationCodes: string[];
        dispatchedLines: number;
    }>;
    createAdjustment(request: AuthenticatedRequest, body: StockAdjustmentInput): Promise<{
        productId: string;
        direction: "in" | "out";
        quantity: number;
        location: string;
    }>;
    listStock(request: AuthenticatedRequest, locationCode?: string): Promise<{
        product_id: string;
        product_name: string;
        location_code: string;
        on_hand: string;
        reserved: string;
        available: string;
    }[]>;
    listMovements(request: AuthenticatedRequest, productId?: string, locationCode?: string, page?: string, pageSize?: string): Promise<{
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    listSalesOrdersForFulfillment(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
}
