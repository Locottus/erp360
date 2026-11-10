import { RuntimeException } from './runtime.exception';
export declare class RequestScopedGlobalEnhancerException extends RuntimeException {
    constructor(enhancerToken: string, provider: string, kind: 'useClass' | 'useExisting' | 'useFactory');
}
