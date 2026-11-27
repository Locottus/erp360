import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { PettyCashController } from './petty-cash.controller';
import { PettyCashService } from './petty-cash.service';

@Module({
  controllers: [PettyCashController],
  providers: [PettyCashService, DatabaseService, AuthService, AuthGuard],
})
export class PettyCashModule {}
