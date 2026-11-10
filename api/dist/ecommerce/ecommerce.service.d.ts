import { DatabaseService } from '../common/database.service';
import type { AddCartItemInput, AuthUser, CheckoutCartInput, CreateCategoryInput, PublishListingInput, SubscribeInput, UpsertStorefrontSettingsInput } from './ecommerce.types';
export declare class EcommerceService {
    private readonly db;
    constructor(db: DatabaseService);
    getAdminSettings(user: AuthUser): Promise<import("pg").QueryResultRow>;
    upsertAdminSettings(user: AuthUser, input: UpsertStorefrontSettingsInput): Promise<{
        id: string;
    }>;
    createCategory(user: AuthUser, input: CreateCategoryInput): Promise<{
        id: string;
        code: string;
    }>;
    listCategories(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    publishListing(user: AuthUser, input: PublishListingInput): Promise<{
        id: string;
    }>;
    listAdminListings(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    getStorefront(companyCode: string, query?: string, categoryCode?: string): Promise<{
        store: import("pg").QueryResultRow;
        categories: import("pg").QueryResultRow[];
        products: import("pg").QueryResultRow[];
    }>;
    createCart(companyCode: string): Promise<{
        cartId: string;
        cartToken: string;
        currencyCode: string;
    }>;
    getCart(companyCode: string, cartId: string, cartToken: string): Promise<{
        cart: {
            id: string;
            status: string;
            currencyCode: string;
            subtotal: string;
            taxTotal: string;
            grandTotal: string;
        };
        items: import("pg").QueryResultRow[];
        companyId: string;
    }>;
    addCartItem(companyCode: string, cartId: string, cartToken: string, input: AddCartItemInput): Promise<{
        cart: {
            id: string;
            status: string;
            currencyCode: string;
            subtotal: string;
            taxTotal: string;
            grandTotal: string;
        };
        items: import("pg").QueryResultRow[];
        companyId: string;
    }>;
    removeCartItem(companyCode: string, cartId: string, cartToken: string, itemId: string): Promise<{
        cart: {
            id: string;
            status: string;
            currencyCode: string;
            subtotal: string;
            taxTotal: string;
            grandTotal: string;
        };
        items: import("pg").QueryResultRow[];
        companyId: string;
    }>;
    checkoutCart(companyCode: string, cartId: string, cartToken: string, input: CheckoutCartInput): Promise<{
        cartId: string;
        checkoutNumber: string;
        orderId: string;
        orderNumber: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
    }>;
    subscribe(companyCode: string, input: SubscribeInput): Promise<{
        id: string;
        status: string;
    }>;
    listSubscribers(user: AuthUser): Promise<import("pg").QueryResultRow[]>;
    unsubscribe(user: AuthUser, subscriberId: string): Promise<{
        id: string;
        status: string;
    }>;
    private resolveCompanyByCode;
    private assertCartAccess;
    private hashSecret;
    private isValidEmail;
    private getAvailableStock;
    private getAvailableStockTx;
    private recalculateCartTotals;
    private resolveDefaultTaxRatePercent;
    private computeCartTotalsWithTax;
    private resolveOrCreateCustomer;
    private nextSequence;
    private reserveSalesOrderStockTx;
    private insertAudit;
    private insertAuditTx;
}
