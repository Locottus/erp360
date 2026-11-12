import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { MastersModule } from './masters/masters.module';
import { CommerceModule } from './commerce/commerce.module';
import { InventoryModule } from './inventory/inventory.module';
import { AccountingModule } from './accounting/accounting.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { PortalModule } from './portal/portal.module';
import { HrModule } from './hr/hr.module';
import { RpcLegacyModule } from './rpc-legacy/rpc-legacy.module';
import { EcommerceModule } from './ecommerce/ecommerce.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SaasModule } from './saas/saas.module';
import { AssistantModule } from './assistant/assistant.module';

@Module({
  imports: [
    AuthModule,
    CompaniesModule,
    MastersModule,
    CommerceModule,
    InventoryModule,
    AccountingModule,
    FiscalModule,
    PortalModule,
    HrModule,
    RpcLegacyModule,
    EcommerceModule,
    DashboardModule,
    SaasModule,
    AssistantModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
