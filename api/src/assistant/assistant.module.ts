import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';
import { SaasOperatorGuard } from '../saas/saas-operator.guard';
import { AssistantController, AssistantOperatorController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { DeepSeekProvider } from './deepseek.provider';
import { OpenAiProvider } from './openai.provider';
import { ClaudeProvider } from './claude.provider';
import { AiProviderService } from './ai-provider.service';
import { AssistantDiagnosticsService } from './assistant-diagnostics.service';

@Module({
  controllers: [AssistantController, AssistantOperatorController],
  providers: [AssistantService, AssistantDiagnosticsService, AiProviderService, DeepSeekProvider, OpenAiProvider, ClaudeProvider, DatabaseService, AuthService, AuthGuard, SaasOperatorGuard],
})
export class AssistantModule {}
