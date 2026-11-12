import { StreamableFile } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreatePurchaseRequestInput, CreateQuotationInput } from './commerce.types';
import { CommerceService } from './commerce.service';
export declare class CommerceController {
    private readonly commerceService;
    constructor(commerceService: CommerceService);
    cancelSale(request: AuthenticatedRequest, id: string, input: {
        reason: string;
    }): Promise<{
        id: string;
        status: string;
    }>;
    cancelPurchase(request: AuthenticatedRequest, id: string, input: {
        reason: string;
    }): Promise<{
        id: string;
        status: string;
    }>;
    invoicePdf(request: AuthenticatedRequest, id: string): Promise<StreamableFile>;
    createQuotation(request: AuthenticatedRequest, body: CreateQuotationInput): Promise<{
        id: string;
        quotationNumber: string;
        status: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
        validUntil: string | null;
        revision: number;
    }>;
    listQuotations(request: AuthenticatedRequest): Promise<{
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
    listSalesOrders(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    listSalesInvoices(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    confirmQuotation(request: AuthenticatedRequest, quotationId: string, body: {
        orderNumber: string;
    }): Promise<{
        quotationId: string;
        orderId: string;
        orderNumber: string;
        status: string;
    }>;
    reviseQuotationValidity(request: AuthenticatedRequest, id: string, body: {
        validUntil: string | null;
        expectedRevision: number;
        reason: string;
    }): Promise<any>;
    issueInvoice(request: AuthenticatedRequest, salesOrderId: string, body: {
        invoiceNumber: string;
    }): Promise<{
        salesOrderId: string;
        invoiceId: string;
        invoiceNumber: string;
        status: string;
    }>;
    createPurchaseRequest(request: AuthenticatedRequest, body: CreatePurchaseRequestInput): Promise<{
        id: string;
        requestNumber: string;
        status: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
    }>;
    listPurchaseRequests(request: AuthenticatedRequest): Promise<{
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
    purchaseRequestDetails(request: AuthenticatedRequest, id: string): Promise<{
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
        lines: {
            id: string;
            product_id: string;
            sku: string | null;
            product_name: string | null;
            quantity: string;
            unit_cost: string;
            line_total: string;
        }[];
    }>;
    rejectPurchaseRequest(request: AuthenticatedRequest, id: string, input: {
        reason: string;
    }): Promise<{
        id: string;
        status: string;
    }>;
    approvePurchaseRequest(request: AuthenticatedRequest, requestId: string, body: {
        orderNumber: string;
    }): Promise<{
        requestId: string;
        purchaseOrderId: string;
        purchaseOrderNumber: string;
        status: string;
    }>;
    receivePurchaseOrder(request: AuthenticatedRequest, purchaseOrderId: string, body: {
        receiptNumber: string;
    }): Promise<{
        purchaseOrderId: string;
        receiptId: string;
        receiptNumber: string;
        status: string;
    }>;
}
