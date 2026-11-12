import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import { EmptyStateComponent } from './shared/empty-state.component';
import { ReplenishmentComponent } from './replenishment.component';
import { AssistantContextService } from './core/assistant-context.service';

type StockRow = {
  product_id: string;
  product_name: string;
  location_code: string;
  on_hand: string;
  reserved: string;
  available: string;
};
type ProductRow = { id: string; sku: string; name: string };
type Movement = {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  location_code: string;
  movement_type: string;
  quantity: string;
  reference_type: string;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
};
type MovementPage = { items: Movement[]; total: number; page: number; pageSize: number };
type FulfillmentOrder = {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
  reservation_status: 'none' | 'reserved' | 'fulfilled';
  reservation_location: string | null;
  is_invoiced: boolean;
};

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent, ReplenishmentComponent],
  template: `
    <section class="page-shell">
      <header class="page-header">
        <p class="eyebrow">EXISTENCIAS Y MOVIMIENTOS</p>
        <h1>Inventario</h1>
        <p>Consulta saldos, revisa el kardex y procesa reservas o despachos por ubicación.</p>
      </header>

      <p *ngIf="error" class="status status-error" role="alert">{{ error }}</p>
      <p *ngIf="message" class="status status-success" role="status">{{ message }}</p>

      <article class="surface-card">
        <div class="toolbar-grid">
          <label>Ubicación
            <input name="locationFilter" [(ngModel)]="locationCode" maxlength="32" autocomplete="off" />
          </label>
          <label>Producto en movimientos
            <select name="productFilter" [(ngModel)]="productFilter">
              <option value="">Todos los productos</option>
              @for (product of products; track product.id) {
                <option [value]="product.id">{{ product.sku }} · {{ product.name }}</option>
              }
            </select>
          </label>
          <button type="button" class="btn btn-primary" (click)="applyFilters()" [disabled]="loading">
            {{ loading ? 'Actualizando…' : 'Actualizar inventario' }}
          </button>
        </div>
      </article>

      <section class="kpi-grid" aria-label="Resumen de inventario">
        <article class="kpi-card"><span>Productos / ubicaciones</span><strong>{{ stock.length }}</strong></article>
        <article class="kpi-card"><span>Unidades disponibles</span><strong>{{ totalAvailable | number:'1.0-4' }}</strong></article>
        <article class="kpi-card"><span>Unidades reservadas</span><strong>{{ totalReserved | number:'1.0-4' }}</strong></article>
      </section>

      <article class="surface-card">
        <h2>Saldos por producto y ubicación</h2>
        @if (stock.length) {
          <div class="table-scroll"><table class="table-list">
            <caption>Existencia física, comprometida y disponible. La ubicación se filtra en servidor.</caption>
            <thead><tr><th scope="col">Producto</th><th scope="col">Ubicación</th><th scope="col">Físico</th><th scope="col">Reservado</th><th scope="col">Disponible</th><th scope="col">Diagnóstico</th></tr></thead>
            <tbody>@for (row of stock; track row.product_id + row.location_code) {
              <tr><th scope="row">{{ row.product_name }}</th><td>{{ row.location_code }}</td><td>{{ row.on_hand | number:'1.0-4' }}</td><td>{{ row.reserved | number:'1.0-4' }}</td><td><strong>{{ row.available | number:'1.0-4' }}</strong></td><td><button class="btn btn-secondary" type="button" (click)="assistant.select({kind: 'stock', id: row.product_id, locationCode: row.location_code}, '/inventory')">Analizar saldo</button></td></tr>
            }</tbody>
          </table></div>
        } @else if (!loading) {
          <app-empty-state title="Sin saldos para esta ubicación" description="Registra una recepción o un ajuste autorizado para crear existencias." icon="bi-box-seam"></app-empty-state>
        }
      </article>

      @if (isAdmin) {
        <article class="surface-card">
          <h2>Ajuste manual de existencias</h2>
          <p>Utiliza un motivo y conserva evidencia. No uses ajustes para sustituir recepción, reserva o despacho de documentos.</p>
          <form class="toolbar-grid" #adjustmentForm="ngForm" (ngSubmit)="adjustStock()">
            <label>Producto
              <select name="adjustmentProduct" [(ngModel)]="adjustment.productId" required>
                <option value="">Selecciona un producto</option>
                @for (product of products; track product.id) { <option [value]="product.id">{{ product.sku }} · {{ product.name }}</option> }
              </select>
            </label>
            <label>Tipo
              <select name="direction" [(ngModel)]="adjustment.direction" required>
                <option value="in">Entrada</option><option value="out">Salida</option>
              </select>
            </label>
            <label>Cantidad
              <input name="quantity" type="number" min="0.0001" step="0.0001" [(ngModel)]="adjustment.quantity" required />
            </label>
            <label>Ubicación
              <input name="adjustmentLocation" [(ngModel)]="adjustment.locationCode" maxlength="32" required />
            </label>
            <label class="wide-field">Motivo
              <input name="notes" [(ngModel)]="adjustment.notes" maxlength="500" required />
            </label>
            <button type="submit" class="btn btn-secondary" [disabled]="busy || adjustmentForm.invalid">Registrar ajuste</button>
          </form>
        </article>
      }

      @if (isAdmin) {
        <article class="surface-card">
          <h2>Pedidos pendientes de surtir</h2>
          <p>La reserva reduce disponibilidad; el despacho descuenta existencia física. Confirma la ubicación antes de despachar.</p>
          @if (orders.length) {
            <div class="table-scroll"><table class="table-list">
              <caption>Pedidos de venta confirmados o facturados del tenant actual.</caption>
              <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Estado</th><th scope="col">Reserva</th><th scope="col">Ubicación</th><th scope="col">Acción</th></tr></thead>
              <tbody>@for (order of orders; track order.id) {
                <tr>
                  <th scope="row">{{ order.order_number }}</th><td>{{ order.customer_name }}</td><td>{{ order.status }}</td>
                  <td>{{ reservationLabel(order.reservation_status) }}</td>
                  <td>
                    <button class="btn btn-secondary" type="button" (click)="assistant.select({kind: 'sales-order', id: order.id, locationCode: orderLocations[order.id] || locationCode}, '/inventory')">Analizar pedido</button>
                    @if (order.reservation_status === 'reserved') { {{ order.reservation_location }} }
                    @else { <input [name]="'loc-' + order.id" [(ngModel)]="orderLocations[order.id]" maxlength="32" aria-label="Ubicación para el pedido {{ order.order_number }}" /> }
                  </td>
                  <td>
                    @if (order.reservation_status === 'none') {
                      <button class="btn btn-secondary" type="button" (click)="reserve(order)" [disabled]="busy">Reservar</button>
                    } @else if (order.reservation_status === 'reserved' && pendingDispatchId !== order.id) {
                      <button class="btn btn-secondary" type="button" (click)="requestDispatch(order)">Preparar despacho</button>
                    } @else if (order.reservation_status === 'reserved') {
                      <button class="btn btn-primary" type="button" (click)="dispatch(order)" [disabled]="busy">Confirmar despacho</button>
                      <button class="btn btn-secondary" type="button" (click)="pendingDispatchId = ''" [disabled]="busy">Cancelar</button>
                    } @else { <span>Despachado</span> }
                  </td>
                </tr>
              }</tbody>
            </table></div>
          } @else if (!loading) { <p class="muted">No hay pedidos pendientes de reserva o despacho.</p> }
        </article>
      }

      <article class="surface-card">
        <h2>Kardex de movimientos</h2>
        <p>Movimientos ordenados por fecha. Reservar cambia unidades disponibles, no las físicas; el despacho registra la salida física.</p>
        @if (movements.items.length) {
          <div class="table-scroll"><table class="table-list">
            <caption>Registro de movimientos; página {{ movements.page }} de {{ movementPages }}.</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Producto</th><th scope="col">Ubicación</th><th scope="col">Tipo</th><th scope="col">Cantidad</th><th scope="col">Referencia / motivo</th></tr></thead>
            <tbody>@for (movement of movements.items; track movement.id) {
              <tr><td>{{ movement.created_at | date:'short' }}</td><th scope="row">{{ movement.sku }} · {{ movement.product_name }}</th><td>{{ movement.location_code }}</td><td>{{ movementLabel(movement.movement_type) }}</td><td>{{ movement.quantity | number:'1.0-4' }}</td><td>{{ movement.reference_type }} · {{ movement.notes || movement.reference_id || '—' }}</td></tr>
            }</tbody>
          </table></div>
          <div class="pagination">
            <button class="btn btn-secondary" type="button" (click)="changeMovementPage(-1)" [disabled]="loading || movements.page <= 1">Anterior</button>
            <span>Página {{ movements.page }} de {{ movementPages }} · {{ movements.total }} movimientos</span>
            <button class="btn btn-secondary" type="button" (click)="changeMovementPage(1)" [disabled]="loading || movements.page >= movementPages">Siguiente</button>
          </div>
        } @else if (!loading) {
          <p class="muted">No hay movimientos que coincidan con el filtro.</p>
        }
      </article>
      <app-replenishment />
      <p class="muted">La valoración de inventario, lotes, series y caducidad aún no están disponibles. Transferencias y conteos se realizan desde Control operativo.</p>
    </section>
  `,
})
export class InventoryComponent implements OnInit {
  readonly assistant = inject(AssistantContextService);
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly api = API_BASE_URL;
  stock: StockRow[] = [];
  products: ProductRow[] = [];
  orders: FulfillmentOrder[] = [];
  movements: MovementPage = { items: [], total: 0, page: 1, pageSize: 25 };
  locationCode = 'MAIN';
  productFilter = '';
  orderLocations: Record<string, string> = {};
  adjustment = { productId: '', direction: 'in' as 'in' | 'out', quantity: 1, locationCode: 'MAIN', notes: '' };
  pendingDispatchId = '';
  loading = false;
  busy = false;
  error = '';
  message = '';

