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
const decimal_input_1 = require("../common/decimal-input");
const management_input_1 = require("../common/management-input");
const iso_date_1 = require("../common/iso-date");
const purchase_plan_1 = require("../common/purchase-plan");
const csv_1 = require("../common/csv");
const document_sequence_1 = require("../common/document-sequence");
const purchaseCommitmentCtes = `open_lines AS (
  SELECT l.id AS order_line_id,l.product_id,l.order_id,l.quantity,
    COALESCE(l.destination_location_code,po.destination_location_code) AS destination_location_code,
    COALESCE(l.expected_receipt_date,po.expected_receipt_date) AS expected_receipt_date,
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
let InventoryService = class InventoryService {
    db;
    constructor(db) {
        this.db = db;
    }
    async listWarehouses(user) {
        const result = await this.db.query(`SELECT location_code,name,is_active,revision,created_at,updated_at
       FROM authorized_warehouses
       WHERE company_id=$1
       ORDER BY location_code`, [user.companyId]);
        return result.rows;
    }
    async upsertWarehouse(user, input) {
        if (typeof input?.locationCode !== 'string' ||
            !/^[A-Z0-9_-]{1,32}$/i.test(input.locationCode.trim())) {
            throw new common_1.BadRequestException('locationCode must contain 1 to 32 letters, digits, underscore or hyphen.');
        }
        if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 128) {
            throw new common_1.BadRequestException('name must contain 1 to 128 characters.');
        }
        if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
            throw new common_1.BadRequestException('isActive must be boolean.');
        }
        const locationCode = input.locationCode.trim().toUpperCase();
        const result = await this.db.query(`INSERT INTO authorized_warehouses(company_id,location_code,name,is_active,created_by,updated_at)
       VALUES($1,$2,$3,$4,$5,NOW())
       ON CONFLICT(company_id,location_code) DO UPDATE SET
         name=EXCLUDED.name,
         is_active=COALESCE(EXCLUDED.is_active,authorized_warehouses.is_active),
         revision=authorized_warehouses.revision+1,
         updated_at=NOW()
       RETURNING location_code,name,is_active,revision`, [user.companyId, locationCode, input.name.trim(), input.isActive ?? true, user.sub]);
        await this.db.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
       VALUES($1,$2,'inventory.warehouse.upsert','authorized_warehouses',$3,$4)`, [user.companyId, user.sub, locationCode, JSON.stringify(result.rows[0])]);
        return result.rows[0];
    }
    async listReplenishment(user, locationCode) {
        const location = locationCode === undefined || locationCode === '' ? null : this.normalizeLocation(locationCode);
        const result = await this.db.query(`WITH ${purchaseCommitmentCtes}, commitments AS (
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
    async purchaseCommitments(user, productId) {
        const product = await this.db.query('SELECT id FROM products WHERE id=$1 AND company_id=$2', [productId, user.companyId]);
        if (!product.rows[0])
            throw new common_1.NotFoundException('Product not found.');
        const result = await this.db.query(`WITH ${purchaseCommitmentCtes}
       SELECT po.id AS order_id,po.order_number,po.status,s.name AS supplier_name,
         po.destination_location_code,po.expected_receipt_date::text,
         COALESCE(po.expected_receipt_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, FALSE) AS is_receipt_overdue,
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
    async purchasePlanning(user, productId) {
        const result = await this.db.query(`WITH ${purchaseCommitmentCtes}, orders AS (
        SELECT po.id AS order_id,po.order_number,po.status,s.name AS supplier_name,
          COALESCE(ol.destination_location_code,po.destination_location_code) AS destination_location_code,
          COALESCE(ol.expected_receipt_date,po.expected_receipt_date)::text AS expected_receipt_date,
          COALESCE(COALESCE(ol.expected_receipt_date,po.expected_receipt_date) < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,FALSE) AS is_receipt_overdue,
          SUM(ol.quantity)::text AS ordered_quantity,SUM(ol.received)::text AS documented_received_quantity,
          CASE WHEN BOOL_OR(ol.has_legacy OR ol.received>ol.quantity) THEN NULL
            ELSE SUM(ol.quantity-ol.received)::text END AS pending_quantity,
          BOOL_OR(ol.has_legacy) AS has_legacy,BOOL_OR(ol.received>ol.quantity) AS over_received
        FROM open_lines ol
        JOIN purchase_orders po ON po.id=ol.order_id AND po.company_id=$1
        JOIN suppliers s ON s.id=po.supplier_id AND s.company_id=po.company_id
        WHERE ol.product_id=$2
        GROUP BY po.id,po.order_number,po.status,s.name,
          COALESCE(ol.destination_location_code,po.destination_location_code),
          COALESCE(ol.expected_receipt_date,po.expected_receipt_date)
        HAVING BOOL_OR(ol.has_legacy OR ol.received>ol.quantity)
          OR SUM(ol.quantity-ol.received)>0
      ), plan_groups AS (
        SELECT destination_location_code,expected_receipt_date,is_receipt_overdue,
          ROUND(COALESCE(SUM(pending_quantity::numeric),0),4)::text AS pending_quantity,
          COUNT(DISTINCT order_id) FILTER (WHERE pending_quantity IS NOT NULL)::integer AS pending_orders,
          COUNT(DISTINCT order_id) FILTER (WHERE pending_quantity IS NULL)::integer AS review_orders
        FROM orders GROUP BY destination_location_code,expected_receipt_date,is_receipt_overdue
      ), request_groups AS (
        SELECT pr.id AS request_id,pr.request_number,pr.status,s.name AS supplier_name,
          SUM(l.quantity)::text AS quantity,
          COALESCE(l.destination_location_code,pr.destination_location_code) AS destination_location_code,
          COALESCE(l.expected_receipt_date,pr.expected_receipt_date)::text AS expected_receipt_date,
          CASE WHEN rp.request_id IS NULL THEN 'manual' ELSE 'replenishment' END AS origin,
          rp.location_code AS source_location_code
        FROM purchase_requests pr JOIN purchase_request_lines l ON l.request_id=pr.id
        JOIN suppliers s ON s.id=pr.supplier_id AND s.company_id=pr.company_id
        LEFT JOIN replenishment_purchase_proposals rp ON rp.request_id=pr.id AND rp.company_id=pr.company_id
        WHERE pr.company_id=$1 AND l.product_id=$2 AND pr.status IN ('draft','submitted')
          AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.request_id=pr.id AND po.company_id=pr.company_id)
        GROUP BY pr.id,s.name,rp.request_id,rp.location_code,
          COALESCE(l.destination_location_code,pr.destination_location_code),
          COALESCE(l.expected_receipt_date,pr.expected_receipt_date)
      ), requests AS (
        SELECT request_groups.*,
          COUNT(*) OVER (PARTITION BY destination_location_code,expected_receipt_date)::integer
            AS similar_open_request_count
        FROM request_groups
      )
      SELECT jsonb_build_object(
        'product_id',p.id,'sku',p.sku,'product_name',p.name,
        'as_of',CURRENT_TIMESTAMP,'as_of_date',(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
        'pending_quantity',(SELECT ROUND(COALESCE(SUM(pending_quantity::numeric),0),4)::text FROM orders),
        'pending_orders',(SELECT COUNT(DISTINCT order_id)::integer FROM orders WHERE pending_quantity IS NOT NULL),
        'review_orders',(SELECT COUNT(DISTINCT order_id)::integer FROM orders WHERE pending_quantity IS NULL),
        'groups',COALESCE((SELECT jsonb_agg(g ORDER BY destination_location_code NULLS LAST,expected_receipt_date NULLS LAST) FROM plan_groups g),'[]'::jsonb),
        'orders',COALESCE((SELECT jsonb_agg(o ORDER BY order_number,order_id) FROM orders o),'[]'::jsonb),
        'open_request_quantity',(SELECT ROUND(COALESCE(SUM(quantity::numeric),0),4)::text FROM requests),
        'open_requests',(SELECT COUNT(DISTINCT request_id)::integer FROM requests),
        'requests',COALESCE((SELECT jsonb_agg(r ORDER BY request_number,request_id) FROM requests r),'[]'::jsonb)
      ) AS planning FROM products p WHERE p.company_id=$1 AND p.id=$2`, [user.companyId, productId]);
        if (!result.rows[0])
            throw new common_1.NotFoundException('Product not found.');
        return result.rows[0].planning;
    }
    async purchasePlanningCsv(user, productId) {
        const plan = await this.purchasePlanning(user, productId);
        const headers = ['as_of_utc', 'reference_date_utc', 'sku', 'product', 'document_type', 'document_number',
            'status', 'supplier', 'origin', 'source_location', 'planned_destination', 'expected_receipt_date_utc',
            'ordered_quantity', 'documented_received_quantity', 'verifiable_pending_quantity', 'unapproved_request_quantity',
            'legacy_receipt', 'over_received', 'excluded_from_pending', 'similar_open_request_count'];
        const prefix = [plan.as_of, plan.as_of_date, plan.sku, plan.product_name];
        const rows = [
            ...plan.orders.map(order => [...prefix, 'order', order.order_number, order.status, order.supplier_name,
                '', '', order.destination_location_code, order.expected_receipt_date, order.ordered_quantity,
                order.documented_received_quantity, order.pending_quantity, '', order.has_legacy, order.over_received,
                order.pending_quantity === null, '']),
            ...plan.requests.map(item => [...prefix, 'request', item.request_number, item.status, item.supplier_name,
                item.origin, item.source_location_code, item.destination_location_code, item.expected_receipt_date,
                '', '', '', item.quantity, '', '', '', item.similar_open_request_count]),
        ];
        return '\uFEFF' + [headers, ...rows].map(row => row.map(csv_1.csvCell).join(',')).join('\r\n') + '\r\n';
    }
    async createReplenishmentProposal(user, productId, input) {
        if (!input || typeof input.locationCode !== 'string' || !input.locationCode.trim()) {
            throw new common_1.BadRequestException('An explicit locationCode is required.');
        }
        const location = this.normalizeLocation(input.locationCode);
        const plan = (0, purchase_plan_1.normalizePurchasePlan)(input);
        const revision = (0, management_input_1.expectedRevision)(input.expectedRevision);
        const reason = (0, management_input_1.changeReason)(input.reason);
        const quantity = (0, decimal_input_1.requiredDecimal)(input.quantity, 'quantity');
        const unitCost = (0, decimal_input_1.requiredDecimal)(input.unitCost, 'unitCost', true);
        if (typeof input.requestNumber !== 'string' || !input.requestNumber.trim() || input.requestNumber.trim().length > 64 ||
            /[\u0000-\u001f]/.test(input.requestNumber))
            throw new common_1.BadRequestException('A request number of at most 64 characters is required.');
        if (typeof input.supplierId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.supplierId)) {
            throw new common_1.BadRequestException('A valid supplierId is required.');
        }
        if (input.reviewedCommitments !== true)
            throw new common_1.BadRequestException('Review existing purchases before creating a proposal.');
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reorder:${user.companyId}:${productId}:${location}`]);
            const rule = await client.query(`SELECT r.id,r.revision FROM inventory_reorder_rules r JOIN products p ON p.id=r.product_id AND p.company_id=r.company_id
         WHERE r.company_id=$1 AND r.product_id=$2 AND r.location_code=$3 AND p.is_active FOR UPDATE OF r`, [user.companyId, productId, location]);
            if (!rule.rows[0])
                throw new common_1.NotFoundException('Active product and replenishment rule not found.');
            if (rule.rows[0].revision !== revision)
                throw new common_1.ConflictException('Replenishment rule changed. Reload before proposing.');
            const supplier = await client.query('SELECT id FROM suppliers WHERE id=$1 AND company_id=$2 AND is_active', [input.supplierId, user.companyId]);
            if (!supplier.rows[0])
                throw new common_1.BadRequestException('Active supplier not found for this company.');
            const existing = await client.query(`SELECT pr.id FROM replenishment_purchase_proposals rp
         JOIN purchase_requests pr ON pr.id=rp.request_id AND pr.company_id=rp.company_id
         WHERE rp.company_id=$1 AND rp.rule_id=$2 AND pr.status IN ('draft','submitted') LIMIT 1`, [user.companyId, rule.rows[0].id]);
            if (existing.rows[0])
                throw new common_1.ConflictException('An open proposal already exists for this rule.');
            const amount = await client.query(`SELECT ROUND($1::numeric*$2::numeric,4)::text AS total,
          ROUND($1::numeric*$2::numeric,4)<100000000000000::numeric AS valid`, [quantity, unitCost]);
            if (!amount.rows[0].valid)
                throw new common_1.BadRequestException('Purchase amount exceeds supported precision.');
            const request = await client.query(`INSERT INTO purchase_requests(company_id,supplier_id,request_number,status,subtotal,tax_total,grand_total,created_by,currency_code,
          destination_location_code,expected_receipt_date)
         VALUES($1,$2,$3,'draft',$4,0,$4,$5,(SELECT currency_code FROM companies WHERE id=$1),$6,$7::date) RETURNING id,request_number`, [user.companyId, input.supplierId, input.requestNumber.trim(), amount.rows[0].total, user.sub,
                plan.destinationLocationCode, plan.expectedReceiptDate]);
            await client.query(`INSERT INTO purchase_request_lines(request_id,product_id,quantity,unit_cost,line_total) VALUES($1,$2,$3,$4,$5)`, [request.rows[0].id, productId, quantity, unitCost, amount.rows[0].total]);
            await client.query(`INSERT INTO replenishment_purchase_proposals(request_id,company_id,rule_id,rule_revision,location_code,reason)
         VALUES($1,$2,$3,$4,$5,$6)`, [request.rows[0].id, user.companyId, rule.rows[0].id, revision, location, reason]);
            await client.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'inventory.replenishment.proposal.create','purchase_requests',$3,$4)`, [user.companyId, user.sub, request.rows[0].id, JSON.stringify({
                    product_id: productId, location_code: location, rule_revision: revision, supplier_id: input.supplierId,
                    quantity, unit_cost: unitCost, reason, reviewed_commitments: true,
                    ...plan,
                })]);
            await client.query('COMMIT');
            return { id: request.rows[0].id, requestNumber: request.rows[0].request_number, status: 'draft', ...plan };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('purchase_requests_company_id_request_number_key')) {
                throw new common_1.ConflictException('Purchase request number already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async setReplenishment(user, productId, input) {
        if (typeof input.locationCode !== 'string' || !input.locationCode.trim()) {
            throw new common_1.BadRequestException('An explicit locationCode is required.');
        }
        const location = this.normalizeLocation(input.locationCode);
        const minimum = (0, decimal_input_1.requiredDecimal)(input.minimumQuantity, 'minimumQuantity', true);
        const target = (0, decimal_input_1.requiredDecimal)(input.targetQuantity, 'targetQuantity', true);
        const revision = (0, management_input_1.expectedRevision)(input.expectedRevision);
        const reason = (0, management_input_1.changeReason)(input.reason);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reorder:${user.companyId}:${productId}:${location}`]);
            const product = await client.query('SELECT id FROM products WHERE id=$1 AND company_id=$2', [productId, user.companyId]);
            if (!product.rows[0])
                throw new common_1.NotFoundException('Product not found.');
            const valid = await client.query('SELECT $1::numeric <= $2::numeric AS valid', [minimum, target]);
            if (!valid.rows[0].valid)
                throw new common_1.BadRequestException('targetQuantity must be greater than or equal to minimumQuantity.');
            const before = await client.query(`SELECT minimum_quantity::text,target_quantity::text,revision FROM inventory_reorder_rules
         WHERE company_id=$1 AND product_id=$2 AND location_code=$3 FOR UPDATE`, [user.companyId, productId, location]);
            if ((before.rows[0]?.revision ?? 0) !== revision)
                throw new common_1.ConflictException('Replenishment rule changed. Reload before editing.');
            if (before.rows[0]?.minimum_quantity === minimum && before.rows[0]?.target_quantity === target) {
                throw new common_1.ConflictException('No replenishment changes.');
            }
            const result = await client.query(`INSERT INTO inventory_reorder_rules(company_id,product_id,location_code,minimum_quantity,target_quantity,updated_by)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(company_id,product_id,location_code) DO UPDATE
         SET minimum_quantity=EXCLUDED.minimum_quantity,target_quantity=EXCLUDED.target_quantity,
             updated_by=EXCLUDED.updated_by,updated_at=NOW(),revision=inventory_reorder_rules.revision+1
         RETURNING id,revision`, [user.companyId, productId, location, minimum, target, user.sub]);
            await client.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'inventory.replenishment.update','inventory_reorder_rules',$3,$4)`, [user.companyId, user.sub, result.rows[0].id, JSON.stringify({
                    product_id: productId, location_code: location, before: before.rows[0] ?? null,
                    after: { minimum_quantity: minimum, target_quantity: target, revision: revision + 1 }, reason,
                })]);
            await client.query('COMMIT');
            return result.rows[0];
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async purchaseReceiptDetails(user, id) {
        const order = await this.db.query(`SELECT id,order_number,status,currency_code,destination_location_code,expected_receipt_date::text,delivery_plan_revision,
        COALESCE(status IN ('ordered','partially_received') AND
          expected_receipt_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, FALSE) AS is_receipt_overdue
       FROM purchase_orders WHERE id=$1 AND company_id=$2`, [id, user.companyId]);
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
            const order = await client.query('SELECT status,destination_location_code,expected_receipt_date::text,delivery_plan_revision FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
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
                const receiptLine = await client.query(`INSERT INTO purchase_receipt_lines(receipt_id,order_line_id,location_code,quantity,unit_cost)
           VALUES($1,$2,$3,$4,$5) RETURNING id`, [receipt.rows[0].id, line.id, location, selected.quantity, line.unit_cost]);
                await this.createCostLot(client, user.companyId, line.product_id, location, selected.quantity, Number(line.unit_cost), 'purchase_receipt', receiptLine.rows[0].id, receiptLine.rows[0].id);
                await this.ensureStockBalanceRow(client, user.companyId, line.product_id, location);
                await client.query(`UPDATE inventory_stock_balances SET on_hand=on_hand+$1,updated_at=NOW()
           WHERE company_id=$2 AND product_id=$3 AND location_code=$4`, [selected.quantity, user.companyId, line.product_id, location]);
                await this.insertMovement(client, user, line.product_id, location, 'purchase_receipt', selected.quantity, 'purchase_receipt', receipt.rows[0].id, document.reference, Number(line.unit_cost), Number((Number(line.unit_cost) * selected.quantity).toFixed(4)), 'receipt', 'purchase_receipt');
            }
            const pending = await client.query(`SELECT EXISTS(SELECT 1 FROM purchase_order_lines l WHERE l.order_id=$1
         AND l.quantity>COALESCE((SELECT SUM(rl.quantity) FROM purchase_receipt_lines rl WHERE rl.order_line_id=l.id),0)) AS pending`, [id]);
            const status = pending.rows[0].pending ? 'partially_received' : 'received';
            await client.query('UPDATE purchase_orders SET status=$1,updated_at=NOW() WHERE id=$2', [status, id]);
            await this.insertAudit(client, user, 'inventory.purchase.partial.receive', receipt.rows[0].id, {
                ...payload, reference: document.reference,
                planned_destination_location_code: order.rows[0].destination_location_code,
                expected_receipt_date: order.rows[0].expected_receipt_date,
                delivery_plan_revision: order.rows[0].delivery_plan_revision,
            });
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
        if (operation === 'count' && input.quantity > (input.expectedOnHand ?? 0) &&
            (typeof input.unitCost !== 'number' || !Number.isFinite(input.unitCost) ||
                input.unitCost < 0 || Math.round(input.unitCost * 10000) / 10000 !== input.unitCost)) {
            throw new common_1.BadRequestException('A count increase requires an explicit unitCost with up to 4 decimals.');
        }
        if (operation === 'transfer' && input.unitCost !== undefined) {
            throw new common_1.BadRequestException('A transfer preserves existing cost layers; unitCost is not accepted.');
        }
        if (operation === 'count' && input.quantity <= (input.expectedOnHand ?? 0) && input.unitCost !== undefined) {
            throw new common_1.BadRequestException('unitCost is only accepted when a count increases inventory.');
        }
        const source = this.normalizeLocation(input.locationCode);
        const destination = operation === 'transfer' ? this.normalizeLocation(input.destinationCode) : null;
        if (source === destination)
            throw new common_1.BadRequestException('Source and destination must differ.');
        const payload = { productId: input.productId, source, destination, quantity: input.quantity,
            expectedOnHand: operation === 'count' ? input.expectedOnHand : null,
            unitCost: operation === 'count' && input.quantity > (input.expectedOnHand ?? 0) ? input.unitCost : null,
            notes: input.notes?.trim() ?? '' };
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
                const costPolicy = await this.getInventoryCostPolicy(client, user.companyId);
                const cost = await this.consumeCostLots(client, user.companyId, input.productId, source, input.quantity, costPolicy.policy);
                await client.query(`UPDATE inventory_stock_balances SET on_hand=on_hand+CASE WHEN location_code=$1 THEN -$2::numeric ELSE $2::numeric END,updated_at=NOW()
           WHERE company_id=$3 AND product_id=$4 AND location_code=ANY($5::text[])`, [source, input.quantity, user.companyId, input.productId, locations]);
                await this.insertMovement(client, user, input.productId, source, 'transfer_out', input.quantity, 'inventory_operation', id, payload.notes, cost.unitCost, cost.totalCost, costPolicy.policy, cost.source);
                await this.insertMovement(client, user, input.productId, destination, 'transfer_in', input.quantity, 'inventory_operation', id, payload.notes, cost.unitCost, cost.totalCost, costPolicy.policy, cost.source);
                for (const layer of cost.allocations) {
                    await this.createCostLot(client, user.companyId, input.productId, destination, layer.quantity, layer.unitCost, 'inventory_transfer', id, layer.purchaseReceiptLineId ?? undefined);
                }
            }
            else {
                const delta = Number((input.quantity - onHand).toFixed(4));
                await client.query('UPDATE inventory_stock_balances SET on_hand=$1,updated_at=NOW() WHERE company_id=$2 AND product_id=$3 AND location_code=$4', [input.quantity, user.companyId, input.productId, source]);
                if (delta > 0) {
                    const totalCost = Number((delta * input.unitCost).toFixed(4));
                    await this.insertMovement(client, user, input.productId, source, 'count_in', delta, 'inventory_operation', id, payload.notes, input.unitCost, totalCost, 'explicit', 'count');
                    await this.createCostLot(client, user.companyId, input.productId, source, delta, input.unitCost, 'inventory_count', id);
                }
                else if (delta < 0) {
                    const costPolicy = await this.getInventoryCostPolicy(client, user.companyId);
                    const cost = await this.consumeCostLots(client, user.companyId, input.productId, source, -delta, costPolicy.policy);
                    await this.insertMovement(client, user, input.productId, source, 'count_out', -delta, 'inventory_operation', id, payload.notes, cost.unitCost, cost.totalCost, costPolicy.policy, cost.source);
                }
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
            const lines = await client.query(`SELECT id,product_id, quantity,unit_cost
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
                const movement = await this.insertMovement(client, user, line.product_id, location, 'purchase_receipt', Number(line.quantity), 'purchase_order', purchaseOrderId, null);
                await this.createCostLot(client, user.companyId, line.product_id, location, Number(line.quantity), Number(line.unit_cost), 'purchase_order', purchaseOrderId);
                await client.query(`UPDATE inventory_movements SET unit_cost=$1,total_cost=$2,cost_policy='receipt',cost_source='purchase_order'
           WHERE id=$3`, [line.unit_cost, (Number(line.quantity) * Number(line.unit_cost)).toFixed(4), movement.id]);
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
            const lines = await client.query(`SELECT id,product_id, quantity
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
                await client.query(`INSERT INTO inventory_reservations
             (company_id,sales_order_id,sales_order_line_id,product_id,location_code,quantity,status)
           VALUES ($1,$2,$3,$4,$5,$6,'reserved')`, [user.companyId, salesOrderId, line.id, line.product_id, location, quantity]);
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
            const policyRow = await client.query('SELECT inventory_cost_policy,inventory_cost_policy_revision FROM companies WHERE id=$1 FOR UPDATE', [user.companyId]);
            const costPolicy = policyRow.rows[0]?.inventory_cost_policy ?? 'weighted_average';
            const costRevision = policyRow.rows[0]?.inventory_cost_policy_revision ?? 0;
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
            const reservations = await client.query(`SELECT id,sales_order_line_id,product_id,quantity,status,location_code
         FROM inventory_reservations
         WHERE company_id = $1 AND sales_order_id = $2 AND status = 'reserved'`, [user.companyId, salesOrderId]);
            if (reservations.rows.length === 0) {
                throw new common_1.BadRequestException('No active reservation found for this sales order.');
            }
            const dispatchCosts = [];
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
                const cost = await this.consumeCostLots(client, user.companyId, reservation.product_id, location, quantity, costPolicy);
                await client.query(`UPDATE inventory_stock_balances
           SET on_hand = on_hand - $1, reserved = reserved - $1, updated_at = NOW()
           WHERE company_id = $2 AND location_code = $3 AND product_id = $4`, [quantity, user.companyId, location, reservation.product_id]);
                await client.query(`UPDATE inventory_reservations
           SET status = 'fulfilled', updated_at = NOW()
           WHERE id = $1`, [reservation.id]);
                const movement = await this.insertMovement(client, user, reservation.product_id, location, 'sale_dispatch', quantity, 'sales_order', salesOrderId, null, cost.unitCost, cost.totalCost, costPolicy, cost.source);
                const dispatchCost = await client.query(`INSERT INTO inventory_dispatch_costs
             (company_id,sales_order_id,sales_order_line_id,inventory_movement_id,product_id,location_code,quantity,unit_cost,total_cost,cost_policy,cost_revision,source)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT(inventory_movement_id) DO NOTHING
           RETURNING id`, [user.companyId, salesOrderId, reservation.sales_order_line_id, movement.id, reservation.product_id,
                    location, quantity, cost.unitCost, cost.totalCost, costPolicy, costRevision, cost.source]);
                if (!dispatchCost.rows[0])
                    throw new common_1.ConflictException('Dispatch cost was already recorded.');
                for (const layer of cost.allocations) {
                    await client.query(`INSERT INTO inventory_dispatch_cost_layers
               (company_id,dispatch_cost_id,cost_lot_id,quantity,unit_cost,total_cost)
             VALUES($1,$2,$3,$4,$5,$6)`, [user.companyId, dispatchCost.rows[0].id, layer.costLotId, layer.quantity, layer.unitCost, layer.totalCost]);
                }
                dispatchCosts.push({
                    movementId: movement.id,
                    productId: reservation.product_id,
                    locationCode: location,
                    quantity,
                    unitCost: cost.unitCost,
                    totalCost: cost.totalCost,
                });
            }
            const cogsTotal = dispatchCosts.reduce((sum, row) => sum + row.totalCost, 0);
            if (cogsTotal > 0) {
                await this.postSaleDispatchCogs(client, user, salesOrderId, cogsTotal, costPolicy, costRevision);
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
        if (input.direction === 'in' &&
            (typeof input.unitCost !== 'number' || !Number.isFinite(input.unitCost) ||
                input.unitCost < 0 || Math.round(input.unitCost * 10000) / 10000 !== input.unitCost)) {
            throw new common_1.BadRequestException('An inventory increase requires an explicit unitCost with up to 4 decimals.');
        }
        if (input.direction === 'out' && input.unitCost !== undefined) {
            throw new common_1.BadRequestException('unitCost is calculated from the company inventory cost policy for an inventory decrease.');
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
            const costPolicy = await this.getInventoryCostPolicy(client, user.companyId);
            const cost = input.direction === 'out'
                ? await this.consumeCostLots(client, user.companyId, input.productId, location, input.quantity, costPolicy.policy)
                : {
                    unitCost: input.unitCost,
                    totalCost: Math.round((input.unitCost * input.quantity + Number.EPSILON) * 10000) / 10000,
                    source: 'explicit_adjustment',
                    allocations: [],
                };
            await client.query(`UPDATE inventory_stock_balances
         SET on_hand = on_hand ${operation} $1, updated_at = NOW()
         WHERE company_id = $2 AND location_code = $3 AND product_id = $4`, [input.quantity, user.companyId, location, input.productId]);
            await this.insertMovement(client, user, input.productId, location, input.direction === 'in' ? 'adjustment_in' : 'adjustment_out', input.quantity, 'manual_adjustment', null, input.notes ?? null, cost.unitCost, cost.totalCost, input.direction === 'in' ? 'explicit' : costPolicy.policy, cost.source);
            if (input.direction === 'in') {
                await this.createCostLot(client, user.companyId, input.productId, location, input.quantity, input.unitCost, 'manual_adjustment');
            }
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
    async valuationAndCogs(user, options) {
        const fromDate = options.fromDate === undefined || options.fromDate === '' ? null : (0, iso_date_1.requiredDate)(options.fromDate, 'fromDate');
        const toDate = options.toDate === undefined || options.toDate === '' ? null : (0, iso_date_1.requiredDate)(options.toDate, 'toDate');
        if (fromDate && toDate && fromDate > toDate) {
            throw new common_1.BadRequestException('fromDate must not be later than toDate.');
        }
        const location = options.locationCode?.trim() ? this.normalizeLocation(options.locationCode) : null;
        const rows = await this.db.query(`WITH receipts AS (
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
       ORDER BY p.name,k.location_code`, [user.companyId, fromDate, toDate, location]);
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,'inventory.report.valuation_cogs','inventory',$4,$3)`, [user.companyId, user.sub, JSON.stringify({ from_date: fromDate, to_date: toDate, location_code: location, rows: rows.rows.length }), user.companyId]);
        return {
            fromDate,
            toDate,
            locationCode: location,
            rows: rows.rows,
        };
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
    async getInventoryCostPolicy(client, companyId) {
        const result = await client.query('SELECT inventory_cost_policy,inventory_cost_policy_revision FROM companies WHERE id=$1', [companyId]);
        return {
            policy: result.rows[0]?.inventory_cost_policy ?? 'weighted_average',
            revision: result.rows[0]?.inventory_cost_policy_revision ?? 0,
        };
    }
    async createCostLot(client, companyId, productId, locationCode, quantity, unitCost, sourceType, sourceId, purchaseReceiptLineId) {
        await client.query(`INSERT INTO inventory_cost_lots
         (company_id,product_id,location_code,purchase_receipt_line_id,quantity_remaining,unit_cost,source_at,source_type,source_id)
       VALUES($1,$2,$3,$4,$5,$6,NOW(),$7,$8)`, [companyId, productId, locationCode, purchaseReceiptLineId ?? null, quantity,
            unitCost.toFixed(4), sourceType, sourceId ?? null]);
    }
    async consumeCostLots(client, companyId, productId, locationCode, quantity, policy) {
        const lots = await client.query(`SELECT id,purchase_receipt_line_id,quantity_remaining::text,unit_cost::text
       FROM inventory_cost_lots
       WHERE company_id=$1 AND product_id=$2 AND location_code=$3 AND quantity_remaining>0
       ORDER BY source_at,id
       FOR UPDATE`, [companyId, productId, locationCode]);
        const available = lots.rows.reduce((sum, lot) => sum + Number(lot.quantity_remaining), 0);
        if (available + 0.00005 < quantity) {
            throw new common_1.BadRequestException('Insufficient costed inventory. Reconcile this location balance before dispatching or reducing stock.');
        }
        const value = lots.rows.reduce((sum, lot) => sum + Number(lot.quantity_remaining) * Number(lot.unit_cost), 0);
        const average = Math.round((value / available + Number.EPSILON) * 10000) / 10000;
        let remaining = quantity;
        let allocatedValue = 0;
        const allocations = [];
        for (let index = 0; index < lots.rows.length && remaining > 0; index++) {
            const lot = lots.rows[index];
            const lotQuantity = Number(lot.quantity_remaining);
            const proportional = policy === 'weighted_average' && index < lots.rows.length - 1
                ? Math.round((quantity * lotQuantity / available + Number.EPSILON) * 10000) / 10000
                : remaining;
            const consumed = Math.min(lotQuantity, remaining, proportional);
            if (consumed <= 0)
                continue;
            const unitCost = policy === 'weighted_average' ? average : Number(lot.unit_cost);
            const totalCost = Math.round((consumed * unitCost + Number.EPSILON) * 10000) / 10000;
            allocations.push({
                costLotId: lot.id,
                purchaseReceiptLineId: lot.purchase_receipt_line_id,
                quantity: consumed,
                unitCost,
                totalCost,
            });
            remaining = Math.round((remaining - consumed + Number.EPSILON) * 10000) / 10000;
            allocatedValue += totalCost;
            await client.query(`UPDATE inventory_cost_lots SET quantity_remaining=quantity_remaining-$1
         WHERE id=$2 AND company_id=$3 AND quantity_remaining >= $1`, [consumed, lot.id, companyId]);
        }
        if (remaining > 0.00005) {
            throw new common_1.BadRequestException('Cost layers do not cover the inventory quantity. Reconcile before continuing.');
        }
        const totalCost = Math.round((allocatedValue + Number.EPSILON) * 10000) / 10000;
        const unitCost = Math.round((totalCost / quantity + Number.EPSILON) * 10000) / 10000;
        return {
            unitCost,
            totalCost,
            source: policy === 'fifo' ? 'fifo_cost_lots' : 'weighted_average_cost_lots',
            allocations,
        };
    }
    async postSaleDispatchCogs(client, user, salesOrderId, cogsTotal, costPolicy, costRevision) {
        const existing = await client.query(`SELECT id FROM accounting_journal_entries
       WHERE company_id=$1 AND source_type='sale_dispatch' AND source_id=$2 LIMIT 1`, [user.companyId, salesOrderId]);
        if (existing.rows[0])
            return;
        const accounts = await client.query(`SELECT id,code FROM accounting_accounts WHERE company_id=$1 AND code IN ('1200','5100')`, [user.companyId]);
        const inventory = accounts.rows.find(row => row.code === '1200');
        const cogs = accounts.rows.find(row => row.code === '5100');
        if (!inventory || !cogs) {
            throw new common_1.BadRequestException('Contabilidad no tiene cuentas 1200 Inventario y 5100 Costo de ventas. Ejecuta bootstrap de cuentas.');
        }
        const entryNumber = await (0, document_sequence_1.nextDocumentNumber)(client, user.companyId, 'AUTO-JE');
        const entry = await client.query(`INSERT INTO accounting_journal_entries(company_id,entry_number,entry_date,source_type,source_id,description,created_by)
       VALUES($1,$2,CURRENT_DATE,'sale_dispatch',$3,$4,$5) RETURNING id`, [user.companyId, entryNumber, salesOrderId, `Costo de ventas pedido ${salesOrderId}`, user.sub]);
        await client.query(`INSERT INTO accounting_journal_lines(journal_entry_id,account_id,line_description,debit,credit)
       VALUES($1,$2,'Costo de ventas por despacho',$3,0),($1,$4,'Salida de inventario por despacho',0,$3)`, [entry.rows[0].id, cogs.id, cogsTotal.toFixed(4), inventory.id]);
        await client.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
       VALUES($1,$2,'inventory.sales.cogs.post','sales_orders',$3,$4)`, [user.companyId, user.sub, salesOrderId, JSON.stringify({
                journal_entry_id: entry.rows[0].id,
                cogs_total: cogsTotal,
                cost_policy: costPolicy,
                cost_revision: costRevision,
            })]);
    }
    async insertMovement(client, user, productId, locationCode, movementType, quantity, referenceType, referenceId, notes, unitCost, totalCost, costPolicy, costSource) {
        const result = await client.query(`INSERT INTO inventory_movements
        (company_id, location_code, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by,
         unit_cost,total_cost,cost_policy,cost_posted,cost_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`, [user.companyId, locationCode, productId, movementType, quantity, referenceType, referenceId, notes, user.sub,
            unitCost ?? null, totalCost ?? null, costPolicy ?? null, false, costSource ?? null]);
        return result.rows[0];
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