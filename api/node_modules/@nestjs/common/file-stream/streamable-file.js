"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamableFile = void 0;
const stream_1 = require("stream");
const util_1 = require("util");
const enums_1 = require("../enums");
const services_1 = require("../services");
const shared_utils_1 = require("../utils/shared.utils");
/**
 * @see [Streaming files](https://docs.nestjs.com/techniques/streaming-files)
 *
 * @publicApi
 */
class StreamableFile {
    constructor(bufferOrReadStream, options = {}) {
        this.options = options;
        this.logger = new services_1.Logger('StreamableFile');
        this.handleError = (err, res) => {
            if (res.destroyed) {
                return;
            }
            if (res.headersSent) {
                // Ending the response would make the truncated file look complete. A
                // stream that fails after it ended (e.g. while closing the file) has
                // already handed over every byte, so the response is left to finish.
                this.logError(err);
                if ((0, shared_utils_1.isFunction)(res.destroy) && !this.stream?.readableEnded) {
                    res.destroy();
                }
                else {
                    res.end();
                }
                return;
            }
            // The message may name the path the stream reads from, so it is
            // logged rather than sent.
            this.logError(err);
            res.statusCode = enums_1.HttpStatus.BAD_REQUEST;
            res.send('Bad Request');
        };
        this.logError = (err) => {
            this.logger.error(err);
        };
        if (util_1.types.isUint8Array(bufferOrReadStream)) {
            this.stream = new stream_1.Readable();
            this.stream.push(bufferOrReadStream);
            this.stream.push(null);
            this.options.length ??= bufferOrReadStream.length;
        }
        else if (bufferOrReadStream.pipe && (0, shared_utils_1.isFunction)(bufferOrReadStream.pipe)) {
            this.stream = bufferOrReadStream;
            // Without a listener, an 'error' emitted before the adapter attaches
            // its own (e.g. ENOENT from `fs.createReadStream()` while an
            // interceptor awaits), or by a file that is never sent, would bring
            // the process down.
            if ((0, shared_utils_1.isFunction)(this.stream.on)) {
                this.stream.on('error', () => { });
            }
        }
    }
    getStream() {
        return this.stream;
    }
    getHeaders() {
        const { type = 'application/octet-stream', disposition = undefined, length = undefined, } = this.options;
        return {
            type,
            disposition,
            length,
        };
    }
    get errorHandler() {
        return this.handleError;
    }
    setErrorHandler(handler) {
        this.handleError = handler;
        return this;
    }
    get errorLogger() {
        return this.logError;
    }
    setErrorLogger(handler) {
        this.logError = handler;
        return this;
    }
}
exports.StreamableFile = StreamableFile;
