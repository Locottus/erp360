import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { SaasService } from './saas.service';
import type { SaasRole } from './saas-inputs';
type OperatorRequest = AuthenticatedRequest & {
    saasRole: SaasRole;
};
export declare class SaasIdentityController {
    private readonly saas;
    constructor(saas: SaasService);
    operator(request: AuthenticatedRequest): Promise<{
        role: SaasRole | null;
        integrations: {
            readonly payments: "not_configured";
            readonly email: "not_configured";
            readonly enforcement: "informational";
        };
    }>;
    subscription(request: AuthenticatedRequest): Promise<{
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
}
export declare class SaasOperatorController {
    private readonly saas;
    constructor(saas: SaasService);
    operators(): Promise<import("pg").QueryResultRow[]>;
    portfolio(asOf?: string): Promise<{
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
    portfolioCsv(asOf: string | undefined, response: Response): Promise<string>;
    accounts(): Promise<import("pg").QueryResultRow[]>;
    createAccount(request: OperatorRequest, body: unknown): Promise<any>;
    account(id: string): Promise<{
        account: import("pg").QueryResultRow;
        subscriptions: import("pg").QueryResultRow[];
        invoices: import("pg").QueryResultRow[];
        payments: import("pg").QueryResultRow[];
        followups: import("pg").QueryResultRow[];
        audit: import("pg").QueryResultRow[];
        users: import("pg").QueryResultRow[];
    }>;
    companies(): Promise<import("pg").QueryResultRow[]>;
    createSubscription(request: OperatorRequest, body: unknown): Promise<any>;
    updateSubscription(request: OperatorRequest, id: string, body: unknown): Promise<any>;
    createInvoice(request: OperatorRequest, id: string, body: unknown): Promise<any>;
    recordPayment(request: OperatorRequest, id: string, body: unknown): Promise<any>;
    reversePayment(request: OperatorRequest, id: string, body: unknown): Promise<any>;
    issueCredit(request: OperatorRequest, id: string, body: unknown): Promise<any>;
    createFollowup(request: OperatorRequest, id: string, body: unknown): Promise<any>;
    updateFollowup(request: OperatorRequest, id: string, body: unknown): Promise<any>;
    collectionQueue(asOf?: string): Promise<{
        as_of: string;
        items: {
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
        }[];
    }>;
    collectionRun(request: OperatorRequest, body: unknown): Promise<{
        as_of: string;
        created: number;
        skipped_paid: number;
        skipped_paused: number;
        already_run: boolean;
        followup_ids: string[];
    }>;
}
export {};
