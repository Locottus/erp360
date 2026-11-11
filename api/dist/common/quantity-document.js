"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeQuantityDocument = normalizeQuantityDocument;
const common_1 = require("@nestjs/common");
function normalizeQuantityDocument(input) {
    if (!input || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
        !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200) {
        throw new common_1.BadRequestException('A reference (1 to 64 characters) and 1 to 200 lines are required.');
    }
    const lines = input.lines.map(line => {
        if (!line || typeof line.lineId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(line.lineId) ||
            typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0 ||
            line.quantity > 1e9 || Math.round(line.quantity * 10000) / 10000 !== line.quantity) {
            throw new common_1.BadRequestException('Each line requires a UUID and positive quantity up to 1 billion with at most 4 decimals.');
        }
        return { lineId: line.lineId.toLowerCase(), quantity: line.quantity };
    }).sort((a, b) => a.lineId.localeCompare(b.lineId));
    if (new Set(lines.map(line => line.lineId)).size !== lines.length) {
        throw new common_1.BadRequestException('Duplicate lines are not allowed.');
    }
    return { reference: input.reference.trim(), lines };
}
//# sourceMappingURL=quantity-document.js.map