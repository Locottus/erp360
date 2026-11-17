"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.csvCell = csvCell;
function csvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    text = text.replace(/[\r\n\t]/g, ' ');
    if (/^[\s]*[=+\-@]/.test(text))
        text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}
//# sourceMappingURL=csv.js.map