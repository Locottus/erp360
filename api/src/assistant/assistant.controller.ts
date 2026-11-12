import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { SaasRole } from '../saas/saas-inputs';
import { SaasOperatorGuard } from '../saas/saas-operator.guard';
import { AssistantService } from './assistant.service';
import { AssistantDiagnosticsService } from './assistant-diagnostics.service';

type OperatorRequest = AuthenticatedRequest & { saasRole: SaasRole };
const operator = (request: OperatorRequest) => ({ ...request.user, saasRole: request.saasRole });

@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService, private readonly diagnostics: AssistantDiagnosticsService) {}
  @Post('diagnostics')
  @Header('Cache-Control', 'no-store')
  diagnose(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.diagnostics.inspect(request.user, body);
  }
  @Get('usage')
  @Header('Cache-Control', 'no-store')
  usage(@Req() request: AuthenticatedRequest) { return this.assistant.usage(request.user); }
  @Post('chat')
  @Header('Cache-Control', 'no-store')
  chat(@Req() request: AuthenticatedRequest, @Body() body: unknown) { return this.assistant.chat(request.user, body); }
}

@Controller('assistant/admin')
@UseGuards(AuthGuard, SaasOperatorGuard)
export class AssistantOperatorController {
  constructor(private readonly assistant: AssistantService) {}
  @Get('service-types')
  types() { return this.assistant.types(); }
  @Get('options')
  options() { return this.assistant.options(); }
  @Post('service-types')
  saveType(@Req() request: OperatorRequest, @Body() body: unknown) { return this.assistant.saveType(operator(request), body); }
  @Get('companies/:id')
  company(@Req() request: OperatorRequest, @Param('id', ParseUUIDPipe) id: string) { return this.assistant.company(operator(request), id); }
  @Get('companies/:id/provider')
  @Header('Cache-Control', 'no-store')
  config(@Req() request: OperatorRequest, @Param('id', ParseUUIDPipe) id: string, @Query('provider') provider?: string) {
    return this.assistant.config(operator(request), id, provider);
  }
  @Post('companies/:id/provider')
  saveConfig(@Req() request: OperatorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.assistant.saveConfig(operator(request), id, body); }
  @Post('companies/:id/users/:userId/service')
  assign(@Req() request: OperatorRequest, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @Body() body: unknown) {
    return this.assistant.assign(operator(request), id, userId, body);
  }
  @Post('companies/:id/token-purchases')
  purchase(@Req() request: OperatorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.assistant.purchase(operator(request), id, body); }
  @Post('companies/:id/requests/:requestId/reconcile')
  reconcile(@Req() request: OperatorRequest, @Param('id', ParseUUIDPipe) id: string, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() body: unknown) {
    return this.assistant.reconcile(operator(request), id, requestId, body);
  }
}
