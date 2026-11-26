import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type {
  CountryCode,
  CreateFiscalDocumentInput,
  UpsertProviderConfigInput,
} from './fiscal.types';
import { FiscalService } from './fiscal.service';

@Controller('fiscal')
@UseGuards(AuthGuard)
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Post('providers/config')
  @Roles('admin')
  @Permissions('fiscal.manage')
  upsertProviderConfig(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpsertProviderConfigInput,
  ) {
    return this.fiscalService.upsertProviderConfig(request.user, body);
  }

  @Post('invoices/:id/documents')
  @Roles('admin')
  @Permissions('fiscal.manage')
  createFiscalDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id') invoiceId: string,
    @Body() body: CreateFiscalDocumentInput,
  ) {
    return this.fiscalService.createFiscalDocument(
      request.user,
      invoiceId,
      body,
    );
  }

  @Post('documents/:id/submit')
  @Roles('admin')
  @Permissions('fiscal.manage')
  submitFiscalDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id') fiscalDocumentId: string,
  ) {
    return this.fiscalService.submitFiscalDocument(
      request.user,
      fiscalDocumentId,
    );
  }

  @Get('documents/:id')
  @Roles('admin')
  @Permissions('fiscal.read')
  getFiscalDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id') fiscalDocumentId: string,
  ) {
    return this.fiscalService.getFiscalDocument(request.user, fiscalDocumentId);
  }

  @Get('documents')
  @Roles('admin')
  @Permissions('fiscal.read')
  listFiscalDocuments(
    @Req() request: AuthenticatedRequest,
    @Query('countryCode') countryCode?: CountryCode,
  ) {
    return this.fiscalService.listFiscalDocuments(request.user, countryCode);
  }
}
