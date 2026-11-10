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

abstract class BaseSandboxAdapter implements FiscalAdapter {
  abstract country: CountryCode;

  async submit(payload: Record<string, unknown>, config: FiscalAdapterConfig): Promise<FiscalSubmitResult> {
    const control = String(payload['controlNumber'] ?? '');
    const track = `${this.country}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const accepted = config.environment === 'sandbox' || control.length > 4;
    return {
      status: accepted ? 'accepted' : 'submitted',
      providerTrackId: track,
      message: accepted ? 'Documento aceptado en ambiente de homologacion.' : 'Documento enviado y pendiente.',
      responsePayload: {
        adapter_country: this.country,
        provider: config.providerCode,
        environment: config.environment,
        endpoint: config.endpointUrl,
      },
    };
  }
}

export class GuatemalaFelAdapter extends BaseSandboxAdapter {
  country: CountryCode = 'GT';
}

export class ElSalvadorDteAdapter extends BaseSandboxAdapter {
  country: CountryCode = 'SV';
}

export class DominicanRepublicEcfAdapter extends BaseSandboxAdapter {
  country: CountryCode = 'DO';
}

export function buildFiscalAdapter(country: CountryCode): FiscalAdapter {
  switch (country) {
    case 'GT':
      return new GuatemalaFelAdapter();
    case 'SV':
      return new ElSalvadorDteAdapter();
    case 'DO':
      return new DominicanRepublicEcfAdapter();
    default:
      throw new Error(`Unsupported fiscal country: ${country}`);
  }
}
