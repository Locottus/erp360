"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.destroyStreamableFile = destroyStreamableFile;
const common_1 = require("@nestjs/common");
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
/**
 * Destroys the stream of a `StreamableFile` that will not be sent. Nothing
 * else would release what the stream reads from (e.g. an open file).
 */
function destroyStreamableFile(value) {
    if (!(value instanceof common_1.StreamableFile)) {
        return;
    }
    const stream = value.getStream();
    if ((0, shared_utils_1.isFunction)(stream?.destroy)) {
        stream.destroy();
    }
}
