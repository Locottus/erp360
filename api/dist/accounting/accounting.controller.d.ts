import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
import { AccountingService } from './accounting.service';
export declare class AccountingController {
    private readonly accountingService;
    constructor(accountingService: AccountingService);
    returnToSupplier(request: AuthenticatedRequest, id: string, input: Parameters<AccountingService['returnToSupplier']>[2]): Promise<{
        returnId: string;
        replayed: boolean;
    } | {
        replayed: boolean;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        returnId: string;
    }>;
    credit(request: AuthenticatedRequest, id: string, input: {
        reason: string;
        returnStock: boolean;
    }): Promise<{
        id: string;
        creditNumber: string;
    }>;
    credits(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    refund(request: AuthenticatedRequest, id: string, input: RegisterInvoicePaymentInput): Promise<{
        id: string;
    }>;
    returnCreditedStock(request: AuthenticatedRequest, id: string, input: {
        reference: string;
        reason: string;
    }): Promise<{
        id: string;
        replayed: boolean;
    }>;
    payables(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    supplierRefunds(request: AuthenticatedRequest, id: string): Promise<import("pg").QueryResultRow[]>;
    supplierRefund(request: AuthenticatedRequest, id: string, input: Parameters<AccountingService['receiveSupplierRefund']>[2]): Promise<{
        refundId: string;
        replayed: boolean;
    }>;
    paySupplier(request: AuthenticatedRequest, id: string, input: RegisterInvoicePaymentInput): Promise<{
        paymentId: string;
        remainingBalance: number;
    }>;
    periods(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    reopen(request: AuthenticatedRequest, input: ClosePeriodInput & {
        reason: string;
    }): Promise<{
        status: string;
    }>;
    bootstrapAccounts(request: AuthenticatedRequest): Promise<{
        companyId: string;
        createdCount: number;
        createdCodes: string[];
    }>;
    postSalesInvoice(request: AuthenticatedRequest, invoiceId: string): Promise<{
        invoiceId: string;
        journalEntryId: string;
        status: string;
    }>;
    registerSalesInvoicePayment(request: AuthenticatedRequest, invoiceId: string, body: RegisterInvoicePaymentInput): Promise<{
        invoiceId: string;
        paymentId: string;
        paymentReference: string;
        amount: number;
        remainingBalance: number;
    }>;
    postPurchaseOrder(request: AuthenticatedRequest, purchaseOrderId: string): Promise<{
        purchaseOrderId: string;
        journalEntryId: string;
        status: string;
    }>;
    getTrialBalance(request: AuthenticatedRequest, fromDate?: string, toDate?: string): Promise<{
        rows: {
            account_code: string;
            account_name: string;
            account_type: string;
            debit: string;
            credit: string;
            balance: string;
        }[];
        totals: {
            totalDebit: number;
            totalCredit: number;
            isBalanced: boolean;
        };
    }>;
    closePeriod(request: AuthenticatedRequest, body: ClosePeriodInput): Promise<{
        id: string;
        year: number;
        month: number;
        status: string;
    }>;
}
