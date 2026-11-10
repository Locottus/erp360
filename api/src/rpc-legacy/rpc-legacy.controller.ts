import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RpcLegacyService } from './rpc-legacy.service';
import { buildXmlRpcFault, buildXmlRpcResponse, parseXmlRpcRequest } from './xmlrpc.util';

@Controller('rpc')
export class RpcLegacyController {
  constructor(private readonly rpcService: RpcLegacyService) {}

  @Post('xmlrpc')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async xmlRpc(
    @Body() body: string | Record<string, unknown>,
    @Req() request: Request & { rawBody?: Buffer },
  ) {
    try {
      const raw =
        typeof body === 'string'
          ? body
          : request.rawBody?.toString('utf-8') ??
            (typeof body === 'object' && body !== null && 'xml' in body ? String(body['xml']) : '');
      const { methodName, params } = parseXmlRpcRequest(raw);
      const value = await this.rpcService.execute(methodName, params);
      return buildXmlRpcResponse(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown XML-RPC error';
      return buildXmlRpcFault(message);
    }
  }
}
