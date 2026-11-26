import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type {
  CreateCustomerInput,
  CreateProductInput,
  CreateSupplierInput,
  CreateTaxRateInput,
} from './masters.types';
import { MastersService } from './masters.service';

@Controller('masters')
@UseGuards(AuthGuard)
export class MastersController {
  constructor(private readonly mastersService: MastersService) {}

  @Patch(':kind/:id')
  @Roles('admin')
  @Permissions('masters.update')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: unknown,
  ) {
    return this.mastersService.updateRecord(request.user, kind, id, input);
  }

  @Post(':kind/import')
  @Roles('admin')
  @Permissions('masters.import')
  import(
    @Req() request: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Body() body: { records: unknown },
  ) {
    return this.mastersService.importRecords(request.user, kind, body.records);
  }

  @Get('customers')
  @Roles('admin', 'sales')
  @Permissions('masters.customers.read')
  listCustomers(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listCustomers(request.user);
  }

  @Post('customers')
  @Roles('admin')
  @Permissions('masters.customers.create')
  createCustomer(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateCustomerInput,
  ) {
    return this.mastersService.createCustomer(request.user, body);
  }

  @Get('products')
  @Permissions('masters.products.read')
  listProducts(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listProducts(request.user);
  }

  @Post('products')
  @Roles('admin')
  @Permissions('masters.products.create')
  createProduct(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateProductInput,
  ) {
    return this.mastersService.createProduct(request.user, body);
  }

  @Get('suppliers')
  @Roles('admin', 'purchases')
  @Permissions('masters.suppliers.read')
  listSuppliers(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listSuppliers(request.user);
  }

  @Post('suppliers')
  @Roles('admin')
  @Permissions('masters.suppliers.create')
  createSupplier(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateSupplierInput,
  ) {
    return this.mastersService.createSupplier(request.user, body);
  }

  @Get('tax-rates')
  @Permissions('masters.tax-rates.read')
  listTaxRates(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listTaxRates(request.user);
  }

  @Post('tax-rates')
  @Roles('admin')
  @Permissions('masters.tax-rates.create')
  createTaxRate(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateTaxRateInput,
  ) {
    return this.mastersService.createTaxRate(request.user, body);
  }
}
