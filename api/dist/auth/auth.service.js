"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = require("jsonwebtoken");
const database_service_1 = require("../common/database.service");
const crypto_util_1 = require("./crypto.util");
const jwt_keys_util_1 = require("./jwt-keys.util");
let AuthService = class AuthService {
    db;
    constructor(db) {
        this.db = db;
    }
    async login(input, correlationId) {
        if (!input.email || !input.password) {
            throw new common_1.BadRequestException('Email and password are required.');
        }
        const userResult = await this.db.query(`SELECT id, company_id, email, password_hash, full_name, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`, [input.email.toLowerCase()]);
        const user = userResult.rows[0];
        if (!user || !user.is_active || !(0, crypto_util_1.verifyPassword)(input.password, user.password_hash)) {
            throw new common_1.UnauthorizedException('Invalid credentials.');
        }
        const rolesResult = await this.db.query(`SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`, [user.id]);
        const payload = {
            sub: user.id,
            email: user.email,
            companyId: user.company_id,
            roles: rolesResult.rows.map((row) => row.code),
        };
        const activeKey = this.getActiveJwtKey();
        const token = (0, jsonwebtoken_1.sign)(payload, activeKey.secret, {
            expiresIn: '8h',
            keyid: activeKey.kid,
        });
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, correlation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            user.company_id,
            user.id,
            'user.login_success',
            'users',
            user.id,
            correlationId ?? null,
            JSON.stringify({ email: user.email }),
        ]);
        return {
            access_token: token,
            token_type: 'Bearer',
            expires_in: 8 * 60 * 60,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                companyId: user.company_id,
                roles: payload.roles,
            },
        };
    }
    verifyAccessToken(token) {
        const decoded = (0, jsonwebtoken_1.decode)(token, { complete: true });
        const candidateKeys = (0, jwt_keys_util_1.resolveVerificationKeys)(this.getJwtKeys(), decoded?.header?.kid);
        for (const key of candidateKeys) {
            try {
                return (0, jsonwebtoken_1.verify)(token, key.secret);
            }
            catch {
            }
        }
        throw new common_1.UnauthorizedException('Invalid or expired token.');
    }
    async getCurrentUser(userId) {
        const userResult = await this.db.query(`SELECT id, company_id, email, full_name, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`, [userId]);
        const user = userResult.rows[0];
        if (!user || !user.is_active) {
            throw new common_1.UnauthorizedException('User is not active.');
        }
        const rolesResult = await this.db.query(`SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`, [user.id]);
        return {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            companyId: user.company_id,
            roles: rolesResult.rows.map((row) => row.code),
        };
    }
    async bootstrapAdmin(input, correlationId) {
        if (!input.email || !input.password || !input.companyCode || !input.companyName || !input.fullName) {
            throw new common_1.BadRequestException('Missing required fields for bootstrap admin.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const companyResult = await client.query('SELECT id FROM companies WHERE code = $1 LIMIT 1', [input.companyCode]);
            let companyId = companyResult.rows[0]?.id;
            if (!companyId) {
                const createdCompany = await client.query(`INSERT INTO companies (code, name)
           VALUES ($1, $2)
           RETURNING id`, [input.companyCode, input.companyName]);
                companyId = createdCompany.rows[0].id;
            }
            const roleResult = await client.query('SELECT id FROM roles WHERE code = $1 LIMIT 1', ['admin']);
            let roleId = roleResult.rows[0]?.id;
            if (!roleId) {
                const createdRole = await client.query(`INSERT INTO roles (code, name, description)
           VALUES ('admin', 'Administrator', 'Full access role')
           RETURNING id`);
                roleId = createdRole.rows[0].id;
            }
            const existingUser = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [input.email.toLowerCase()]);
            if (existingUser.rows.length > 0) {
                throw new common_1.ConflictException('User with this email already exists.');
            }
            const passwordHash = (0, crypto_util_1.hashPassword)(input.password);
            const insertedUser = await client.query(`INSERT INTO users (company_id, email, password_hash, full_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id`, [companyId, input.email.toLowerCase(), passwordHash, input.fullName]);
            const userId = insertedUser.rows[0].id;
            await client.query(`INSERT INTO user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`, [userId, roleId]);
            await client.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, correlation_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                companyId,
                userId,
                'user.bootstrap_admin',
                'users',
                userId,
                correlationId ?? null,
                JSON.stringify({ email: input.email }),
            ]);
            await client.query('COMMIT');
            return { userId, companyId, roleId };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    getJwtKeys() {
        return (0, jwt_keys_util_1.loadJwtKeysFromEnv)(process.env.JWT_SECRETS_JSON, process.env.JWT_SECRET);
    }
    getActiveJwtKey() {
        return (0, jwt_keys_util_1.resolveActiveJwtKey)(this.getJwtKeys(), process.env.JWT_ACTIVE_KID);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], AuthService);
//# sourceMappingURL=auth.service.js.map