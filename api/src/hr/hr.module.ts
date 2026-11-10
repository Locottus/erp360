import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';

@Module({
  controllers: [HrController],
  providers: [HrService, DatabaseService, AuthService, AuthGuard],
})
export class HrModule {}
