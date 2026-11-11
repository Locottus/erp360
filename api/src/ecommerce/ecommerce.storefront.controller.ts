import { Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import type { AddCartItemInput, CheckoutCartInput, SubscribeInput } from './ecommerce.types';
import { EcommerceService } from './ecommerce.service';

@Controller('ecommerce/storefront')
export class EcommerceStorefrontController {
  constructor(private readonly ecommerceService: EcommerceService) {}

  @Get('by-slug/:storeSlug')
  getStorefrontBySlug(
    @Param('storeSlug') storeSlug: string,
    @Query('q') query?: string,
    @Query('category') categoryCode?: string,
  ) {
    return this.ecommerceService.getStorefrontBySlug(storeSlug, query, categoryCode);
  }

  @Get(':companyCode')
  getStorefront(
    @Param('companyCode') companyCode: string,
    @Query('q') query?: string,
    @Query('category') categoryCode?: string,
  ) {
    return this.ecommerceService.getStorefront(companyCode, query, categoryCode);
  }

  @Post(':companyCode/carts')
  createCart(@Param('companyCode') companyCode: string) {
    return this.ecommerceService.createCart(companyCode);
  }

  @Post(':companyCode/subscribe')
  subscribe(@Param('companyCode') companyCode: string, @Body() body: SubscribeInput) {
    return this.ecommerceService.subscribe(companyCode, body);
  }

  @Get(':companyCode/carts/:cartId')
  getCart(
    @Param('companyCode') companyCode: string,
    @Param('cartId') cartId: string,
    @Headers('x-cart-token') cartToken?: string,
  ) {
    return this.ecommerceService.getCart(companyCode, cartId, cartToken ?? '');
  }

  @Post(':companyCode/carts/:cartId/items')
  addCartItem(
    @Param('companyCode') companyCode: string,
    @Param('cartId') cartId: string,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Body() body: AddCartItemInput,
  ) {
    return this.ecommerceService.addCartItem(companyCode, cartId, cartToken ?? '', body);
  }

  @Delete(':companyCode/carts/:cartId/items/:itemId')
  removeCartItem(
    @Param('companyCode') companyCode: string,
    @Param('cartId') cartId: string,
    @Param('itemId') itemId: string,
    @Headers('x-cart-token') cartToken: string | undefined,
  ) {
    return this.ecommerceService.removeCartItem(companyCode, cartId, cartToken ?? '', itemId);
  }

  @Post(':companyCode/carts/:cartId/checkout')
  checkoutCart(
    @Param('companyCode') companyCode: string,
    @Param('cartId') cartId: string,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Body() body: CheckoutCartInput,
  ) {
    return this.ecommerceService.checkoutCart(companyCode, cartId, cartToken ?? '', body);
  }
}
