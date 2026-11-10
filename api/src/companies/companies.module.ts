import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, DatabaseService, AuthService, AuthGuard],
})
export class CompaniesModule {}
