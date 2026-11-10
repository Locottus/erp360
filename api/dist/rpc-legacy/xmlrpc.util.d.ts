export declare function parseValue(content: string): unknown;
export declare function parseXmlRpcRequest(xml: string): {
    methodName: string;
    params: unknown[];
};
export declare function buildXmlRpcResponse(value: unknown): string;
export declare function buildXmlRpcFault(message: string): string;
