import { StreamableFile } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreatePurchaseRequestInput, CreateQuotationInput, RevisePurchaseDeliveryPlanInput } from './commerce.types';
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
        destinationLocationCode: string | null;
        expectedReceiptDate: string | null;
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
        destination_location_code: string | null;
        expected_receipt_date: string | null;
        delivery_plan_revision: number;
        order_delivery_plan_revision: number | null;
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
        destination_location_code: string | null;
        expected_receipt_date: string | null;
        delivery_plan_revision: number;
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
    purchaseRequestDeliveryPlan(request: AuthenticatedRequest, id: string): Promise<{
        history: {
            created_at: string;
            actor_user_id: string;
            reason: string;
            before: {
                destination_location_code: string | null;
                expected_receipt_date: string | null;
                revision: number;
            };
            after: {
                destination_location_code: string | null;
                expected_receipt_date: string | null;
                revision: number;
            };
        }[];
        history_has_more: boolean;
        id: string;
        document_number: string;
        status: string;
        delivery_plan_revision: number;
        destination_location_code: string | null;
        expected_receipt_date: string | null;
    }>;
    purchaseOrderDeliveryPlan(request: AuthenticatedRequest, id: string): Promise<{
        history: {
            created_at: string;
            actor_user_id: string;
            reason: string;
            before: {
                destination_location_code: string | null;
                expected_receipt_date: string | null;
                revision: number;
            };
            after: {
                destination_location_code: string | null;
                expected_receipt_date: string | null;
                revision: number;
            };
        }[];
        history_has_more: boolean;
        id: string;
        document_number: string;
        status: string;
        delivery_plan_revision: number;
        destination_location_code: string | null;
        expected_receipt_date: string | null;
    }>;
    revisePurchaseRequestDeliveryPlan(request: AuthenticatedRequest, id: string, input: RevisePurchaseDeliveryPlanInput): Promise<{
        destination_location_code: string | null;
        expected_receipt_date: string | null;
        revision: number;
        id: string;
    }>;
    revisePurchaseOrderDeliveryPlan(request: AuthenticatedRequest, id: string, input: RevisePurchaseDeliveryPlanInput): Promise<{
        destination_location_code: string | null;
        expected_receipt_date: string | null;
        revision: number;
        id: string;
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
