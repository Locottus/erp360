import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';

@Module({
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, DatabaseService, AuthService, AuthGuard],
})
export class FixedAssetsModule {}
