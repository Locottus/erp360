import type { CountryCode } from './fiscal.types';
export type FiscalAdapterConfig = {
    providerCode: string;
    environment: 'sandbox' | 'production';
    endpointUrl: string;
    credentials: Record<string, unknown>;
};
export type FiscalSubmitResult = {
    status: 'submitted' | 'accepted' | 'rejected' | 'error';
    providerTrackId: string;
    message: string;
    responsePayload: Record<string, unknown>;
};
export interface FiscalAdapter {
    country: CountryCode;
    submit(payload: Record<string, unknown>, config: FiscalAdapterConfig): Promise<FiscalSubmitResult>;
}
declare abstract class BaseSandboxAdapter implements FiscalAdapter {
    abstract country: CountryCode;
    submit(payload: Record<string, unknown>, config: FiscalAdapterConfig): Promise<FiscalSubmitResult>;
}
export declare class GuatemalaFelAdapter extends BaseSandboxAdapter {
    country: CountryCode;
}
export declare class ElSalvadorDteAdapter extends BaseSandboxAdapter {
    country: CountryCode;
}
export declare class DominicanRepublicEcfAdapter extends BaseSandboxAdapter {
    country: CountryCode;
}
export declare function buildFiscalAdapter(country: CountryCode): FiscalAdapter;
export {};
