import { DatabaseService } from '../common/database.service';
import type { AuthTokenPayload } from '../auth/auth.types';
import { type SaasRole } from './saas-inputs';
type OperatorUser = AuthTokenPayload & {
    saasRole?: SaasRole;
};
type QueueRow = {
    invoice_id: string;
    account_id: string;
    account_name: string;
    company_id: string;
    company_name: string;
    reference: string;
    currency: string;
    balance: string;
    due_on: string;
    days_overdue: number;
    stage: string;
    already_prepared: boolean;
    paused: boolean;
};
export declare class SaasService {
    private readonly db;
    constructor(db: DatabaseService);
    operatorRole(user: AuthTokenPayload): Promise<SaasRole | null>;
    integrations(): Promise<{
        readonly payments: "not_configured";
        readonly email: "not_configured";
        readonly enforcement: "informational";
    }>;
    listOperators(): Promise<import("pg").QueryResultRow[]>;
    listAccounts(): Promise<import("pg").QueryResultRow[]>;
    createAccount(user: OperatorUser, input: unknown): Promise<any>;
    listCompanies(): Promise<import("pg").QueryResultRow[]>;
    createSubscription(user: OperatorUser, input: unknown): Promise<any>;
    updateSubscription(user: OperatorUser, id: string, input: unknown): Promise<any>;
    getTenantSubscription(companyId: string): Promise<{
        subscription: {
            access: string;
        } | null;
        company: {
            id: string;
            code: string;
            name: string;
        };
        users: {
            total_count: number;
            active_count: number;
        };
        balance: {
            as_of: string;
            open_balance: string;
            overdue_balance: string;
            currency: string;
        };
        access: "informational";
    }>;
    portfolio(asOfInput?: unknown): Promise<{
        as_of: string;
        clients: {
            id: any;
            name: any;
            billing_email: any;
            currency: any;
            open_balance: any;
            overdue_balance: any;
            days_overdue: any;
            status: any;
            modules: any;
            next_followup: {
                id: any;
                kind: any;
                note: any;
                due_on: any;
                promised_on: any;
                owner_id: any;
                owner_name: any;
                status: any;
            } | null;
            followup_overdue: any;
        }[];
        totals: import("pg").QueryResultRow[];
    }>;
    portfolioCsv(asOfInput?: unknown): Promise<string>;
    collectionQueue(asOfInput?: unknown): Promise<{
        as_of: string;
        items: QueueRow[];
    }>;
    runCollection(user: OperatorUser, input: unknown): Promise<{
        as_of: string;
        created: number;
        skipped_paid: number;
        skipped_paused: number;
        already_run: boolean;
        followup_ids: string[];
    }>;
    accountDetail(id: string): Promise<{
        account: import("pg").QueryResultRow;
        subscriptions: import("pg").QueryResultRow[];
        invoices: import("pg").QueryResultRow[];
        payments: import("pg").QueryResultRow[];
        followups: import("pg").QueryResultRow[];
        audit: import("pg").QueryResultRow[];
        users: import("pg").QueryResultRow[];
    }>;
    createInvoice(user: OperatorUser, subscriptionId: string, input: unknown): Promise<any>;
    recordPayment(user: OperatorUser, invoiceId: string, input: unknown): Promise<any>;
    reversePayment(user: OperatorUser, paymentId: string, input: unknown): Promise<any>;
    issueCredit(user: OperatorUser, invoiceId: string, input: unknown): Promise<any>;
    createFollowup(user: OperatorUser, accountId: string, input: unknown): Promise<any>;
    updateFollowup(user: OperatorUser, followupId: string, input: unknown): Promise<any>;
    private getAccountSummary;
    private getSubscription;
    private getInvoice;
    private getPayment;
    private getReversal;
    private getCredit;
    private getFollowup;
    private lockInvoice;
    private invoiceBalance;
    private insertRevisionModules;
    private audit;
    private transaction;
    private assertWrite;
    private requiredUuid;
    private requiredRevision;
    private utcToday;
}
export {};
