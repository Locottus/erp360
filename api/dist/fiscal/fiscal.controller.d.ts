import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CountryCode, CreateFiscalDocumentInput, UpsertProviderConfigInput } from './fiscal.types';
import { FiscalService } from './fiscal.service';
export declare class FiscalController {
    private readonly fiscalService;
    constructor(fiscalService: FiscalService);
    upsertProviderConfig(request: AuthenticatedRequest, body: UpsertProviderConfigInput): Promise<{
        id: string;
        status: string;
    }>;
    createFiscalDocument(request: AuthenticatedRequest, invoiceId: string, body: CreateFiscalDocumentInput): Promise<{
        id: string;
        status: string;
        payload: {
            country: CountryCode;
            provider: string;
            environment: "sandbox" | "production";
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
    submitFiscalDocument(request: AuthenticatedRequest, fiscalDocumentId: string): Promise<{
        id: string;
        status: "rejected" | "submitted" | "accepted" | "error";
        providerTrackId: string;
        message: string;
    }>;
    getFiscalDocument(request: AuthenticatedRequest, fiscalDocumentId: string): Promise<import("pg").QueryResultRow>;
    listFiscalDocuments(request: AuthenticatedRequest, countryCode?: CountryCode): Promise<import("pg").QueryResultRow[]>;
}
