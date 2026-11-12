import { DatabaseService } from '../common/database.service';
import type { AuthUser, CreatePurchaseRequestInput, CreateQuotationInput } from './commerce.types';
export declare function purchaseApprovalBlockReason(required: boolean, createdBy: string | null, approverId: string): "unknown_creator" | "self_approval" | null;
export declare class CommerceService {
    private readonly db;
    constructor(db: DatabaseService);
    cancelOrder(user: AuthUser, id: string, type: 'sales' | 'purchase', reason: string): Promise<{
        id: string;
        status: string;
    }>;
    invoicePdf(user: AuthUser, id: string): Promise<Buffer>;
    createQuotation(user: AuthUser, input: CreateQuotationInput): Promise<{
        id: string;
        quotationNumber: string;
        status: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
        validUntil: string | null;
        revision: number;
    }>;
    listQuotations(user: AuthUser): Promise<{
        id: string;
        quotation_number: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        customer_id: string;
        valid_until: string | null;
        revision: number;
        is_expired: boolean;
    }[]>;
    listSalesOrders(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    listSalesInvoices(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    confirmQuotation(user: AuthUser, quotationId: string, orderNumber: string): Promise<{
        quotationId: string;
        orderId: string;
        orderNumber: string;
        status: string;
    }>;
    reviseQuotationValidity(user: AuthUser, id: string, input: {
        validUntil: string | null;
        expectedRevision: number;
        reason: string;
    }): Promise<any>;
    issueInvoice(user: AuthUser, salesOrderId: string, invoiceNumber: string): Promise<{
        salesOrderId: string;
        invoiceId: string;
        invoiceNumber: string;
        status: string;
    }>;
    createPurchaseRequest(user: AuthUser, input: CreatePurchaseRequestInput): Promise<{
        id: string;
        requestNumber: string;
        status: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
    }>;
    listPurchaseRequests(user: AuthUser): Promise<{
        approval_block_reason: string | null;
        id: string;
        request_number: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        supplier_id: string;
        created_by: string | null;
        require_independent_purchase_approver: boolean;
    }[]>;
    purchaseRequestDetails(user: AuthUser, id: string): Promise<{
        approval_block_reason: string | null;
        id: string;
        request_number: string;
        status: string;
        currency_code: string | null;
        supplier_name: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        created_by: string | null;
        require_independent_purchase_approver: boolean;
        replenishment_location: string | null;
        replenishment_rule_revision: number | null;
        replenishment_reason: string | null;
        lines: Array<{
            id: string;
            product_id: string;
            sku: string | null;
            product_name: string | null;
            quantity: string;
            unit_cost: string;
            line_total: string;
        }>;
    }>;
    rejectPurchaseRequest(user: AuthUser, id: string, input: {
        reason: string;
    }): Promise<{
        id: string;
        status: string;
    }>;
    approvePurchaseRequest(user: AuthUser, requestId: string, orderNumber: string): Promise<{
        requestId: string;
        purchaseOrderId: string;
        purchaseOrderNumber: string;
        status: string;
    }>;
    receivePurchaseOrder(user: AuthUser, purchaseOrderId: string, receiptNumber: string): Promise<{
        purchaseOrderId: string;
        receiptId: string;
        receiptNumber: string;
        status: string;
    }>;
    private validateSalesInput;
    private validatePurchaseInput;
    private resolveTaxRatePercent;
    private calculateTotals;
    private calculateSalesLines;
    private calculatePurchaseLines;
    private assertCustomerOwnership;
    private assertSupplierOwnership;
    private insertAudit;
    private insertAuditDirect;
}
