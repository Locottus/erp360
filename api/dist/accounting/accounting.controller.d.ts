import { DatabaseService } from '../common/database.service';
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
    financialStatements(request: AuthenticatedRequest, asOfDate?: string, fromDate?: string, toDate?: string): Promise<{
        basis: string;
        balanceSheet: {
            asOfDate: string;
            assets: number;
            liabilities: number;
            equity: number;
            accumulatedNetIncome: number;
            totalLiabilitiesAndEquity: number;
            balancesMatch: boolean;
        };
        incomeStatement: {
            fromDate: string;
            toDate: string;
            revenue: number;
            expenses: number;
            netIncome: number;
        };
    }>;
    bankAccounts(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    bankReconciliationLines(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    reconcileBankLine(request: AuthenticatedRequest, id: string, input: {
        matchedPaymentId?: string;
        status: 'matched' | 'reconciled' | 'difference';
        reason: string;
        differenceAmount?: number;
    }): Promise<{
        id: string;
        status: string;
        matchedPaymentId: string | null;
        differenceAmount: number | null | undefined;
    }>;
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
    importBankStatement(request: AuthenticatedRequest, id: string, input: {
        statementReference: string;
        statementDate: string;
        openingBalance: string;
        closingBalance: string;
        csv: string;
    }): Promise<{
        id: string;
        importedLines: number;
        replayed: boolean;
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
        lines?: {
            orderLineId: string;
            quantity: number;
        }[];
    }): Promise<{
        id: string;
        creditNumber: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
        fullyCredited: boolean;
    }>;
    creditableInvoiceLines(request: AuthenticatedRequest, id: string): Promise<import("pg").QueryResultRow[]>;
    credits(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    refund(request: AuthenticatedRequest, id: string, input: RegisterInvoicePaymentInput): Promise<{
        id: string;
    }>;
    returnCreditedStock(request: AuthenticatedRequest, id: string, input: {
        reference: string;
        reason: string;
        lines?: {
            creditNoteLineId: string;
            quantity: number;
        }[];
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
export declare class PaymentWebhookController {
    private readonly db;
    constructor(db: DatabaseService);
    receive(provider: string, companyCodeHeader: string | undefined, signature: string | undefined, body: Record<string, unknown>): Promise<{
        received: boolean;
        duplicate: boolean;
        signatureValid: boolean;
        message?: undefined;
    } | {
        received: boolean;
        duplicate: boolean;
        signatureValid: boolean;
        message: string;
    }>;
    private readSecretMap;
}
