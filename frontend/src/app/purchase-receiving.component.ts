import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type Purchase = { purchase_order_id: string | null; purchase_order_number: string | null; purchase_order_status: string | null; supplier_name: string; is_posted: boolean };
type ReceiptDetails = {
  order: { id: string; order_number: string; status: string; currency_code: string | null };
  lines: { id: string; product_name: string; quantity: string; unit_cost: string; received: string; remaining: string }[];
  receipts: { id: string; receipt_number: string; product_name: string; location_code: string; quantity: string; unit_cost: string; returnable: string }[];
  legacyReceipts: { id: string; receipt_number: string }[];
  returns: { id: string; reference: string; reason: string; subtotal: string; tax_total: string; grand_total: string; created_at: string }[];
};

@Component({
  selector: 'app-purchase-receiving', standalone: true, imports: [CommonModule, FormsModule],
  styles: [`
    .receiving-form { max-width: none; min-width: 0; grid-template-columns: minmax(0, 1fr); }
    .receiving-table { min-width: 860px; table-layout: auto; }
    .receiving-table thead th { white-space: nowrap; overflow-wrap: normal; }
    .receiving-table td:last-child { min-width: 240px; }
  `],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">COMPRAS Y ALMACÉN</p><h1>Recepciones y devoluciones</h1>
        <p>Recibe cantidades reales por entrega. Cada lote actualiza inventario una sola vez.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (!isAdmin) { <p role="alert">Requiere administrador de empresa.</p> } @else {
        <article class="surface-card">
          <div class="header-with-action"><h2>Orden de compra</h2><button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="busy">Actualizar compras</button></div>
          <label>Compra a gestionar<select [ngModel]="orderId" (ngModelChange)="selectOrder($event)" [disabled]="busy">
            <option value="">Selecciona una compra aprobada</option>
            @for (row of purchases; track row.purchase_order_id) {
              <option [value]="row.purchase_order_id">{{ row.purchase_order_number }} · {{ row.supplier_name }} · {{ statusLabel(row.purchase_order_status || '') }}</option>
            }
          </select></label>
        </article>
        @if (details; as data) {
          <article class="surface-card"><h2>{{ data.order.order_number }} · {{ statusLabel(data.order.status) }}</h2>
            <p>Moneda: {{ data.order.currency_code || 'No definida (histórico)' }}. El costo de cada lote se conserva desde la orden aprobada.</p>
            @if (data.legacyReceipts.length) {
              <p class="status status-info">Esta compra usa recepción histórica sin líneas de lote. Continúa su aplicación desde Operaciones; no mezcles flujos ni inventes ubicaciones históricas. Las devoluciones por lote requieren conciliación previa.</p>
            } @else {
              <form class="form-grid receiving-form" #receiveForm="ngForm" (ngSubmit)="receive()">
                @if (data.order.status === 'ordered' || data.order.status === 'partially_received') {
                <div class="toolbar-grid">
                  <label>Referencia de recepción<input name="receiptReference" [(ngModel)]="receipt.reference" maxlength="64" required /></label>
                  <label>Ubicación de recepción<input name="receiptLocation" [(ngModel)]="receipt.locationCode" maxlength="32" required /></label>
                </div>
                }
                <div class="table-scroll"><table class="table-list receiving-table"><caption>Cantidades pedidas, recibidas y pendientes por línea</caption>
                  <thead><tr><th>Producto / costo</th><th>Pedido</th><th>Recibido</th><th>Pendiente</th><th>Recibir ahora</th></tr></thead>
                  <tbody>@for (line of data.lines; track line.id) {
                    <tr><th scope="row">{{ line.product_name }}<br>{{ line.unit_cost | number:'1.2-4' }}</th>
                      <td>{{ line.quantity | number:'1.0-4' }}</td><td>{{ line.received | number:'1.0-4' }}</td><td>{{ line.remaining | number:'1.0-4' }}</td>
                      <td>@if (+line.remaining > 0) { <label>Cantidad a recibir: {{ line.product_name }}<input [name]="'receive-' + line.id" [(ngModel)]="receiveQuantities[line.id]" type="number" min="0" [max]="+line.remaining" step="0.0001" [disabled]="busy" required /></label> } @else { Línea completa } </td>
                    </tr>
                  }</tbody>
                </table></div>
                @if (data.order.status === 'ordered' || data.order.status === 'partially_received') {
                  <label><input name="receivedConfirmed" type="checkbox" [(ngModel)]="receipt.confirmed" required /> Confirmo que recibí físicamente estas cantidades.</label>
                  <button class="btn btn-primary" type="submit" [disabled]="busy || receiveForm.invalid || !hasReceiptQuantity">Confirmar recepción e inventario</button>
                }
              </form>
            }
            @if (data.order.status === 'received' && !selectedPurchase?.is_posted && !data.legacyReceipts.length) {
              <p>La recepción está completa. El devengo contable se realiza al completar la orden, no en cada entrega parcial.</p>
              <button class="btn btn-secondary" type="button" (click)="postPurchase()" [disabled]="busy">Contabilizar compra completa</button>
            }
          </article>
          @if (data.receipts.length) {
            <article class="surface-card"><h2>Devolución a proveedor</h2>
              <p>Solo compras totalmente recibidas y contabilizadas. Se resta stock disponible de la ubicación original y se registra crédito comercial con reversión contable proporcional. No anula documentos fiscales ni envía dinero.</p>
              <p>Si la compra ya se pagó, el saldo negativo en Control operativo representa crédito a recuperar del proveedor. Registra allí el ingreso solo cuando recibas el dinero. Devolver no reabre cantidades pendientes ni crea una reposición.</p>
              <form class="form-grid receiving-form" #returnForm="ngForm" (ngSubmit)="returnGoods()">
                <div class="toolbar-grid"><label>Referencia de devolución<input name="returnReference" [(ngModel)]="supplierReturn.reference" maxlength="64" required /></label>
                  <label>Motivo de devolución<input name="returnReason" [(ngModel)]="supplierReturn.reason" minlength="10" maxlength="1000" required /></label></div>
                <div class="table-scroll"><table class="table-list receiving-table"><caption>Lotes recibidos y cantidades aún no devueltas</caption>
                  <thead><tr><th>Recepción / producto</th><th>Ubicación</th><th>Recibido / costo</th><th>Sin devolver</th><th>Devolver ahora</th></tr></thead>
                  <tbody>@for (line of data.receipts; track line.id) {
                    <tr><th scope="row">{{ line.receipt_number }}<br>{{ line.product_name }}</th><td>{{ line.location_code }}</td>
                      <td>{{ line.quantity | number:'1.0-4' }} × {{ line.unit_cost | number:'1.2-4' }}</td><td>{{ line.returnable | number:'1.0-4' }}</td>
                      <td><label>Cantidad a devolver: {{ line.receipt_number }} · {{ line.product_name }}<input [name]="'return-' + line.id" [(ngModel)]="returnQuantities[line.id]" type="number" min="0" [max]="+line.returnable" step="0.0001" [disabled]="busy || +line.returnable <= 0" required /></label></td>
                    </tr>
                  }</tbody>
                </table></div>
                <label><input name="returnConfirmed" type="checkbox" [(ngModel)]="supplierReturn.confirmed" required /> Confirmo la entrega física al proveedor y el crédito comercial acordado.</label>
                <button class="btn btn-secondary" type="submit" [disabled]="busy || returnForm.invalid || !hasReturnQuantity || !selectedPurchase?.is_posted">Confirmar devolución y crédito</button>
              </form>
            </article>
          }
          @if (data.returns.length) {
            <article class="surface-card"><h2>Historial de devoluciones</h2>
              <div class="table-scroll"><table class="table-list"><caption>Créditos comerciales registrados por devolución</caption>
                <thead><tr><th>Referencia / fecha</th><th>Motivo</th><th>Subtotal</th><th>Impuesto</th><th>Total</th></tr></thead>
                <tbody>@for (row of data.returns; track row.id) { <tr><th scope="row">{{ row.reference }}<br>{{ row.created_at | date:'short' }}</th><td>{{ row.reason }}</td>
                  <td>{{ row.subtotal | number:'1.2-4' }}</td><td>{{ row.tax_total | number:'1.2-4' }}</td><td>{{ row.grand_total | number:'1.2-4' }}</td></tr> }</tbody>
              </table></div>
            </article>
          }
        }
      }
    </section>
  `,
})
export class PurchaseReceivingComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  purchases: Purchase[] = [];
  details: ReceiptDetails | null = null;
  orderId = '';
  receiveQuantities: Record<string, number | null> = {};
  returnQuantities: Record<string, number | null> = {};
  receipt = { reference: '', locationCode: 'MAIN', confirmed: false };
  supplierReturn = { reference: '', reason: '', confirmed: false };
  busy = false; error = ''; message = '';
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get selectedPurchase() { return this.purchases.find(row => row.purchase_order_id === this.orderId); }
  get hasReceiptQuantity() { return Object.values(this.receiveQuantities).some(value => value !== null && value > 0); }
  get hasReturnQuantity() { return Object.values(this.returnQuantities).some(value => value !== null && value > 0); }

  constructor() {
    effect(() => {
      const user = this.session.user();
      untracked(() => {
        this.purchases = []; this.orderId = ''; this.clearDetails(); this.busy = false;
        this.receipt = { reference: '', locationCode: 'MAIN', confirmed: false };
        this.supplierReturn = { reference: '', reason: '', confirmed: false };
        this.error = ''; this.message = '';
        if (user?.roles.includes('admin')) void this.refresh();
      });
    });
  }
  statusLabel(status: string) {
    return ({ ordered: 'Pendiente de recepción', partially_received: 'Recibida parcialmente', received: 'Recibida completa' } as Record<string, string>)[status] ?? status;
  }
  private clearDetails() { this.details = null; this.receiveQuantities = {}; this.returnQuantities = {}; }
  private async load() {
    const user = this.session.user();
    const purchases = await firstValueFrom(this.http.get<Purchase[]>(`${API_BASE_URL}/commerce/purchases/requests`));
    if (this.session.user() !== user) return;
    this.purchases = purchases.filter(row => row.purchase_order_id && ['ordered', 'partially_received', 'received'].includes(row.purchase_order_status ?? ''));
    if (this.orderId) await this.loadDetails();
  }
  private async loadDetails() {
    const user = this.session.user(); const id = this.orderId;
    const details = await firstValueFrom(this.http.get<ReceiptDetails>(`${API_BASE_URL}/inventory/purchases/orders/${id}/receipts`));
    if (this.session.user() !== user || this.orderId !== id) return;
    this.details = details;
    this.receiveQuantities = Object.fromEntries(details.lines.map(line => [line.id, 0]));
    this.returnQuantities = Object.fromEntries(details.receipts.map(line => [line.id, 0]));
  }
  async refresh() { await this.perform(() => this.load()); }
  async selectOrder(id: string) {
    if (this.busy) return;
    this.orderId = id; this.clearDetails(); this.receipt.confirmed = false; this.supplierReturn.confirmed = false;
    if (id) await this.perform(() => this.loadDetails());
  }
  private selectedLines(quantities: Record<string, number | null>) {
    return Object.entries(quantities).filter((entry): entry is [string, number] => entry[1] !== null && entry[1] > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
  }
  async receive() {
    if (!this.receipt.confirmed || !this.hasReceiptQuantity) { this.error = 'Indica cantidades y confirma la recepción física.'; return; }
    const user = this.session.user();
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ replayed: boolean }>(`${API_BASE_URL}/inventory/purchases/orders/${this.orderId}/receipts`,
        { reference: this.receipt.reference, locationCode: this.receipt.locationCode, lines: this.selectedLines(this.receiveQuantities) }));
      if (this.session.user() !== user) return;
      this.receipt.reference = ''; this.receipt.confirmed = false;
      this.message = result.replayed ? 'Referencia ya aplicada; no se duplicó inventario.' : 'Lote recibido e inventario actualizado.';
      await this.load();
    });
  }
  async postPurchase() {
    const user = this.session.user();
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/accounting/purchase-orders/${this.orderId}/post`, {}));
      if (this.session.user() !== user) return;
      this.message = 'Compra completa contabilizada.'; await this.load();
    });
  }
  async returnGoods() {
    if (!this.supplierReturn.confirmed || !this.hasReturnQuantity) { this.error = 'Indica cantidades y confirma entrega y crédito del proveedor.'; return; }
    const user = this.session.user();
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ replayed: boolean }>(`${API_BASE_URL}/accounting/purchase-orders/${this.orderId}/returns`,
        { reference: this.supplierReturn.reference, reason: this.supplierReturn.reason, lines: this.selectedLines(this.returnQuantities) }));
      if (this.session.user() !== user) return;
      this.supplierReturn = { reference: '', reason: '', confirmed: false };
      this.message = result.replayed ? 'Devolución ya aplicada; no se repitió la salida.' : 'Devolución, crédito comercial y reversión contable registrados.';
      await this.load();
    });
  }
  private async perform(action: () => Promise<void>) {
    if (this.busy || !this.isAdmin) return;
    const user = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); }
    catch (error) {
      if (this.session.user() !== user) return;
      this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'Cantidades cambiadas o referencia usada con otros datos. Actualiza y verifica antes de reintentar.'
        : error instanceof HttpErrorResponse && error.status === 400
          ? 'Revisa cantidades, ubicación disponible, contabilización y período abierto. No mezcles recepciones históricas y lotes nuevos.'
          : 'No se pudo completar. Verifica sesión, permisos y estado del documento antes de reintentar.';
    } finally { if (this.session.user() === user) this.busy = false; }
  }
}
