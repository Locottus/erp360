import type { DiagnosticTarget } from './assistant-inputs';
type ScreenTarget = Extract<DiagnosticTarget, {
    kind: 'screen';
}>;
type Area = 'guide' | 'workspace' | 'catalogs' | 'sales' | 'purchases' | 'receiving' | 'controls' | 'accounting' | 'people' | 'company' | 'users' | 'ecommerce' | 'subscription' | 'platform' | 'portal' | 'fiscal' | 'inventory';
export declare function diagnosticArea(target: ScreenTarget): Area;
export declare const diagnosticKnowledge: Record<Area, {
    roles: string[];
    guidance: string;
    query?: string;
}>;
export {};
