import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';

@Module({
  controllers: [CommerceController],
  providers: [CommerceService, DatabaseService, AuthService, AuthGuard],
})
export class CommerceModule {}
