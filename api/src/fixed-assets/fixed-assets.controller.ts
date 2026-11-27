import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { Permissions } from '../auth/permissions.decorator';
import { FixedAssetsService } from './fixed-assets.service';

@Controller('fixed-assets')
@UseGuards(AuthGuard)
export class FixedAssetsController {
  constructor(private readonly assets: FixedAssetsService) {}

  @Get('categories')
  @Permissions('fixed_assets.read')
  @Header('Cache-Control', 'no-store')
  categories(@Req() request: AuthenticatedRequest) {
    return this.assets.listCategories(request.user);
  }

  @Get('assets')
  @Permissions('fixed_assets.read')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest) {
    return this.assets.listAssets(request.user);
  }

  @Get('assets/:id')
  @Permissions('fixed_assets.read')
  @Header('Cache-Control', 'no-store')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.assets.getAsset(request.user, id);
  }

  @Get('depreciation')
  @Permissions('fixed_assets.read')
  @Header('Cache-Control', 'no-store')
  depreciation(
    @Req() request: AuthenticatedRequest,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.assets.listDepreciation(request.user, year, month);
  }

  @Post('categories')
  @Permissions('fixed_assets.manage')
  createCategory(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.assets.createCategory(request.user, body);
  }

  @Post('assets')
  @Permissions('fixed_assets.manage')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.assets.createAsset(request.user, body);
  }

  @Post('assets/:id/activate')
  @Permissions('fixed_assets.manage')
  activate(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.assets.activateAsset(request.user, id, body);
  }

  @Post('assets/:id/dispose')
  @Permissions('fixed_assets.dispose')
  dispose(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.assets.disposeAsset(request.user, id, body);
  }

  @Post('depreciation/runs')
  @Permissions('fixed_assets.depreciate')
  run(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.assets.runDepreciation(request.user, body);
  }

  @Post('depreciation/post-period')
  @Permissions('fixed_assets.depreciate')
  postPeriod(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.assets.postDepreciationPeriod(request.user, body);
  }

  @Post('depreciation/lines/:id/post')
  @Permissions('fixed_assets.depreciate')
  postLine(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.assets.postDepreciationLine(request.user, id);
  }

  @Post('depreciation/lines/:id/reverse')
  @Permissions('fixed_assets.reverse')
  reverseLine(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.assets.reverseDepreciationLine(request.user, id, body);
  }

  @Post('depreciation/lines/:id/void')
  @Permissions('fixed_assets.depreciate')
  voidLine(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.assets.voidDepreciationLine(request.user, id, body);
  }
}
