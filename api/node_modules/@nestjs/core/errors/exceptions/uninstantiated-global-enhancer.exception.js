"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UninstantiatedGlobalEnhancerException = void 0;
const messages_1 = require("../messages");
const runtime_exception_1 = require("./runtime.exception");
class UninstantiatedGlobalEnhancerException extends runtime_exception_1.RuntimeException {
    constructor(enhancerToken, provider) {
        super((0, messages_1.UNINSTANTIATED_GLOBAL_ENHANCER_MESSAGE)(enhancerToken, provider));
    }
}
exports.UninstantiatedGlobalEnhancerException = UninstantiatedGlobalEnhancerException;