  ngOnInit() { void this.refresh(); }

  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get totalAvailable() { return this.stock.reduce((sum, row) => sum + Number(row.available), 0); }
  get totalReserved() { return this.stock.reduce((sum, row) => sum + Number(row.reserved), 0); }
  get movementPages() { return Math.max(1, Math.ceil(this.movements.total / this.movements.pageSize)); }

  async applyFilters() {
    if (this.loading) return;
    this.movements = { ...this.movements, page: 1 };
    await this.refresh();
  }

  async refresh() {
    if (this.loading) return;
    this.loading = true; this.error = '';
    try {
      const [stock, movements, products, orders] = await Promise.all([
        firstValueFrom(this.http.get<StockRow[]>(`${this.api}/inventory/stock`, { params: { locationCode: this.locationCode.trim() } })),
        firstValueFrom(this.http.get<MovementPage>(`${this.api}/inventory/movements`, { params: {
          locationCode: this.locationCode.trim(), page: this.movements.page, pageSize: this.movements.pageSize,
          ...(this.productFilter ? { productId: this.productFilter } : {}),
        } })),
        firstValueFrom(this.http.get<ProductRow[]>(`${this.api}/masters/products`)),
        this.isAdmin ? firstValueFrom(this.http.get<FulfillmentOrder[]>(`${this.api}/inventory/sales-orders`)) : Promise.resolve([]),
      ]);
      this.stock = stock;
      this.movements = movements;
      this.products = products;
      this.orders = orders;
      for (const order of orders) this.orderLocations[order.id] ??= order.reservation_location || this.locationCode;
    } catch (error) {
      this.error = this.errorMessage(error, 'No se pudo cargar inventario. Comprueba tu sesión y vuelve a intentar.');
    } finally { this.loading = false; }
  }

