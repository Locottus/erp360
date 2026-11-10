"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteParamsFactory = void 0;
const route_paramtypes_enum_1 = require("@nestjs/common/enums/route-paramtypes.enum");
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
/**
 * A key picks a property of an object body. Of an array, a Buffer or a
 * primitive the client sent instead, it picks only an own property (an
 * element, a length), not a prototype member: `Buffer#parent` exposes memory
 * shared with other requests, and a built-in function such as
 * `Array.prototype.values` passes for a DTO without required properties.
 * Objects keep resolving inherited properties, as a custom body parser may
 * build class instances.
 */
const getBodyProperty = (body, key) => ((0, shared_utils_1.isObject)(body) && !Array.isArray(body) && !ArrayBuffer.isView(body)) ||
    (!(0, shared_utils_1.isNil)(body) && Object.prototype.hasOwnProperty.call(Object(body), key))
    ? body[key]
    : undefined;
class RouteParamsFactory {
    exchangeKeyForValue(key, data, { req, res, next }) {
        switch (key) {
            case route_paramtypes_enum_1.RouteParamtypes.NEXT:
                return next;
            case route_paramtypes_enum_1.RouteParamtypes.REQUEST:
                return req;
            case route_paramtypes_enum_1.RouteParamtypes.RESPONSE:
                return res;
            case route_paramtypes_enum_1.RouteParamtypes.BODY:
                return data && req.body ? getBodyProperty(req.body, data) : req.body;
            case route_paramtypes_enum_1.RouteParamtypes.RAW_BODY:
                return req.rawBody;
            case route_paramtypes_enum_1.RouteParamtypes.PARAM:
                return data ? req.params[data] : req.params;
            case route_paramtypes_enum_1.RouteParamtypes.HOST:
                /* eslint-disable-next-line no-case-declarations */
                const hosts = req.hosts || {};
                return data ? hosts[data] : hosts;
            case route_paramtypes_enum_1.RouteParamtypes.QUERY:
                return data ? req.query[data] : req.query;
            case route_paramtypes_enum_1.RouteParamtypes.HEADERS:
                return data ? req.headers[data.toLowerCase()] : req.headers;
            case route_paramtypes_enum_1.RouteParamtypes.SESSION:
                return req.session;
            case route_paramtypes_enum_1.RouteParamtypes.FILE:
                return req[data || 'file'];
            case route_paramtypes_enum_1.RouteParamtypes.FILES:
                return req.files;
            case route_paramtypes_enum_1.RouteParamtypes.IP:
                return req.ip;
            default:
                return null;
        }
    }
}
exports.RouteParamsFactory = RouteParamsFactory;
