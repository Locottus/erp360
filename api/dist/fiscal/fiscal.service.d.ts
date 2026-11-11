import { DatabaseService } from '../common/database.service';
import type { AuthUser, CountryCode, CreateFiscalDocumentInput, UpsertProviderConfigInput } from './fiscal.types';
export declare class FiscalService {
    private readonly db;
    constructor(db: DatabaseService);
    upsertProviderConfig(user: AuthUser, input: UpsertProviderConfigInput): Promise<{
        id: string;
        status: string;
    }>;
    createFiscalDocument(user: AuthUser, invoiceId: string, input: CreateFiscalDocumentInput): Promise<{
        id: string;
        status: string;
        payload: {
            country: CountryCode;
            provider: string;
            environment: "production" | "sandbox";
            documentType: string;
            invoiceNumber: string;
            controlNumber: string;
            issuedAt: string;
            issuer: {
                code: string;
                name: string;
                taxId: string | null;
            };
            customer: {
                id: string;
                code: string;
                name: string;
                taxId: string | null;
            };
            totals: {
                subtotal: number;
                taxTotal: number;
                grandTotal: number;
            };
        };
    }>;
    submitFiscalDocument(user: AuthUser, fiscalDocumentId: string): Promise<{
        id: string;
        status: "rejected" | "submitted" | "accepted" | "error";
        providerTrackId: string;
        message: string;
    }>;
    getFiscalDocument(user: AuthUser, fiscalDocumentId: string): Promise<import("pg").QueryResultRow>;
    listFiscalDocuments(user: AuthUser, countryCode?: CountryCode): Promise<import("pg").QueryResultRow[]>;
    private getProviderConfig;
    private insertAudit;
    private insertAuditTx;
}
