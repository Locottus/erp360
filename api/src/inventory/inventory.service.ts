import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import type { AuthUser, StockAdjustmentInput } from './inventory.types';

type DbClient = Awaited<ReturnType<DatabaseService['connect']>>;

@Injectable()
export class InventoryService {
  constructor(private readonly db: DatabaseService) {}

  async receivePurchaseOrder(user: AuthUser, purchaseOrderId: string, locationCode?: string) {
    const location = this.normalizeLocation(locationCode);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1`,
        [purchaseOrderId, user.companyId],
      );
      if (!order.rows[0]) {
        throw new NotFoundException('Purchase order not found.');
      }
      if (order.rows[0].status !== 'received') {
        throw new BadRequestException('Purchase order must be in received status.');
      }
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
         LIMIT 1`,
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
          `INSERT INTO inventory_reservations (company_id, sales_order_id, product_id, quantity, status)
           VALUES ($1,$2,$3,$4,'reserved')`,
          [user.companyId, salesOrderId, line.product_id, quantity],
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
    const location = this.normalizeLocation(locationCode);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const reservations = await client.query<{ id: string; product_id: string; quantity: string; status: string }>(
        `SELECT id, product_id, quantity, status
         FROM inventory_reservations
         WHERE company_id = $1 AND sales_order_id = $2 AND status = 'reserved'`,
        [user.companyId, salesOrderId],
      );
      if (reservations.rows.length === 0) {
        throw new BadRequestException('No active reservation found for this sales order.');
      }

      for (const reservation of reservations.rows) {
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
        location,
      });
      await client.query('COMMIT');
      return { salesOrderId, locationCode: location, dispatchedLines: reservations.rows.length };
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
    if (!input.quantity || input.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than zero.');
    }
    const location = this.normalizeLocation(input.locationCode);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.ensureStockBalanceRow(client, user.companyId, input.productId, location);
      const stock = await client.query<{ on_hand: string }>(
        `SELECT on_hand
         FROM inventory_stock_balances
         WHERE company_id = $1 AND location_code = $2 AND product_id = $3
         FOR UPDATE`,
        [user.companyId, location, input.productId],
      );
      const onHand = Number(stock.rows[0].on_hand);
      if (input.direction === 'out' && onHand < input.quantity) {
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

  private normalizeLocation(locationCode?: string) {
    const location = locationCode?.trim() || 'MAIN';
    return location.toUpperCase();
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
