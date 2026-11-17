import type { PurchasePlanInput } from '../common/purchase-plan';

export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type SalesLineInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

export type CreateQuotationInput = {
  quotationNumber: string;
  customerId: string;
  taxRateCode?: string;
  notes?: string;
  validUntil?: string | null;
  lines: SalesLineInput[];
};

export type PurchaseLineInput = {
  productId: string;
  quantity: number;
  unitCost?: number;
};

export type CreatePurchaseRequestInput = PurchasePlanInput & {
  requestNumber: string;
  supplierId: string;
  taxRateCode?: string;
  lines: PurchaseLineInput[];
};

export type RevisePurchaseDeliveryPlanInput = Required<PurchasePlanInput> & {
  expectedRevision: number;
  reason: string;
};
