export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type CreateCustomerInput = {
  code: string;
  name: string;
  email?: string;
  taxId?: string;
};

export type CreateProductInput = {
  sku: string;
  name: string;
  description?: string;
  unitPrice: number;
};

export type CreateSupplierInput = {
  code: string;
  name: string;
  email?: string;
  taxId?: string;
};

export type CreateTaxRateInput = {
  code: string;
  name: string;
  rate: number;
  taxType: 'vat' | 'withholding' | 'other';
};
