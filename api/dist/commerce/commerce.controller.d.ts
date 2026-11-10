import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreatePurchaseRequestInput, CreateQuotationInput } from './commerce.types';
import { CommerceService } from './commerce.service';
export declare class CommerceController {
    private readonly commerceService;
    constructor(commerceService: CommerceService);
    createQuotation(request: AuthenticatedRequest, body: CreateQuotationInput): Promise<{
        id: string;
        quotationNumber: string;
        status: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
    }>;
    listQuotations(request: AuthenticatedRequest): Promise<{
        id: string;
        quotation_number: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        customer_id: string;
    }[]>;
    confirmQuotation(request: AuthenticatedRequest, quotationId: string, body: {
        orderNumber: string;
    }): Promise<{
        quotationId: string;
        orderId: string;
        orderNumber: string;
        status: string;
    }>;
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
        id: string;
        request_number: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        supplier_id: string;
    }[]>;
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
