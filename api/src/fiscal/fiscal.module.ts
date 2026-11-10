import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';

@Module({
  controllers: [FiscalController],
  providers: [FiscalService, DatabaseService, AuthService, AuthGuard],
})
export class FiscalModule {}
