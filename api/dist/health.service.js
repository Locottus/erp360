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
var HealthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const database_service_1 = require("./common/database.service");
let HealthService = HealthService_1 = class HealthService {
    logger = new common_1.Logger(HealthService_1.name);
    pool = new pg_1.Pool({
        ...(0, database_service_1.databaseConfig)(), max: 1, connectionTimeoutMillis: 2000, query_timeout: 2000,
    });
    constructor() {
        this.pool.on('error', () => this.logger.warn('La conexión de verificación de base de datos se cerró.'));
    }
    async checkReadiness() {
        try {
            await this.pool.query('SELECT 1');
        }
        catch {
            this.logger.warn('No se pudo verificar la conexión de base de datos.');
            throw new common_1.ServiceUnavailableException('No se pudo verificar la conexión de base de datos.');
        }
    }
    async onModuleDestroy() {
        await this.pool.end();
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = HealthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], HealthService);
//# sourceMappingURL=health.service.js.map