"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.masterDefinitions = void 0;
exports.masterDefinition = masterDefinition;
exports.validateMaster = validateMaster;
const common_1 = require("@nestjs/common");
exports.masterDefinitions = {
    customers: { table: 'customers', fields: { code: 'code', name: 'name', email: 'email', taxId: 'tax_id' } },
    products: { table: 'products', fields: { sku: 'sku', name: 'name', description: 'description', unitPrice: 'unit_price' } },
    suppliers: { table: 'suppliers', fields: { code: 'code', name: 'name', email: 'email', taxId: 'tax_id' } },
    'tax-rates': { table: 'tax_rates', fields: { code: 'code', name: 'name', rate: 'rate', taxType: 'tax_type' } },
};
function masterDefinition(kind) {
    if (!Object.hasOwn(exports.masterDefinitions, kind))
        throw new common_1.BadRequestException('Unknown master catalog.');
    return exports.masterDefinitions[kind];
}
function validateMaster(kind, value) {
    masterDefinition(kind);
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new common_1.BadRequestException('A catalog record is required.');
    const record = value;
    const text = (key, limit, required = false) => {
        const raw = record[key];
        if (raw === undefined || raw === null || raw === '') {
            if (required)
                throw new common_1.BadRequestException(`${key} is required.`);
            return null;
        }
        if (typeof raw !== 'string' || raw.trim().length > limit || (required && !raw.trim())) {
            throw new common_1.BadRequestException(`${key} is invalid (maximum ${limit} characters).`);
        }
        return raw.trim();
    };
    const numeric = (key, maximum) => {
        const raw = record[key];
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > maximum ||
            Math.abs(raw * 10000 - Math.round(raw * 10000)) > 0.00001) {
            throw new common_1.BadRequestException(`${key} must be finite, nonnegative and have at most 4 decimal places.`);
        }
        return raw;
    };
    const result = { name: text('name', 180, true) };
    if (record['isActive'] !== undefined && typeof record['isActive'] !== 'boolean') {
        throw new common_1.BadRequestException('isActive must be boolean.');
    }
    result['isActive'] = record['isActive'] ?? true;
    if (kind === 'products') {
        result['sku'] = text('sku', 64, true);
        result['description'] = text('description', 10000);
        result['unitPrice'] = numeric('unitPrice', 9999999999);
    }
    else {
        result['code'] = text('code', 64, true);
        if (kind === 'tax-rates') {
            result['rate'] = numeric('rate', 100);
            if (!['vat', 'withholding', 'other'].includes(String(record['taxType']))) {
                throw new common_1.BadRequestException('Invalid tax type.');
            }
            result['taxType'] = String(record['taxType']);
        }
        else {
            const email = text('email', 255);
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                throw new common_1.BadRequestException('Invalid email.');
            result['email'] = email?.toLowerCase() ?? null;
            result['taxId'] = text('taxId', 64);
        }
    }
    return result;
}
//# sourceMappingURL=master-input.js.map