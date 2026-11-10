import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreateCategoryInput, PublishListingInput, UpsertStorefrontSettingsInput } from './ecommerce.types';
import { EcommerceService } from './ecommerce.service';
export declare class EcommerceAdminController {
    private readonly ecommerceService;
    constructor(ecommerceService: EcommerceService);
    getSettings(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow>;
    upsertSettings(request: AuthenticatedRequest, body: UpsertStorefrontSettingsInput): Promise<{
        id: string;
    }>;
    createCategory(request: AuthenticatedRequest, body: CreateCategoryInput): Promise<{
        id: string;
        code: string;
    }>;
    listCategories(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    publishListing(request: AuthenticatedRequest, body: PublishListingInput): Promise<{
        id: string;
    }>;
    listListings(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    listSubscribers(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    unsubscribe(request: AuthenticatedRequest, subscriberId: string): Promise<{
        id: string;
        status: string;
    }>;
}
