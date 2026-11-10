import { Module } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { RpcLegacyController } from './rpc-legacy.controller';
import { RpcLegacyService } from './rpc-legacy.service';

@Module({
  controllers: [RpcLegacyController],
  providers: [RpcLegacyService, DatabaseService, AuthService],
})
export class RpcLegacyModule {}
