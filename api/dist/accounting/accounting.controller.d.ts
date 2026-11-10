import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
import { AccountingService } from './accounting.service';
export declare class AccountingController {
    private readonly accountingService;
    constructor(accountingService: AccountingService);
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
