import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreateCategoryInput, PublishListingInput, UpsertStorefrontSettingsInput } from './ecommerce.types';
import { EcommerceService } from './ecommerce.service';

@Controller('ecommerce/admin')
@UseGuards(AuthGuard)
@Roles('admin')
export class EcommerceAdminController {
  constructor(private readonly ecommerceService: EcommerceService) {}

  @Get('settings')
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.ecommerceService.getAdminSettings(request.user);
  }

  @Get('products')
  listProducts(@Req() request: AuthenticatedRequest) {
    return this.ecommerceService.listAdminProducts(request.user);
  }

  @Post('settings')
  upsertSettings(@Req() request: AuthenticatedRequest, @Body() body: UpsertStorefrontSettingsInput) {
    return this.ecommerceService.upsertAdminSettings(request.user, body);
  }

  @Post('categories')
  createCategory(@Req() request: AuthenticatedRequest, @Body() body: CreateCategoryInput) {
    return this.ecommerceService.createCategory(request.user, body);
  }

  @Get('categories')
  listCategories(@Req() request: AuthenticatedRequest) {
    return this.ecommerceService.listCategories(request.user);
  }

  @Post('listings')
  publishListing(@Req() request: AuthenticatedRequest, @Body() body: PublishListingInput) {
    return this.ecommerceService.publishListing(request.user, body);
  }

  @Get('listings')
  listListings(@Req() request: AuthenticatedRequest) {
    return this.ecommerceService.listAdminListings(request.user);
  }

  @Get('subscribers')
  listSubscribers(@Req() request: AuthenticatedRequest) {
    return this.ecommerceService.listSubscribers(request.user);
  }

  @Post('subscribers/:id/unsubscribe')
  unsubscribe(@Req() request: AuthenticatedRequest, @Param('id') subscriberId: string) {
    return this.ecommerceService.unsubscribe(request.user, subscriberId);
  }
}
