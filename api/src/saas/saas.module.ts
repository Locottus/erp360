import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import {
  SaasIdentityController,
  SaasOperatorController,
} from './saas.controller';
import { SaasOperatorGuard } from './saas-operator.guard';
import { SaasService } from './saas.service';

@Module({
  controllers: [SaasIdentityController, SaasOperatorController],
  providers: [
    SaasService,
    DatabaseService,
    AuthService,
    AuthGuard,
    SaasOperatorGuard,
  ],
})
export class SaasModule {}
