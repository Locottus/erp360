import { DatabaseService } from '../common/database.service';
import { type QuantityDocument } from '../common/quantity-document';
import type { AuthUser, ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
export declare class AccountingService {
    private readonly db;
    constructor(db: DatabaseService);
    listAccounts(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    generalLedger(user: AuthUser, options: {
        accountCode?: string;
        fromDate?: string;
        toDate?: string;
        page?: string;
        pageSize?: string;
    }): Promise<{
        fromDate: string;
        toDate: string;
        page: number;
        pageSize: number;
        account: {
            code: string;
            name: string;
            account_type: string;
        };
        summary: {
            opening: string;
            debit: string;
            credit: string;
            closing: string;
        };
        items: {
            id: string;
            entry_id: string;
            entry_number: string;
            entry_date: string;
            description: string | null;
            source_type: string;
            source_id: string | null;
            debit: string;
            credit: string;
            running_balance: string;
        }[];
        total: number;
    }>;
    creditInvoice(user: AuthUser, invoiceId: string, input: {
        reason: string;
        returnStock: boolean;
    }): Promise<{
        id: string;
        creditNumber: string;
    }>;
    listCredits(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    returnCreditedStock(user: AuthUser, id: string, input: {
        reference: string;
        reason: string;
    }): Promise<{
        id: string;
        replayed: boolean;
    }>;
    private restoreCreditedStock;
    refundCredit(user: AuthUser, id: string, input: RegisterInvoicePaymentInput): Promise<{
        id: string;
    }>;
    bootstrapDefaultAccounts(user: AuthUser): Promise<{
        companyId: string;
        createdCount: number;
        createdCodes: string[];
    }>;
    postSalesInvoice(user: AuthUser, invoiceId: string): Promise<{
        invoiceId: string;
        journalEntryId: string;
        status: string;
    }>;
    registerInvoicePayment(user: AuthUser, invoiceId: string, input: RegisterInvoicePaymentInput): Promise<{
        invoiceId: string;
        paymentId: string;
        paymentReference: string;
        amount: number;
        remainingBalance: number;
    }>;
    postPurchaseOrderAccrual(user: AuthUser, purchaseOrderId: string): Promise<{
        purchaseOrderId: string;
        journalEntryId: string;
        status: string;
    }>;
    returnToSupplier(user: AuthUser, id: string, input: QuantityDocument & {
        reason: string;
    }): Promise<{
        returnId: string;
        replayed: boolean;
    } | {
        replayed: boolean;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        returnId: string;
    }>;
    listPayables(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    supplierRefundHistory(user: AuthUser, id: string): Promise<import("pg").QueryResultRow[]>;
    receiveSupplierRefund(user: AuthUser, id: string, input: {
        reference: string;
        amount: number;
        reason: string;
    }): Promise<{
        refundId: string;
        replayed: boolean;
    }>;
    paySupplier(user: AuthUser, id: string, input: RegisterInvoicePaymentInput): Promise<{
        paymentId: string;
        remainingBalance: number;
    }>;
    listPeriods(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    reopenPeriod(user: AuthUser, input: ClosePeriodInput & {
        reason: string;
    }): Promise<{
        status: string;
    }>;
    getTrialBalance(user: AuthUser, fromDate?: string, toDate?: string): Promise<{
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
    closePeriod(user: AuthUser, input: ClosePeriodInput): Promise<{
        id: string;
        year: number;
        month: number;
        status: string;
    }>;
    private createEntryHeader;
    private generateEntryNumber;
    private insertLine;
    private getSystemAccounts;
    private assertNoExistingSourceEntry;
    private assertSourceEntryExists;
    private insertAudit;
    private insertAuditDirect;
}
