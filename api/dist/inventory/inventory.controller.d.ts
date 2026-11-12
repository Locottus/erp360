import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { StockAdjustmentInput } from './inventory.types';
import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    replenishment(request: AuthenticatedRequest, locationCode?: string): Promise<import("pg").QueryResultRow[]>;
    purchaseCommitments(request: AuthenticatedRequest, productId: string): Promise<import("pg").QueryResultRow[]>;
    createReplenishmentProposal(request: AuthenticatedRequest, productId: string, input: Parameters<InventoryService['createReplenishmentProposal']>[2]): Promise<{
        id: string;
        requestNumber: string;
        status: string;
    }>;
    setReplenishment(request: AuthenticatedRequest, productId: string, input: Parameters<InventoryService['setReplenishment']>[2]): Promise<any>;
    receiptDetails(request: AuthenticatedRequest, id: string): Promise<{
        order: import("pg").QueryResultRow;
        lines: import("pg").QueryResultRow[];
        receipts: import("pg").QueryResultRow[];
        legacyReceipts: import("pg").QueryResultRow[];
        returns: import("pg").QueryResultRow[];
    }>;
    partialReceipt(request: AuthenticatedRequest, id: string, input: Parameters<InventoryService['receivePartialPurchase']>[2]): Promise<{
        receiptId: string;
        replayed: boolean;
        status?: undefined;
    } | {
        receiptId: string;
        status: string;
        replayed: boolean;
    }>;
    transfer(request: AuthenticatedRequest, input: Parameters<InventoryService['moveOrCount']>[2]): Promise<{
        id: string;
        replayed: boolean;
    }>;
    count(request: AuthenticatedRequest, input: Parameters<InventoryService['moveOrCount']>[2]): Promise<{
        id: string;
        replayed: boolean;
    }>;
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
    valuationAndCogs(request: AuthenticatedRequest, fromDate?: string, toDate?: string, locationCode?: string): Promise<{
        fromDate: string | null;
        toDate: string | null;
        locationCode: string | null;
        rows: {
            product_id: string;
            sku: string;
            product_name: string;
            location_code: string;
            period_received_quantity: string;
            period_received_cost: string;
            period_returned_quantity: string;
            period_returned_cost: string;
            period_dispatched_quantity: string;
            cumulative_net_quantity: string;
            cumulative_net_cost: string;
            weighted_average_cost: string | null;
            estimated_period_cogs: string | null;
            current_on_hand: string;
            current_reserved: string;
            current_available: string;
            provisional_stock_value: string | null;
            has_cost_gap: boolean;
        }[];
    }>;
    listSalesOrdersForFulfillment(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
}
