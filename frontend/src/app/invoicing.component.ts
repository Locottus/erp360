import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import { EmptyStateComponent } from './shared/empty-state.component';

type SalesOrder = {
  id: string;
  order_number: string;
  status: string;
  grand_total: string;
  customer_name: string;
};
type SalesInvoice = {
  id: string;
  invoice_number: string;
  status: 'issued' | 'paid' | 'void';
  subtotal: string;
  tax_total: string;
  grand_total: string;
  total_paid: string;
  balance_due: string;
  issued_at: string;
  sales_order_id: string;
  order_number: string;
  customer_name: string;
  is_posted: boolean;
  currency_code: string | null;
};

@Component({
  selector: 'app-invoicing',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="page-shell">
      <header class="page-header">
        <p class="eyebrow">DOCUMENTOS COMERCIALES Y COBROS</p>
        <h1>Facturación</h1>
        <p>Emite desde pedidos confirmados, contabiliza y registra pagos recibidos.</p>
      </header>
      <p class="status status-warning" role="note">Documento comercial, no comprobante fiscal certificado. Las facturas históricas sin moneda explícita requieren revisión contable; no se les asigna una moneda retroactivamente.</p>
      <p *ngIf="error" class="status status-error" role="alert">{{ error }}</p>
      <p *ngIf="message" class="status status-success" role="status">{{ message }}</p>

      @if (isAdmin) {
        <article class="surface-card">
          <h2>Emitir factura comercial</h2>
          <p>Solo se pueden facturar pedidos confirmados que aún no tengan factura.</p>
          @if (invoiceableOrders.length) {
            <form class="toolbar-grid" #issueForm="ngForm" (ngSubmit)="issueInvoice()">
              <label>Pedido y cliente
                <select name="salesOrderId" [(ngModel)]="issue.salesOrderId" required>
                  <option value="">Selecciona un pedido confirmado</option>
                  @for (order of invoiceableOrders; track order.id) {
                    <option [value]="order.id">{{ order.order_number }} · {{ order.customer_name }} · {{ order.grand_total | number:'1.2-4' }}</option>
                  }
                </select>
              </label>
              <label>Número de factura (vacío = automático)
                <input name="invoiceNumber" [(ngModel)]="issue.invoiceNumber" maxlength="64" autocomplete="off" />
              </label>
              <button type="submit" class="btn btn-primary" [disabled]="busy || issueForm.invalid">Emitir factura comercial</button>
            </form>
            <p class="muted">La secuencia automática es comercial y propia de esta empresa; no reemplaza numeración fiscal autorizada.</p>
          } @else {
            <p class="muted">No hay pedidos confirmados pendientes de factura.</p>
          }
        </article>
      }

      <article class="surface-card">
        <div class="header-with-action">
          <div><h2>Facturas</h2><p class="muted">{{ invoices.length }} documentos comerciales</p></div>
          <button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="loading">{{ loading ? 'Actualizando…' : 'Actualizar' }}</button>
        </div>
        @if (invoices.length) {
          <div class="table-scroll"><table class="table-list invoice-table">
            <caption>Facturas comerciales del tenant. Los saldos se calculan con pagos registrados en el sistema.</caption>
            <thead><tr><th scope="col">Factura / fecha</th><th scope="col">Pedido / cliente</th><th scope="col">Estado</th><th scope="col">Total</th><th scope="col">Pagado</th><th scope="col">Pendiente</th><th scope="col">Acciones</th></tr></thead>
            <tbody>@for (invoice of invoices; track invoice.id) {
              <tr>
                <th scope="row">{{ invoice.invoice_number }}<br><small>{{ invoice.issued_at | date:'short' }}</small></th>
                <td>{{ invoice.order_number }}<br>{{ invoice.customer_name }}</td>
                <td>{{ invoice.status }} · {{ invoice.is_posted ? 'Contabilizada' : 'Pendiente de contabilizar' }}</td>
                <td>{{ invoice.grand_total | number:'1.2-4' }} {{ invoice.currency_code || 'Sin moneda histórica' }}</td><td>{{ invoice.total_paid | number:'1.2-4' }}</td><td>{{ invoice.balance_due | number:'1.2-4' }}</td>
                <td>
                  <button class="btn btn-secondary" type="button" (click)="downloadPdf(invoice)" [disabled]="busy">Descargar PDF</button>
                  @if (isAdmin && !invoice.is_posted && invoice.status !== 'void') {
                    <button class="btn btn-secondary" type="button" (click)="postInvoice(invoice)" [disabled]="busy">Contabilizar</button>
                  }
                  @if (isAdmin && invoice.is_posted && Number(invoice.balance_due) > 0) {
                    <details>
                      <summary>Registrar pago</summary>
                      <form class="form-grid payment-form" (ngSubmit)="registerPayment(invoice)">
                        <label>Referencia de pago
                          <input [name]="'ref-' + invoice.id" [(ngModel)]="payments[invoice.id].reference" maxlength="64" required />
                        </label>
                        <label>Importe (máximo {{ invoice.balance_due | number:'1.2-4' }})
                          <input [name]="'amount-' + invoice.id" type="number" min="0.0001" [max]="Number(invoice.balance_due)" step="0.0001" [(ngModel)]="payments[invoice.id].amount" required />
                        </label>
                        <button class="btn btn-primary" type="submit" [disabled]="busy">Guardar pago</button>
                      </form>
                    </details>
                  }
                </td>
              </tr>
            }</tbody>
          </table></div>
        } @else if (!loading) {
          <app-empty-state title="Sin facturas" description="Emite una factura desde un pedido confirmado para verla aquí." icon="bi-receipt"></app-empty-state>
        }
      </article>
      <p class="muted">La transmisión fiscal certificada requiere proveedor habilitado. No registrar cobros mediante esta pantalla si el dinero no se recibió.</p>
    </section>
  `,
})
export class InvoicingComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly api = API_BASE_URL;
  invoices: SalesInvoice[] = [];
  orders: SalesOrder[] = [];
  issue = { salesOrderId: '', invoiceNumber: '' };
  payments: Record<string, { reference: string; amount: number | null }> = {};
  loading = false;
  busy = false;
  error = '';
  message = '';

  ngOnInit() { void this.refresh(); }

  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get invoiceableOrders() { return this.orders.filter(order => order.status === 'confirmed' && !this.invoices.some(invoice => invoice.sales_order_id === order.id)); }
  Number(value: string) { return Number(value); }

  async downloadPdf(invoice: SalesInvoice) {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      const blob = await firstValueFrom(this.http.get(`${this.api}/commerce/sales/invoices/${invoice.id}/pdf`, { responseType: 'blob' }));
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${invoice.invoice_number.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      anchor.click(); URL.revokeObjectURL(url);
    } catch { this.error = 'No se pudo descargar el PDF.'; }
    finally { this.busy = false; }
  }

  async refresh() {
    if (this.loading) return;
    this.loading = true; this.error = '';
    try {
      const [invoices, orders] = await Promise.all([
        firstValueFrom(this.http.get<SalesInvoice[]>(`${this.api}/commerce/sales/invoices`)),
        firstValueFrom(this.http.get<SalesOrder[]>(`${this.api}/commerce/sales/orders`)),
      ]);
      this.invoices = invoices;
      this.orders = orders;
      for (const invoice of invoices) this.payments[invoice.id] ??= { reference: '', amount: null };
    } catch (error) { this.error = this.errorMessage(error, 'No se pudieron cargar las facturas. Comprueba sesión y conexión.'); }
    finally { this.loading = false; }
  }

  async issueInvoice() {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    try {
      const response = await firstValueFrom(this.http.post<{ invoiceNumber: string }>(
        `${this.api}/commerce/sales/orders/${this.issue.salesOrderId}/invoice`,
        { invoiceNumber: this.issue.invoiceNumber.trim() },
      ));
      this.message = `Factura comercial ${response.invoiceNumber} emitida. Contabilízala después de revisar los datos.`;
      this.issue = { salesOrderId: '', invoiceNumber: '' };
      await this.refresh();
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo emitir. El pedido puede no estar confirmado o ya tener factura.'); }
    finally { this.busy = false; }
  }

  async postInvoice(invoice: SalesInvoice) {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.post(`${this.api}/accounting/bootstrap-accounts`, {}));
      await firstValueFrom(this.http.post(`${this.api}/accounting/sales-invoices/${invoice.id}/post`, {}));
      this.message = `Factura ${invoice.invoice_number} contabilizada.`;
      await this.refresh();
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo contabilizar. Revisa el período y si ya fue contabilizada.'); }
    finally { this.busy = false; }
  }

  async registerPayment(invoice: SalesInvoice) {
    if (this.busy) return;
    const payment = this.payments[invoice.id];
    if (!payment?.reference.trim() || !Number.isFinite(payment.amount) ||
        Number(payment.amount) <= 0 || Number(payment.amount) > Number(invoice.balance_due)) {
      this.error = 'Indica una referencia única y un importe positivo no superior al saldo pendiente.';
      return;
    }
    this.busy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.post(`${this.api}/accounting/sales-invoices/${invoice.id}/payments`, {
        paymentReference: payment.reference.trim(), amount: Number(payment.amount),
      }));
      this.message = `Pago registrado para ${invoice.invoice_number}.`;
      this.payments[invoice.id] = { reference: '', amount: null };
      await this.refresh();
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo registrar el pago. Revisa referencia y saldo pendiente.'); }
    finally { this.busy = false; }
  }

  private errorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpErrorResponse && error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo.';
    if (error instanceof HttpErrorResponse && error.status === 403) return 'Tu rol no permite esta operación.';
    if (error instanceof HttpErrorResponse && error.status === 400) return 'La operación no cumple las validaciones. Comprueba estado, folio, saldo y período.';
    if (error instanceof HttpErrorResponse && error.status === 409) return 'La referencia ya existe. Consulta el documento original antes de volver a intentar.';
    return fallback;
  }
}
