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
const quantity_document_1 = require("../common/quantity-document");
let InventoryService = class InventoryService {
    db;
    constructor(db) {
        this.db = db;
    }
    async purchaseReceiptDetails(user, id) {
        const order = await this.db.query('SELECT id,order_number,status,currency_code FROM purchase_orders WHERE id=$1 AND company_id=$2', [id, user.companyId]);
        if (!order.rows[0])
            throw new common_1.NotFoundException('Purchase order not found.');
        const lines = await this.db.query(`SELECT l.id,p.name AS product_name,l.quantity,l.unit_cost,
              COALESCE(r.received,0)::text AS received,
              (l.quantity-COALESCE(r.received,0))::text AS remaining
       FROM purchase_order_lines l JOIN products p ON p.id=l.product_id AND p.company_id=$2
       LEFT JOIN (SELECT rl.order_line_id,SUM(rl.quantity) received FROM purchase_receipt_lines rl
         JOIN purchase_receipts r ON r.id=rl.receipt_id WHERE r.company_id=$2 AND r.purchase_order_id=$1
         GROUP BY rl.order_line_id) r ON r.order_line_id=l.id
       WHERE l.order_id=$1 ORDER BY l.product_id,l.id`, [id, user.companyId]);
        const receipts = await this.db.query(`SELECT rl.id,r.receipt_number,p.name AS product_name,rl.location_code,rl.quantity,rl.unit_cost,
              (rl.quantity-COALESCE(ret.quantity,0))::text AS returnable
       FROM purchase_receipt_lines rl JOIN purchase_receipts r ON r.id=rl.receipt_id
       JOIN purchase_order_lines l ON l.id=rl.order_line_id JOIN products p ON p.id=l.product_id AND p.company_id=r.company_id
       LEFT JOIN (SELECT receipt_line_id,SUM(quantity) quantity FROM purchase_supplier_return_lines
                  GROUP BY receipt_line_id) ret ON ret.receipt_line_id=rl.id
       WHERE r.purchase_order_id=$1 AND r.company_id=$2 ORDER BY r.received_at,rl.id`, [id, user.companyId]);
        const legacy = await this.db.query('SELECT id,receipt_number FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2 AND payload IS NULL', [id, user.companyId]);
        const returns = await this.db.query(`SELECT id,reference,reason,subtotal,tax_total,grand_total,created_at FROM purchase_supplier_returns
       WHERE purchase_order_id=$1 AND company_id=$2 ORDER BY created_at DESC,id`, [id, user.companyId]);
        return { order: order.rows[0], lines: lines.rows, receipts: receipts.rows, legacyReceipts: legacy.rows, returns: returns.rows };
    }
    async receivePartialPurchase(user, id, input) {
        const document = (0, quantity_document_1.normalizeQuantityDocument)(input);
        if (typeof input.locationCode !== 'string' || !input.locationCode.trim()) {
            throw new common_1.BadRequestException('An explicit receipt location is required.');
        }
        const location = this.normalizeLocation(input.locationCode);
        const payload = { orderId: id.toLowerCase(), locationCode: location, lines: document.lines };
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query('SELECT status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            if (!order.rows[0])
                throw new common_1.NotFoundException('Purchase order not found.');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`purchase-receipt:${user.companyId}:${document.reference}`]);
            const prior = await client.query('SELECT id,payload=$3::jsonb AS same FROM purchase_receipts WHERE company_id=$1 AND receipt_number=$2', [user.companyId, document.reference, JSON.stringify(payload)]);
            if (prior.rows[0]) {
                if (!prior.rows[0].same)
                    throw new common_1.ConflictException('Receipt reference already used with different data.');
                await client.query('COMMIT');
                return { receiptId: prior.rows[0].id, replayed: true };
            }
            if (!['ordered', 'partially_received'].includes(order.rows[0].status)) {
                throw new common_1.BadRequestException('Only ordered or partially received purchases accept receipt batches.');
            }
            const legacy = await client.query('SELECT id FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2 AND payload IS NULL', [id, user.companyId]);
            if (legacy.rows.length)
                throw new common_1.BadRequestException('Legacy receipts must be reconciled; do not mix receipt workflows.');
            const receipt = await client.query(`INSERT INTO purchase_receipts(company_id,purchase_order_id,receipt_number,created_by,payload)
         VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, document.reference, user.sub, JSON.stringify(payload)]);
            const lines = await client.query('SELECT id,product_id,unit_cost FROM purchase_order_lines WHERE order_id=$1 ORDER BY product_id,id', [id]);
            if (document.lines.some(line => !lines.rows.some(row => row.id === line.lineId)))
                throw new common_1.BadRequestException('Line does not belong to this purchase.');
            for (const line of lines.rows) {
                const selected = document.lines.find(item => item.lineId === line.id);
                if (!selected)
                    continue;
                const available = await client.query(`SELECT l.quantity-COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_lines rl WHERE rl.order_line_id=l.id),0)>=$2::numeric AS valid
           FROM purchase_order_lines l WHERE l.id=$1`, [line.id, selected.quantity]);
                if (!available.rows[0].valid)
                    throw new common_1.ConflictException('Receipt exceeds pending quantity. Refresh before retrying.');
                await client.query(`INSERT INTO purchase_receipt_lines(receipt_id,order_line_id,location_code,quantity,unit_cost)
           VALUES($1,$2,$3,$4,$5)`, [receipt.rows[0].id, line.id, location, selected.quantity, line.unit_cost]);
                await this.ensureStockBalanceRow(client, user.companyId, line.product_id, location);
                await client.query(`UPDATE inventory_stock_balances SET on_hand=on_hand+$1,updated_at=NOW()
           WHERE company_id=$2 AND product_id=$3 AND location_code=$4`, [selected.quantity, user.companyId, line.product_id, location]);
                await this.insertMovement(client, user, line.product_id, location, 'purchase_receipt', selected.quantity, 'purchase_receipt', receipt.rows[0].id, document.reference);
            }
            const pending = await client.query(`SELECT EXISTS(SELECT 1 FROM purchase_order_lines l WHERE l.order_id=$1
         AND l.quantity>COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_lines rl WHERE rl.order_line_id=l.id),0)) AS pending`, [id]);
            const status = pending.rows[0].pending ? 'partially_received' : 'received';
            await client.query('UPDATE purchase_orders SET status=$1,updated_at=NOW() WHERE id=$2', [status, id]);
            await this.insertAudit(client, user, 'inventory.purchase.partial.receive', receipt.rows[0].id, { ...payload, reference: document.reference });
            await client.query('COMMIT');
            return { receiptId: receipt.rows[0].id, status, replayed: false };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505')
                throw new common_1.ConflictException('Receipt reference already used. Refresh before retrying.');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async moveOrCount(user, operation, input) {
        if (typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
            typeof input.productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.productId) ||
            typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity < 0 ||
            (operation === 'transfer' && input.quantity === 0) || Math.round(input.quantity * 10000) / 10000 !== input.quantity) {
            throw new common_1.BadRequestException('Valid reference, product and quantity (up to 4 decimals) are required.');
        }
        if (operation === 'count' && (typeof input.expectedOnHand !== 'number' || !Number.isFinite(input.expectedOnHand) || input.expectedOnHand < 0)) {
            throw new common_1.BadRequestException('A count requires expectedOnHand from the current stock balance.');
        }
        if (operation === 'transfer' && (typeof input.destinationCode !== 'string' || !input.destinationCode.trim())) {
            throw new common_1.BadRequestException('A transfer requires an explicit destinationCode.');
        }
        if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 1000)) {
            throw new common_1.BadRequestException('notes must not exceed 1000 characters.');
        }
        const source = this.normalizeLocation(input.locationCode);
        const destination = operation === 'transfer' ? this.normalizeLocation(input.destinationCode) : null;
        if (source === destination)
            throw new common_1.BadRequestException('Source and destination must differ.');
        const payload = { productId: input.productId, source, destination, quantity: input.quantity,
            expectedOnHand: operation === 'count' ? input.expectedOnHand : null, notes: input.notes?.trim() ?? '' };
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`inventory:${user.companyId}:${input.reference.trim()}`]);
            const prior = await client.query('SELECT id,operation_type,payload FROM inventory_operations WHERE company_id=$1 AND reference=$2', [user.companyId, input.reference.trim()]);
            if (prior.rows[0]) {
                const same = prior.rows[0].operation_type === operation &&
                    Object.entries(payload).every(([key, value]) => prior.rows[0].payload[key] === value);
                if (!same)
                    throw new common_1.ConflictException('Reference was already used with different data.');
                await client.query('COMMIT');
                return { id: prior.rows[0].id, replayed: true };
            }
            const locations = destination ? [source, destination].sort() : [source];
            for (const location of locations)
                await this.ensureStockBalanceRow(client, user.companyId, input.productId, location);
            const stocks = await client.query(`SELECT location_code,on_hand,reserved FROM inventory_stock_balances
         WHERE company_id=$1 AND product_id=$2 AND location_code=ANY($3::text[])
         ORDER BY location_code FOR UPDATE`, [user.companyId, input.productId, locations]);
            const stock = stocks.rows.find(row => row.location_code === source);
            const onHand = Number(stock.on_hand);
            const reserved = Number(stock.reserved);
            if (operation === 'transfer' && onHand - reserved < input.quantity)
                throw new common_1.BadRequestException('Reserved stock cannot be transferred.');
            if (operation === 'count' && onHand !== input.expectedOnHand)
                throw new common_1.ConflictException('Stock changed. Recount before retrying.');
            if (operation === 'count' && input.quantity < reserved)
                throw new common_1.BadRequestException('Physical count cannot be below reserved stock. Resolve reservations first.');
            const created = await client.query(`INSERT INTO inventory_operations(company_id,reference,operation_type,payload,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, input.reference.trim(), operation, JSON.stringify(payload), user.sub]);
            const id = created.rows[0].id;
            if (operation === 'transfer') {
                await client.query(`UPDATE inventory_stock_balances SET on_hand=on_hand+CASE WHEN location_code=$1 THEN -$2::numeric ELSE $2::numeric END,updated_at=NOW()
           WHERE company_id=$3 AND product_id=$4 AND location_code=ANY($5::text[])`, [source, input.quantity, user.companyId, input.productId, locations]);
                await this.insertMovement(client, user, input.productId, source, 'transfer_out', input.quantity, 'inventory_operation', id, payload.notes);
                await this.insertMovement(client, user, input.productId, destination, 'transfer_in', input.quantity, 'inventory_operation', id, payload.notes);
            }
            else {
                const delta = Number((input.quantity - onHand).toFixed(4));
                await client.query('UPDATE inventory_stock_balances SET on_hand=$1,updated_at=NOW() WHERE company_id=$2 AND product_id=$3 AND location_code=$4', [input.quantity, user.companyId, input.productId, source]);
                if (delta !== 0)
                    await this.insertMovement(client, user, input.productId, source, delta > 0 ? 'count_in' : 'count_out', Math.abs(delta), 'inventory_operation', id, payload.notes);
            }
            await this.insertAudit(client, user, `inventory.${operation}`, id, { reference: input.reference.trim(), ...payload });
            await client.query('COMMIT');
            return { id, replayed: false };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async receivePurchaseOrder(user, purchaseOrderId, locationCode) {
        const location = this.normalizeLocation(locationCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query(`SELECT id, status
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`, [purchaseOrderId, user.companyId]);
            if (!order.rows[0]) {
                throw new common_1.NotFoundException('Purchase order not found.');
            }
            if (order.rows[0].status !== 'received') {
                throw new common_1.BadRequestException('Purchase order must be in received status.');
            }
            const batches = await client.query('SELECT id FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2 AND payload IS NOT NULL', [purchaseOrderId, user.companyId]);
            if (batches.rows.length)
                throw new common_1.BadRequestException('Batch receipts already updated inventory. Do not apply a legacy full receipt.');
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
         LIMIT 1
         FOR UPDATE`, [salesOrderId, user.companyId]);
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
                await client.query(`INSERT INTO inventory_reservations (company_id, sales_order_id, product_id, location_code, quantity, status)
           VALUES ($1,$2,$3,$4,$5,'reserved')`, [user.companyId, salesOrderId, line.product_id, location, quantity]);
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
        const requestedLocation = locationCode?.trim() ? this.normalizeLocation(locationCode) : null;
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query(`SELECT id, status
         FROM sales_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`, [salesOrderId, user.companyId]);
            if (!order.rows[0]) {
                throw new common_1.NotFoundException('Sales order not found.');
            }
            if (!['confirmed', 'invoiced'].includes(order.rows[0].status)) {
                throw new common_1.BadRequestException('Sales order must be confirmed or invoiced.');
            }
            const reservations = await client.query(`SELECT id, product_id, quantity, status, location_code
         FROM inventory_reservations
         WHERE company_id = $1 AND sales_order_id = $2 AND status = 'reserved'`, [user.companyId, salesOrderId]);
            if (reservations.rows.length === 0) {
                throw new common_1.BadRequestException('No active reservation found for this sales order.');
            }
            for (const reservation of reservations.rows) {
                const location = reservation.location_code;
                if (requestedLocation && requestedLocation !== location) {
                    throw new common_1.BadRequestException('Dispatch location must match the order reservation location.');
                }
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
                locations: [...new Set(reservations.rows.map((row) => row.location_code))],
            });
            await client.query('COMMIT');
            return {
                salesOrderId,
                locationCodes: [...new Set(reservations.rows.map((row) => row.location_code))],
                dispatchedLines: reservations.rows.length,
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
    async adjustStock(user, input) {
        if (!input.productId?.trim()) {
            throw new common_1.BadRequestException('productId is required.');
        }
        if (!input.direction || !['in', 'out'].includes(input.direction)) {
            throw new common_1.BadRequestException('direction must be in or out.');
        }
        if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity <= 0) {
            throw new common_1.BadRequestException('quantity must be greater than zero.');
        }
        const location = this.normalizeLocation(input.locationCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await this.ensureStockBalanceRow(client, user.companyId, input.productId, location);
            const stock = await client.query(`SELECT on_hand, reserved
         FROM inventory_stock_balances
         WHERE company_id = $1 AND location_code = $2 AND product_id = $3
         FOR UPDATE`, [user.companyId, location, input.productId]);
            const onHand = Number(stock.rows[0].on_hand);
            if (input.direction === 'out' && onHand - Number(stock.rows[0].reserved) < input.quantity) {
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
    async listMovements(user, options) {
        const page = this.parsePageValue(options.page, 1, 1_000_000, 'page');
        const pageSize = this.parsePageValue(options.pageSize, 50, 100, 'pageSize');
        const params = [user.companyId];
        const filters = ['m.company_id = $1'];
        if (options.productId?.trim()) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.productId.trim())) {
                throw new common_1.BadRequestException('productId must be a valid UUID.');
            }
            params.push(options.productId.trim());
            filters.push(`m.product_id = $${params.length}`);
        }
        if (options.locationCode?.trim()) {
            params.push(this.normalizeLocation(options.locationCode));
            filters.push(`m.location_code = $${params.length}`);
        }
        const where = filters.join(' AND ');
        const count = await this.db.query(`SELECT COUNT(*)::text AS total FROM inventory_movements m WHERE ${where}`, params);
        const offset = (page - 1) * pageSize;
        const rows = await this.db.query(`SELECT m.id, m.product_id, p.sku, p.name AS product_name, m.location_code,
              m.movement_type, m.quantity, m.reference_type, m.reference_id, m.notes,
              m.created_at
       FROM inventory_movements m
       JOIN products p ON p.id = m.product_id AND p.company_id = m.company_id
       WHERE ${where}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, offset]);
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,'inventory.movement.list','inventory',$4,$3)`, [
            user.companyId,
            user.sub,
            JSON.stringify({ total: count.rows[0].total, page, page_size: pageSize }),
            user.companyId,
        ]);
        return { items: rows.rows, total: Number(count.rows[0].total), page, pageSize };
    }
    async listSalesOrdersForFulfillment(user) {
        const result = await this.db.query(`SELECT so.id, so.order_number, so.status, so.created_at, c.name AS customer_name,
              EXISTS (SELECT 1 FROM sales_invoices si WHERE si.order_id = so.id) AS is_invoiced,
              CASE
                WHEN bool_or(ir.status = 'reserved') THEN 'reserved'
                WHEN bool_or(ir.status = 'fulfilled') THEN 'fulfilled'
                ELSE 'none'
              END AS reservation_status,
              MAX(ir.location_code) FILTER (WHERE ir.status = 'reserved') AS reservation_location
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id AND c.company_id = so.company_id
       LEFT JOIN inventory_reservations ir ON ir.sales_order_id = so.id AND ir.company_id = so.company_id
       WHERE so.company_id = $1 AND so.status IN ('confirmed', 'invoiced')
       GROUP BY so.id, c.name
       ORDER BY so.created_at DESC, so.id DESC`, [user.companyId]);
        return result.rows;
    }
    parsePageValue(raw, fallback, maximum, field) {
        if (raw === undefined || raw === '')
            return fallback;
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
            throw new common_1.BadRequestException(`${field} must be an integer between 1 and ${maximum}.`);
        }
        return parsed;
    }
    normalizeLocation(locationCode) {
        if (locationCode !== undefined && typeof locationCode !== 'string')
            throw new common_1.BadRequestException('locationCode must be a string.');
        const location = locationCode?.trim() || 'MAIN';
        const normalized = location.toUpperCase();
        if (normalized.length > 32) {
            throw new common_1.BadRequestException('locationCode must not exceed 32 characters.');
        }
        return normalized;
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