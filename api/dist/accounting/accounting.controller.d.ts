import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
import { AccountingService } from './accounting.service';
export declare class AccountingController {
    private readonly accountingService;
    constructor(accountingService: AccountingService);
    accounts(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    generalLedger(request: AuthenticatedRequest, accountCode?: string, fromDate?: string, toDate?: string, page?: string, pageSize?: string): Promise<{
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
    financialStatements(request: AuthenticatedRequest, asOfDate?: string): Promise<{
        balanceSheet: {
            asOfDate: string | null;
            assets: number;
            liabilities: number;
            equity: number;
            totalLiabilitiesAndEquity: number;
            balancesMatch: boolean;
        };
        incomeStatement: {
            revenue: number;
            expenses: number;
            netIncome: number;
        };
    }>;
    bankAccounts(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    upsertBankAccount(request: AuthenticatedRequest, input: {
        code: string;
        bankName: string;
        iban?: string;
        currencyCode?: string;
        isActive?: boolean;
    }): Promise<{
        id: string;
        code: string;
        bankName: string;
        iban: string | null;
        currencyCode: string;
        isActive: boolean;
    }>;
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
        amount: number;
        amountBase: number;
        paymentCurrencyCode: string;
        documentCurrencyCode: string;
        baseCurrencyCode: string;
        exchangeRate: number;
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
        amountBase: number;
        paymentCurrencyCode: string;
        documentCurrencyCode: string;
        baseCurrencyCode: string;
        exchangeRate: number;
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
