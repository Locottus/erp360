"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseValue = parseValue;
exports.parseXmlRpcRequest = parseXmlRpcRequest;
exports.buildXmlRpcResponse = buildXmlRpcResponse;
exports.buildXmlRpcFault = buildXmlRpcFault;
function escapeXml(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}
function unwrapTag(content, tag) {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    const match = content.match(regex);
    return match ? match[1] : null;
}
function parseStruct(content) {
    const result = {};
    const memberRegex = /<member>([\s\S]*?)<\/member>/gi;
    const members = content.match(memberRegex) ?? [];
    for (const member of members) {
        const name = unwrapTag(member, 'name');
        const rawValue = unwrapTag(member, 'value');
        if (!name || rawValue === null) {
            continue;
        }
        result[name] = parseValue(rawValue);
    }
    return result;
}
function parseArray(content) {
    const data = unwrapTag(content, 'data') ?? '';
    const values = data.match(/<value>([\s\S]*?)<\/value>/gi) ?? [];
    return values.map((raw) => parseValue(raw.replace(/^<value>/i, '').replace(/<\/value>$/i, '')));
}
function parseValue(content) {
    const trimmed = content.trim();
    const stringValue = unwrapTag(trimmed, 'string');
    if (stringValue !== null) {
        return stringValue;
    }
    const intValue = unwrapTag(trimmed, 'int') ?? unwrapTag(trimmed, 'i4');
    if (intValue !== null) {
        return Number(intValue);
    }
    const doubleValue = unwrapTag(trimmed, 'double');
    if (doubleValue !== null) {
        return Number(doubleValue);
    }
    const boolValue = unwrapTag(trimmed, 'boolean');
    if (boolValue !== null) {
        return boolValue.trim() === '1';
    }
    const dateValue = unwrapTag(trimmed, 'dateTime.iso8601');
    if (dateValue !== null) {
        return dateValue;
    }
    const arrayValue = unwrapTag(trimmed, 'array');
    if (arrayValue !== null) {
        return parseArray(arrayValue);
    }
    const structValue = unwrapTag(trimmed, 'struct');
    if (structValue !== null) {
        return parseStruct(structValue);
    }
    return trimmed;
}
function parseXmlRpcRequest(xml) {
    const methodName = unwrapTag(xml, 'methodName');
    if (!methodName) {
        throw new Error('Invalid XML-RPC request: missing methodName.');
    }
    const paramsBlock = unwrapTag(xml, 'params') ?? '';
    const paramRegex = /<param>([\s\S]*?)<\/param>/gi;
    const paramsMatches = paramsBlock.match(paramRegex) ?? [];
    const params = paramsMatches.map((paramBlock) => {
        const value = unwrapTag(paramBlock, 'value');
        return parseValue(value ?? '');
    });
    return { methodName: methodName.trim(), params };
}
function serializeValue(value) {
    if (value === null || value === undefined) {
        return '<nil/>';
    }
    if (Array.isArray(value)) {
        return `<array><data>${value.map((item) => `<value>${serializeValue(item)}</value>`).join('')}</data></array>`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value)
            .map(([key, val]) => `<member><name>${escapeXml(key)}</name><value>${serializeValue(val)}</value></member>`)
            .join('');
        return `<struct>${entries}</struct>`;
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? `<int>${value}</int>` : `<double>${value}</double>`;
    }
    if (typeof value === 'boolean') {
        return `<boolean>${value ? 1 : 0}</boolean>`;
    }
    return `<string>${escapeXml(String(value))}</string>`;
}
function buildXmlRpcResponse(value) {
    return `<?xml version="1.0"?><methodResponse><params><param><value>${serializeValue(value)}</value></param></params></methodResponse>`;
}
function buildXmlRpcFault(message) {
    return `<?xml version="1.0"?><methodResponse><fault><value><struct><member><name>faultCode</name><value><int>1</int></value></member><member><name>faultString</name><value><string>${escapeXml(message)}</string></value></member></struct></value></fault></methodResponse>`;
}
//# sourceMappingURL=xmlrpc.util.js.map