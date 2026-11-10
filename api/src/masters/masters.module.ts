import { Module } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';
import { DatabaseService } from '../common/database.service';
import { MastersController } from './masters.controller';
import { MastersService } from './masters.service';

@Module({
  controllers: [MastersController],
  providers: [MastersService, DatabaseService, AuthService, AuthGuard],
})
export class MastersModule {}
