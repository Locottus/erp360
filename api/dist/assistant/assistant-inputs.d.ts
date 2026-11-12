export declare const ASSISTANT_SCREENS: string[];
export type Message = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};
export type DiagnosticTarget = {
    kind: 'screen';
    screen: string;
    area?: string;
} | {
    kind: 'purchase-request';
    id: string;
} | {
    kind: 'sales-order' | 'stock';
    id: string;
    locationCode: string;
};
export declare function diagnosticTarget(input: unknown): DiagnosticTarget;
export declare function integer(input: unknown, field: string, min: number, max: number): number;
export declare function boolean(input: unknown, field: string): input is true;
export declare function uuid(input: unknown, field: string): string;
export declare function serviceCode(input: unknown): string;
export declare function chatInput(input: unknown): {
    requestId: string;
    provider: "deepseek" | "openai" | "claude";
    messages: Message[];
    target: DiagnosticTarget | undefined;
};
