import type { AddCartItemInput, CheckoutCartInput, SubscribeInput } from './ecommerce.types';
import { EcommerceService } from './ecommerce.service';
export declare class EcommerceStorefrontController {
    private readonly ecommerceService;
    constructor(ecommerceService: EcommerceService);
    unsubscribe(companyCode: string, input: {
        token: string;
    }): Promise<{
        status: string;
    }>;
    getStorefrontBySlug(storeSlug: string, query?: string, categoryCode?: string): Promise<{
        store: import("pg").QueryResultRow;
        categories: import("pg").QueryResultRow[];
        products: import("pg").QueryResultRow[];
    }>;
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
    subscribe(companyCode: string, body: SubscribeInput): Promise<{
        id: string;
        status: string;
        unsubscribeToken: string;
    }>;
    getCart(companyCode: string, cartId: string, cartToken?: string): Promise<{
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
    addCartItem(companyCode: string, cartId: string, cartToken: string | undefined, body: AddCartItemInput): Promise<{
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
    removeCartItem(companyCode: string, cartId: string, itemId: string, cartToken: string | undefined): Promise<{
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
    checkoutCart(companyCode: string, cartId: string, cartToken: string | undefined, body: CheckoutCartInput): Promise<{
        cartId: string;
        orderId: string;
        orderNumber: string;
        checkoutNumber: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
        replayed: boolean;
    } | {
        cartId: string;
        checkoutNumber: string;
        orderId: string;
        orderNumber: string;
        subtotal: number;
        taxTotal: number;
        grandTotal: number;
        replayed?: undefined;
    }>;
}
