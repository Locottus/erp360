import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type Rule = {
  product_id: string; sku: string; product_name: string; is_active: boolean; location_code: string;
  minimum_quantity: string; target_quantity: string; revision: number; on_hand: string;
  reserved: string; available: string; needs_replenishment: boolean; suggested_quantity: string;
  pending_purchase_quantity: string; pending_purchase_orders: number; purchase_orders_requiring_review: number;
  open_proposal_number: string | null;
};
type PurchaseCommitment = {
  order_id: string; order_number: string; status: string; supplier_name: string;
  ordered_quantity: string; documented_received_quantity: string; pending_quantity: string | null;
  has_legacy: boolean; over_received: boolean;
};

@Component({
  selector: 'app-replenishment', standalone: true, imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (isAdmin) {
      <article class="surface-card">
        <div class="header-with-action"><h2>Reposición por ubicación</h2>
          <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="busy">Actualizar reposición</button></div>
        <p>Alerta cuando disponible es menor al mínimo. La sugerencia no descuenta compras pendientes ni crea pedidos o asientos. Mínimo cero desactiva la alerta.</p>
        <p>Las compras pendientes son el total por producto de toda la empresa, sin ubicación de destino ni fecha comprometida; se repiten en cada regla del producto y no deben sumarse entre ubicaciones. Revisa las órdenes antes de comprar.</p>
        @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
        @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
        <form class="form-grid" #ruleForm="ngForm" (ngSubmit)="save()">
          <label>Producto para reposición<select name="reorderProduct" [(ngModel)]="productId" (change)="prepare()" required [disabled]="busy">
            <option value="">Selecciona un producto</option>
            @for (product of products; track product.id) { <option [value]="product.id">{{ product.sku }} · {{ product.name }}</option> }
          </select></label>
          <label>Ubicación de reposición<input name="reorderLocation" [(ngModel)]="location" (ngModelChange)="prepare()" maxlength="32" required [disabled]="busy" /></label>
          <label>Mínimo disponible<input name="minimum" [(ngModel)]="minimum" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" required [disabled]="busy" /></label>
          <label>Objetivo disponible<input name="target" [(ngModel)]="target" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" required [disabled]="busy" /></label>
          <label>Motivo de reposición<input name="reorderReason" [(ngModel)]="reason" minlength="10" maxlength="1000" required [disabled]="busy" /></label>
          <p class="muted">Revisión cargada: {{ revision }}. Cantidades exactas, hasta cuatro decimales; usa punto decimal.</p>
          <button class="btn btn-primary" type="submit" [disabled]="busy || !loaded || ruleForm.invalid">Guardar regla de reposición</button>
        </form>
        @if (rules.length) {
          <div class="table-scroll"><table class="table-list">
            <caption>Reglas de la empresa; incluye productos sin saldo y reglas desactivadas.</caption>
            <thead><tr><th>Producto / ubicación</th><th>Disponible</th><th>Mínimo / objetivo</th><th>Compra pendiente de empresa</th><th>Sugerido sin descontar compra</th><th>Estado</th></tr></thead>
            <tbody>@for (row of rules; track row.product_id + row.location_code) {
              <tr><th scope="row">{{ row.product_name }} · {{ row.location_code }}</th><td>{{ row.available }}</td>
                <td>{{ row.minimum_quantity }} / {{ row.target_quantity }}</td>
                <td>{{ row.pending_purchase_quantity }} · {{ row.pending_purchase_orders }} {{ row.pending_purchase_orders === 1 ? 'orden' : 'órdenes' }}
                  @if (row.purchase_orders_requiring_review) { <br><strong>Revisar {{ row.purchase_orders_requiring_review }} {{ row.purchase_orders_requiring_review === 1 ? 'orden' : 'órdenes' }} con recepción histórica o inconsistente; {{ row.purchase_orders_requiring_review === 1 ? 'excluida' : 'excluidas' }} del total.</strong> }
                  <br><button type="button" class="btn btn-secondary" [disabled]="busy" (click)="showCommitments(row)">Ver órdenes de {{ row.product_name }}</button></td>
                <td>{{ row.suggested_quantity }}</td>
                <td>{{ !row.is_active ? 'Producto inactivo' : row.minimum_quantity === '0.0000' ? 'Alerta desactivada' : row.needs_replenishment ? 'Reponer: revisar compras pendientes' : 'Sin alerta' }}
                  @if (row.open_proposal_number) { <br>Solicitud abierta: {{ row.open_proposal_number }} }
                  @else if (row.is_active) { <br><button type="button" class="btn btn-secondary" [disabled]="busy" (click)="prepareProposal(row)">Preparar propuesta para {{ row.product_name }} en {{ row.location_code }}</button> }
                </td></tr>
            }</tbody>
          </table></div>
        } @else { <p>Sin reglas configuradas. No se asignan umbrales automáticamente.</p> }
        @if (proposalRule) {
          <section aria-label="Propuesta de compra">
            <h3>Propuesta: {{ proposalRule.product_name }} · {{ proposalRule.location_code }}</h3>
            <p>Se crea una solicitud en borrador sin impuesto; no crea orden, movimiento ni asiento. El destino no se asigna a la orden. Revisa compras y solicitudes manuales de toda la empresa: la sugerencia no descuenta compromisos y puede haber cambiado.</p>
            <form class="form-grid" #proposalForm="ngForm" (ngSubmit)="createProposal()">
              <label>Número de solicitud<input name="proposalNumber" [(ngModel)]="proposal.requestNumber" maxlength="64" required [disabled]="busy" /></label>
              <label>Proveedor de propuesta<select name="proposalSupplier" [(ngModel)]="proposal.supplierId" required [disabled]="busy"><option value="">Selecciona proveedor</option>
                @for (supplier of suppliers; track supplier.id) { <option [value]="supplier.id">{{ supplier.code }} · {{ supplier.name }}</option> }</select></label>
              <label>Cantidad propuesta<input name="proposalQuantity" [(ngModel)]="proposal.quantity" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" required [disabled]="busy" /></label>
              <label>Costo unitario propuesto<input name="proposalCost" [(ngModel)]="proposal.unitCost" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" required [disabled]="busy" /></label>
              <label>Motivo de propuesta<input name="proposalReason" [(ngModel)]="proposal.reason" minlength="10" maxlength="1000" required [disabled]="busy" /></label>
              <label><input type="checkbox" name="proposalReviewed" [(ngModel)]="proposal.reviewedCommitments" [disabled]="busy" /> Revisé compras pendientes y solicitudes existentes.</label>
              <button type="submit" class="btn btn-primary" [disabled]="busy || proposalForm.invalid || !proposal.reviewedCommitments">Crear solicitud en borrador</button>
              <button type="button" class="btn btn-secondary" (click)="proposalRule = null" [disabled]="busy">Cerrar propuesta</button>
            </form>
            <a routerLink="/operations" [queryParams]="{tab:'purchases'}">Revisar solicitudes y aprobar en Compras</a>
          </section>
        }
        @if (commitmentProduct) {
          <section aria-label="Detalle de compras pendientes">
            <h3>Órdenes abiertas: {{ commitmentProduct }}</h3>
            <p>Consulta independiente de toda la empresa. Actualiza para consultar cambios recientes; no asigna destino ni descuenta compromisos de la sugerencia.</p>
            @if (commitments.length) {
              <div class="table-scroll"><table class="table-list">
                <thead><tr><th>Orden</th><th>Proveedor</th><th>Estado</th><th>Pedido</th><th>Recepción documentada</th><th>Pendiente verificable</th></tr></thead>
                <tbody>@for (order of commitments; track order.order_id) {
                  <tr><th scope="row">{{ order.order_number }}</th><td>{{ order.supplier_name }}</td><td>{{ order.status === 'ordered' ? 'Ordenada' : order.status === 'partially_received' ? 'Parcialmente recibida' : order.status }}</td>
                    <td>{{ order.ordered_quantity }}</td><td>{{ order.documented_received_quantity }}</td>
                    <td>@if (order.pending_quantity !== null) { {{ order.pending_quantity }} } @else {
                      <strong>Excluida: revisar
                        @if (order.has_legacy) { recepción histórica sin detalle }
                        @if (order.has_legacy && order.over_received) { y }
                        @if (order.over_received) { sobre-recepción }
                      </strong>
                    }</td></tr>
                }</tbody>
              </table></div>
            } @else { <p>No hay órdenes abiertas con pendiente o anomalías para este producto.</p> }
          </section>
        }
      </article>
    }
  `,
})
export class ReplenishmentComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  rules: Rule[] = [];
  products: { id: string; sku: string; name: string }[] = [];
  commitments: PurchaseCommitment[] = []; commitmentProduct = '';
  suppliers: { id: string; code: string; name: string; is_active: boolean }[] = [];
  proposalRule: Rule | null = null;
  proposal = { requestNumber: '', supplierId: '', quantity: '', unitCost: '', reason: '', reviewedCommitments: false };
  productId = ''; location = 'MAIN'; minimum = '0'; target = '0'; revision = 0; reason = '';
  error = ''; message = ''; busy = false; loaded = false;
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  constructor() {
    effect(() => {
      const identity = this.session.user();
      untracked(() => {
        this.rules = []; this.products = []; this.commitments = []; this.commitmentProduct = ''; this.productId = ''; this.location = 'MAIN';
        this.suppliers = []; this.proposalRule = null;
        this.proposal = { requestNumber: '', supplierId: '', quantity: '', unitCost: '', reason: '', reviewedCommitments: false };
        this.prepare(); this.error = ''; this.message = ''; this.busy = false; this.loaded = false;
        if (identity?.roles.includes('admin')) void this.load();
      });
    });
  }
  prepare() {
    const rule = this.rules.find(r => r.product_id === this.productId && r.location_code === this.location.trim().toUpperCase());
    this.minimum = rule?.minimum_quantity ?? '0'; this.target = rule?.target_quantity ?? '0';
    this.revision = rule?.revision ?? 0; this.reason = '';
  }
  async load() {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = ''; this.loaded = false; this.commitments = []; this.commitmentProduct = ''; this.proposalRule = null;
    try {
      const [rules, products] = await Promise.all([
        firstValueFrom(this.http.get<Rule[]>(`${API_BASE_URL}/inventory/replenishment`)),
        firstValueFrom(this.http.get<{ id: string; sku: string; name: string }[]>(`${API_BASE_URL}/masters/products`)),
      ]);
      if (identity !== this.session.user()) return;
      this.rules = rules; this.products = products; this.prepare(); this.loaded = true;
    } catch { if (identity === this.session.user()) this.error = 'No se pudieron cargar las reglas. Actualiza antes de guardar.'; }
    finally { if (identity === this.session.user()) this.busy = false; }
  }
  async prepareProposal(row: Rule) {
    if (this.busy || !this.isAdmin || row.open_proposal_number) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = ''; this.proposalRule = null;
    try {
      const suppliers = await firstValueFrom(this.http.get<typeof this.suppliers>(`${API_BASE_URL}/masters/suppliers`));
      if (identity !== this.session.user()) return;
      this.suppliers = suppliers.filter(s => s.is_active);
      this.proposal = { requestNumber: '', supplierId: '', quantity: row.suggested_quantity, unitCost: '', reason: '', reviewedCommitments: false };
      this.proposalRule = row;
    } catch {
      if (identity === this.session.user()) this.error = 'No se pudieron cargar proveedores para la propuesta.';
    } finally { if (identity === this.session.user()) this.busy = false; }
  }
  async createProposal() {
    const row = this.proposalRule;
    if (this.busy || !this.isAdmin || !row || !this.proposal.reviewedCommitments) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try {
      const result = await firstValueFrom(this.http.post<{ requestNumber: string }>(
        `${API_BASE_URL}/inventory/replenishment/${row.product_id}/proposals`, {
          ...this.proposal, locationCode: row.location_code, expectedRevision: row.revision,
        }));
      if (identity !== this.session.user()) return;
      this.busy = false; await this.load();
      if (identity === this.session.user() && !this.error) this.message = `Solicitud ${result.requestNumber} creada en borrador. Revísala en Compras antes de aprobar.`;
    } catch (error) {
      if (identity !== this.session.user()) return;
      this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'La regla cambió, el número ya existe o hay otra propuesta abierta. Actualiza y revisa Compras.'
        : 'No se pudo crear la propuesta. Revisa proveedor, cantidades, costo y motivo antes de volver a intentar.';
    } finally { if (identity === this.session.user()) this.busy = false; }
  }
  async showCommitments(row: Rule) {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = ''; this.commitments = []; this.commitmentProduct = '';
    try {
      const orders = await firstValueFrom(this.http.get<PurchaseCommitment[]>(
        `${API_BASE_URL}/inventory/replenishment/${row.product_id}/purchase-commitments`));
      if (identity !== this.session.user()) return;
      this.commitments = orders; this.commitmentProduct = row.product_name;
    } catch {
      if (identity === this.session.user()) this.error = 'No se pudieron cargar las órdenes pendientes. Intenta nuevamente.';
    } finally { if (identity === this.session.user()) this.busy = false; }
  }
  async save() {
    if (this.busy || !this.isAdmin || !this.loaded || !this.productId) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.patch(`${API_BASE_URL}/inventory/replenishment/${this.productId}`, {
        locationCode: this.location, minimumQuantity: this.minimum, targetQuantity: this.target,
        expectedRevision: this.revision, reason: this.reason,
      }));
      if (identity !== this.session.user()) return;
      this.busy = false; await this.load();
      if (identity === this.session.user() && !this.error) this.message = 'Regla guardada con auditoría. Revisa la sugerencia antes de comprar.';
    } catch (error) {
      if (identity !== this.session.user()) return;
      this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'La regla cambió o no hay cambios. Actualiza reposición y revisa los valores.'
        : 'No se guardó la regla. Revisa producto, ubicación, cantidades (objetivo ≥ mínimo) y motivo.';
    } finally { if (identity === this.session.user()) this.busy = false; }
  }
}
