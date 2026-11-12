import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import type { AuthUser, StockAdjustmentInput } from './inventory.types';
import { normalizeQuantityDocument, type QuantityDocument } from '../common/quantity-document';
import { requiredDecimal } from '../common/decimal-input';
import { changeReason, expectedRevision } from '../common/management-input';
import { requiredDate } from '../common/iso-date';

type DbClient = Awaited<ReturnType<DatabaseService['connect']>>;

const purchaseCommitmentCtes = `open_lines AS (
  SELECT l.product_id,l.order_id,l.quantity,
    EXISTS (SELECT 1 FROM purchase_receipts pr
            WHERE pr.company_id=po.company_id AND pr.purchase_order_id=po.id AND pr.payload IS NULL) AS has_legacy,
    COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_lines rl
              JOIN purchase_receipts pr ON pr.id=rl.receipt_id
              WHERE rl.order_line_id=l.id AND pr.company_id=po.company_id AND pr.purchase_order_id=po.id),0) AS received
  FROM purchase_orders po JOIN purchase_order_lines l ON l.order_id=po.id
  WHERE po.company_id=$1 AND po.status IN ('ordered','partially_received')
), order_products AS (
  SELECT product_id,order_id,SUM(quantity) AS ordered,SUM(received) AS received,
    SUM(quantity-received) AS pending,BOOL_OR(has_legacy) AS has_legacy,
    BOOL_OR(received>quantity) AS over_received,
    BOOL_OR(has_legacy OR received>quantity) AS requires_review
  FROM open_lines GROUP BY product_id,order_id
)`;

@Injectable()
export class InventoryService {
  constructor(private readonly db: DatabaseService) {}

  async listReplenishment(user: AuthUser, locationCode?: string) {
    const location = locationCode === undefined || locationCode === '' ? null : this.normalizeLocation(locationCode);
    const result = await this.db.query(
      `WITH ${purchaseCommitmentCtes}, commitments AS (
        SELECT product_id,
          COALESCE(SUM(pending) FILTER (WHERE NOT requires_review),0)::text AS pending_quantity,
          COUNT(*) FILTER (WHERE NOT requires_review AND pending>0)::integer AS pending_orders,
          COUNT(*) FILTER (WHERE requires_review)::integer AS review_orders
        FROM order_products GROUP BY product_id
      )
      SELECT r.product_id,p.sku,p.name AS product_name,p.is_active,r.location_code,
        r.minimum_quantity::text,r.target_quantity::text,r.revision,
        COALESCE(s.on_hand,0)::text AS on_hand,COALESCE(s.reserved,0)::text AS reserved,
        (COALESCE(s.on_hand,0)-COALESCE(s.reserved,0))::text AS available,
        COALESCE(c.pending_quantity,'0') AS pending_purchase_quantity,
        COALESCE(c.pending_orders,0) AS pending_purchase_orders,
        COALESCE(c.review_orders,0) AS purchase_orders_requiring_review,
        (SELECT pr.request_number FROM replenishment_purchase_proposals rp
         JOIN purchase_requests pr ON pr.id=rp.request_id AND pr.company_id=rp.company_id
         WHERE rp.company_id=r.company_id AND rp.rule_id=r.id AND pr.status IN ('draft','submitted')
         ORDER BY rp.created_at DESC LIMIT 1) AS open_proposal_number,
        (p.is_active AND r.minimum_quantity>0 AND COALESCE(s.on_hand,0)-COALESCE(s.reserved,0)<r.minimum_quantity) AS needs_replenishment,
        CASE WHEN p.is_active AND r.minimum_quantity>0 AND COALESCE(s.on_hand,0)-COALESCE(s.reserved,0)<r.minimum_quantity
          THEN GREATEST(r.target_quantity-(COALESCE(s.on_hand,0)-COALESCE(s.reserved,0)),0)
          ELSE 0 END::text AS suggested_quantity
       FROM inventory_reorder_rules r JOIN products p ON p.id=r.product_id AND p.company_id=r.company_id
       LEFT JOIN inventory_stock_balances s ON s.company_id=r.company_id AND s.product_id=r.product_id AND s.location_code=r.location_code
       LEFT JOIN commitments c ON c.product_id=r.product_id
       WHERE r.company_id=$1 AND ($2::text IS NULL OR r.location_code=$2)
       ORDER BY needs_replenishment DESC,p.name,r.location_code`, [user.companyId, location]);
    return result.rows;
  }

  async purchaseCommitments(user: AuthUser, productId: string) {
    const product = await this.db.query('SELECT id FROM products WHERE id=$1 AND company_id=$2', [productId, user.companyId]);
    if (!product.rows[0]) throw new NotFoundException('Product not found.');
    const result = await this.db.query(
      `WITH ${purchaseCommitmentCtes}
       SELECT po.id AS order_id,po.order_number,po.status,s.name AS supplier_name,
         op.ordered::text AS ordered_quantity,op.received::text AS documented_received_quantity,
         CASE WHEN op.requires_review THEN NULL ELSE op.pending::text END AS pending_quantity,
         op.has_legacy,op.over_received
       FROM order_products op
       JOIN purchase_orders po ON po.id=op.order_id AND po.company_id=$1
       JOIN suppliers s ON s.id=po.supplier_id AND s.company_id=po.company_id
       WHERE op.product_id=$2 AND (op.requires_review OR op.pending>0)
       ORDER BY po.created_at DESC,po.id`, [user.companyId, productId]);
    return result.rows;
  }

