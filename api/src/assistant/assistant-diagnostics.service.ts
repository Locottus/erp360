import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AuthTokenPayload } from '../auth/auth.types';
import { DatabaseService } from '../common/database.service';
import { purchaseApprovalBlockReason } from '../commerce/commerce.service';
import { diagnosticTarget, type DiagnosticTarget } from './assistant-inputs';
import { diagnosticArea, diagnosticKnowledge } from './assistant-knowledge';

type Facts = Record<string, boolean | number | string | null>;
type Finding = {
  code: string; severity: 'info' | 'warning' | 'blocking'; title: string;
  recommendation: string; evidenceIds: string[]; route: string;
};
export type DiagnosticReport = {
  target: DiagnosticTarget; capturedAt: string; readOnly: true;
  evidence: { id: string; source: string; facts: Facts }[];
  findings: Finding[]; limitations: string[];
};

@Injectable()
export class AssistantDiagnosticsService {
  constructor(private readonly db: DatabaseService) {}

  async inspect(user: AuthTokenPayload, input: unknown): Promise<DiagnosticReport> {
    const target = diagnosticTarget(input);
    const allowed = target.kind === 'purchase-request' ? ['admin', 'purchases'] : ['admin', 'sales'];
    if (target.kind !== 'stock' && target.kind !== 'screen' && !allowed.some(role => user.roles.includes(role))) {
      throw new ForbiddenException('Tu rol no permite consultar este tipo de documento.');
    }
    const client = await this.db.connect();
    const report: DiagnosticReport = {
      target, capturedAt: new Date().toISOString(), readOnly: true, evidence: [], findings: [],
      limitations: [
        'Instantánea de solo lectura: los datos y permisos pueden cambiar después.',
        'No verifica formularios sin guardar, logs, errores de código, movimientos bancarios ni todas las reglas del flujo.',
        'Un estado HTTP del navegador no demuestra la causa del problema. No se ejecutó ninguna corrección.',
      ],
    };
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout = '3000ms'");
      this.evidence(report, 'Permisos de la sesión verificados por el servidor', {
        canExecuteOperationalWrites: user.roles.includes('admin'),
      });
      if (target.kind === 'screen') await this.screen(client, user, target, report);
      else if (target.kind === 'purchase-request') await this.purchase(client, user, target, report);
      else if (target.kind === 'sales-order') await this.sales(client, user, target, report);
      else await this.stock(client, user, target, report);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    if (!report.findings.length) this.finding(report, 'checks_without_block', 'info',
      'No se detecta un bloqueo entre las comprobaciones realizadas.',
      'Actualiza la pantalla y revisa las validaciones del flujo. Esto no garantiza que una operación pueda ejecutarse.',
      report.evidence.map(item => item.id), target.kind === 'purchase-request' ? '/operations?tab=purchases' : '/inventory');
    await this.db.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
      VALUES($1,$2,'assistant.diagnostic.read','assistant',$3,$4)`,
      [user.companyId, user.sub, target.kind === 'screen' ? target.screen : target.id, JSON.stringify({
        tool: target.kind, findingCodes: report.findings.map(item => item.code), capturedAt: report.capturedAt,
      })]);
    return report;
  }

  private evidence(report: DiagnosticReport, source: string, facts: Facts) {
    const id = `E${report.evidence.length + 1}`;
    report.evidence.push({ id, source, facts });
    return id;
  }
  private finding(report: DiagnosticReport, code: string, severity: Finding['severity'],
    title: string, recommendation: string, evidenceIds: string[], route: string) {
    report.findings.push({ code, severity, title, recommendation, evidenceIds, route });
  }
  private state(value: string) {
    return ['draft', 'submitted', 'approved', 'rejected', 'confirmed', 'invoiced', 'cancelled'].includes(value) ? value : 'unrecognized';
  }

  private async screen(client: PoolClient, user: AuthTokenPayload,
    target: Extract<DiagnosticTarget, { kind: 'screen' }>, report: DiagnosticReport) {
    const area = diagnosticArea(target), knowledge = diagnosticKnowledge[area];
    if (knowledge.roles.length && !knowledge.roles.some(role => user.roles.includes(role))) {
      throw new ForbiddenException('Tu rol no permite consultar los datos de esta área.');
    }
    if (area === 'platform') {
      const membership = await client.query(`SELECT o.role FROM platform_saas_operators o
        JOIN users u ON u.id=o.user_id AND u.is_active WHERE o.user_id=$1 AND o.enabled`, [user.sub]);
      if (!membership.rows.length) throw new ForbiddenException('Se requiere membresía SaaS activa.');
    }
    const admin = user.roles.includes('admin');
    let dataId: string | undefined;
    if (knowledge.query) {
      const parameterCount = knowledge.query.includes('$3') ? 3 : knowledge.query.includes('$2') ? 2 : 1;
      const params = [user.companyId, admin || user.roles.includes('sales'), admin || user.roles.includes('purchases')];
      const result = await client.query<Facts>(knowledge.query, params.slice(0, parameterCount));
      if (!result.rows[0]) throw new NotFoundException('No hay contexto de empresa disponible.');
      dataId = this.evidence(report, `Resumen autorizado de ${area}`, result.rows[0]);
    }
    const knowledgeId = this.evidence(report, 'Guía operativa ERP360 · manual 3.16 (no es lectura del documento completo)', {
      area, guidance: knowledge.guidance,
    });
    this.finding(report, 'screen_review', 'info',
      dataId ? 'Resumen de pantalla consultado con los permisos de tu sesión.' : 'Guía de pantalla; no se consultaron documentos de esta área.',
      knowledge.guidance, dataId ? [dataId, knowledgeId] : [knowledgeId], target.screen);
    report.limitations.push('Los recuentos no verifican un documento individual ni prueban la causa de un error. null significa información no visible para este rol, no cero.');
  }

  private async purchase(client: PoolClient, user: AuthTokenPayload,
    target: Extract<DiagnosticTarget, { kind: 'purchase-request' }>, report: DiagnosticReport) {
    const result = await client.query<{
      status: string; created_by: string | null; independent: boolean; has_lines: boolean; has_order: boolean;
    }>(`SELECT pr.status,pr.created_by,c.require_independent_purchase_approver AS independent,
        EXISTS(SELECT 1 FROM purchase_request_lines l WHERE l.request_id=pr.id) AS has_lines,
        EXISTS(SELECT 1 FROM purchase_orders po WHERE po.request_id=pr.id AND po.company_id=pr.company_id) AS has_order
      FROM purchase_requests pr JOIN companies c ON c.id=pr.company_id
      WHERE pr.id=$1 AND pr.company_id=$2`, [target.id, user.companyId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Solicitud no encontrada en tu empresa.');
    const block = purchaseApprovalBlockReason(row.independent, row.created_by, user.sub);
    const id = this.evidence(report, 'Solicitud, líneas, orden vinculada y política de aprobación', {
      state: this.state(row.status), hasLines: row.has_lines, hasOrder: row.has_order,
      independentApprovalRequired: row.independent, approvalBlockedByPolicy: Boolean(block),
      creatorKnown: row.created_by !== null,
    });
    const route = '/operations?tab=purchases';
    if (!user.roles.includes('admin')) this.finding(report, 'approval_permission', 'blocking',
      'Tu rol permite consultar, pero no aprobar solicitudes.',
      'Solicita la revisión de un administrador autorizado; el asistente no cambia permisos.', ['E1'], route);
    if (!['draft', 'submitted'].includes(row.status) || row.has_order) this.finding(report, 'purchase_not_open', 'blocking',
      'La solicitud no está abierta para una nueva aprobación o ya tiene orden.',
      'Consulta la orden o el estado actual. No crees una orden duplicada ni alteres el histórico.', [id], route);
    if (block) this.finding(report, 'independent_approval', 'blocking',
      'La política de aprobación independiente bloquea la aprobación por esta sesión.',
      row.created_by === null ? 'Solicita revisión del origen histórico por un administrador; no inventes un creador.'
        : 'Debe revisar y aprobar otro administrador distinto del creador.', [id], route);
    if (!row.has_lines) this.finding(report, 'purchase_empty', 'blocking', 'La solicitud no tiene líneas.',
      'Revisa el documento con el responsable antes de intentar aprobarlo.', [id], route);
  }

  private async sales(client: PoolClient, user: AuthTokenPayload,
    target: Extract<DiagnosticTarget, { locationCode: string }>, report: DiagnosticReport) {
    const result = await client.query<{ status: string }>(
      'SELECT status FROM sales_orders WHERE id=$1 AND company_id=$2', [target.id, user.companyId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Pedido no encontrado en tu empresa.');
    const stateId = this.evidence(report, 'Estado del pedido de venta', { state: this.state(row.status) });
    const stock = (await client.query<{ has_lines: boolean; shortages: number }>(`
      WITH required AS (
        SELECT l.product_id,SUM(l.quantity) AS quantity FROM sales_order_lines l
        JOIN sales_orders so ON so.id=l.order_id AND so.company_id=$2
        WHERE l.order_id=$1 GROUP BY l.product_id
      )
      SELECT EXISTS(SELECT 1 FROM required) AS has_lines,
        COUNT(*) FILTER(WHERE COALESCE(s.on_hand-s.reserved,0)<r.quantity)::integer AS shortages
      FROM required r LEFT JOIN inventory_stock_balances s
        ON s.product_id=r.product_id AND s.company_id=$2 AND s.location_code=$3`,
    [target.id, user.companyId, target.locationCode])).rows[0];
    const reservations = (await client.query<{
      active: number; fulfilled: number; mismatched: number; invalid_stock: number;
    }>(`WITH grouped AS (
        SELECT product_id,location_code,status,SUM(quantity) AS quantity FROM inventory_reservations
        WHERE sales_order_id=$1 AND company_id=$2 AND status IN ('reserved','fulfilled')
        GROUP BY product_id,location_code,status
      )
      SELECT COUNT(*) FILTER(WHERE r.status='reserved')::integer AS active,
        COUNT(*) FILTER(WHERE r.status='fulfilled')::integer AS fulfilled,
        COUNT(*) FILTER(WHERE r.status='reserved' AND r.location_code<>$3)::integer AS mismatched,
        COUNT(*) FILTER(WHERE r.status='reserved' AND
          (s.product_id IS NULL OR s.on_hand<r.quantity OR s.reserved<r.quantity))::integer AS invalid_stock
      FROM grouped r LEFT JOIN inventory_stock_balances s
        ON s.product_id=r.product_id AND s.company_id=$2 AND s.location_code=r.location_code`,
    [target.id, user.companyId, target.locationCode])).rows[0];
    const stockId = this.evidence(report, 'Líneas agrupadas por producto y saldo de la ubicación seleccionada',
      { hasLines: stock.has_lines, productsWithoutAvailableStock: stock.shortages });
    const reservationId = this.evidence(report, 'Reservas del pedido y saldos de sus ubicaciones', {
      activeGroups: reservations.active, fulfilledGroups: reservations.fulfilled,
      differentLocationGroups: reservations.mismatched, invalidStockGroups: reservations.invalid_stock,
    });
    const route = '/inventory';
    if (!user.roles.includes('admin')) this.finding(report, 'fulfillment_permission', 'blocking',
      'Tu rol permite consultar, pero no reservar ni despachar.',
      'Solicita la operación a un administrador autorizado.', ['E1'], route);
    if (!['confirmed', 'invoiced'].includes(row.status)) this.finding(report, 'sale_state', 'blocking',
      'El pedido no está confirmado o facturado.',
      'Revisa el estado y su documento de origen antes de reservar o despachar.', [stateId], '/operations?tab=sales');
    if (!stock.has_lines) this.finding(report, 'sale_empty', 'blocking', 'El pedido no tiene líneas.',
      'Solicita revisión del documento; no ajustes existencias para ocultarlo.', [stockId], route);
    if (!reservations.active && !reservations.fulfilled && stock.shortages) this.finding(report, 'insufficient_stock', 'blocking',
      'No hay disponibilidad suficiente para todos los productos en la ubicación seleccionada.',
      'Revisa ubicación, cantidades, reservas y recepciones reales antes de intentar reservar.', [stockId], route);
    if (!reservations.active && !reservations.fulfilled) this.finding(report, 'reservation_missing', 'blocking',
      'El pedido no tiene reserva activa para despachar.',
      'Un administrador debe revisar disponibilidad y reservar primero; no se ha ejecutado la reserva.', [reservationId], route);
    if (reservations.fulfilled) this.finding(report, 'already_fulfilled', 'warning',
      'Hay reservas del pedido ya despachadas.',
      'Consulta el kardex y concilia el historial antes de intentar otra reserva o despacho.', [reservationId], route);
    if (reservations.mismatched) this.finding(report, 'reservation_location', 'blocking',
      'La ubicación seleccionada no coincide con todas las reservas activas.',
      'Verifica las ubicaciones originales; no cambies inventario para forzar el despacho.', [reservationId], route);
    if (reservations.invalid_stock) this.finding(report, 'reservation_stock', 'blocking',
      'Una reserva activa no está respaldada por su saldo físico o reservado.',
      'Detén el despacho y solicita conciliación de reservas y kardex; no hagas un ajuste sin investigar.', [reservationId], route);
    report.limitations.push('La disponibilidad para reservar excluye stock ya reservado; no es una simulación de escritura ni verifica todos los vínculos históricos.');
  }

  private async stock(client: PoolClient, user: AuthTokenPayload,
    target: Extract<DiagnosticTarget, { locationCode: string }>, report: DiagnosticReport) {
    const result = await client.query<{
      balance_recorded: boolean; invalid_balance: boolean; has_available: boolean;
      reservation_mismatch: boolean; product_active: boolean;
    }>(`SELECT s.product_id IS NOT NULL AS balance_recorded,p.is_active AS product_active,
        (s.on_hand<0 OR s.reserved<0 OR s.reserved>s.on_hand) IS TRUE AS invalid_balance,
        (s.on_hand-s.reserved>0) IS TRUE AS has_available,
        (COALESCE(s.reserved,0)<>COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r
          WHERE r.company_id=p.company_id AND r.product_id=p.id AND r.location_code=$3 AND r.status='reserved'),0)) AS reservation_mismatch
      FROM products p LEFT JOIN inventory_stock_balances s
        ON s.product_id=p.id AND s.company_id=p.company_id AND s.location_code=$3
      WHERE p.id=$1 AND p.company_id=$2`, [target.id, user.companyId, target.locationCode]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Producto no encontrado en tu empresa.');
    const id = this.evidence(report, 'Producto, saldo y suma de reservas activas en la ubicación seleccionada', {
      balanceRecorded: row.balance_recorded, invalidBalance: row.invalid_balance,
      hasAvailableStock: row.has_available, reservationMismatch: row.reservation_mismatch, productActive: row.product_active,
    });
    const route = '/inventory';
    if (!row.balance_recorded) this.finding(report, 'balance_missing', 'warning',
      'No existe un saldo registrado en esta ubicación.',
      'Verifica ubicación y recepciones documentadas. La ausencia de una fila no demuestra pérdida de mercancía.', [id], route);
    else if (!row.has_available) this.finding(report, 'no_available_stock', 'warning',
      'No hay stock disponible positivo en esta ubicación.',
      'Revisa reservas y entradas reales; no asumas que el físico es todo disponible.', [id], route);
    if (row.invalid_balance || row.reservation_mismatch) this.finding(report, 'stock_inconsistency', 'blocking',
      'Se detecta un saldo inválido o una diferencia con las reservas activas.',
      'Solicita conciliación del kardex y reservas antes de modificar o despachar existencias.', [id], route);
    if (!row.product_active) this.finding(report, 'inactive_product', 'warning',
      'El producto está inactivo.',
      'Consulta su estado en Catálogos; el asistente no reactiva productos.', [id], '/catalogs');
  }
}

export function providerDiagnostic(report: DiagnosticReport) {
  return { capturedAt: report.capturedAt, tool: report.target.kind,
    evidence: report.evidence, findings: report.findings, limitations: report.limitations };
}
