import type { Request } from 'express';
import { RpcLegacyService } from './rpc-legacy.service';
export declare class RpcLegacyController {
    private readonly rpcService;
    constructor(rpcService: RpcLegacyService);
    xmlRpc(body: string | Record<string, unknown>, request: Request & {
        rawBody?: Buffer;
    }): Promise<string>;
}
