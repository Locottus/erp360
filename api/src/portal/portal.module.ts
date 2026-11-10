import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { PortalAdminController } from './portal.admin.controller';
import { PortalPublicController } from './portal.public.controller';
import { PortalService } from './portal.service';

@Module({
  controllers: [PortalAdminController, PortalPublicController],
  providers: [PortalService, DatabaseService, AuthService, AuthGuard],
})
export class PortalModule {}
