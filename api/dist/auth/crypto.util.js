"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const crypto_1 = require("crypto");
function hashPassword(plainPassword) {
    const salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const derived = (0, crypto_1.scryptSync)(plainPassword, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
}
function verifyPassword(plainPassword, storedHash) {
    const [algorithm, salt, digest] = storedHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !digest) {
        return false;
    }
    const derived = (0, crypto_1.scryptSync)(plainPassword, salt, 64);
    const digestBuffer = Buffer.from(digest, 'hex');
    if (derived.length !== digestBuffer.length) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(derived, digestBuffer);
}
//# sourceMappingURL=crypto.util.js.map