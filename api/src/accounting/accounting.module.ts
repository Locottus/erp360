import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { AccountingController, PaymentWebhookController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  controllers: [AccountingController, PaymentWebhookController],
  providers: [AccountingService, DatabaseService, AuthService, AuthGuard],
})
export class AccountingModule {}
