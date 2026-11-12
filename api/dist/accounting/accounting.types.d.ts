export type AuthUser = {
    sub: string;
    email: string;
    companyId: string;
    roles: string[];
};
export type RegisterInvoicePaymentInput = {
    paymentReference: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
};
export type ClosePeriodInput = {
    year: number;
    month: number;
};
