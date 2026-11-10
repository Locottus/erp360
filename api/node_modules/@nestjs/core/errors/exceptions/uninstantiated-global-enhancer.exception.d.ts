import { RuntimeException } from './runtime.exception';
export declare class UninstantiatedGlobalEnhancerException extends RuntimeException {
    constructor(enhancerToken: string, provider: string);
}
