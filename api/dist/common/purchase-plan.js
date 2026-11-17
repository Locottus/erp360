"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePurchasePlan = normalizePurchasePlan;
const common_1 = require("@nestjs/common");
const iso_date_1 = require("./iso-date");
function normalizePurchasePlan(input) {
    let destinationLocationCode = null;
    if (input.destinationLocationCode != null) {
        if (typeof input.destinationLocationCode !== 'string' ||
            /[\u0000-\u001f\u007f]/.test(input.destinationLocationCode)) {
            throw new common_1.BadRequestException('destinationLocationCode must be a location code or null.');
        }
        destinationLocationCode = input.destinationLocationCode.trim().toUpperCase();
        if (!destinationLocationCode || destinationLocationCode.length > 32) {
            throw new common_1.BadRequestException('destinationLocationCode must have 1 to 32 characters.');
        }
    }
    return {
        destinationLocationCode,
        expectedReceiptDate: input.expectedReceiptDate == null
            ? null : (0, iso_date_1.requiredDate)(input.expectedReceiptDate, 'expectedReceiptDate'),
    };
}
//# sourceMappingURL=purchase-plan.js.map