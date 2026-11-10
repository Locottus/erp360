export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type StockAdjustmentInput = {
  productId: string;
  locationCode?: string;
  direction: 'in' | 'out';
  quantity: number;
  notes?: string;
};
