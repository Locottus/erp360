import type { AuthTokenPayload } from '../auth/auth.types';
import { DatabaseService } from '../common/database.service';
import { type DiagnosticTarget } from './assistant-inputs';
type Facts = Record<string, boolean | number | string | null>;
type Finding = {
    code: string;
    severity: 'info' | 'warning' | 'blocking';
    title: string;
    recommendation: string;
    evidenceIds: string[];
    route: string;
};
export type DiagnosticReport = {
    target: DiagnosticTarget;
    capturedAt: string;
    readOnly: true;
    evidence: {
        id: string;
        source: string;
        facts: Facts;
    }[];
    findings: Finding[];
    limitations: string[];
};
export declare class AssistantDiagnosticsService {
    private readonly db;
    constructor(db: DatabaseService);
    inspect(user: AuthTokenPayload, input: unknown): Promise<DiagnosticReport>;
    private evidence;
    private finding;
    private state;
    private screen;
    private purchase;
    private sales;
    private stock;
}
export declare function providerDiagnostic(report: DiagnosticReport): {
    capturedAt: string;
    tool: "stock" | "screen" | "purchase-request" | "sales-order";
    evidence: {
        id: string;
        source: string;
        facts: Facts;
    }[];
    findings: Finding[];
    limitations: string[];
};
export {};
