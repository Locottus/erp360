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
exports.FiscalService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
const fiscal_adapters_1 = require("./fiscal.adapters");
let FiscalService = class FiscalService {
    db;
    constructor(db) {
        this.db = db;
    }
    async upsertProviderConfig(user, input) {
        if (!input.providerCode?.trim()) {
            throw new common_1.BadRequestException('providerCode is required.');
        }
        if (!input.endpointUrl?.trim()) {
            throw new common_1.BadRequestException('endpointUrl is required.');
        }
        const result = await this.db.query(`INSERT INTO fiscal_provider_configs
         (company_id, country_code, provider_code, environment, endpoint_url, credentials_json, is_active, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,NOW())
       ON CONFLICT (company_id, country_code)
       DO UPDATE SET
         provider_code = EXCLUDED.provider_code,
         environment = EXCLUDED.environment,
         endpoint_url = EXCLUDED.endpoint_url,
         credentials_json = EXCLUDED.credentials_json,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id`, [
            user.companyId,
            input.countryCode,
            input.providerCode.trim(),
            input.environment,
            input.endpointUrl.trim(),
            JSON.stringify(input.credentials ?? {}),
            user.sub,
        ]);
        await this.insertAudit(user, 'fiscal.provider.config.upsert', result.rows[0].id, {
            country: input.countryCode,
            provider: input.providerCode,
            environment: input.environment,
        });
        return { id: result.rows[0].id, status: 'active' };
    }
    async createFiscalDocument(user, invoiceId, input) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const invoice = await client.query(`SELECT id, invoice_number, status, subtotal, tax_total, grand_total, order_id
         FROM sales_invoices
         WHERE id = $1 AND company_id = $2
         LIMIT 1`, [invoiceId, user.companyId]);
            if (!invoice.rows[0]) {
                throw new common_1.NotFoundException('Invoice not found.');
            }
            if (!['issued', 'paid'].includes(invoice.rows[0].status)) {
                throw new common_1.BadRequestException('Invoice must be issued or paid.');
            }
            const config = await this.getProviderConfig(client, user.companyId, input.countryCode);
            const sourceData = await client.query(`SELECT so.customer_id,
                c.code AS customer_code,
                c.name AS customer_name,
                c.tax_id AS customer_tax_id,
                co.code AS company_code,
                co.name AS company_name,
                co.tax_id AS company_tax_id
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         JOIN companies co ON co.id = so.company_id
         WHERE so.id = $1 AND so.company_id = $2
         LIMIT 1`, [invoice.rows[0].order_id, user.companyId]);
            if (!sourceData.rows[0]) {
                throw new common_1.BadRequestException('Could not resolve source order/customer/company for invoice.');
            }
            const payload = {
                country: input.countryCode,
                provider: config.provider_code,
                environment: config.environment,
                documentType: input.documentType ?? 'invoice',
                invoiceNumber: invoice.rows[0].invoice_number,
                controlNumber: `${input.countryCode}-${invoice.rows[0].invoice_number}`,
                issuedAt: new Date().toISOString(),
                issuer: {
                    code: sourceData.rows[0].company_code,
                    name: sourceData.rows[0].company_name,
                    taxId: sourceData.rows[0].company_tax_id,
                },
                customer: {
                    id: sourceData.rows[0].customer_id,
                    code: sourceData.rows[0].customer_code,
                    name: sourceData.rows[0].customer_name,
                    taxId: sourceData.rows[0].customer_tax_id,
                },
                totals: {
                    subtotal: Number(invoice.rows[0].subtotal),
                    taxTotal: Number(invoice.rows[0].tax_total),
                    grandTotal: Number(invoice.rows[0].grand_total),
                },
            };
            const document = await client.query(`INSERT INTO fiscal_documents
          (company_id, sales_invoice_id, country_code, provider_code, document_type, control_number, status, payload, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8)
         RETURNING id, status`, [
                user.companyId,
                invoice.rows[0].id,
                input.countryCode,
                config.provider_code,
                input.documentType ?? 'invoice',
                String(payload.controlNumber),
                JSON.stringify(payload),
                user.sub,
            ]);
            await this.insertAuditTx(client, user, 'fiscal.document.create', document.rows[0].id, {
                invoice_id: invoice.rows[0].id,
                country: input.countryCode,
            });
            await client.query('COMMIT');
            return { id: document.rows[0].id, status: document.rows[0].status, payload };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('fiscal_documents_company_id_sales_invoice_id_country_code_key')) {
                throw new common_1.ConflictException('Fiscal document already exists for this invoice and country.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async submitFiscalDocument(user, fiscalDocumentId) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const doc = await client.query(`SELECT id, country_code, provider_code, payload
         FROM fiscal_documents
         WHERE id = $1 AND company_id = $2
         LIMIT 1`, [fiscalDocumentId, user.companyId]);
            if (!doc.rows[0]) {
                throw new common_1.NotFoundException('Fiscal document not found.');
            }
            const config = await this.getProviderConfig(client, user.companyId, doc.rows[0].country_code);
            const adapter = (0, fiscal_adapters_1.buildFiscalAdapter)(doc.rows[0].country_code);
            const result = await adapter.submit(doc.rows[0].payload, {
                providerCode: config.provider_code,
                environment: config.environment,
                endpointUrl: config.endpoint_url,
                credentials: config.credentials_json,
            });
            const attempt = await client.query(`SELECT COUNT(*)::text AS total
         FROM fiscal_transmissions
         WHERE fiscal_document_id = $1`, [doc.rows[0].id]);
            const attemptNo = Number(attempt.rows[0].total) + 1;
            await client.query(`INSERT INTO fiscal_transmissions
          (fiscal_document_id, attempt_no, status, request_payload, response_payload, error_message)
         VALUES ($1,$2,$3,$4,$5,$6)`, [
                doc.rows[0].id,
                attemptNo,
                result.status,
                JSON.stringify(doc.rows[0].payload),
                JSON.stringify(result.responsePayload),
                result.status === 'error' ? result.message : null,
            ]);
            await client.query(`UPDATE fiscal_documents
         SET status = $1,
             external_uuid = $2,
             provider_response = $3,
             last_error = $4,
             updated_at = NOW()
         WHERE id = $5`, [
                result.status,
                result.providerTrackId,
                JSON.stringify(result.responsePayload),
                result.status === 'error' ? result.message : null,
                doc.rows[0].id,
            ]);
            await this.insertAuditTx(client, user, 'fiscal.document.submit', doc.rows[0].id, {
                status: result.status,
                track_id: result.providerTrackId,
            });
            await client.query('COMMIT');
            return {
                id: doc.rows[0].id,
                status: result.status,
                providerTrackId: result.providerTrackId,
                message: result.message,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getFiscalDocument(user, fiscalDocumentId) {
        const result = await this.db.query(`SELECT id, sales_invoice_id, country_code, provider_code, document_type, control_number, external_uuid, status, payload, provider_response, last_error, created_at, updated_at
       FROM fiscal_documents
       WHERE id = $1 AND company_id = $2
       LIMIT 1`, [fiscalDocumentId, user.companyId]);
        if (!result.rows[0]) {
            throw new common_1.NotFoundException('Fiscal document not found.');
        }
        return result.rows[0];
    }
    async listFiscalDocuments(user, countryCode) {
        const params = [user.companyId];
        let where = 'WHERE company_id = $1';
        if (countryCode) {
            params.push(countryCode);
            where += ` AND country_code = $${params.length}`;
        }
        const result = await this.db.query(`SELECT id, sales_invoice_id, country_code, provider_code, document_type, control_number, external_uuid, status, created_at, updated_at
       FROM fiscal_documents
       ${where}
       ORDER BY created_at DESC`, params);
        await this.insertAudit(user, 'fiscal.document.list', user.companyId, {
            total: result.rows.length,
            country: countryCode ?? null,
        });
        return result.rows;
    }
    async getProviderConfig(client, companyId, countryCode) {
        const config = await client.query(`SELECT id, provider_code, environment, endpoint_url, credentials_json
       FROM fiscal_provider_configs
       WHERE company_id = $1 AND country_code = $2 AND is_active = TRUE
       LIMIT 1`, [companyId, countryCode]);
        if (!config.rows[0]) {
            throw new common_1.BadRequestException(`No active fiscal provider config for country ${countryCode}.`);
        }
        return config.rows[0];
    }
    async insertAudit(user, eventName, entityId, payload) {
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'fiscal', entityId, JSON.stringify(payload)]);
    }
    async insertAuditTx(client, user, eventName, entityId, payload) {
        await client.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'fiscal', entityId, JSON.stringify(payload)]);
    }
};
exports.FiscalService = FiscalService;
exports.FiscalService = FiscalService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], FiscalService);
//# sourceMappingURL=fiscal.service.js.map