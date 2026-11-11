"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredDecimal = requiredDecimal;
const common_1 = require("@nestjs/common");
function requiredDecimal(input, field, allowZero = false) {
    if (typeof input !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(input)) {
        throw new common_1.BadRequestException(`${field} must be a decimal string with at most four fractional digits.`);
    }
    const [whole, fraction = ''] = input.split('.');
    const normalized = `${whole}.${fraction.padEnd(4, '0')}`;
    if (!allowZero && normalized === '0.0000') {
        throw new common_1.BadRequestException(`${field} must be greater than zero.`);
    }
    return normalized;
}
//# sourceMappingURL=decimal-input.js.map