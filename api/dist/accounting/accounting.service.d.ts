import { DatabaseService } from '../common/database.service';
import type { AuthUser, ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
export declare class AccountingService {
    private readonly db;
    constructor(db: DatabaseService);
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
