import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { DatabaseService } from '../common/database.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, DatabaseService],
  exports: [AuthService],
})
export class AuthModule {}
