export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type UpsertStorefrontSettingsInput = {
  storeName: string;
  storeSlug: string;
  currencyCode?: string;
  defaultTaxRateCode?: string;
  supportEmail?: string;
  isActive?: boolean;
  theme?: Record<string, unknown>;
};

export type CreateCategoryInput = {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
};

export type PublishListingInput = {
  productId: string;
  slug: string;
  title: string;
  categoryCode?: string;
  shortDescription?: string;
  longDescription?: string;
  unitPrice: number;
  compareAtPrice?: number;
  featuredImageUrl?: string;
  sortOrder?: number;
  isPublished?: boolean;
};

export type AddCartItemInput = {
  listingId: string;
  quantity: number;
};

export type CheckoutCartInput = {
  customerName: string;
  customerEmail: string;
  customerCode?: string;
  customerTaxId?: string;
  notes?: string;
  deliveryMethod?: 'pickup' | 'delivery';
  deliveryAddress?: string;
  phone?: string;
};

export type SubscribeInput = {
  email: string;
  fullName?: string;
  acceptsMarketing: boolean;
  consentVersion?: string;
};
