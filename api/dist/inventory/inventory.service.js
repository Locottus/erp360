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
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
let InventoryService = class InventoryService {
    db;
    constructor(db) {
        this.db = db;
    }
    async receivePurchaseOrder(user, purchaseOrderId, locationCode) {
        const location = this.normalizeLocation(locationCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query(`SELECT id, status
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1`, [purchaseOrderId, user.companyId]);
            if (!order.rows[0]) {
                throw new common_1.NotFoundException('Purchase order not found.');
            }
            if (order.rows[0].status !== 'received') {
                throw new common_1.BadRequestException('Purchase order must be in received status.');
            }
            const alreadyApplied = await client.query(`SELECT id
         FROM inventory_movements
         WHERE company_id = $1
           AND movement_type = 'purchase_receipt'
           AND reference_type = 'purchase_order'
           AND reference_id = $2
         LIMIT 1`, [user.companyId, purchaseOrderId]);
            if (alreadyApplied.rows[0]) {
                throw new common_1.BadRequestException('Purchase order receipt was already applied to inventory.');
            }
            const lines = await client.query(`SELECT product_id, quantity
         FROM purchase_order_lines
         WHERE order_id = $1`, [purchaseOrderId]);
            if (lines.rows.length === 0) {
                throw new common_1.BadRequestException('Purchase order has no lines.');
            }
            for (const line of lines.rows) {
                await this.ensureStockBalanceRow(client, user.companyId, line.product_id, location);
                await client.query(`UPDATE inventory_stock_balances
           SET on_hand = on_hand + $1, updated_at = NOW()
           WHERE company_id = $2 AND location_code = $3 AND product_id = $4`, [line.quantity, user.companyId, location, line.product_id]);
                await this.insertMovement(client, user, line.product_id, location, 'purchase_receipt', Number(line.quantity), 'purchase_order', purchaseOrderId, null);
            }
            await this.insertAudit(client, user, 'inventory.purchase.receipt.apply', purchaseOrderId, {
                lines: lines.rows.length,
                location,
            });
            await client.query('COMMIT');
            return { purchaseOrderId, locationCode: location, appliedLines: lines.rows.length };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async reserveSalesOrder(user, salesOrderId, locationCode) {
        const location = this.normalizeLocation(locationCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query(`SELECT id, status
         FROM sales_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1`, [salesOrderId, user.companyId]);
            if (!order.rows[0]) {
                throw new common_1.NotFoundException('Sales order not found.');
            }
            if (!['confirmed', 'invoiced'].includes(order.rows[0].status)) {
                throw new common_1.BadRequestException('Sales order must be confirmed or invoiced.');
            }
            const activeReservation = await client.query(`SELECT id
         FROM inventory_reservations
         WHERE company_id = $1 AND sales_order_id = $2 AND status IN ('reserved', 'fulfilled')
         LIMIT 1`, [user.companyId, salesOrderId]);
            if (activeReservation.rows[0]) {
                throw new common_1.BadRequestException('Sales order already has inventory reservations processed.');
            }
            const lines = await client.query(`SELECT product_id, quantity
         FROM sales_order_lines
         WHERE order_id = $1`, [salesOrderId]);
            if (lines.rows.length === 0) {
                throw new common_1.BadRequestException('Sales order has no lines.');
            }
            for (const line of lines.rows) {
                await this.ensureStockBalanceRow(client, user.companyId, line.product_id, location);
                const stock = await client.query(`SELECT on_hand, reserved
           FROM inventory_stock_balances
           WHERE company_id = $1 AND location_code = $2 AND product_id = $3
           FOR UPDATE`, [user.companyId, location, line.product_id]);
                const onHand = Number(stock.rows[0].on_hand);
                const reserved = Number(stock.rows[0].reserved);
                const quantity = Number(line.quantity);
                const available = onHand - reserved;
                if (available < quantity) {
                    throw new common_1.BadRequestException(`Insufficient stock for product ${line.product_id}.`);
                }
                await client.query(`UPDATE inventory_stock_balances
           SET reserved = reserved + $1, updated_at = NOW()
           WHERE company_id = $2 AND location_code = $3 AND product_id = $4`, [quantity, user.companyId, location, line.product_id]);
                await client.query(`INSERT INTO inventory_reservations (company_id, sales_order_id, product_id, quantity, status)
           VALUES ($1,$2,$3,$4,'reserved')`, [user.companyId, salesOrderId, line.product_id, quantity]);
                await this.insertMovement(client, user, line.product_id, location, 'sale_reservation', quantity, 'sales_order', salesOrderId, null);
            }
            await this.insertAudit(client, user, 'inventory.sales.reservation.apply', salesOrderId, {
                lines: lines.rows.length,
                location,
            });
            await client.query('COMMIT');
            return { salesOrderId, locationCode: location, reservedLines: lines.rows.length };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async dispatchSalesOrder(user, salesOrderId, locationCode) {
        const location = this.normalizeLocation(locationCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const reservations = await client.query(`SELECT id, product_id, quantity, status
         FROM inventory_reservations
         WHERE company_id = $1 AND sales_order_id = $2 AND status = 'reserved'`, [user.companyId, salesOrderId]);
            if (reservations.rows.length === 0) {
                throw new common_1.BadRequestException('No active reservation found for this sales order.');
            }
            for (const reservation of reservations.rows) {
                const stock = await client.query(`SELECT on_hand, reserved
           FROM inventory_stock_balances
           WHERE company_id = $1 AND location_code = $2 AND product_id = $3
           FOR UPDATE`, [user.companyId, location, reservation.product_id]);
                if (!stock.rows[0]) {
                    throw new common_1.BadRequestException(`Stock balance missing for product ${reservation.product_id}.`);
                }
                const onHand = Number(stock.rows[0].on_hand);
                const reserved = Number(stock.rows[0].reserved);
                const quantity = Number(reservation.quantity);
                if (reserved < quantity || onHand < quantity) {
                    throw new common_1.BadRequestException(`Invalid stock state for product ${reservation.product_id}.`);
                }
                await client.query(`UPDATE inventory_stock_balances
           SET on_hand = on_hand - $1, reserved = reserved - $1, updated_at = NOW()
           WHERE company_id = $2 AND location_code = $3 AND product_id = $4`, [quantity, user.companyId, location, reservation.product_id]);
                await client.query(`UPDATE inventory_reservations
           SET status = 'fulfilled', updated_at = NOW()
           WHERE id = $1`, [reservation.id]);
                await this.insertMovement(client, user, reservation.product_id, location, 'sale_dispatch', quantity, 'sales_order', salesOrderId, null);
            }
            await this.insertAudit(client, user, 'inventory.sales.dispatch.apply', salesOrderId, {
                lines: reservations.rows.length,
                location,
            });
            await client.query('COMMIT');
            return { salesOrderId, locationCode: location, dispatchedLines: reservations.rows.length };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async adjustStock(user, input) {
        if (!input.productId?.trim()) {
            throw new common_1.BadRequestException('productId is required.');
        }
        if (!input.direction || !['in', 'out'].includes(input.direction)) {
            throw new common_1.BadRequestException('direction must be in or out.');
        }
        if (!input.quantity || input.quantity <= 0) {
            throw new common_1.BadRequestException('quantity must be greater than zero.');
        }
        const location = this.normalizeLocation(input.locationCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await this.ensureStockBalanceRow(client, user.companyId, input.productId, location);
            const stock = await client.query(`SELECT on_hand
         FROM inventory_stock_balances
         WHERE company_id = $1 AND location_code = $2 AND product_id = $3
         FOR UPDATE`, [user.companyId, location, input.productId]);
            const onHand = Number(stock.rows[0].on_hand);
            if (input.direction === 'out' && onHand < input.quantity) {
                throw new common_1.BadRequestException('Insufficient stock for adjustment out.');
            }
            const operation = input.direction === 'in' ? '+' : '-';
            await client.query(`UPDATE inventory_stock_balances
         SET on_hand = on_hand ${operation} $1, updated_at = NOW()
         WHERE company_id = $2 AND location_code = $3 AND product_id = $4`, [input.quantity, user.companyId, location, input.productId]);
            await this.insertMovement(client, user, input.productId, location, input.direction === 'in' ? 'adjustment_in' : 'adjustment_out', input.quantity, 'manual_adjustment', null, input.notes ?? null);
            await this.insertAudit(client, user, 'inventory.adjustment.create', input.productId, {
                direction: input.direction,
                quantity: input.quantity,
                location,
            });
            await client.query('COMMIT');
            return { productId: input.productId, direction: input.direction, quantity: input.quantity, location };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listStockBalances(user, locationCode) {
        const params = [user.companyId];
        let where = 'WHERE sb.company_id = $1';
        if (locationCode) {
            params.push(this.normalizeLocation(locationCode));
            where += ` AND sb.location_code = $${params.length}`;
        }
        const result = await this.db.query(`SELECT sb.product_id,
              p.name AS product_name,
              sb.location_code,
              sb.on_hand,
              sb.reserved,
              (sb.on_hand - sb.reserved) AS available
       FROM inventory_stock_balances sb
       JOIN products p ON p.id = sb.product_id
       ${where}
       ORDER BY p.name ASC`, params);
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [
            user.companyId,
            user.sub,
            'inventory.stock.list',
            'inventory',
            user.companyId,
            JSON.stringify({ total: result.rows.length, location: locationCode ?? null }),
        ]);
        return result.rows;
    }
    normalizeLocation(locationCode) {
        const location = locationCode?.trim() || 'MAIN';
        return location.toUpperCase();
    }
    async ensureStockBalanceRow(client, companyId, productId, locationCode) {
        const product = await client.query(`SELECT id
       FROM products
       WHERE id = $1 AND company_id = $2
       LIMIT 1`, [productId, companyId]);
        if (!product.rows[0]) {
            throw new common_1.BadRequestException(`Product '${productId}' does not belong to current company.`);
        }
        await client.query(`INSERT INTO inventory_stock_balances (company_id, location_code, product_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (company_id, location_code, product_id) DO NOTHING`, [companyId, locationCode, productId]);
    }
    async insertMovement(client, user, productId, locationCode, movementType, quantity, referenceType, referenceId, notes) {
        await client.query(`INSERT INTO inventory_movements
        (company_id, location_code, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [user.companyId, locationCode, productId, movementType, quantity, referenceType, referenceId, notes, user.sub]);
    }
    async insertAudit(client, user, eventName, entityId, payload) {
        await client.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'inventory', entityId, JSON.stringify(payload)]);
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map