  async adjustStock() {
    if (this.busy) return;
    const quantity = Number(this.adjustment.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !this.adjustment.notes.trim()) {
      this.error = 'Indica una cantidad positiva y un motivo para el ajuste.'; return;
    }
    this.busy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.post(`${this.api}/inventory/adjustments`, {
        ...this.adjustment, quantity, locationCode: this.adjustment.locationCode.trim(), notes: this.adjustment.notes.trim(),
      }));
      this.message = 'Ajuste registrado. Revisa el nuevo saldo y el movimiento del kardex.';
      this.adjustment = { ...this.adjustment, quantity: 1, notes: '' };
      await this.refresh();
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo registrar el ajuste. Revisa cantidad y saldo disponible.'); }
    finally { this.busy = false; }
  }

  async reserve(order: FulfillmentOrder) {
    if (this.busy) return;
    const locationCode = (this.orderLocations[order.id] || this.locationCode).trim();
    if (!locationCode) { this.error = 'Indica una ubicación para reservar.'; return; }
    this.busy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.post(`${this.api}/inventory/sales/orders/${order.id}/reserve`, { locationCode }));
      this.message = `Reserva aplicada para ${order.order_number}.`;
      await this.refresh();
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo reservar. Comprueba estado y disponibilidad.'); }
    finally { this.busy = false; }
  }

  requestDispatch(order: FulfillmentOrder) { this.pendingDispatchId = order.id; }

  async dispatch(order: FulfillmentOrder) {
    if (this.busy || !order.reservation_location) return;
    this.busy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.post(`${this.api}/inventory/sales/orders/${order.id}/dispatch`, {
        locationCode: order.reservation_location,
      }));
      this.pendingDispatchId = '';
      this.message = `Despacho registrado para ${order.order_number}.`;
      await this.refresh();
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo despachar. La ubicación debe coincidir con la reserva.'); }
    finally { this.busy = false; }
  }

  async changeMovementPage(delta: number) {
    const next = this.movements.page + delta;
    if (next < 1 || next > this.movementPages) return;
    this.movements = { ...this.movements, page: next };
    await this.refresh();
  }

  reservationLabel(status: FulfillmentOrder['reservation_status']) {
    return status === 'reserved' ? 'Reservado' : status === 'fulfilled' ? 'Despachado' : 'Sin reserva';
  }

  movementLabel(type: string) {
    const labels: Record<string, string> = {
      purchase_receipt: 'Recepción de compra', sale_reservation: 'Reserva de venta',
      sale_dispatch: 'Despacho', reservation_release: 'Liberación de reserva',
      adjustment_in: 'Ajuste de entrada', adjustment_out: 'Ajuste de salida',
    };
    return labels[type] ?? type;
  }

  private errorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpErrorResponse && error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo.';
    if (error instanceof HttpErrorResponse && error.status === 403) return 'Tu rol no permite esta operación.';
    if (error instanceof HttpErrorResponse && error.status === 400) return 'La operación no cumple las validaciones de inventario. Revisa disponibilidad, estado y ubicación.';
    return fallback;
  }
}