  async createReplenishmentProposal(user: AuthUser, productId: string, input: {
    locationCode: string; expectedRevision: number; supplierId: string; requestNumber: string;
    quantity: string; unitCost: string; reason: string; reviewedCommitments: boolean;
  }) {
    if (!input || typeof input.locationCode !== 'string' || !input.locationCode.trim()) {
      throw new BadRequestException('An explicit locationCode is required.');
    }
    const location = this.normalizeLocation(input.locationCode);
    const revision = expectedRevision(input.expectedRevision);
    const reason = changeReason(input.reason);
    const quantity = requiredDecimal(input.quantity, 'quantity');
    const unitCost = requiredDecimal(input.unitCost, 'unitCost', true);
    if (typeof input.requestNumber !== 'string' || !input.requestNumber.trim() || input.requestNumber.trim().length > 64 ||
        /[\u0000-\u001f]/.test(input.requestNumber)) throw new BadRequestException('A request number of at most 64 characters is required.');
    if (typeof input.supplierId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.supplierId)) {
      throw new BadRequestException('A valid supplierId is required.');
    }
    if (input.reviewedCommitments !== true) throw new BadRequestException('Review existing purchases before creating a proposal.');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reorder:${user.companyId}:${productId}:${location}`]);
      const rule = await client.query<{ id: string; revision: number }>(
        `SELECT r.id,r.revision FROM inventory_reorder_rules r JOIN products p ON p.id=r.product_id AND p.company_id=r.company_id
         WHERE r.company_id=$1 AND r.product_id=$2 AND r.location_code=$3 AND p.is_active FOR UPDATE OF r`,
        [user.companyId, productId, location]);
      if (!rule.rows[0]) throw new NotFoundException('Active product and replenishment rule not found.');
      if (rule.rows[0].revision !== revision) throw new ConflictException('Replenishment rule changed. Reload before proposing.');
      const supplier = await client.query('SELECT id FROM suppliers WHERE id=$1 AND company_id=$2 AND is_active', [input.supplierId, user.companyId]);
      if (!supplier.rows[0]) throw new BadRequestException('Active supplier not found for this company.');
      const existing = await client.query(
        `SELECT pr.id FROM replenishment_purchase_proposals rp
         JOIN purchase_requests pr ON pr.id=rp.request_id AND pr.company_id=rp.company_id
         WHERE rp.company_id=$1 AND rp.rule_id=$2 AND pr.status IN ('draft','submitted') LIMIT 1`,
        [user.companyId, rule.rows[0].id]);
      if (existing.rows[0]) throw new ConflictException('An open proposal already exists for this rule.');
      const amount = await client.query<{ total: string; valid: boolean }>(
        `SELECT ROUND($1::numeric*$2::numeric,4)::text AS total,
          ROUND($1::numeric*$2::numeric,4)<100000000000000::numeric AS valid`, [quantity, unitCost]);
      if (!amount.rows[0].valid) throw new BadRequestException('Purchase amount exceeds supported precision.');
      const request = await client.query<{ id: string; request_number: string }>(
        `INSERT INTO purchase_requests(company_id,supplier_id,request_number,status,subtotal,tax_total,grand_total,created_by,currency_code)
         VALUES($1,$2,$3,'draft',$4,0,$4,$5,(SELECT currency_code FROM companies WHERE id=$1)) RETURNING id,request_number`,
        [user.companyId, input.supplierId, input.requestNumber.trim(), amount.rows[0].total, user.sub]);
      await client.query(
        `INSERT INTO purchase_request_lines(request_id,product_id,quantity,unit_cost,line_total) VALUES($1,$2,$3,$4,$5)`,
        [request.rows[0].id, productId, quantity, unitCost, amount.rows[0].total]);
      await client.query(
        `INSERT INTO replenishment_purchase_proposals(request_id,company_id,rule_id,rule_revision,location_code,reason)
         VALUES($1,$2,$3,$4,$5,$6)`, [request.rows[0].id, user.companyId, rule.rows[0].id, revision, location, reason]);
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'inventory.replenishment.proposal.create','purchase_requests',$3,$4)`,
        [user.companyId, user.sub, request.rows[0].id, JSON.stringify({
          product_id: productId, location_code: location, rule_revision: revision, supplier_id: input.supplierId,
          quantity, unit_cost: unitCost, reason, reviewed_commitments: true,
        })]);
      await client.query('COMMIT');
      return { id: request.rows[0].id, requestNumber: request.rows[0].request_number, status: 'draft' };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('purchase_requests_company_id_request_number_key')) {
        throw new ConflictException('Purchase request number already exists for this company.');
      }
      throw error;
    } finally { client.release(); }
  }

  async setReplenishment(user: AuthUser, productId: string,
    input: { locationCode: string; minimumQuantity: string; targetQuantity: string; expectedRevision: number; reason: string }) {
    if (typeof input.locationCode !== 'string' || !input.locationCode.trim()) {
      throw new BadRequestException('An explicit locationCode is required.');
    }
    const location = this.normalizeLocation(input.locationCode);
    const minimum = requiredDecimal(input.minimumQuantity, 'minimumQuantity', true);
    const target = requiredDecimal(input.targetQuantity, 'targetQuantity', true);
    const revision = expectedRevision(input.expectedRevision);
    const reason = changeReason(input.reason);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reorder:${user.companyId}:${productId}:${location}`]);
      const product = await client.query('SELECT id FROM products WHERE id=$1 AND company_id=$2', [productId, user.companyId]);
      if (!product.rows[0]) throw new NotFoundException('Product not found.');
      const valid = await client.query<{ valid: boolean }>('SELECT $1::numeric <= $2::numeric AS valid', [minimum, target]);
      if (!valid.rows[0].valid) throw new BadRequestException('targetQuantity must be greater than or equal to minimumQuantity.');
      const before = await client.query<{ minimum_quantity: string; target_quantity: string; revision: number }>(
        `SELECT minimum_quantity::text,target_quantity::text,revision FROM inventory_reorder_rules
         WHERE company_id=$1 AND product_id=$2 AND location_code=$3 FOR UPDATE`, [user.companyId, productId, location]);
      if ((before.rows[0]?.revision ?? 0) !== revision) throw new ConflictException('Replenishment rule changed. Reload before editing.');
      if (before.rows[0]?.minimum_quantity === minimum && before.rows[0]?.target_quantity === target) {
        throw new ConflictException('No replenishment changes.');
      }
      const result = await client.query(
        `INSERT INTO inventory_reorder_rules(company_id,product_id,location_code,minimum_quantity,target_quantity,updated_by)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(company_id,product_id,location_code) DO UPDATE
         SET minimum_quantity=EXCLUDED.minimum_quantity,target_quantity=EXCLUDED.target_quantity,
             updated_by=EXCLUDED.updated_by,updated_at=NOW(),revision=inventory_reorder_rules.revision+1
         RETURNING id,revision`, [user.companyId, productId, location, minimum, target, user.sub]);
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'inventory.replenishment.update','inventory_reorder_rules',$3,$4)`,
        [user.companyId, user.sub, result.rows[0].id, JSON.stringify({
          product_id: productId, location_code: location, before: before.rows[0] ?? null,
          after: { minimum_quantity: minimum, target_quantity: target, revision: revision + 1 }, reason,
        })]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async purchaseReceiptDetails(user: AuthUser, id: string) {
    const order = await this.db.query(
      'SELECT id,order_number,status,currency_code FROM purchase_orders WHERE id=$1 AND company_id=$2', [id, user.companyId],
    );
    if (!order.rows[0]) throw new NotFoundException('Purchase order not found.');
    const lines = await this.db.query(
      `SELECT l.id,p.name AS product_name,l.quantity,l.unit_cost,
              COALESCE(r.received,0)::text AS received,
              (l.quantity-COALESCE(r.received,0))::text AS remaining
       FROM purchase_order_lines l JOIN products p ON p.id=l.product_id AND p.company_id=$2
       LEFT JOIN (SELECT rl.order_line_id,SUM(rl.quantity) received FROM purchase_receipt_lines rl
         JOIN purchase_receipts r ON r.id=rl.receipt_id WHERE r.company_id=$2 AND r.purchase_order_id=$1
         GROUP BY rl.order_line_id) r ON r.order_line_id=l.id
       WHERE l.order_id=$1 ORDER BY l.product_id,l.id`, [id, user.companyId],
    );
    const receipts = await this.db.query(
      `SELECT rl.id,r.receipt_number,p.name AS product_name,rl.location_code,rl.quantity,rl.unit_cost,
              (rl.quantity-COALESCE(ret.quantity,0))::text AS returnable
       FROM purchase_receipt_lines rl JOIN purchase_receipts r ON r.id=rl.receipt_id
       JOIN purchase_order_lines l ON l.id=rl.order_line_id JOIN products p ON p.id=l.product_id AND p.company_id=r.company_id
       LEFT JOIN (SELECT receipt_line_id,SUM(quantity) quantity FROM purchase_supplier_return_lines
                  GROUP BY receipt_line_id) ret ON ret.receipt_line_id=rl.id
       WHERE r.purchase_order_id=$1 AND r.company_id=$2 ORDER BY r.received_at,rl.id`, [id, user.companyId],
    );
    const legacy = await this.db.query(
      'SELECT id,receipt_number FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2 AND payload IS NULL', [id, user.companyId],
    );
    const returns = await this.db.query(
      `SELECT id,reference,reason,subtotal,tax_total,grand_total,created_at FROM purchase_supplier_returns
       WHERE purchase_order_id=$1 AND company_id=$2 ORDER BY created_at DESC,id`, [id, user.companyId],
    );
    return { order: order.rows[0], lines: lines.rows, receipts: receipts.rows, legacyReceipts: legacy.rows, returns: returns.rows };
  }

  async receivePartialPurchase(user: AuthUser, id: string, input: QuantityDocument & { locationCode: string }) {
    const document = normalizeQuantityDocument(input);
    if (typeof input.locationCode !== 'string' || !input.locationCode.trim()) {
      throw new BadRequestException('An explicit receipt location is required.');
    }
    const location = this.normalizeLocation(input.locationCode);
    const payload = { orderId: id.toLowerCase(), locationCode: location, lines: document.lines };
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ status: string }>(
        'SELECT status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
      );
      if (!order.rows[0]) throw new NotFoundException('Purchase order not found.');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`purchase-receipt:${user.companyId}:${document.reference}`]);
      const prior = await client.query<{ id: string; same: boolean }>(
        'SELECT id,payload=$3::jsonb AS same FROM purchase_receipts WHERE company_id=$1 AND receipt_number=$2',
        [user.companyId, document.reference, JSON.stringify(payload)],
      );
      if (prior.rows[0]) {
        if (!prior.rows[0].same) throw new ConflictException('Receipt reference already used with different data.');
        await client.query('COMMIT'); return { receiptId: prior.rows[0].id, replayed: true };
      }
      if (!['ordered', 'partially_received'].includes(order.rows[0].status)) {
        throw new BadRequestException('Only ordered or partially received purchases accept receipt batches.');
      }
      const legacy = await client.query(
        'SELECT id FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2 AND payload IS NULL', [id, user.companyId],
      );
      if (legacy.rows.length) throw new BadRequestException('Legacy receipts must be reconciled; do not mix receipt workflows.');
      const receipt = await client.query<{ id: string }>(
        `INSERT INTO purchase_receipts(company_id,purchase_order_id,receipt_number,created_by,payload)
         VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, document.reference, user.sub, JSON.stringify(payload)],
      );
      const lines = await client.query<{ id: string; product_id: string; unit_cost: string }>(
        'SELECT id,product_id,unit_cost FROM purchase_order_lines WHERE order_id=$1 ORDER BY product_id,id', [id],
      );
      if (document.lines.some(line => !lines.rows.some(row => row.id === line.lineId))) throw new BadRequestException('Line does not belong to this purchase.');
      for (const line of lines.rows) {
        const selected = document.lines.find(item => item.lineId === line.id);
        if (!selected) continue;
        const available = await client.query<{ valid: boolean }>(
          `SELECT l.quantity-COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_lines rl WHERE rl.order_line_id=l.id),0)>=$2::numeric AS valid
           FROM purchase_order_lines l WHERE l.id=$1`, [line.id, selected.quantity],
        );
        if (!available.rows[0].valid) throw new ConflictException('Receipt exceeds pending quantity. Refresh before retrying.');
        await client.query(
          `INSERT INTO purchase_receipt_lines(receipt_id,order_line_id,location_code,quantity,unit_cost)
           VALUES($1,$2,$3,$4,$5)`, [receipt.rows[0].id, line.id, location, selected.quantity, line.unit_cost],
        );
        await this.ensureStockBalanceRow(client, user.companyId, line.product_id, location);
        await client.query(
          `UPDATE inventory_stock_balances SET on_hand=on_hand+$1,updated_at=NOW()
           WHERE company_id=$2 AND product_id=$3 AND location_code=$4`, [selected.quantity, user.companyId, line.product_id, location],
        );
        await this.insertMovement(client, user, line.product_id, location, 'purchase_receipt', selected.quantity, 'purchase_receipt', receipt.rows[0].id, document.reference);
      }
      const pending = await client.query<{ pending: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM purchase_order_lines l WHERE l.order_id=$1
         AND l.quantity>COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_lines rl WHERE rl.order_line_id=l.id),0)) AS pending`, [id],
      );
      const status = pending.rows[0].pending ? 'partially_received' : 'received';
      await client.query('UPDATE purchase_orders SET status=$1,updated_at=NOW() WHERE id=$2', [status, id]);
      await this.insertAudit(client, user, 'inventory.purchase.partial.receive', receipt.rows[0].id, { ...payload, reference: document.reference });
      await client.query('COMMIT');
      return { receiptId: receipt.rows[0].id, status, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Receipt reference already used. Refresh before retrying.');
      throw error;
    }
    finally { client.release(); }
  }

  async moveOrCount(user: AuthUser, operation: 'transfer' | 'count', input: {
    reference: string; productId: string; locationCode: string; destinationCode?: string;
    quantity: number; expectedOnHand?: number; notes?: string;
  }) {
    if (typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
        typeof input.productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.productId) ||
        typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity < 0 ||
        (operation === 'transfer' && input.quantity === 0) || Math.round(input.quantity * 10000) / 10000 !== input.quantity) {
      throw new BadRequestException('Valid reference, product and quantity (up to 4 decimals) are required.');
    }
    if (operation === 'count' && (typeof input.expectedOnHand !== 'number' || !Number.isFinite(input.expectedOnHand) || input.expectedOnHand < 0)) {
      throw new BadRequestException('A count requires expectedOnHand from the current stock balance.');
    }
    if (operation === 'transfer' && (typeof input.destinationCode !== 'string' || !input.destinationCode.trim())) {
      throw new BadRequestException('A transfer requires an explicit destinationCode.');
    }
    if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 1000)) {
      throw new BadRequestException('notes must not exceed 1000 characters.');
    }
    const source = this.normalizeLocation(input.locationCode);
    const destination = operation === 'transfer' ? this.normalizeLocation(input.destinationCode) : null;
    if (source === destination) throw new BadRequestException('Source and destination must differ.');
    const payload = { productId: input.productId, source, destination, quantity: input.quantity,
      expectedOnHand: operation === 'count' ? input.expectedOnHand : null, notes: input.notes?.trim() ?? '' };
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`inventory:${user.companyId}:${input.reference.trim()}`]);
      const prior = await client.query<{ id: string; operation_type: string; payload: typeof payload }>(
        'SELECT id,operation_type,payload FROM inventory_operations WHERE company_id=$1 AND reference=$2',
        [user.companyId, input.reference.trim()],
      );
      if (prior.rows[0]) {
        const same = prior.rows[0].operation_type === operation &&
          Object.entries(payload).every(([key, value]) => prior.rows[0].payload[key as keyof typeof payload] === value);
        if (!same) throw new ConflictException('Reference was already used with different data.');
        await client.query('COMMIT');
        return { id: prior.rows[0].id, replayed: true };
      }
      const locations = destination ? [source, destination].sort() : [source];
      for (const location of locations) await this.ensureStockBalanceRow(client, user.companyId, input.productId, location);
      const stocks = await client.query<{ location_code: string; on_hand: string; reserved: string }>(
        `SELECT location_code,on_hand,reserved FROM inventory_stock_balances
         WHERE company_id=$1 AND product_id=$2 AND location_code=ANY($3::text[])
         ORDER BY location_code FOR UPDATE`, [user.companyId, input.productId, locations],
      );
      const stock = stocks.rows.find(row => row.location_code === source)!;
      const onHand = Number(stock.on_hand); const reserved = Number(stock.reserved);
      if (operation === 'transfer' && onHand - reserved < input.quantity) throw new BadRequestException('Reserved stock cannot be transferred.');
      if (operation === 'count' && onHand !== input.expectedOnHand) throw new ConflictException('Stock changed. Recount before retrying.');
      if (operation === 'count' && input.quantity < reserved) throw new BadRequestException('Physical count cannot be below reserved stock. Resolve reservations first.');
      const created = await client.query<{ id: string }>(
        `INSERT INTO inventory_operations(company_id,reference,operation_type,payload,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, input.reference.trim(), operation, JSON.stringify(payload), user.sub],
      );
      const id = created.rows[0].id;
      if (operation === 'transfer') {
        await client.query(
          `UPDATE inventory_stock_balances SET on_hand=on_hand+CASE WHEN location_code=$1 THEN -$2::numeric ELSE $2::numeric END,updated_at=NOW()
           WHERE company_id=$3 AND product_id=$4 AND location_code=ANY($5::text[])`,
          [source, input.quantity, user.companyId, input.productId, locations],
        );
        await this.insertMovement(client, user, input.productId, source, 'transfer_out', input.quantity, 'inventory_operation', id, payload.notes);
        await this.insertMovement(client, user, input.productId, destination!, 'transfer_in', input.quantity, 'inventory_operation', id, payload.notes);
      } else {
        const delta = Number((input.quantity - onHand).toFixed(4));
        await client.query(
          'UPDATE inventory_stock_balances SET on_hand=$1,updated_at=NOW() WHERE company_id=$2 AND product_id=$3 AND location_code=$4',
          [input.quantity, user.companyId, input.productId, source],
        );
        if (delta !== 0) await this.insertMovement(client, user, input.productId, source, delta > 0 ? 'count_in' : 'count_out',
          Math.abs(delta), 'inventory_operation', id, payload.notes);
      }
      await this.insertAudit(client, user, `inventory.${operation}`, id, { reference: input.reference.trim(), ...payload });
      await client.query('COMMIT');
      return { id, replayed: false };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async receivePurchaseOrder(user: AuthUser, purchaseOrderId: string, locationCode?: string) {
    const location = this.normalizeLocation(locationCode);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [purchaseOrderId, user.companyId],
      );
      if (!order.rows[0]) {
        throw new NotFoundException('Purchase order not found.');
      }
      if (order.rows[0].status !== 'received') {
        throw new BadRequestException('Purchase order must be in received status.');
      }
      const batches = await client.query(
        'SELECT id FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2 AND payload IS NOT NULL', [purchaseOrderId, user.companyId],
      );
      if (batches.rows.length) throw new BadRequestException('Batch receipts already updated inventory. Do not apply a legacy full receipt.');
      const alreadyApplied = await client.query<{ id: string }>(
        `SELECT id
         FROM inventory_movements
         WHERE company_id = $1
           AND movement_type = 'purchase_receipt'
           AND reference_type = 'purchase_order'
           AND reference_id = $2
         LIMIT 1`,
        [user.companyId, purchaseOrderId],
      );
      if (alreadyApplied.rows[0]) {
        throw new BadRequestException('Purchase order receipt was already applied to inventory.');
      }

      const lines = await client.query<{ product_id: string; quantity: string }>(
        `SELECT product_id, quantity
         FROM purchase_order_lines
         WHERE order_id = $1`,
        [purchaseOrderId],
      );
      if (lines.rows.length === 0) {
        throw new BadRequestException('Purchase order has no lines.');
      }

      for (const line of lines.rows) {
        await this.ensureStockBalanceRow(client, user.companyId, line.product_id, location);
        await client.query(
          `UPDATE inventory_stock_balances
           SET on_hand = on_hand + $1, updated_at = NOW()
           WHERE company_id = $2 AND location_code = $3 AND product_id = $4`,
          [line.quantity, user.companyId, location, line.product_id],
        );
        await this.insertMovement(
          client,
          user,
          line.product_id,
          location,
          'purchase_receipt',
          Number(line.quantity),
          'purchase_order',
          purchaseOrderId,
          null,
        );
      }

      await this.insertAudit(client, user, 'inventory.purchase.receipt.apply', purchaseOrderId, {
        lines: lines.rows.length,
        location,
      });
      await client.query('COMMIT');
      return { purchaseOrderId, locationCode: location, appliedLines: lines.rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reserveSalesOrder(user: AuthUser, salesOrderId: string, locationCode?: string) {
    const location = this.normalizeLocation(locationCode);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM sales_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [salesOrderId, user.companyId],
      );
      if (!order.rows[0]) {
        throw new NotFoundException('Sales order not found.');
      }
      if (!['confirmed', 'invoiced'].includes(order.rows[0].status)) {
        throw new BadRequestException('Sales order must be confirmed or invoiced.');
      }

      const activeReservation = await client.query<{ id: string }>(
        `SELECT id
         FROM inventory_reservations
         WHERE company_id = $1 AND sales_order_id = $2 AND status IN ('reserved', 'fulfilled')
         LIMIT 1`,
        [user.companyId, salesOrderId],
      );
      if (activeReservation.rows[0]) {
        throw new BadRequestException('Sales order already has inventory reservations processed.');
      }

      const lines = await client.query<{ product_id: string; quantity: string }>(
        `SELECT product_id, quantity
         FROM sales_order_lines
         WHERE order_id = $1`,
        [salesOrderId],
      );
      if (lines.rows.length === 0) {
        throw new BadRequestException('Sales order has no lines.');
      }

      for (const line of lines.rows) {
        await this.ensureStockBalanceRow(client, user.companyId, line.product_id, location);
        const stock = await client.query<{ on_hand: string; reserved: string }>(
          `SELECT on_hand, reserved
           FROM inventory_stock_balances
           WHERE company_id = $1 AND location_code = $2 AND product_id = $3
           FOR UPDATE`,
          [user.companyId, location, line.product_id],
        );
        const onHand = Number(stock.rows[0].on_hand);
        const reserved = Number(stock.rows[0].reserved);
        const quantity = Number(line.quantity);
        const available = onHand - reserved;
        if (available < quantity) {
          throw new BadRequestException(`Insufficient stock for product ${line.product_id}.`);
        }

        await client.query(
          `UPDATE inventory_stock_balances
           SET reserved = reserved + $1, updated_at = NOW()
           WHERE company_id = $2 AND location_code = $3 AND product_id = $4`,
          [quantity, user.companyId, location, line.product_id],
        );
        await client.query(
          `INSERT INTO inventory_reservations (company_id, sales_order_id, product_id, location_code, quantity, status)
           VALUES ($1,$2,$3,$4,$5,'reserved')`,
          [user.companyId, salesOrderId, line.product_id, location, quantity],
        );
        await this.insertMovement(
          client,
          user,
          line.product_id,
          location,
          'sale_reservation',
          quantity,
          'sales_order',
          salesOrderId,
          null,
        );
      }

      await this.insertAudit(client, user, 'inventory.sales.reservation.apply', salesOrderId, {
        lines: lines.rows.length,
        location,
      });
      await client.query('COMMIT');
      return { salesOrderId, locationCode: location, reservedLines: lines.rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async dispatchSalesOrder(user: AuthUser, salesOrderId: string, locationCode?: string) {
    const requestedLocation = locationCode?.trim() ? this.normalizeLocation(locationCode) : null;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM sales_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [salesOrderId, user.companyId],
      );
      if (!order.rows[0]) {
        throw new NotFoundException('Sales order not found.');
      }
      if (!['confirmed', 'invoiced'].includes(order.rows[0].status)) {
        throw new BadRequestException('Sales order must be confirmed or invoiced.');
      }
      const reservations = await client.query<{
        id: string; product_id: string; quantity: string; status: string; location_code: string;
      }>(
        `SELECT id, product_id, quantity, status, location_code
         FROM inventory_reservations
         WHERE company_id = $1 AND sales_order_id = $2 AND status = 'reserved'`,
        [user.companyId, salesOrderId],
      );
      if (reservations.rows.length === 0) {
        throw new BadRequestException('No active reservation found for this sales order.');
      }

      for (const reservation of reservations.rows) {
        const location = reservation.location_code;
        if (requestedLocation && requestedLocation !== location) {
          throw new BadRequestException('Dispatch location must match the order reservation location.');
        }
        const stock = await client.query<{ on_hand: string; reserved: string }>(
          `SELECT on_hand, reserved
           FROM inventory_stock_balances
           WHERE company_id = $1 AND location_code = $2 AND product_id = $3
           FOR UPDATE`,
          [user.companyId, location, reservation.product_id],
        );
        if (!stock.rows[0]) {
          throw new BadRequestException(`Stock balance missing for product ${reservation.product_id}.`);
        }
        const onHand = Number(stock.rows[0].on_hand);
        const reserved = Number(stock.rows[0].reserved);
        const quantity = Number(reservation.quantity);
        if (reserved < quantity || onHand < quantity) {
          throw new BadRequestException(`Invalid stock state for product ${reservation.product_id}.`);
        }

        await client.query(
          `UPDATE inventory_stock_balances
           SET on_hand = on_hand - $1, reserved = reserved - $1, updated_at = NOW()
           WHERE company_id = $2 AND location_code = $3 AND product_id = $4`,
          [quantity, user.companyId, location, reservation.product_id],
        );
        await client.query(
          `UPDATE inventory_reservations
           SET status = 'fulfilled', updated_at = NOW()
           WHERE id = $1`,
          [reservation.id],
        );
        await this.insertMovement(
          client,
          user,
          reservation.product_id,
          location,
          'sale_dispatch',
          quantity,
          'sales_order',
          salesOrderId,
          null,
        );
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
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async adjustStock(user: AuthUser, input: StockAdjustmentInput) {
    if (!input.productId?.trim()) {
      throw new BadRequestException('productId is required.');
    }
    if (!input.direction || !['in', 'out'].includes(input.direction)) {
      throw new BadRequestException('direction must be in or out.');
    }
    if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than zero.');
    }
    const location = this.normalizeLocation(input.locationCode);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.ensureStockBalanceRow(client, user.companyId, input.productId, location);
      const stock = await client.query<{ on_hand: string; reserved: string }>(
        `SELECT on_hand, reserved
         FROM inventory_stock_balances
         WHERE company_id = $1 AND location_code = $2 AND product_id = $3
         FOR UPDATE`,
        [user.companyId, location, input.productId],
      );
      const onHand = Number(stock.rows[0].on_hand);
      if (input.direction === 'out' && onHand - Number(stock.rows[0].reserved) < input.quantity) {
        throw new BadRequestException('Insufficient stock for adjustment out.');
      }

      const operation = input.direction === 'in' ? '+' : '-';
      await client.query(
        `UPDATE inventory_stock_balances
         SET on_hand = on_hand ${operation} $1, updated_at = NOW()
         WHERE company_id = $2 AND location_code = $3 AND product_id = $4`,
        [input.quantity, user.companyId, location, input.productId],
      );

      await this.insertMovement(
        client,
        user,
        input.productId,
        location,
        input.direction === 'in' ? 'adjustment_in' : 'adjustment_out',
        input.quantity,
        'manual_adjustment',
        null,
        input.notes ?? null,
      );
      await this.insertAudit(client, user, 'inventory.adjustment.create', input.productId, {
        direction: input.direction,
        quantity: input.quantity,
        location,
      });
      await client.query('COMMIT');
      return { productId: input.productId, direction: input.direction, quantity: input.quantity, location };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listStockBalances(user: AuthUser, locationCode?: string) {
    const params: unknown[] = [user.companyId];
    let where = 'WHERE sb.company_id = $1';
    if (locationCode) {
      params.push(this.normalizeLocation(locationCode));
      where += ` AND sb.location_code = $${params.length}`;
    }
    const result = await this.db.query<{
      product_id: string;
      product_name: string;
      location_code: string;
      on_hand: string;
      reserved: string;
      available: string;
    }>(
      `SELECT sb.product_id,
              p.name AS product_name,
              sb.location_code,
              sb.on_hand,
              sb.reserved,
              (sb.on_hand - sb.reserved) AS available
       FROM inventory_stock_balances sb
       JOIN products p ON p.id = sb.product_id
       ${where}
       ORDER BY p.name ASC`,
      params,
    );
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        user.companyId,
        user.sub,
        'inventory.stock.list',
        'inventory',
        user.companyId,
        JSON.stringify({ total: result.rows.length, location: locationCode ?? null }),
      ],
    );
    return result.rows;
  }

  async listMovements(user: AuthUser, options: {
    productId?: string; locationCode?: string; page?: string; pageSize?: string;
  }) {
    const page = this.parsePageValue(options.page, 1, 1_000_000, 'page');
    const pageSize = this.parsePageValue(options.pageSize, 50, 100, 'pageSize');
    const params: unknown[] = [user.companyId];
    const filters = ['m.company_id = $1'];
    if (options.productId?.trim()) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.productId.trim())) {
        throw new BadRequestException('productId must be a valid UUID.');
      }
      params.push(options.productId.trim());
      filters.push(`m.product_id = $${params.length}`);
    }
    if (options.locationCode?.trim()) {
      params.push(this.normalizeLocation(options.locationCode));
      filters.push(`m.location_code = $${params.length}`);
    }
    const where = filters.join(' AND ');
    const count = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM inventory_movements m WHERE ${where}`,
      params,
    );
    const offset = (page - 1) * pageSize;
    const rows = await this.db.query(
      `SELECT m.id, m.product_id, p.sku, p.name AS product_name, m.location_code,
              m.movement_type, m.quantity, m.reference_type, m.reference_id, m.notes,
              m.created_at
       FROM inventory_movements m
       JOIN products p ON p.id = m.product_id AND p.company_id = m.company_id
       WHERE ${where}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,'inventory.movement.list','inventory',$4,$3)`,
      [
        user.companyId,
        user.sub,
        JSON.stringify({ total: count.rows[0].total, page, page_size: pageSize }),
        user.companyId,
      ],
    );
    return { items: rows.rows, total: Number(count.rows[0].total), page, pageSize };
  }

  async valuationAndCogs(user: AuthUser, options: { fromDate?: string; toDate?: string; locationCode?: string }) {
    const fromDate = options.fromDate === undefined || options.fromDate === '' ? null : requiredDate(options.fromDate, 'fromDate');
    const toDate = options.toDate === undefined || options.toDate === '' ? null : requiredDate(options.toDate, 'toDate');
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('fromDate must not be later than toDate.');
    }
    const location = options.locationCode?.trim() ? this.normalizeLocation(options.locationCode) : null;
    const rows = await this.db.query<{
      product_id: string;
      sku: string;
      product_name: string;
      location_code: string;
      period_received_quantity: string;
      period_received_cost: string;
      period_returned_quantity: string;
      period_returned_cost: string;
      period_dispatched_quantity: string;
      cumulative_net_quantity: string;
      cumulative_net_cost: string;
      weighted_average_cost: string | null;
      estimated_period_cogs: string | null;
      current_on_hand: string;
      current_reserved: string;
      current_available: string;
      provisional_stock_value: string | null;
      has_cost_gap: boolean;
    }>(
      `WITH receipts AS (
         SELECT l.product_id,rl.location_code,
           COALESCE(SUM(rl.quantity) FILTER(
             WHERE ($2::date IS NULL OR pr.received_at::date >= $2::date)
               AND ($3::date IS NULL OR pr.received_at::date <= $3::date)
           ),0) AS period_qty,
           COALESCE(SUM(rl.quantity*rl.unit_cost) FILTER(
             WHERE ($2::date IS NULL OR pr.received_at::date >= $2::date)
               AND ($3::date IS NULL OR pr.received_at::date <= $3::date)
           ),0) AS period_cost,
           COALESCE(SUM(rl.quantity) FILTER(WHERE $3::date IS NULL OR pr.received_at::date <= $3::date),0) AS cumulative_qty,
           COALESCE(SUM(rl.quantity*rl.unit_cost) FILTER(WHERE $3::date IS NULL OR pr.received_at::date <= $3::date),0) AS cumulative_cost
         FROM purchase_receipt_lines rl
         JOIN purchase_receipts pr ON pr.id=rl.receipt_id
         JOIN purchase_order_lines l ON l.id=rl.order_line_id
         WHERE pr.company_id=$1 AND ($4::text IS NULL OR rl.location_code=$4::text)
         GROUP BY l.product_id,rl.location_code
       ), returns AS (
         SELECT l.product_id,rl.location_code,
           COALESCE(SUM(ret.quantity) FILTER(
             WHERE ($2::date IS NULL OR r.created_at::date >= $2::date)
               AND ($3::date IS NULL OR r.created_at::date <= $3::date)
           ),0) AS period_qty,
           COALESCE(SUM(ret.subtotal) FILTER(
             WHERE ($2::date IS NULL OR r.created_at::date >= $2::date)
               AND ($3::date IS NULL OR r.created_at::date <= $3::date)
           ),0) AS period_cost,
           COALESCE(SUM(ret.quantity) FILTER(WHERE $3::date IS NULL OR r.created_at::date <= $3::date),0) AS cumulative_qty,
           COALESCE(SUM(ret.subtotal) FILTER(WHERE $3::date IS NULL OR r.created_at::date <= $3::date),0) AS cumulative_cost
         FROM purchase_supplier_return_lines ret
         JOIN purchase_supplier_returns r ON r.id=ret.return_id
         JOIN purchase_receipt_lines rl ON rl.id=ret.receipt_line_id
         JOIN purchase_order_lines l ON l.id=rl.order_line_id
         WHERE r.company_id=$1 AND ($4::text IS NULL OR rl.location_code=$4::text)
         GROUP BY l.product_id,rl.location_code
       ), dispatches AS (
         SELECT m.product_id,m.location_code,
           COALESCE(SUM(m.quantity) FILTER(
             WHERE ($2::date IS NULL OR m.created_at::date >= $2::date)
               AND ($3::date IS NULL OR m.created_at::date <= $3::date)
           ),0) AS period_qty
         FROM inventory_movements m
         WHERE m.company_id=$1 AND m.movement_type='sale_dispatch' AND ($4::text IS NULL OR m.location_code=$4::text)
         GROUP BY m.product_id,m.location_code
       ), stock AS (
         SELECT s.product_id,s.location_code,s.on_hand,s.reserved,(s.on_hand-s.reserved) AS available
         FROM inventory_stock_balances s
         WHERE s.company_id=$1 AND ($4::text IS NULL OR s.location_code=$4::text)
       ), keys AS (
         SELECT product_id,location_code FROM receipts
         UNION SELECT product_id,location_code FROM returns
         UNION SELECT product_id,location_code FROM dispatches
         UNION SELECT product_id,location_code FROM stock
       )
       SELECT k.product_id,p.sku,p.name AS product_name,k.location_code,
         COALESCE(rc.period_qty,0)::text AS period_received_quantity,
         COALESCE(rc.period_cost,0)::text AS period_received_cost,
         COALESCE(rt.period_qty,0)::text AS period_returned_quantity,
         COALESCE(rt.period_cost,0)::text AS period_returned_cost,
         COALESCE(d.period_qty,0)::text AS period_dispatched_quantity,
         (COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))::text AS cumulative_net_quantity,
         (COALESCE(rc.cumulative_cost,0)-COALESCE(rt.cumulative_cost,0))::text AS cumulative_net_cost,
         CASE WHEN (COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))>0
           THEN ROUND((COALESCE(rc.cumulative_cost,0)-COALESCE(rt.cumulative_cost,0))
                    /(COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0)),4)::text
           ELSE NULL END AS weighted_average_cost,
         CASE WHEN (COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))>0
           THEN ROUND(COALESCE(d.period_qty,0)*
             ((COALESCE(rc.cumulative_cost,0)-COALESCE(rt.cumulative_cost,0))
             /(COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))),4)::text
           ELSE NULL END AS estimated_period_cogs,
         COALESCE(s.on_hand,0)::text AS current_on_hand,
         COALESCE(s.reserved,0)::text AS current_reserved,
         COALESCE(s.available,0)::text AS current_available,
         CASE WHEN (COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))>0
           THEN ROUND(COALESCE(s.on_hand,0)*
             ((COALESCE(rc.cumulative_cost,0)-COALESCE(rt.cumulative_cost,0))
             /(COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))),4)::text
           ELSE NULL END AS provisional_stock_value,
         (COALESCE(d.period_qty,0)>0 AND (COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))<=0)
          OR (COALESCE(s.on_hand,0)>0 AND (COALESCE(rc.cumulative_qty,0)-COALESCE(rt.cumulative_qty,0))<=0) AS has_cost_gap
       FROM keys k
       JOIN products p ON p.id=k.product_id AND p.company_id=$1
       LEFT JOIN receipts rc ON rc.product_id=k.product_id AND rc.location_code=k.location_code
       LEFT JOIN returns rt ON rt.product_id=k.product_id AND rt.location_code=k.location_code
       LEFT JOIN dispatches d ON d.product_id=k.product_id AND d.location_code=k.location_code
       LEFT JOIN stock s ON s.product_id=k.product_id AND s.location_code=k.location_code
       ORDER BY p.name,k.location_code`,
      [user.companyId, fromDate, toDate, location],
    );
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,'inventory.report.valuation_cogs','inventory',$4,$3)`,
      [user.companyId, user.sub, JSON.stringify({ from_date: fromDate, to_date: toDate, location_code: location, rows: rows.rows.length }), user.companyId],
    );
    return {
      fromDate,
      toDate,
      locationCode: location,
      rows: rows.rows,
    };
  }

  async listSalesOrdersForFulfillment(user: AuthUser) {
    const result = await this.db.query(
      `SELECT so.id, so.order_number, so.status, so.created_at, c.name AS customer_name,
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
       ORDER BY so.created_at DESC, so.id DESC`,
      [user.companyId],
    );
    return result.rows;
  }

  private parsePageValue(raw: string | undefined, fallback: number, maximum: number, field: string) {
    if (raw === undefined || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
      throw new BadRequestException(`${field} must be an integer between 1 and ${maximum}.`);
    }
    return parsed;
  }

  private normalizeLocation(locationCode?: string) {
    if (locationCode !== undefined && typeof locationCode !== 'string') throw new BadRequestException('locationCode must be a string.');
    const location = locationCode?.trim() || 'MAIN';
    const normalized = location.toUpperCase();
    if (normalized.length > 32) {
      throw new BadRequestException('locationCode must not exceed 32 characters.');
    }
    return normalized;
  }

  private async ensureStockBalanceRow(client: DbClient, companyId: string, productId: string, locationCode: string) {
    const product = await client.query<{ id: string }>(
      `SELECT id
       FROM products
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [productId, companyId],
    );
    if (!product.rows[0]) {
      throw new BadRequestException(`Product '${productId}' does not belong to current company.`);
    }
    await client.query(
      `INSERT INTO inventory_stock_balances (company_id, location_code, product_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (company_id, location_code, product_id) DO NOTHING`,
      [companyId, locationCode, productId],
    );
  }

  private async insertMovement(
    client: DbClient,
    user: AuthUser,
    productId: string,
    locationCode: string,
    movementType: string,
    quantity: number,
    referenceType: string,
    referenceId: string | null,
    notes: string | null,
  ) {
    await client.query(
      `INSERT INTO inventory_movements
        (company_id, location_code, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user.companyId, locationCode, productId, movementType, quantity, referenceType, referenceId, notes, user.sub],
    );
  }

  private async insertAudit(
    client: DbClient,
    user: AuthUser,
    eventName: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.companyId, user.sub, eventName, 'inventory', entityId, JSON.stringify(payload)],
    );
  }
}
