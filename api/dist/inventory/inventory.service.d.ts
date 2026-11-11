import { DatabaseService } from '../common/database.service';
import type { AuthUser, StockAdjustmentInput } from './inventory.types';
export declare class InventoryService {
    private readonly db;
    constructor(db: DatabaseService);
    receivePurchaseOrder(user: AuthUser, purchaseOrderId: string, locationCode?: string): Promise<{
        purchaseOrderId: string;
        locationCode: string;
        appliedLines: number;
    }>;
    reserveSalesOrder(user: AuthUser, salesOrderId: string, locationCode?: string): Promise<{
        salesOrderId: string;
        locationCode: string;
        reservedLines: number;
    }>;
    dispatchSalesOrder(user: AuthUser, salesOrderId: string, locationCode?: string): Promise<{
        salesOrderId: string;
        locationCodes: string[];
        dispatchedLines: number;
    }>;
    adjustStock(user: AuthUser, input: StockAdjustmentInput): Promise<{
        productId: string;
        direction: "in" | "out";
        quantity: number;
        location: string;
    }>;
    listStockBalances(user: AuthUser, locationCode?: string): Promise<{
        product_id: string;
        product_name: string;
        location_code: string;
        on_hand: string;
        reserved: string;
        available: string;
    }[]>;
    listMovements(user: AuthUser, options: {
        productId?: string;
        locationCode?: string;
        page?: string;
        pageSize?: string;
    }): Promise<{
        items: import("pg").QueryResultRow[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    listSalesOrdersForFulfillment(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    private parsePageValue;
    private normalizeLocation;
    private ensureStockBalanceRow;
    private insertMovement;
    private insertAudit;
}
