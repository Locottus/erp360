import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { EcommerceAdminController } from './ecommerce.admin.controller';
import { EcommerceService } from './ecommerce.service';
import { EcommerceStorefrontController } from './ecommerce.storefront.controller';

@Module({
  controllers: [EcommerceAdminController, EcommerceStorefrontController],
  providers: [EcommerceService, DatabaseService, AuthService, AuthGuard],
})
export class EcommerceModule {}
