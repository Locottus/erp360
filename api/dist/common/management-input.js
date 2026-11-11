"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expectedRevision = expectedRevision;
exports.changeReason = changeReason;
const common_1 = require("@nestjs/common");
function expectedRevision(value) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new common_1.BadRequestException('expectedRevision must be a non-negative safe integer.');
    }
    return value;
}
function changeReason(value) {
    if (typeof value !== 'string' || value.trim().length < 10 || value.length > 1000 ||
        /[\u0000-\u001f]/.test(value)) {
        throw new common_1.BadRequestException('reason must contain 10 to 1000 characters without control characters.');
    }
    return value.trim();
}
//# sourceMappingURL=management-input.js.map