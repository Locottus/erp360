"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAAS_MODULES = exports.requiredMoney = exports.requiredDate = void 0;
exports.objectInput = objectInput;
exports.requiredText = requiredText;
exports.requiredReference = requiredReference;
exports.requiredReason = requiredReason;
exports.parseModulePrices = parseModulePrices;
exports.requireSaasRole = requireSaasRole;
const common_1 = require("@nestjs/common");
const decimal_input_1 = require("../common/decimal-input");
Object.defineProperty(exports, "requiredMoney", { enumerable: true, get: function () { return decimal_input_1.requiredDecimal; } });
var iso_date_1 = require("../common/iso-date");
Object.defineProperty(exports, "requiredDate", { enumerable: true, get: function () { return iso_date_1.requiredDate; } });
exports.SAAS_MODULES = [
    'base',
    'sales',
    'purchases',
    'inventory',
    'accounting',
    'store',
    'people',
];
function objectInput(input, label = 'Request body') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new common_1.BadRequestException(`${label} must be an object.`);
    }
    return input;
}
function requiredText(input, field, maxLength, options = {}) {
    if (typeof input !== 'string') {
        throw new common_1.BadRequestException(`${field} must be a string.`);
    }
    const value = input.trim();
    if (!value ||
        value.length > maxLength ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
        throw new common_1.BadRequestException(`${field} is required and must be at most ${maxLength} characters.`);
    }
    return options.lowerCase ? value.toLowerCase() : value;
}
function requiredReference(input) {
    return requiredText(input, 'reference', 120);
}
function requiredReason(input, field = 'reason') {
    const reason = requiredText(input, field, 2000);
    if (reason.length < 10) {
        throw new common_1.BadRequestException(`${field} must contain at least 10 characters.`);
    }
    return reason;
}
function parseModulePrices(input) {
    if (!Array.isArray(input) ||
        input.length === 0 ||
        input.length > exports.SAAS_MODULES.length) {
        throw new common_1.BadRequestException('modules must contain between one and seven module prices.');
    }
    const seen = new Set();
    const modules = input.map((entry, index) => {
        const row = objectInput(entry, `modules[${index}]`);
        const code = requiredText(row.code, `modules[${index}].code`, 32);
        if (!exports.SAAS_MODULES.includes(code)) {
            throw new common_1.BadRequestException(`modules[${index}].code is not supported.`);
        }
        if (seen.has(code)) {
            throw new common_1.BadRequestException('modules cannot contain duplicate codes.');
        }
        seen.add(code);
        return {
            code: code,
            price: (0, decimal_input_1.requiredDecimal)(row.price, `modules[${index}].price`, true),
        };
    });
    if (!seen.has('base')) {
        throw new common_1.BadRequestException('The base module is required for every subscription.');
    }
    if (seen.has('store') && (!seen.has('sales') || !seen.has('inventory'))) {
        throw new common_1.BadRequestException('The store module requires both sales and inventory.');
    }
    return modules.sort((left, right) => exports.SAAS_MODULES.indexOf(left.code) - exports.SAAS_MODULES.indexOf(right.code));
}
function requireSaasRole(role, write = false) {
    if (!role) {
        throw new common_1.ForbiddenException('Enabled platform SaaS membership is required.');
    }
    if (write && role === 'viewer') {
        throw new common_1.ForbiddenException('A billing or owner platform role is required for this action.');
    }
}
//# sourceMappingURL=saas-inputs.js.map