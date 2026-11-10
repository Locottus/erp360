export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type CountryCode = 'GT' | 'SV' | 'DO';

export type UpsertProviderConfigInput = {
  countryCode: CountryCode;
  providerCode: string;
  environment: 'sandbox' | 'production';
  endpointUrl: string;
  credentials?: Record<string, unknown>;
};

export type CreateFiscalDocumentInput = {
  countryCode: CountryCode;
  documentType?: string;
};
