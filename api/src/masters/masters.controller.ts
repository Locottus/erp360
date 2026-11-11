import { Body, Controller, Get, Post, Patch, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
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
  update(@Req() request: AuthenticatedRequest, @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string, @Body() input: unknown) {
    return this.mastersService.updateRecord(request.user, kind, id, input);
  }

  @Post(':kind/import')
  @Roles('admin')
  import(@Req() request: AuthenticatedRequest, @Param('kind') kind: string,
    @Body() body: { records: unknown }) {
    return this.mastersService.importRecords(request.user, kind, body.records);
  }

  @Get('customers')
  listCustomers(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listCustomers(request.user);
  }

  @Post('customers')
  @Roles('admin')
  createCustomer(@Req() request: AuthenticatedRequest, @Body() body: CreateCustomerInput) {
    return this.mastersService.createCustomer(request.user, body);
  }

  @Get('products')
  listProducts(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listProducts(request.user);
  }

  @Post('products')
  @Roles('admin')
  createProduct(@Req() request: AuthenticatedRequest, @Body() body: CreateProductInput) {
    return this.mastersService.createProduct(request.user, body);
  }

  @Get('suppliers')
  listSuppliers(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listSuppliers(request.user);
  }

  @Post('suppliers')
  @Roles('admin')
  createSupplier(@Req() request: AuthenticatedRequest, @Body() body: CreateSupplierInput) {
    return this.mastersService.createSupplier(request.user, body);
  }

  @Get('tax-rates')
  listTaxRates(@Req() request: AuthenticatedRequest) {
    return this.mastersService.listTaxRates(request.user);
  }

  @Post('tax-rates')
  @Roles('admin')
  createTaxRate(@Req() request: AuthenticatedRequest, @Body() body: CreateTaxRateInput) {
    return this.mastersService.createTaxRate(request.user, body);
  }
}
