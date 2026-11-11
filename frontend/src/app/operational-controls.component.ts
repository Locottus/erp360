import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type Stock = { product_id: string; product_name: string; location_code: string; on_hand: string; reserved: string };
type Payable = { id: string; order_number: string; supplier_name: string; grand_total: string; total_paid: string; total_returned: string; total_refunded: string; balance_due: string; is_posted: boolean };
type SupplierRefund = { id: string; reference: string; amount: string; reason: string; created_at: string };
type Period = { period_year: number; period_month: number; status: string };
type Credit = { id: string; credit_number: string; invoice_number: string; grand_total: string; currency_code: string | null; refund_due: string; stock_returned: boolean; can_return_stock: boolean };
type Invoice = { id: string; invoice_number: string; is_posted: boolean; status: string };
type Order = { id: string; order_number: string; status: string };
type Purchase = { purchase_order_id: string | null; purchase_order_number: string | null; purchase_order_status: string | null };
type Fulfillment = { id: string; order_number: string; customer_name: string; delivery_method: string; address: string | null; phone: string | null; status: string; courier: string | null; tracking_code: string | null };

@Component({
  selector: 'app-operational-controls', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">CONTROL OPERATIVO</p><h1>Transferencias, conteos y tesorería</h1>
        <p>Registra hechos confirmados. Una referencia de transferencia o conteo se aplica una sola vez.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (!isAdmin) { <p role="alert">Requiere administrador de empresa.</p> } @else {
        <button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="busy">Actualizar datos</button>
        <div class="panel-grid">
          <article class="surface-card"><h2>Transferencia entre ubicaciones</h2>
            <form class="form-grid" #transferForm="ngForm" (ngSubmit)="applyStock('transfer')">
              <label>Saldo de origen<select name="transferStock" [(ngModel)]="selectedStock" required>
                <option [ngValue]="null">Selecciona</option>@for (row of stock; track row.product_id + row.location_code) {
                  <option [ngValue]="row">{{ row.product_name }} · {{ row.location_code }} · físico {{ row.on_hand }} / reservado {{ row.reserved }}</option>
                }</select></label>
              <label>Destino<input name="destination" [(ngModel)]="transfer.destinationCode" maxlength="32" required /></label>
              <label>Cantidad<input name="transferQty" [(ngModel)]="transfer.quantity" type="number" min="0.0001" step="0.0001" required /></label>
              <label>Referencia única<input name="transferRef" [(ngModel)]="transfer.reference" maxlength="64" required /></label>
              <label>Motivo<input name="transferNotes" [(ngModel)]="transfer.notes" maxlength="1000" required /></label>
              <button class="btn btn-primary" type="submit" [disabled]="busy || transferForm.invalid">Transferir disponible</button>
            </form>
          </article>
          <article class="surface-card"><h2>Conteo físico</h2><p>No puede reducir el físico por debajo de lo reservado. Si el saldo cambió, debes volver a contar.</p>
            <form class="form-grid" #countForm="ngForm" (ngSubmit)="applyStock('count')">
              <label>Saldo a contar<select name="countStock" [(ngModel)]="countedStock" required>
                <option [ngValue]="null">Selecciona</option>@for (row of stock; track row.product_id + row.location_code) {
                  <option [ngValue]="row">{{ row.product_name }} · {{ row.location_code }} · físico esperado {{ row.on_hand }}</option>
                }</select></label>
              <label>Unidades contadas<input name="countQty" [(ngModel)]="count.quantity" type="number" min="0" step="0.0001" required /></label>
              <label>Referencia única<input name="countRef" [(ngModel)]="count.reference" maxlength="64" required /></label>
              <label>Motivo<input name="countNotes" [(ngModel)]="count.notes" maxlength="1000" required /></label>
              <button class="btn btn-primary" type="submit" [disabled]="busy || countForm.invalid">Confirmar conteo</button>
            </form>
          </article>
        </div>
        <article class="surface-card"><h2>Cuentas por pagar</h2><p>El registro documenta un pago ya realizado; no envía dinero al banco. Los importes heredan la moneda del documento original.</p>
          <div class="table-scroll"><table class="table-list payables-table"><caption>Compras y saldos de proveedores</caption>
            <thead><tr><th>Compra / proveedor</th><th>Total</th><th>Pagado</th><th>Crédito por devolución</th><th>Recuperado</th><th>Saldo</th><th>Registrar egreso</th></tr></thead>
            <tbody>@for (row of payables; track row.id) { <tr><th scope="row">{{ row.order_number }}<br>{{ row.supplier_name }}</th>
              <td>{{ row.grand_total | number:'1.2-4' }}</td><td>{{ row.total_paid | number:'1.2-4' }}</td><td>{{ row.total_returned | number:'1.2-4' }}</td><td>{{ row.total_refunded | number:'1.2-4' }}</td><td>{{ row.balance_due | number:'1.2-4' }}@if (+row.balance_due < 0) { <br><small>Crédito a recuperar del proveedor; no es dinero recibido.</small> }</td>
              <td>@if (row.is_posted && +row.balance_due > 0) { <form class="form-grid" #payment="ngForm" (ngSubmit)="pay(row)">
                <label>Referencia<input [name]="'ref-' + row.id" [(ngModel)]="payments[row.id].reference" maxlength="64" required /></label>
                <label>Importe<input [name]="'amount-' + row.id" [(ngModel)]="payments[row.id].amount" type="number" min="0.0001" [max]="+row.balance_due" step="0.0001" required /></label>
                <button class="btn btn-primary" type="submit" [disabled]="busy || payment.invalid">Registrar pago realizado</button></form>
              } @else { {{ row.is_posted ? 'Sin saldo' : 'Contabiliza la compra primero' }} }</td></tr> }</tbody>
          </table></div>
        </article>
        <article class="surface-card"><h2>Recuperar crédito del proveedor</h2>
          <p>Registra exclusivamente dinero que el proveedor ya devolvió por banco o caja. No ejecuta cobros, no concilia extractos y no compensa otras compras. La moneda es la del documento original.</p>
          <form class="form-grid" #supplierRefundForm="ngForm" (ngSubmit)="receiveSupplierRefund()">
            <label>Compra con crédito por recuperar<select name="supplierRefundOrder" [(ngModel)]="supplierRecovery.orderId" required [disabled]="busy">
              <option value="">Selecciona</option>@for (row of recoverablePayables; track row.id) {
                <option [value]="row.id">{{ row.order_number }} · {{ row.supplier_name }} · recuperar {{ -row.balance_due | number:'1.2-4' }}</option>
              }</select></label>
            <label>Referencia del ingreso proveedor<input name="supplierRefundReference" [(ngModel)]="supplierRecovery.reference" maxlength="64" required /></label>
            <label>Importe recibido del proveedor<input name="supplierRefundAmount" [(ngModel)]="supplierRecovery.amount" type="number" min="0.0001" step="0.0001" [max]="supplierRecoveryLimit" required /></label>
            <label>Motivo del ingreso proveedor<input name="supplierRefundReason" [(ngModel)]="supplierRecovery.reason" minlength="10" maxlength="1000" required /></label>
            <label><input name="supplierRefundConfirmed" [(ngModel)]="supplierRecovery.confirmed" type="checkbox" required /> Confirmo que el dinero ya fue recibido.</label>
            <button type="submit" class="btn btn-primary" [disabled]="busy || supplierRefundForm.invalid">Registrar ingreso del proveedor</button>
          </form>
          <h3>Historial de ingresos por compra</h3>
          <label>Compra para historial<select [ngModel]="supplierHistoryId" (ngModelChange)="loadSupplierRefunds($event)" [disabled]="busy">
            <option value="">Selecciona</option>@for (row of payables; track row.id) { <option [value]="row.id">{{ row.order_number }} · {{ row.supplier_name }}</option> }
          </select></label>
          @if (supplierHistoryId) {
            <div class="table-scroll"><table class="table-list"><caption>Reembolsos recibidos, sin borrar pagos ni créditos</caption>
              <thead><tr><th>Referencia / fecha</th><th>Importe</th><th>Motivo</th></tr></thead><tbody>
              @for (row of supplierHistory; track row.id) { <tr><th scope="row">{{ row.reference }}<br>{{ row.created_at | date:'short' }}</th><td>{{ row.amount | number:'1.2-4' }}</td><td>{{ row.reason }}</td></tr> }
              @empty { <tr><td colspan="3">Sin ingresos registrados para esta compra.</td></tr> }
            </tbody></table></div>
          }
        </article>
        <div class="panel-grid">
          <article class="surface-card"><h2>Cancelar pedido sin entrega</h2>
            <p>Solo pedidos no facturados, no despachados y compras no recibidas. Las reservas se liberan de forma transaccional.</p>
            <form class="form-grid" #cancelForm="ngForm" (ngSubmit)="cancelOrder()">
              <label>Operación<select name="cancelType" [(ngModel)]="cancel.type" (ngModelChange)="cancel.id = ''">
                <option value="sales">Venta</option><option value="purchases">Compra</option></select></label>
              <label>Pedido<select name="cancelOrder" [(ngModel)]="cancel.id" required><option value="">Selecciona</option>
                @for (row of cancellableOrders; track row.id) { <option [value]="row.id">{{ row.order_number }}</option> }
              </select></label>
              <label>Motivo<input name="cancelReason" [(ngModel)]="cancel.reason" minlength="10" maxlength="1000" required /></label>
              <label><input name="cancelConfirmed" type="checkbox" [(ngModel)]="cancel.confirmed" required /> Confirmo la cancelación definitiva.</label>
              <button class="btn btn-secondary" type="submit" [disabled]="busy || cancelForm.invalid">Cancelar y liberar reservas</button>
            </form>
          </article>
          <article class="surface-card"><h2>Nota de crédito total</h2>
            <p>Revierte una factura contabilizada. No anula un comprobante fiscal ni envía dinero. Solo marca devolución física si ya recibiste toda la mercancía despachada.</p>
            <form class="form-grid" #creditForm="ngForm" (ngSubmit)="creditInvoice()">
              <label>Factura contabilizada<select name="creditInvoice" [(ngModel)]="credit.invoiceId" required><option value="">Selecciona</option>
                @for (row of creditableInvoices; track row.id) { <option [value]="row.id">{{ row.invoice_number }}</option> }
              </select></label>
              <label>Motivo<input name="creditReason" [(ngModel)]="credit.reason" minlength="10" maxlength="1000" required /></label>
              <label><input type="checkbox" name="returnStock" [(ngModel)]="credit.returnStock" /> Recibí físicamente todos los productos despachados.</label>
              <label><input type="checkbox" name="creditConfirmed" [(ngModel)]="credit.confirmed" required /> Confirmo el crédito comercial total e irreversible.</label>
              <button class="btn btn-secondary" type="submit" [disabled]="busy || creditForm.invalid">Emitir crédito y reversión contable</button>
            </form>
          </article>
        </div>
        <article class="surface-card"><h2>Saldos a devolver al cliente</h2>
          <p>Una nota de crédito no borra cobros anteriores. Registra aquí únicamente reembolsos ya ejecutados por banco o caja.</p>
          <div class="table-scroll"><table class="table-list"><caption>Notas de crédito comerciales</caption>
            <thead><tr><th>Nota / factura</th><th>Total acreditado</th><th>Reembolso pendiente</th><th>Registrar devolución de dinero</th><th>Retorno físico posterior</th></tr></thead>
            <tbody>@for (row of credits; track row.id) { <tr><th scope="row">{{ row.credit_number }}<br>{{ row.invoice_number }}</th>
              <td>{{ row.grand_total }} {{ row.currency_code || 'Sin moneda histórica' }}</td><td>{{ row.refund_due }}</td>
              <td>@if (+row.refund_due > 0) { <form class="form-grid" #refundForm="ngForm" (ngSubmit)="refund(row)">
                <label>Referencia<input [name]="'refundRef-' + row.id" [(ngModel)]="refunds[row.id].reference" maxlength="64" required /></label>
                <label>Importe<input [name]="'refundAmount-' + row.id" [(ngModel)]="refunds[row.id].amount" type="number" min="0.0001" step="0.0001" [max]="+row.refund_due" required /></label>
                <button class="btn btn-secondary" type="submit" [disabled]="busy || refundForm.invalid">Registrar reembolso realizado</button>
              </form> } @else { Sin saldo a devolver }</td>
              <td>@if (row.can_return_stock) {
                <form class="form-grid" #stockReturnForm="ngForm" (ngSubmit)="returnCreditedStock(row)">
                  <label>Referencia de retorno<input [name]="'stockRef-' + row.id" [(ngModel)]="stockReturns[row.id].reference" maxlength="64" required /></label>
                  <label>Motivo del retorno<input [name]="'stockReason-' + row.id" [(ngModel)]="stockReturns[row.id].reason" minlength="10" maxlength="1000" required /></label>
                  <label><input [name]="'stockConfirmed-' + row.id" [(ngModel)]="stockReturns[row.id].confirmed" type="checkbox" required /> Recibí toda la mercancía despachada.</label>
                  <button type="submit" class="btn btn-secondary" [disabled]="busy || stockReturnForm.invalid">Registrar retorno físico total</button>
                </form>
              } @else { {{ row.stock_returned ? 'Retorno ya registrado' : 'Sin despacho a retornar' }} }</td></tr> }</tbody>
          </table></div>
        </article>
        <article class="surface-card"><h2>Entregas de tienda online</h2>
          <p>Hasta 500 entregas recientes. Primero confirma la salida física en Inventario. Los cambios de estado no cobran envío ni notifican al transportista.</p>
          <div class="table-scroll"><table class="table-list"><caption>Preparación y seguimiento manual</caption>
            <thead><tr><th>Pedido</th><th>Entrega / contacto</th><th>Estado</th><th>Siguiente paso</th></tr></thead>
            <tbody>@for (row of fulfillments; track row.id) { <tr><th scope="row">{{ row.order_number }}<br>{{ row.customer_name }}</th>
              <td>{{ row.delivery_method === 'delivery' ? 'Envío solicitado' : 'Recogida' }}<br>{{ row.address }}<br>{{ row.phone }}</td>
              <td>{{ fulfillmentLabel(row.status) }}<br>{{ row.courier }} {{ row.tracking_code }}</td>
              <td>@if (nextFulfillment(row)) { <form class="form-grid" #shippingForm="ngForm" (ngSubmit)="advanceFulfillment(row)">
                @if (nextFulfillment(row) === 'shipped') {
                  <label>Transportista<input [name]="'courier-' + row.id" [(ngModel)]="shipping[row.id].courier" maxlength="120" required /></label>
                  <label>Guía<input [name]="'tracking-' + row.id" [(ngModel)]="shipping[row.id].trackingCode" maxlength="120" required /></label>
                }
                <button class="btn btn-secondary" type="submit" [disabled]="busy || shippingForm.invalid">Confirmar: {{ fulfillmentLabel(nextFulfillment(row)) }}</button>
              </form> } @else { Sin transición pendiente }</td></tr> }</tbody>
          </table></div>
        </article>
        <article class="surface-card"><h2>Reapertura de períodos</h2>
          <p>Solo para correcciones autorizadas. Revisa y vuelve a cerrar el período al finalizar.</p>
          <form class="toolbar-grid" #reopenForm="ngForm" (ngSubmit)="reopen()">
            <label>Período cerrado<select name="period" [(ngModel)]="period" required><option [ngValue]="null">Selecciona</option>
              @for (row of closedPeriods; track row.period_year + '-' + row.period_month) {
                <option [ngValue]="row">{{ row.period_year }}-{{ row.period_month }}</option>
              }</select></label>
            <label>Motivo documentado<input name="reason" [(ngModel)]="reason" minlength="10" maxlength="1000" required /></label>
            <button type="submit" class="btn btn-secondary" [disabled]="busy || reopenForm.invalid">Reabrir y auditar</button>
          </form>
        </article>
      }
    </section>
  `,
  styles: [`
    .payables-table { min-width: 58rem; }
    .payables-table thead th,
    .payables-table td:nth-child(2),
    .payables-table td:nth-child(3),
    .payables-table td:nth-child(4),
    .payables-table td:nth-child(5) { white-space: nowrap; }
    .payables-table td:nth-child(6) { min-width: 10rem; }
  `],
})
export class OperationalControlsComponent {
  private readonly http = inject(HttpClient); private readonly session = inject(SessionService);
  stock: Stock[] = []; payables: Payable[] = []; periods: Period[] = [];
  credits: Credit[] = []; invoices: Invoice[] = []; sales: Order[] = []; purchases: Purchase[] = [];
  cancel = { type: 'sales', id: '', reason: '', confirmed: false };
  credit = { invoiceId: '', reason: '', returnStock: false, confirmed: false };
  refunds: Record<string, { reference: string; amount: number | null }> = {};
  stockReturns: Record<string, { reference: string; reason: string; confirmed: boolean }> = {};
  supplierRecovery: { orderId: string; reference: string; amount: number | null; reason: string; confirmed: boolean } =
    { orderId: '', reference: '', amount: null, reason: '', confirmed: false };
  supplierHistoryId = ''; supplierHistory: SupplierRefund[] = [];
  fulfillments: Fulfillment[] = [];
  shipping: Record<string, { courier: string; trackingCode: string }> = {};
  selectedStock: Stock | null = null; countedStock: Stock | null = null; period: Period | null = null;
  transfer = { destinationCode: '', quantity: 1, reference: '', notes: '' };
  count = { quantity: 0, reference: '', notes: '' };
  payments: Record<string, { reference: string; amount: number | null }> = {};
  reason = ''; busy = false; error = ''; message = '';
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get closedPeriods() { return this.periods.filter(row => row.status === 'closed'); }
  get recoverablePayables() { return this.payables.filter(row => row.is_posted && +row.balance_due < 0); }
  get supplierRecoveryLimit() { return -Number(this.payables.find(row => row.id === this.supplierRecovery.orderId)?.balance_due ?? 0); }
  get creditableInvoices() { return this.invoices.filter(row => row.is_posted && row.status !== 'void'); }
  get cancellableOrders(): Order[] {
    return this.cancel.type === 'sales' ? this.sales.filter(row => row.status === 'confirmed')
      : this.purchases.filter(row => row.purchase_order_id && row.purchase_order_status === 'ordered')
        .map(row => ({ id: row.purchase_order_id!, order_number: row.purchase_order_number!, status: row.purchase_order_status! }));
  }
  constructor() {
    effect(() => {
      const user = this.session.user();
      untracked(() => {
        this.stock = []; this.payables = []; this.periods = []; this.credits = []; this.invoices = [];
        this.sales = []; this.purchases = []; this.fulfillments = []; this.payments = {}; this.refunds = {}; this.stockReturns = {}; this.shipping = {};
        this.selectedStock = null; this.countedStock = null; this.period = null;
        this.supplierRecovery = { orderId: '', reference: '', amount: null, reason: '', confirmed: false };
        this.supplierHistoryId = ''; this.supplierHistory = [];
        this.busy = false; this.error = ''; this.message = '';
        if (user?.roles.includes('admin')) void this.refresh();
      });
    });
  }
  private async load() {
    const user = this.session.user();
    const [stock, payables, periods, credits, invoices, sales, purchases, fulfillments] = await Promise.all([
      firstValueFrom(this.http.get<Stock[]>(`${API_BASE_URL}/inventory/stock`)),
      firstValueFrom(this.http.get<Payable[]>(`${API_BASE_URL}/accounting/payables`)),
      firstValueFrom(this.http.get<Period[]>(`${API_BASE_URL}/accounting/periods`)),
      firstValueFrom(this.http.get<Credit[]>(`${API_BASE_URL}/accounting/credits`)),
      firstValueFrom(this.http.get<Invoice[]>(`${API_BASE_URL}/commerce/sales/invoices`)),
      firstValueFrom(this.http.get<Order[]>(`${API_BASE_URL}/commerce/sales/orders`)),
      firstValueFrom(this.http.get<Purchase[]>(`${API_BASE_URL}/commerce/purchases/requests`)),
      firstValueFrom(this.http.get<Fulfillment[]>(`${API_BASE_URL}/ecommerce/admin/fulfillments`)),
    ]);
    if (this.session.user() !== user) return;
    this.stock = stock; this.payables = payables; this.periods = periods;
    this.credits = credits; this.invoices = invoices; this.sales = sales; this.purchases = purchases;
    this.fulfillments = fulfillments;
    this.supplierHistoryId = ''; this.supplierHistory = [];
    this.selectedStock = null; this.countedStock = null; this.period = null;
    for (const row of payables) this.payments[row.id] ??= { reference: '', amount: null };
    for (const row of credits) this.refunds[row.id] ??= { reference: '', amount: null };
    for (const row of credits) this.stockReturns[row.id] ??= { reference: '', reason: '', confirmed: false };
    for (const row of fulfillments) this.shipping[row.id] ??= { courier: row.courier ?? '', trackingCode: row.tracking_code ?? '' };
  }
  fulfillmentLabel(status: string) {
    const labels: Record<string, string> = { requested: 'Solicitado', preparing: 'En preparación', ready: 'Listo para recoger', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado' };
    return labels[status] ?? status;
  }
  nextFulfillment(row: Fulfillment) {
    const path = row.delivery_method === 'delivery' ? ['requested', 'preparing', 'shipped', 'delivered'] : ['requested', 'preparing', 'ready', 'delivered'];
    const index = path.indexOf(row.status);
    return index >= 0 ? path[index + 1] ?? '' : '';
  }
  async advanceFulfillment(row: Fulfillment) {
    await this.perform(async () => {
      await firstValueFrom(this.http.patch(`${API_BASE_URL}/ecommerce/admin/fulfillments/${row.id}`,
        { status: this.nextFulfillment(row), expectedStatus: row.status, ...this.shipping[row.id] }));
      this.message = 'Seguimiento actualizado. No se envió notificación automática.'; await this.load();
    });
  }
  async cancelOrder() {
    if (!this.cancel.confirmed) { this.error = 'Confirma la cancelación.'; return; }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/commerce/${this.cancel.type}/orders/${this.cancel.id}/cancel`, { reason: this.cancel.reason }));
      this.cancel = { type: this.cancel.type, id: '', reason: '', confirmed: false };
      this.message = 'Pedido cancelado; reservas liberadas cuando correspondía.'; await this.load();
    });
  }
  async creditInvoice() {
    if (!this.credit.confirmed) { this.error = 'Confirma la nota de crédito total.'; return; }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/accounting/sales-invoices/${this.credit.invoiceId}/credit`,
        { reason: this.credit.reason, returnStock: this.credit.returnStock }));
      this.credit = { invoiceId: '', reason: '', returnStock: false, confirmed: false };
      this.message = 'Crédito emitido y asiento revertido. Revisa si corresponde devolver dinero.'; await this.load();
    });
  }
  async refund(row: Credit) {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/accounting/credits/${row.id}/refunds`,
        { paymentReference: this.refunds[row.id].reference, amount: this.refunds[row.id].amount }));
      this.refunds[row.id] = { reference: '', amount: null };
      this.message = 'Reembolso realizado y asiento registrados.'; await this.load();
    });
  }
  async returnCreditedStock(row: Credit) {
    const input = this.stockReturns[row.id];
    if (!input.confirmed) { this.error = 'Confirma que recibiste toda la mercancía despachada.'; return; }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/accounting/credits/${row.id}/stock-return`,
        { reference: input.reference, reason: input.reason }));
      this.stockReturns[row.id] = { reference: '', reason: '', confirmed: false };
      this.message = 'Retorno físico total registrado una sola vez. No se repitió el crédito ni el reembolso.';
      await this.load();
    });
  }
  async loadSupplierRefunds(id: string) {
    if (this.busy) return;
    this.supplierHistoryId = id; this.supplierHistory = [];
    if (!id) return;
    const user = this.session.user();
    await this.perform(async () => {
      const history = await firstValueFrom(this.http.get<SupplierRefund[]>(`${API_BASE_URL}/accounting/purchase-orders/${id}/refunds`));
      if (this.session.user() === user && this.supplierHistoryId === id) this.supplierHistory = history;
    });
  }
  async receiveSupplierRefund() {
    if (!this.supplierRecovery.confirmed) { this.error = 'Confirma que el dinero ya fue recibido.'; return; }
    const user = this.session.user(); const input = { ...this.supplierRecovery };
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ replayed: boolean }>(`${API_BASE_URL}/accounting/purchase-orders/${input.orderId}/refunds`,
        { reference: input.reference, amount: input.amount, reason: input.reason }));
      if (this.session.user() !== user) return;
      this.supplierRecovery = { orderId: '', reference: '', amount: null, reason: '', confirmed: false };
      this.supplierHistoryId = ''; this.supplierHistory = [];
      this.message = result.replayed ? 'Ingreso ya registrado: no se duplicó.' : 'Ingreso del proveedor y asiento registrados. No se ejecutó un cobro bancario.';
      await this.load();
    });
  }
  async refresh() { await this.perform(() => this.load()); }
  async applyStock(operation: 'transfer' | 'count') {
    const row = operation === 'transfer' ? this.selectedStock : this.countedStock;
    if (!row) { this.error = 'Selecciona un saldo.'; return; }
    await this.perform(async () => {
      const input = operation === 'transfer' ? this.transfer : this.count;
      const response = await firstValueFrom(this.http.post<{ replayed: boolean }>(
        `${API_BASE_URL}/inventory/${operation === 'transfer' ? 'transfers' : 'counts'}`,
        { ...input, productId: row.product_id, locationCode: row.location_code, expectedOnHand: Number(row.on_hand) }));
      this.message = response.replayed ? 'Esta referencia ya se había aplicado. No se repitió el movimiento.' : 'Movimiento registrado en kardex.';
      await this.load();
    });
  }
  async pay(row: Payable) {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/accounting/purchase-orders/${row.id}/payments`,
        { paymentReference: this.payments[row.id].reference, amount: this.payments[row.id].amount }));
      this.payments[row.id] = { reference: '', amount: null }; this.message = 'Pago y asiento registrados.'; await this.load();
    });
  }
  async reopen() {
    if (!this.period) { this.error = 'Selecciona un período cerrado.'; return; }
    const period = this.period;
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/accounting/periods/reopen`,
        { year: period.period_year, month: period.period_month, reason: this.reason }));
      this.reason = ''; this.message = 'Período reabierto con motivo y auditoría.'; await this.load();
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
        ? 'Referencia duplicada con otros datos o saldo modificado. Actualiza y concilia antes de reintentar.'
        : error instanceof HttpErrorResponse && error.status === 400
          ? 'Regla de negocio: revisa disponible, importe, período contable y datos de origen.'
          : 'No se pudo completar la operación. Verifica el estado antes de reintentar.';
    } finally { if (this.session.user() === user) this.busy = false; }
  }
}
